-- 상세 화면에서 기존 번들에 상품/리뷰어를 반복 추가할 때
-- 새 상품이 별도 번들로 분리되지 않도록 bulk v2 계약을 보완한다.
-- target_bundle_id는 클라이언트가 임의의 관계를 직접 저장하는 값이 아니라,
-- 이 RPC에서 actor의 product.create 범위를 다시 검증한 뒤 사용하는 연결 대상이다.

create or replace function public.create_admin_review_receive_product_reviewer_bulk_v2(
  p_actor_admin_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor public.admins;
  v_groups jsonb;
  v_group jsonb;
  v_product_payload jsonb;
  v_submission_payload jsonb;
  v_reusable_product_id bigint;
  v_target_bundle_id bigint;
  v_target_bundle_anchor_id bigint;
  v_reusable_bundle_id bigint;
  v_bundle_id bigint;
  v_product_id bigint;
  v_product public.products;
  v_submission jsonb;
  v_products jsonb := '[]'::jsonb;
  v_submissions jsonb := '[]'::jsonb;
  v_group_count integer;
  v_total_submission_count integer := 0;
  v_group_index integer := 0;
  v_submission_index integer := 0;
  v_submission_count integer := 0;
  v_chunk_size integer := 50;
  v_chunk_start integer := 0;
  v_chunk_end integer := 0;
  v_sqlstate text;
  v_error_message text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception '상품/리뷰어 bulk payload는 JSON object여야 합니다.' using errcode = '22023';
  end if;

  perform public.admin_gateway_validate_payload_keys(
    p_payload,
    array['groups', 'reusable_product_id', 'target_bundle_id']::text[]
  );

  v_groups := p_payload -> 'groups';
  if v_groups is null or jsonb_typeof(v_groups) <> 'array' then
    raise exception '상품/리뷰어 bulk의 groups는 JSON array여야 합니다.' using errcode = '22023';
  end if;

  v_group_count := jsonb_array_length(v_groups);
  if v_group_count < 1 then
    raise exception '등록할 품목이 없습니다.' using errcode = '22023';
  elsif v_group_count > 500 then
    raise exception '상품/리뷰어 일괄입력은 최대 500개 품목까지 지원합니다.' using errcode = '22023';
  end if;

  -- 쓰기 전에 모든 group 구조와 총 행 수를 검증한다.
  for v_group in
    select value
    from jsonb_array_elements(v_groups) as groups(value)
  loop
    v_group_index := v_group_index + 1;

    if v_group is null or jsonb_typeof(v_group) <> 'object' then
      raise exception '%번째 품목 payload가 올바르지 않습니다.', v_group_index using errcode = '22023';
    end if;

    perform public.admin_gateway_validate_payload_keys(
      v_group,
      array['product', 'submissions']::text[]
    );

    v_product_payload := v_group -> 'product';
    if v_product_payload is null or jsonb_typeof(v_product_payload) <> 'object' then
      raise exception '%번째 품목의 product payload가 올바르지 않습니다.', v_group_index using errcode = '22023';
    end if;

    perform public.admin_gateway_validate_payload_keys(
      v_product_payload,
      array[
        'title', 'product_name', 'description', 'product_link', 'deposit_date',
        'product_date', 'is_real_shipping', 'company_name', 'option_name',
        'review_type', 'planned_depositor_name', 'deposit_GB'
      ]::text[]
    );

    if v_group -> 'submissions' is null or jsonb_typeof(v_group -> 'submissions') <> 'array' then
      raise exception '%번째 품목의 submissions는 JSON array여야 합니다.', v_group_index using errcode = '22023';
    end if;

    if jsonb_array_length(v_group -> 'submissions') < 1 then
      raise exception '%번째 품목에 등록할 리뷰어 행이 없습니다.', v_group_index using errcode = '22023';
    end if;

    v_total_submission_count := v_total_submission_count + jsonb_array_length(v_group -> 'submissions');
    if v_total_submission_count > 500 then
      raise exception '상품/리뷰어 일괄입력은 최대 500행까지 지원합니다.' using errcode = '22023';
    end if;

    for v_submission_payload in
      select value
      from jsonb_array_elements(v_group -> 'submissions') as submissions(value)
    loop
      if v_submission_payload is null or jsonb_typeof(v_submission_payload) <> 'object' then
        raise exception '%번째 품목의 submission payload가 올바르지 않습니다.', v_group_index using errcode = '22023';
      end if;

      perform public.admin_gateway_validate_payload_keys(
        v_submission_payload,
        array[
          'assign_name', 'order_number', 'buyer_name', 'recipient_name',
          'purchase_account', 'contact', 'address', 'bank_name', 'bank_account',
          'account_holder', 'amount', 'review_fee', 'is_purchase_verified',
          'is_review_verified', 'is_deposit_verified', 'deposited_at',
          'actual_depositor_name'
        ]::text[]
      );
    end loop;
  end loop;

  v_actor := public.admin_gateway_actor(p_actor_admin_id);
  perform public.admin_gateway_assert_permission(p_actor_admin_id, 'submission.create');
  v_reusable_product_id := nullif(btrim(p_payload ->> 'reusable_product_id'), '')::bigint;
  v_target_bundle_id := nullif(btrim(p_payload ->> 'target_bundle_id'), '')::bigint;

  if v_target_bundle_id is not null then
    -- target_bundle_id는 bundle root 또는 해당 bundle의 상품 ID를 받을 수 있다.
    -- 실제 연결에는 조회된 canonical bundle_id만 사용한다.
    select
      products.id,
      coalesce(products.bundle_id::bigint, products.id)
    into v_target_bundle_anchor_id, v_bundle_id
    from public.products as products
    where products.id = v_target_bundle_id
    for update;

    if not found then
      raise exception '연결할 상품 묶음을 찾지 못했습니다.' using errcode = '22023';
    end if;

    if not public.admin_gateway_product_allowed(
      p_actor_admin_id,
      v_target_bundle_anchor_id,
      'product.create'
    ) then
      raise exception '상품 묶음에 품목을 추가할 권한이 없습니다.' using errcode = '42501';
    end if;
  end if;

  if v_reusable_product_id is not null then
    perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product.update');

    select products.*
    into v_product
    from public.products as products
    where products.id = v_reusable_product_id
    for update;

    if not found then
      raise exception '재사용할 빈 상품을 찾지 못했습니다.' using errcode = '22023';
    end if;

    if not public.admin_gateway_product_allowed(
      p_actor_admin_id,
      v_reusable_product_id,
      'product.update'
    ) then
      raise exception '기존 빈 상품을 수정할 권한이 없습니다.' using errcode = '42501';
    end if;

    if (
      coalesce(btrim(v_product.title), '') <> ''
      or coalesce(btrim(v_product.product_name), '') <> ''
      or coalesce(btrim(v_product.option_name), '') <> ''
      or coalesce(btrim(v_product.review_type), '') <> ''
      or coalesce(btrim(v_product.description), '') <> ''
      or coalesce(btrim(v_product.product_link), '') <> ''
      or coalesce(btrim(v_product.planned_depositor_name), '') <> ''
    ) then
      raise exception '상품/리뷰어 일괄입력은 비어 있는 상품만 재사용할 수 있습니다.' using errcode = '22023';
    end if;

    v_reusable_bundle_id := coalesce(v_product.bundle_id::bigint, v_product.id);

    if v_bundle_id is not null and v_bundle_id <> v_reusable_bundle_id then
      raise exception '재사용 상품과 대상 상품 묶음이 일치하지 않습니다.' using errcode = '22023';
    end if;

    v_bundle_id := v_reusable_bundle_id;
  end if;

  if v_reusable_product_id is null or v_group_count > 1 then
    perform public.admin_gateway_assert_permission(p_actor_admin_id, 'product.create');
  end if;

  if v_reusable_product_id is not null and v_group_count > 1 then
    if not public.admin_gateway_product_allowed(
      p_actor_admin_id,
      v_bundle_id,
      'product.create'
    ) then
      raise exception '상품 묶음에 품목을 추가할 권한이 없습니다.' using errcode = '42501';
    end if;
  end if;

  v_group_index := 0;
  for v_group in
    select value
    from jsonb_array_elements(v_groups) as groups(value)
  loop
    v_group_index := v_group_index + 1;
    v_product_payload := v_group -> 'product';

    if v_reusable_product_id is not null and v_group_index = 1 then
      update public.products
      set
        title = case when v_product_payload ? 'title' then v_product_payload ->> 'title' else title end,
        product_name = case when v_product_payload ? 'product_name' then v_product_payload ->> 'product_name' else product_name end,
        description = case when v_product_payload ? 'description' then v_product_payload ->> 'description' else description end,
        product_link = case when v_product_payload ? 'product_link' then v_product_payload ->> 'product_link' else product_link end,
        deposit_date = case
          when v_product_payload ? 'deposit_date' and jsonb_typeof(v_product_payload -> 'deposit_date') <> 'null'
            then (v_product_payload ->> 'deposit_date')::date
          when v_product_payload ? 'deposit_date' then null
          else deposit_date
        end,
        product_date = case
          when v_product_payload ? 'product_date' and jsonb_typeof(v_product_payload -> 'product_date') <> 'null'
            then (v_product_payload ->> 'product_date')::date
          else product_date
        end,
        is_real_shipping = case when v_product_payload ? 'is_real_shipping'
          then coalesce((v_product_payload ->> 'is_real_shipping')::boolean, is_real_shipping)
          else is_real_shipping end,
        company_name = case when v_product_payload ? 'company_name' then v_product_payload ->> 'company_name' else company_name end,
        option_name = case when v_product_payload ? 'option_name' then v_product_payload ->> 'option_name' else option_name end,
        review_type = case when v_product_payload ? 'review_type' then v_product_payload ->> 'review_type' else review_type end,
        planned_depositor_name = case when v_product_payload ? 'planned_depositor_name'
          then v_product_payload ->> 'planned_depositor_name' else planned_depositor_name end,
        "deposit_GB" = case
          when v_product_payload ? 'deposit_GB' and jsonb_typeof(v_product_payload -> 'deposit_GB') <> 'null'
            then (v_product_payload ->> 'deposit_GB')::integer
          else "deposit_GB"
        end,
        bundle_id = coalesce(bundle_id, v_bundle_id::integer)
      where id = v_reusable_product_id
      returning * into v_product;

      v_product_id := v_product.id;
    else
      insert into public.products (
        manager_id,
        title,
        product_name,
        description,
        product_link,
        deposit_date,
        product_date,
        is_real_shipping,
        company_name,
        option_name,
        review_type,
        planned_depositor_name,
        "deposit_GB",
        bundle_id
      )
      values (
        v_actor.login_id,
        v_product_payload ->> 'title',
        v_product_payload ->> 'product_name',
        v_product_payload ->> 'description',
        v_product_payload ->> 'product_link',
        case when v_product_payload ? 'deposit_date' and jsonb_typeof(v_product_payload -> 'deposit_date') <> 'null'
          then (v_product_payload ->> 'deposit_date')::date else null end,
        case when v_product_payload ? 'product_date' and jsonb_typeof(v_product_payload -> 'product_date') <> 'null'
          then (v_product_payload ->> 'product_date')::date else current_date end,
        coalesce((v_product_payload ->> 'is_real_shipping')::boolean, true),
        v_product_payload ->> 'company_name',
        v_product_payload ->> 'option_name',
        v_product_payload ->> 'review_type',
        v_product_payload ->> 'planned_depositor_name',
        coalesce((v_product_payload ->> 'deposit_GB')::integer, 1),
        v_bundle_id::integer
      )
      returning * into v_product;

      v_product_id := v_product.id;
      if v_bundle_id is null then
        v_bundle_id := v_product_id;
        update public.products
        set bundle_id = v_bundle_id::integer
        where id = v_product_id
        returning * into v_product;
      end if;
    end if;

    v_products := v_products || jsonb_build_array(to_jsonb(v_product));
    v_submission_index := 0;

    v_submission_count := jsonb_array_length(v_group -> 'submissions');
    v_chunk_start := 0;

    while v_chunk_start < v_submission_count loop
      v_chunk_end := least(v_chunk_start + v_chunk_size, v_submission_count);

      -- chunk 사이에는 commit하지 않는다. 50개 단위로 순회하더라도
      -- 함수 전체 transaction이므로 어느 chunk의 오류도 전체 rollback한다.
      for v_submission_payload in
        select submissions.value
        from jsonb_array_elements(v_group -> 'submissions') with ordinality as submissions(value, item_index)
        where submissions.item_index > v_chunk_start
          and submissions.item_index <= v_chunk_end
        order by submissions.item_index
      loop
        v_submission_index := v_submission_index + 1;
        begin
          v_submission := public.admin_gateway_insert_submission(
            p_actor_admin_id,
            v_product_id,
            v_submission_payload
          );
        exception when others then
          get stacked diagnostics
            v_sqlstate = returned_sqlstate,
            v_error_message = message_text;
          raise exception '%번째 품목 %번째 리뷰어 저장 중 오류가 발생했습니다: %',
            v_group_index,
            v_submission_index,
            v_error_message
            using errcode = v_sqlstate;
        end;

        v_submissions := v_submissions || jsonb_build_array(v_submission);
      end loop;

      v_chunk_start := v_chunk_end;
    end loop;
  end loop;

  return jsonb_build_object(
    'products', v_products,
    'submissions', v_submissions,
    'partial', false,
    'summary', jsonb_build_object(
      'createdProductCount', jsonb_array_length(v_products),
      'createdSubmissionCount', jsonb_array_length(v_submissions),
      'reusedProductId', v_reusable_product_id,
      'targetBundleId', v_target_bundle_id,
      'bundleId', v_bundle_id,
      'rowCount', v_total_submission_count
    ),
    'scope', public.admin_gateway_scope_json(
      p_actor_admin_id,
      array['submission.create']::text[]
    )
  );
end;
$function$;

revoke all on function public.create_admin_review_receive_product_reviewer_bulk_v2(text, jsonb) from public, anon, authenticated;
grant execute on function public.create_admin_review_receive_product_reviewer_bulk_v2(text, jsonb) to service_role;
