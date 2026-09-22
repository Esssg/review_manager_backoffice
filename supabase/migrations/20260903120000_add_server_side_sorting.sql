-- 서버 정렬·keyset cursor 계약
--
-- 기존 목록 RPC는 그대로 보존하고, 정렬이 선택된 새 웹 요청만 v2 RPC를
-- 사용한다. p_sort는 화면별 allowlist를 통과한 {key,direction} 배열이고,
-- p_cursor는 그 배열의 정렬값과 tie-breaker를 포함한 opaque JSON cursor다.

create or replace function public.admin_gateway_validate_list_sort(
  p_sort jsonb,
  p_allowed_keys text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_item jsonb;
  v_key text;
  v_direction text;
  v_seen_keys text[] := '{}'::text[];
  v_normalized jsonb := '[]'::jsonb;
begin
  if p_sort is null then
    return v_normalized;
  end if;

  if jsonb_typeof(p_sort) <> 'array' then
    raise exception '정렬 조건이 배열이어야 합니다.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_sort) > cardinality(coalesce(p_allowed_keys, '{}'::text[])) then
    raise exception '정렬 조건의 열 수가 올바르지 않습니다.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_sort)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception '정렬 항목이 객체가 아닙니다.' using errcode = '22023';
    end if;

    v_key := nullif(btrim(v_item ->> 'key'), '');
    v_direction := lower(nullif(btrim(v_item ->> 'direction'), ''));

    if v_key is null
      or not coalesce(v_key = any(coalesce(p_allowed_keys, '{}'::text[])), false)
      or v_direction not in ('asc', 'desc')
      or v_key = any(v_seen_keys) then
      raise exception '지원하지 않는 정렬 조건입니다.' using errcode = '22023';
    end if;

    v_seen_keys := array_append(v_seen_keys, v_key);
    v_normalized := v_normalized || jsonb_build_array(
      jsonb_build_object('key', v_key, 'direction', v_direction)
    );
  end loop;

  return v_normalized;
end;
$function$;

create or replace function public.admin_gateway_list_sort_value(
  p_row jsonb,
  p_key text
)
returns jsonb
language plpgsql
immutable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_raw text;
  v_is_unregistered boolean := coalesce(p_row ? 'bundle_item_count', false)
    and coalesce((p_row ->> 'bundle_item_count')::integer, 0) = 0;
begin
  if p_key = 'registered_date' then
    v_raw := nullif(btrim(coalesce(p_row ->> 'cursor_product_date', p_row ->> 'product_date', '')), '');
    return case when v_raw is null then null else to_jsonb(extract(epoch from v_raw::date::timestamp)) end;
  end if;

  if p_key = 'deposited_at' then
    v_raw := nullif(btrim(coalesce(p_row ->> 'deposited_at', '')), '');
    return case when v_raw is null then null else to_jsonb(extract(epoch from v_raw::date::timestamp)) end;
  end if;

  if p_key in ('amount', 'review_fee') then
    v_raw := nullif(btrim(coalesce(p_row ->> p_key, '')), '');
    return case when v_raw is null then null else to_jsonb(v_raw::numeric) end;
  end if;

  if p_key in ('is_review_verified', 'is_deposit_verified') then
    v_raw := nullif(lower(btrim(coalesce(p_row ->> p_key, ''))), '');
    if v_raw is null then
      return null;
    end if;

    -- 사용자 결정: 오름차순은 예/있음이 먼저, 내림차순은 그 반대다.
    return to_jsonb(case when v_raw in ('true', '1', '예', 'y', 'yes') then 0 else 1 end);
  end if;

  if p_key = 'review_photos' then
    return to_jsonb(
      case when jsonb_array_length(coalesce(p_row -> 'review_photos', '[]'::jsonb)) > 0 then 0 else 1 end
    );
  end if;

  if p_key in (
    'product_name', 'option_name', 'review_type',
    'product_link', 'product_fee_deposit_GB', 'review_fee_deposit_GB'
  ) and v_is_unregistered then
    v_raw := '품목 미등록';
  elsif p_key = 'product_fee_deposit_GB' then
    v_raw := coalesce(p_row ->> 'product_fee_deposit_label', p_row ->> p_key);
  elsif p_key = 'review_fee_deposit_GB' then
    v_raw := coalesce(p_row ->> 'review_fee_deposit_label', p_row ->> p_key);
  else
    v_raw := p_row ->> p_key;
  end if;

  v_raw := nullif(lower(btrim(coalesce(v_raw, ''))), '');

  if p_key in (
    'company_name', 'product_name', 'option_name', 'review_type',
    'product_link', 'manager_id', 'title', 'description', 'assign_name',
    'order_number', 'buyer_name', 'recipient_name', 'purchase_account',
    'contact', 'address', 'bank_name', 'bank_account', 'account_holder',
    'planned_depositor_name', 'actual_depositor_name',
    'product_fee_deposit_GB', 'review_fee_deposit_GB'
  ) then
    return case when v_raw is null then null else to_jsonb(v_raw) end;
  end if;

  raise exception '지원하지 않는 정렬 열입니다.' using errcode = '22023';
end;
$function$;

create or replace function public.admin_gateway_list_sort_after(
  p_sort jsonb,
  p_cursor jsonb,
  p_row jsonb,
  p_tie_1 bigint,
  p_tie_2 bigint default null
)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_entry jsonb;
  v_index integer := 0;
  v_key text;
  v_direction text;
  v_current_value jsonb;
  v_cursor_value jsonb;
  v_current_is_null boolean;
  v_cursor_is_null boolean;
  v_cursor_tie_1 bigint;
  v_cursor_tie_2 bigint;
begin
  if p_cursor is null then
    return true;
  end if;

  if jsonb_typeof(p_cursor) <> 'object'
    or jsonb_typeof(p_cursor -> 'sort') <> 'array'
    or p_cursor -> 'sort' <> coalesce(p_sort, '[]'::jsonb)
    or jsonb_typeof(p_cursor -> 'values') <> 'array'
    or jsonb_array_length(p_cursor -> 'values') <> jsonb_array_length(coalesce(p_sort, '[]'::jsonb))
    or nullif(p_cursor ->> 'tie1', '') is null then
    raise exception '페이지 cursor가 현재 정렬과 일치하지 않습니다.' using errcode = '22023';
  end if;

  v_cursor_tie_1 := (p_cursor ->> 'tie1')::bigint;
  if p_tie_2 is not null then
    if nullif(p_cursor ->> 'tie2', '') is null then
      raise exception '페이지 cursor tie-breaker가 올바르지 않습니다.' using errcode = '22023';
    end if;
    v_cursor_tie_2 := (p_cursor ->> 'tie2')::bigint;
  end if;

  for v_entry in select value from jsonb_array_elements(coalesce(p_sort, '[]'::jsonb))
  loop
    v_key := v_entry ->> 'key';
    v_direction := v_entry ->> 'direction';
    v_current_value := public.admin_gateway_list_sort_value(p_row, v_key);
    v_cursor_value := p_cursor -> 'values' -> v_index;

    if jsonb_typeof(v_cursor_value) = 'null' then
      v_cursor_value := null;
    end if;

    v_current_is_null := v_current_value is null;
    v_cursor_is_null := v_cursor_value is null;

    if v_current_is_null <> v_cursor_is_null then
      -- null-last는 방향과 무관하게 같은 규칙을 사용한다.
      return v_current_is_null and not v_cursor_is_null;
    end if;

    if not v_current_is_null and v_current_value <> v_cursor_value then
      if v_direction = 'asc' then
        return v_current_value > v_cursor_value;
      end if;

      return v_current_value < v_cursor_value;
    end if;

    v_index := v_index + 1;
  end loop;

  if p_tie_1 is distinct from v_cursor_tie_1 then
    return p_tie_1 > v_cursor_tie_1;
  end if;

  if p_tie_2 is null then
    return false;
  end if;

  if p_tie_2 is distinct from v_cursor_tie_2 then
    return p_tie_2 > v_cursor_tie_2;
  end if;

  return false;
end;
$function$;

create or replace function public.admin_gateway_build_list_sort_cursor(
  p_sort jsonb,
  p_row jsonb,
  p_tie_1 bigint,
  p_tie_2 bigint default null
)
returns jsonb
language plpgsql
immutable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_entry jsonb;
  v_values jsonb := '[]'::jsonb;
begin
  for v_entry in select value from jsonb_array_elements(coalesce(p_sort, '[]'::jsonb))
  loop
    v_values := v_values || jsonb_build_array(
      public.admin_gateway_list_sort_value(p_row, v_entry ->> 'key')
    );
  end loop;

  return jsonb_build_object(
    'sort', coalesce(p_sort, '[]'::jsonb),
    'values', v_values,
    'tie1', p_tie_1,
    'tie2', p_tie_2
  );
end;
$function$;

create or replace function public.admin_gateway_list_sort_order_sql(
  p_screen text,
  p_sort jsonb
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_entry jsonb;
  v_key text;
  v_direction text;
  v_expression text;
  v_order_sql text := '';
begin
  for v_entry in select value from jsonb_array_elements(coalesce(p_sort, '[]'::jsonb))
  loop
    v_key := v_entry ->> 'key';
    v_direction := upper(v_entry ->> 'direction');

    if p_screen = 'review_receive' then
      v_expression := case v_key
        when 'registered_date' then 'filtered_rows.cursor_product_date'
        when 'company_name' then 'nullif(lower(btrim(coalesce(filtered_rows.company_name, ''''))), '''')'
        when 'product_name' then 'nullif(lower(btrim(case when filtered_rows.bundle_item_count = 0 then ''품목 미등록'' else coalesce(filtered_rows.product_name, '''') end)), '''')'
        when 'option_name' then 'nullif(lower(btrim(case when filtered_rows.bundle_item_count = 0 then ''품목 미등록'' else coalesce(filtered_rows.option_name, '''') end)), '''')'
        when 'review_type' then 'nullif(lower(btrim(case when filtered_rows.bundle_item_count = 0 then ''품목 미등록'' else coalesce(filtered_rows.review_type, '''') end)), '''')'
        when 'product_fee_deposit_GB' then 'nullif(lower(btrim(case when filtered_rows.bundle_item_count = 0 then ''품목 미등록'' else coalesce(filtered_rows.product_fee_deposit_label, '''') end)), '''')'
        when 'review_fee_deposit_GB' then 'nullif(lower(btrim(case when filtered_rows.bundle_item_count = 0 then ''품목 미등록'' else coalesce(filtered_rows.review_fee_deposit_label, '''') end)), '''')'
        when 'product_link' then 'nullif(lower(btrim(case when filtered_rows.bundle_item_count = 0 then ''품목 미등록'' else coalesce(filtered_rows.product_link, '''') end)), '''')'
        when 'manager_id' then 'nullif(lower(btrim(coalesce(filtered_rows.manager_id, ''''))), '''')'
        else null
      end;
    elsif p_screen = 'product_overview' then
      v_expression := case v_key
        when 'manager_id' then 'nullif(lower(btrim(coalesce(filtered_rows.manager_id, ''''))), '''')'
        when 'title' then 'nullif(lower(btrim(coalesce(filtered_rows.title, ''''))), '''')'
        when 'description' then 'nullif(lower(btrim(coalesce(filtered_rows.description, ''''))), '''')'
        when 'product_link' then 'nullif(lower(btrim(coalesce(filtered_rows.product_link, ''''))), '''')'
        when 'company_name' then 'nullif(lower(btrim(coalesce(filtered_rows.company_name, ''''))), '''')'
        when 'product_name' then 'nullif(lower(btrim(coalesce(filtered_rows.product_name, ''''))), '''')'
        when 'option_name' then 'nullif(lower(btrim(coalesce(filtered_rows.option_name, ''''))), '''')'
        when 'review_type' then 'nullif(lower(btrim(coalesce(filtered_rows.review_type, ''''))), '''')'
        when 'assign_name' then 'nullif(lower(btrim(coalesce(filtered_rows.assign_name, ''''))), '''')'
        when 'review_photos' then 'case when jsonb_array_length(coalesce(filtered_rows.review_photos, ''[]''::jsonb)) > 0 then 0 else 1 end'
        when 'order_number' then 'nullif(lower(btrim(coalesce(filtered_rows.order_number, ''''))), '''')'
        when 'buyer_name' then 'nullif(lower(btrim(coalesce(filtered_rows.buyer_name, ''''))), '''')'
        when 'recipient_name' then 'nullif(lower(btrim(coalesce(filtered_rows.recipient_name, ''''))), '''')'
        when 'purchase_account' then 'nullif(lower(btrim(coalesce(filtered_rows.purchase_account, ''''))), '''')'
        when 'contact' then 'nullif(lower(btrim(coalesce(filtered_rows.contact, ''''))), '''')'
        when 'address' then 'nullif(lower(btrim(coalesce(filtered_rows.address, ''''))), '''')'
        when 'bank_name' then 'nullif(lower(btrim(coalesce(filtered_rows.bank_name, ''''))), '''')'
        when 'bank_account' then 'nullif(lower(btrim(coalesce(filtered_rows.bank_account, ''''))), '''')'
        when 'account_holder' then 'nullif(lower(btrim(coalesce(filtered_rows.account_holder, ''''))), '''')'
        when 'amount' then 'filtered_rows.amount'
        when 'review_fee' then 'filtered_rows.review_fee'
        when 'planned_depositor_name' then 'nullif(lower(btrim(coalesce(filtered_rows.planned_depositor_name, ''''))), '''')'
        when 'is_review_verified' then 'case when filtered_rows.is_review_verified then 0 else 1 end'
        when 'is_deposit_verified' then 'case when filtered_rows.is_deposit_verified then 0 else 1 end'
        when 'deposited_at' then 'filtered_rows.deposited_at'
        when 'actual_depositor_name' then 'nullif(lower(btrim(coalesce(filtered_rows.actual_depositor_name, ''''))), '''')'
        when 'product_fee_deposit_GB' then 'nullif(lower(btrim(coalesce(filtered_rows.product_fee_deposit_GB, ''''))), '''')'
        when 'review_fee_deposit_GB' then 'nullif(lower(btrim(coalesce(filtered_rows.review_fee_deposit_GB, ''''))), '''')'
        else null
      end;
    else
      raise exception '지원하지 않는 정렬 화면입니다.' using errcode = '22023';
    end if;

    if v_expression is null or v_direction not in ('ASC', 'DESC') then
      raise exception '지원하지 않는 정렬 조건입니다.' using errcode = '22023';
    end if;

    v_order_sql := concat(
      v_order_sql,
      case when v_order_sql = '' then '' else ', ' end,
      format('case when (%s) is null then 1 else 0 end asc, (%s) %s', v_expression, v_expression, v_direction)
    );
  end loop;

  if v_order_sql = '' and p_screen = 'review_receive' then
    return 'filtered_rows.cursor_product_date desc, filtered_rows.id desc';
  end if;

  if v_order_sql = '' and p_screen = 'product_overview' then
    return 'filtered_rows.product_sort_at desc, filtered_rows.product_id asc, filtered_rows.submission_sort_at asc, filtered_rows.submission_id asc';
  end if;

  if p_screen = 'review_receive' then
    return v_order_sql || ', filtered_rows.id asc';
  end if;

  return v_order_sql || ', filtered_rows.product_id asc, filtered_rows.submission_id asc';
end;
$function$;

revoke all on function public.admin_gateway_validate_list_sort(jsonb, text[]) from public, anon, authenticated;
revoke all on function public.admin_gateway_list_sort_value(jsonb, text) from public, anon, authenticated;
revoke all on function public.admin_gateway_list_sort_after(jsonb, jsonb, jsonb, bigint, bigint) from public, anon, authenticated;
revoke all on function public.admin_gateway_build_list_sort_cursor(jsonb, jsonb, bigint, bigint) from public, anon, authenticated;
revoke all on function public.admin_gateway_list_sort_order_sql(text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_gateway_validate_list_sort(jsonb, text[]) to service_role;
grant execute on function public.admin_gateway_list_sort_value(jsonb, text) to service_role;
grant execute on function public.admin_gateway_list_sort_after(jsonb, jsonb, jsonb, bigint, bigint) to service_role;
grant execute on function public.admin_gateway_build_list_sort_cursor(jsonb, jsonb, bigint, bigint) to service_role;
grant execute on function public.admin_gateway_list_sort_order_sql(text, jsonb) to service_role;

create or replace function public.get_admin_review_receive_product_summaries_gateway_v2(
  p_actor_admin_id text,
  p_include_company_data boolean default false,
  p_force_personal_scope boolean default false,
  p_view_mode text default 'all',
  p_filters jsonb default '{}'::jsonb,
  p_sort jsonb default '[]'::jsonb,
  p_page_size integer default 50,
  p_cursor jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 200);
  v_view_mode text := coalesce(nullif(lower(btrim(p_view_mode)), ''), 'all');
  v_sort jsonb;
  v_order_sql text;
  v_sql text;
  v_product_manager_ids text[];
  v_submission_manager_ids text[];
  v_filters_literal text;
  v_sort_literal text;
  v_cursor_literal text;
  v_total_count bigint := 0;
  v_rows jsonb := '[]'::jsonb;
  v_next_row jsonb;
  v_next_cursor jsonb;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product.read');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.read');

  if v_view_mode not in ('all', 'in_progress', 'completed') then
    raise exception '리뷰받기 목록 상태값이 올바르지 않습니다.' using errcode = '22023';
  end if;

  v_sort := public.admin_gateway_validate_list_sort(
    p_sort,
    array[
      'registered_date', 'company_name', 'product_name', 'option_name',
      'review_type', 'product_fee_deposit_GB', 'review_fee_deposit_GB',
      'product_link', 'manager_id'
    ]::text[]
  );
  v_order_sql := public.admin_gateway_list_sort_order_sql('review_receive', v_sort);

  select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
  into v_product_manager_ids
  from public.admin_gateway_allowed_manager_ids(
    p_actor_admin_id,
    'product.read',
    p_force_personal_scope
  ) as manager_ids;

  select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
  into v_submission_manager_ids
  from public.admin_gateway_allowed_manager_ids(
    p_actor_admin_id,
    'submission.read',
    p_force_personal_scope
  ) as manager_ids;

  v_filters_literal := quote_literal(coalesce(p_filters, '{}'::jsonb)::text) || '::jsonb';
  v_sort_literal := quote_literal(v_sort::text) || '::jsonb';
  v_cursor_literal := case
    when p_cursor is null then 'NULL::jsonb'
    else quote_literal(p_cursor::text) || '::jsonb'
  end;

  v_sql := format($query$
with scoped_products as materialized (
  select
    products.*,
    coalesce(products.bundle_id::bigint, products.id) as bundle_key,
    coalesce(products.product_date, products.created_at::date, date '0001-01-01') as sort_date,
    not (
      nullif(btrim(coalesce(products.title, '')), '') is null
      and nullif(btrim(coalesce(products.product_name, '')), '') is null
      and nullif(btrim(coalesce(products.option_name, '')), '') is null
      and nullif(btrim(coalesce(products.review_type, '')), '') is null
      and nullif(btrim(coalesce(products.description, '')), '') is null
      and nullif(btrim(coalesce(products.product_link, '')), '') is null
      and nullif(btrim(coalesce(products.planned_depositor_name, '')), '') is null
    ) as is_visible_product
  from public.products as products
  where btrim(products.manager_id) = any(%s::text[])
), product_counts as (
  select
    scoped_products.id as product_id,
    count(submissions.id)::integer as submission_count,
    count(submissions.id) filter (where coalesce(submissions.is_review_verified, false) = false)::integer as purchase_count,
    count(submissions.id) filter (
      where coalesce(submissions.is_review_verified, false) = true
        and coalesce(submissions.is_deposit_verified, false) = false
        and btrim(scoped_products.manager_id) = any(%s::text[])
    )::integer as review_count,
    count(submissions.id) filter (
      where coalesce(submissions.is_review_verified, false) = true
        and coalesce(submissions.is_deposit_verified, false) = true
        and btrim(scoped_products.manager_id) = any(%s::text[])
    )::integer as complete_count
  from scoped_products
  left join public.submissions as submissions
    on submissions.product_id = scoped_products.id
    and btrim(scoped_products.manager_id) = any(%s::text[])
  group by scoped_products.id
), product_rows as (
  select
    scoped_products.*,
    coalesce(product_counts.submission_count, 0) as submission_count,
    coalesce(product_counts.purchase_count, 0) as purchase_count,
    coalesce(product_counts.review_count, 0) as review_count,
    coalesce(product_counts.complete_count, 0) as complete_count
  from scoped_products
  left join product_counts on product_counts.product_id = scoped_products.id
), bundle_meta as (
  select
    product_rows.bundle_key,
    min(product_rows.id) as representative_product_id,
    min(product_rows.id) filter (where product_rows.is_visible_product) as first_visible_product_id,
    count(*)::integer as bundle_product_count,
    count(*) filter (where product_rows.is_visible_product)::integer as bundle_item_count
  from product_rows
  group by product_rows.bundle_key
), bundle_rows as (
  select
    representative.id,
    representative.bundle_key as bundle_id,
    coalesce(first_visible.title, representative.title) as title,
    first_visible.product_name,
    first_visible.description,
    first_visible.product_link,
    representative.company_name,
    first_visible.option_name,
    first_visible.review_type,
    coalesce(first_visible.planned_depositor_name, representative.planned_depositor_name) as planned_depositor_name,
    representative.manager_id,
    representative.product_date,
    representative.created_at,
    coalesce(first_visible."deposit_GB", representative."deposit_GB") as "deposit_GB",
    representative.sort_date as cursor_product_date,
    coalesce(sum(product_rows.purchase_count) filter (where product_rows.is_visible_product), 0)::integer as purchase_count,
    coalesce(sum(product_rows.review_count) filter (where product_rows.is_visible_product), 0)::integer as review_count,
    coalesce(sum(product_rows.complete_count) filter (where product_rows.is_visible_product), 0)::integer as complete_count,
    coalesce(sum(product_rows.submission_count) filter (where product_rows.is_visible_product), 0)::integer as submission_count,
    bundle_meta.bundle_product_count,
    bundle_meta.bundle_item_count,
    jsonb_agg(
      jsonb_build_object(
        'id', product_rows.id,
        'bundle_id', product_rows.bundle_key,
        'title', product_rows.title,
        'product_name', product_rows.product_name,
        'description', product_rows.description,
        'product_link', product_rows.product_link,
        'company_name', product_rows.company_name,
        'option_name', product_rows.option_name,
        'review_type', product_rows.review_type,
        'planned_depositor_name', product_rows.planned_depositor_name,
        'manager_id', product_rows.manager_id,
        'product_date', product_rows.product_date,
        'created_at', product_rows.created_at,
        'deposit_GB', product_rows."deposit_GB",
        'purchase_count', product_rows.purchase_count,
        'review_count', product_rows.review_count,
        'complete_count', product_rows.complete_count,
        'submission_count', product_rows.submission_count,
        'status', case
          when product_rows.submission_count > 0 and product_rows.complete_count = product_rows.submission_count
            then 'completed' else 'in_progress' end
      ) order by product_rows.id
    ) as bundle_items,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', product_rows.id,
          'bundle_id', product_rows.bundle_key,
          'title', product_rows.title,
          'product_name', product_rows.product_name,
          'description', product_rows.description,
          'product_link', product_rows.product_link,
          'company_name', product_rows.company_name,
          'option_name', product_rows.option_name,
          'review_type', product_rows.review_type,
          'planned_depositor_name', product_rows.planned_depositor_name,
          'manager_id', product_rows.manager_id,
          'product_date', product_rows.product_date,
          'created_at', product_rows.created_at,
          'deposit_GB', product_rows."deposit_GB",
          'purchase_count', product_rows.purchase_count,
          'review_count', product_rows.review_count,
          'complete_count', product_rows.complete_count,
          'submission_count', product_rows.submission_count,
          'status', case
            when product_rows.submission_count > 0 and product_rows.complete_count = product_rows.submission_count
              then 'completed' else 'in_progress' end
        ) order by product_rows.id
      ) filter (where product_rows.is_visible_product),
      '[]'::jsonb
    ) as bundle_visible_items
  from bundle_meta
  join product_rows as representative on representative.id = bundle_meta.representative_product_id
  left join product_rows as first_visible on first_visible.id = bundle_meta.first_visible_product_id
  join product_rows on product_rows.bundle_key = bundle_meta.bundle_key
  group by
    representative.id, representative.bundle_key, representative.title, representative.company_name,
    representative.manager_id, representative.product_date, representative.created_at, representative.sort_date,
    representative.planned_depositor_name, representative."deposit_GB", first_visible.title,
    first_visible.product_name, first_visible.description, first_visible.product_link,
    first_visible.option_name, first_visible.review_type, first_visible.planned_depositor_name,
    first_visible."deposit_GB", bundle_meta.bundle_product_count, bundle_meta.bundle_item_count
), status_rows as (
  select
    bundle_rows.*,
    case when bundle_rows.submission_count > 0 and bundle_rows.complete_count = bundle_rows.submission_count
      then 'completed' else 'in_progress' end as status,
    case when bundle_rows."deposit_GB" in (3, 4) then '업체입금' else '자체입금' end as product_fee_deposit_label,
    case when bundle_rows."deposit_GB" in (2, 4) then '없음' else '자체입금' end as review_fee_deposit_label
  from bundle_rows
), filtered_rows as (
  select status_rows.*, count(*) over() as total_count
  from status_rows
  where (
    %s = 'all'
    or (%s = 'completed' and status_rows.status = 'completed')
    or (%s = 'in_progress' and status_rows.status = 'in_progress')
  )
  and (nullif(%s #>> '{registered_date,start}', '') is null or status_rows.cursor_product_date >= (%s #>> '{registered_date,start}')::date)
  and (nullif(%s #>> '{registered_date,end}', '') is null or status_rows.cursor_product_date <= (%s #>> '{registered_date,end}')::date)
  and (nullif(public.normalize_review_receive_filter_text(%s ->> 'company_name'), '') is null or public.normalize_review_receive_filter_text(status_rows.company_name) like '%%' || public.normalize_review_receive_filter_text(%s ->> 'company_name') || '%%')
  and (nullif(public.normalize_review_receive_filter_text(%s ->> 'product_name'), '') is null or public.normalize_review_receive_filter_text(case when status_rows.bundle_item_count = 0 then '품목 미등록' else status_rows.product_name end) like '%%' || public.normalize_review_receive_filter_text(%s ->> 'product_name') || '%%')
  and (nullif(public.normalize_review_receive_filter_text(%s ->> 'option_name'), '') is null or public.normalize_review_receive_filter_text(case when status_rows.bundle_item_count = 0 then '품목 미등록' else status_rows.option_name end) like '%%' || public.normalize_review_receive_filter_text(%s ->> 'option_name') || '%%')
  and (nullif(public.normalize_review_receive_filter_text(%s ->> 'review_type'), '') is null or public.normalize_review_receive_filter_text(case when status_rows.bundle_item_count = 0 then '품목 미등록' else status_rows.review_type end) like '%%' || public.normalize_review_receive_filter_text(%s ->> 'review_type') || '%%')
  and (nullif(public.normalize_review_receive_filter_text(%s ->> 'product_fee_deposit_GB'), '') is null or public.normalize_review_receive_filter_text(case when status_rows.bundle_item_count = 0 then '품목 미등록' else status_rows.product_fee_deposit_label end) like '%%' || public.normalize_review_receive_filter_text(%s ->> 'product_fee_deposit_GB') || '%%')
  and (nullif(public.normalize_review_receive_filter_text(%s ->> 'review_fee_deposit_GB'), '') is null or public.normalize_review_receive_filter_text(case when status_rows.bundle_item_count = 0 then '품목 미등록' else status_rows.review_fee_deposit_label end) like '%%' || public.normalize_review_receive_filter_text(%s ->> 'review_fee_deposit_GB') || '%%')
  and (nullif(public.normalize_review_receive_filter_text(%s ->> 'product_link'), '') is null or public.normalize_review_receive_filter_text(case when status_rows.bundle_item_count = 0 then '품목 미등록' else status_rows.product_link end) like '%%' || public.normalize_review_receive_filter_text(%s ->> 'product_link') || '%%')
  and (nullif(public.normalize_review_receive_filter_text(%s ->> 'manager_id'), '') is null or public.normalize_review_receive_filter_text(status_rows.manager_id) like '%%' || public.normalize_review_receive_filter_text(%s ->> 'manager_id') || '%%')
), ranked_rows as (
  select
    filtered_rows.*,
    row_number() over (order by %s) as page_row_number
  from filtered_rows
  where %s is null
    or public.admin_gateway_list_sort_after(%s, %s, to_jsonb(filtered_rows), filtered_rows.id, null)
), limited_rows as (
  select * from ranked_rows where page_row_number <= %s
)
select
  coalesce(max(limited_rows.total_count), 0),
  coalesce(
    jsonb_agg((to_jsonb(limited_rows) - 'total_count' - 'page_row_number') order by limited_rows.page_row_number)
      filter (where limited_rows.page_row_number <= %s),
    '[]'::jsonb
  ),
  (jsonb_agg(to_jsonb(limited_rows)) filter (where limited_rows.page_row_number = %s)) -> 0
from limited_rows
$query$,
    quote_literal(v_product_manager_ids::text),
    quote_literal(v_submission_manager_ids::text),
    quote_literal(v_submission_manager_ids::text),
    quote_literal(v_submission_manager_ids::text),
    quote_literal(v_view_mode), quote_literal(v_view_mode), quote_literal(v_view_mode),
    v_filters_literal, v_filters_literal,
    v_filters_literal, v_filters_literal, v_filters_literal, v_filters_literal,
    v_filters_literal, v_filters_literal, v_filters_literal, v_filters_literal,
    v_filters_literal, v_filters_literal, v_filters_literal, v_filters_literal,
    v_filters_literal, v_filters_literal, v_filters_literal, v_filters_literal,
    v_filters_literal, v_filters_literal,
    v_order_sql, v_cursor_literal, v_sort_literal, v_cursor_literal,
    v_page_size + 1, v_page_size, v_page_size
  );

  execute v_sql into v_total_count, v_rows, v_next_row;

  if v_total_count > v_page_size and v_next_row is not null then
    v_next_cursor := public.admin_gateway_build_list_sort_cursor(
      v_sort,
      v_next_row,
      (v_next_row ->> 'id')::bigint,
      null
    );
  end if;

  return jsonb_build_object(
    'rows', coalesce(v_rows, '[]'::jsonb),
    'scope', public.admin_gateway_scope_json(
      p_actor_admin_id,
      array['product.read', 'submission.read']::text[],
      p_force_personal_scope
    ),
    'pageInfo', jsonb_build_object(
      'hasMore', v_next_cursor is not null,
      'nextCursor', v_next_cursor,
      'pageSize', v_page_size,
      'totalCount', v_total_count
    )
  );
end;
$function$;

revoke all on function public.get_admin_review_receive_product_summaries_gateway_v2(text, boolean, boolean, text, jsonb, jsonb, integer, jsonb) from public, anon, authenticated;
grant execute on function public.get_admin_review_receive_product_summaries_gateway_v2(text, boolean, boolean, text, jsonb, jsonb, integer, jsonb) to service_role;

create or replace function public.get_admin_product_overview_rows_gateway_v2(
  p_actor_admin_id text,
  p_include_company_data boolean default false,
  p_force_personal_scope boolean default false,
  p_status text default 'all',
  p_filters jsonb default '{}'::jsonb,
  p_sort jsonb default '[]'::jsonb,
  p_page_size integer default 300,
  p_cursor jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_page_size integer := least(greatest(coalesce(p_page_size, 300), 1), 1000);
  v_status text := coalesce(nullif(lower(btrim(p_status)), ''), 'all');
  v_sort jsonb;
  v_order_sql text;
  v_sql text;
  v_product_manager_ids text[];
  v_submission_manager_ids text[];
  v_photo_manager_ids text[];
  v_total_count bigint := 0;
  v_rows jsonb := '[]'::jsonb;
  v_next_row jsonb;
  v_next_cursor jsonb;
begin
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product.read');
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.read');

  if v_status not in ('all', 'purchase', 'review', 'complete') then
    raise exception '상품전체보기 상태값이 올바르지 않습니다.' using errcode = '22023';
  end if;

  v_sort := public.admin_gateway_validate_list_sort(
    p_sort,
    array[
      'manager_id', 'title', 'description', 'product_link', 'company_name',
      'product_name', 'option_name', 'review_type', 'assign_name',
      'review_photos', 'order_number', 'buyer_name', 'recipient_name',
      'purchase_account', 'contact', 'address', 'bank_name', 'bank_account',
      'account_holder', 'amount', 'review_fee', 'planned_depositor_name',
      'is_review_verified', 'is_deposit_verified', 'deposited_at',
      'actual_depositor_name', 'product_fee_deposit_GB', 'review_fee_deposit_GB'
    ]::text[]
  );
  v_order_sql := public.admin_gateway_list_sort_order_sql('product_overview', v_sort);

  select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
  into v_product_manager_ids
  from public.admin_gateway_allowed_manager_ids(
    p_actor_admin_id,
    'product.read',
    p_force_personal_scope
  ) as manager_ids;

  select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
  into v_submission_manager_ids
  from public.admin_gateway_allowed_manager_ids(
    p_actor_admin_id,
    'submission.read',
    p_force_personal_scope
  ) as manager_ids;

  select coalesce(array_agg(manager_ids.login_id order by manager_ids.login_id), '{}'::text[])
  into v_photo_manager_ids
  from public.admin_gateway_allowed_manager_ids(
    p_actor_admin_id,
    'submission.photo.read',
    p_force_personal_scope
  ) as manager_ids;

  v_sql := format($query$
with base_rows as (
  select
    products.id as product_id,
    submissions.id as submission_id,
    products.created_at as product_created_at,
    submissions.created_at as submission_created_at,
    products.created_at as product_sort_at,
    submissions.created_at as submission_sort_at,
    products.manager_id,
    products.title,
    products.product_name,
    products.deposit_date,
    products.description,
    products.product_link,
    products.is_real_shipping,
    products.company_name,
    products.option_name,
    products.review_type,
    products.planned_depositor_name,
    products."deposit_GB",
    submissions.assign_name,
    case
      when btrim(products.manager_id) = any($3::text[]) then coalesce(photo_rows.review_photos, '[]'::jsonb)
      else '[]'::jsonb
    end as review_photos,
    submissions.order_number,
    submissions.buyer_name,
    submissions.recipient_name,
    submissions.purchase_account,
    submissions.contact,
    submissions.address,
    submissions.bank_name,
    submissions.bank_account,
    submissions.account_holder,
    submissions.amount,
    submissions.review_fee,
    coalesce(submissions.is_purchase_verified, false) as is_purchase_verified,
    coalesce(submissions.is_review_verified, false) as is_review_verified,
    coalesce(submissions.is_deposit_verified, false) as is_deposit_verified,
    submissions.deposited_at,
    submissions.actual_depositor_name,
    case when products."deposit_GB" in (3, 4) then '업체입금' else '자체입금' end as product_fee_deposit_GB,
    case when products."deposit_GB" in (2, 4) then '없음' else '자체입금' end as review_fee_deposit_GB
  from public.products as products
  join public.submissions as submissions
    on submissions.product_id = products.id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', evidence_photos.id,
        'submission_id', evidence_photos.submission_id,
        'photo_type', evidence_photos.photo_type,
        'image_url', evidence_photos.image_url,
        'created_at', evidence_photos.created_at
      ) order by evidence_photos.created_at, evidence_photos.id
    ) as review_photos
    from public.evidence_photos as evidence_photos
    where evidence_photos.submission_id = submissions.id
      and evidence_photos.photo_type = 'review'
  ) as photo_rows on true
  where btrim(products.manager_id) = any($1::text[])
    and btrim(products.manager_id) = any($2::text[])
), filtered_rows as (
  select base_rows.*, count(*) over() as total_count
  from base_rows
  where (
    $4 = 'all'
    or ($4 = 'purchase' and base_rows.is_review_verified = false)
    or ($4 = 'review' and base_rows.is_review_verified = true and base_rows.is_deposit_verified = false)
    or ($4 = 'complete' and base_rows.is_review_verified = true and base_rows.is_deposit_verified = true)
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'manager_id'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.manager_id)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'manager_id') || '%%'
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'title'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.title)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'title') || '%%'
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'description'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.description)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'description') || '%%'
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'product_link'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.product_link)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'product_link') || '%%'
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'company_name'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.company_name)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'company_name') || '%%'
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'product_name'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.product_name)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'product_name') || '%%'
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'option_name'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.option_name)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'option_name') || '%%'
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'review_type'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.review_type)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'review_type') || '%%'
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'assign_name'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.assign_name)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'assign_name') || '%%'
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'review_photos'), '') is null
    or (
      public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'review_photos') in ('has', '사진있음')
      and jsonb_array_length(base_rows.review_photos) > 0
    )
    or (
      public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'review_photos') in ('none', '사진없음')
      and jsonb_array_length(base_rows.review_photos) = 0
    )
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'order_number'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.order_number)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'order_number') || '%%'
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'buyer_name'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.buyer_name)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'buyer_name') || '%%'
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'recipient_name'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.recipient_name)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'recipient_name') || '%%'
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'purchase_account'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.purchase_account)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'purchase_account') || '%%'
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'contact'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.contact)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'contact') || '%%'
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'address'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.address)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'address') || '%%'
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'bank_name'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.bank_name)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'bank_name') || '%%'
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'bank_account'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.bank_account)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'bank_account') || '%%'
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'account_holder'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.account_holder)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'account_holder') || '%%'
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'amount'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.amount::text)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'amount') || '%%'
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'review_fee'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.review_fee::text)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'review_fee') || '%%'
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'planned_depositor_name'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.planned_depositor_name)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'planned_depositor_name') || '%%'
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'is_review_verified'), '') is null
    or (
      public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'is_review_verified') in ('true', '1', '예', 'y', 'yes')
      and base_rows.is_review_verified
    )
    or (
      public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'is_review_verified') in ('false', '0', '아니오', 'n', 'no')
      and not base_rows.is_review_verified
    )
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'is_deposit_verified'), '') is null
    or (
      public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'is_deposit_verified') in ('true', '1', '예', 'y', 'yes')
      and base_rows.is_deposit_verified
    )
    or (
      public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'is_deposit_verified') in ('false', '0', '아니오', 'n', 'no')
      and not base_rows.is_deposit_verified
    )
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'deposited_at'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.deposited_at::text)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'deposited_at') || '%%'
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'actual_depositor_name'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.actual_depositor_name)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'actual_depositor_name') || '%%'
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'product_fee_deposit_GB'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.product_fee_deposit_GB)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'product_fee_deposit_GB') || '%%'
  )
  and (
    nullif(public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'review_fee_deposit_GB'), '') is null
    or public.normalize_product_overview_filter_text(base_rows.review_fee_deposit_GB)
      like '%%' || public.normalize_product_overview_filter_text(coalesce($5, '{}'::jsonb) ->> 'review_fee_deposit_GB') || '%%'
  )
), ranked_rows as (
  select
    filtered_rows.*,
    row_number() over (order by %s) as page_row_number
  from filtered_rows
  where $7 is null
    or public.admin_gateway_list_sort_after(
      $6,
      $7,
      to_jsonb(filtered_rows),
      filtered_rows.product_id,
      filtered_rows.submission_id
    )
), limited_rows as (
  select * from ranked_rows where page_row_number <= $8
)
select
  coalesce(max(limited_rows.total_count), 0),
  coalesce(
    jsonb_agg((to_jsonb(limited_rows) - 'total_count' - 'page_row_number') order by limited_rows.page_row_number)
      filter (where limited_rows.page_row_number <= $9),
    '[]'::jsonb
  ),
  (jsonb_agg(to_jsonb(limited_rows)) filter (where limited_rows.page_row_number = $10)) -> 0
from limited_rows
$query$, v_order_sql);

  execute v_sql
  into v_total_count, v_rows, v_next_row
  using
    v_product_manager_ids,
    v_submission_manager_ids,
    v_photo_manager_ids,
    v_status,
    coalesce(p_filters, '{}'::jsonb),
    v_sort,
    p_cursor,
    v_page_size + 1,
    v_page_size,
    v_page_size;

  if v_total_count > v_page_size and v_next_row is not null then
    v_next_cursor := public.admin_gateway_build_list_sort_cursor(
      v_sort,
      v_next_row,
      (v_next_row ->> 'product_id')::bigint,
      (v_next_row ->> 'submission_id')::bigint
    );
  end if;

  return jsonb_build_object(
    'rows', coalesce(v_rows, '[]'::jsonb),
    'scope', public.admin_gateway_scope_json(
      p_actor_admin_id,
      array['product.read', 'submission.read']::text[],
      p_force_personal_scope
    ),
    'pageInfo', jsonb_build_object(
      'hasMore', v_next_cursor is not null,
      'nextCursor', v_next_cursor,
      'pageSize', v_page_size,
      'totalCount', v_total_count
    )
  );
end;
$function$;

revoke all on function public.get_admin_product_overview_rows_gateway_v2(text, boolean, boolean, text, jsonb, jsonb, integer, jsonb) from public, anon, authenticated;
grant execute on function public.get_admin_product_overview_rows_gateway_v2(text, boolean, boolean, text, jsonb, jsonb, integer, jsonb) to service_role;
