create index if not exists products_manager_product_date_id_idx
  on public.products (manager_id, product_date desc, id desc);

create index if not exists submissions_product_id_status_idx
  on public.submissions (product_id, is_review_verified, is_deposit_verified);

create or replace function public.normalize_review_receive_filter_text(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(coalesce(value, '')), '[[:space:]\./\\|_-]+', '', 'g');
$$;

create or replace function public.get_admin_review_receive_product_summaries(
  p_admin_id text,
  p_include_company_data boolean default false,
  p_view_mode text default 'all',
  p_filters jsonb default '{}'::jsonb,
  p_page_size integer default 50,
  p_cursor_product_date date default null,
  p_cursor_product_id bigint default null
)
returns table (
  id bigint,
  bundle_id bigint,
  title text,
  product_name text,
  description text,
  product_link text,
  company_name text,
  option_name text,
  review_type text,
  planned_depositor_name text,
  manager_id text,
  product_date date,
  created_at timestamptz,
  "deposit_GB" integer,
  cursor_product_date date,
  purchase_count integer,
  review_count integer,
  complete_count integer,
  submission_count integer,
  status text,
  bundle_product_count integer,
  bundle_item_count integer,
  bundle_items jsonb,
  bundle_visible_items jsonb
)
language sql
stable
as $$
with current_admin as (
  select login_id, nullif(trim(company), '') as company
  from public.admins
  where login_id = p_admin_id
),
manager_scope as (
  select p_admin_id as login_id
  where not coalesce(p_include_company_data, false)
    or not exists (select 1 from current_admin where company is not null)

  union

  select admins.login_id
  from public.admins
  join current_admin on current_admin.company is not null
  where coalesce(p_include_company_data, false)
    and admins.company = current_admin.company
),
scoped_products as (
  select
    products.*,
    coalesce(products.bundle_id::bigint, products.id) as bundle_key,
    coalesce(products.product_date, products.created_at::date, date '0001-01-01') as sort_date,
    not (
      nullif(trim(coalesce(products.title, '')), '') is null
      and nullif(trim(coalesce(products.product_name, '')), '') is null
      and nullif(trim(coalesce(products.option_name, '')), '') is null
      and nullif(trim(coalesce(products.review_type, '')), '') is null
      and nullif(trim(coalesce(products.description, '')), '') is null
      and nullif(trim(coalesce(products.product_link, '')), '') is null
      and nullif(trim(coalesce(products.planned_depositor_name, '')), '') is null
    ) as is_visible_product
  from public.products
  where products.manager_id in (select login_id from manager_scope)
),
product_counts as (
  select
    scoped_products.id as product_id,
    count(submissions.id)::integer as submission_count,
    count(submissions.id) filter (
      where coalesce(submissions.is_review_verified, false) = false
    )::integer as purchase_count,
    count(submissions.id) filter (
      where coalesce(submissions.is_review_verified, false) = true
        and coalesce(submissions.is_deposit_verified, false) = false
    )::integer as review_count,
    count(submissions.id) filter (
      where coalesce(submissions.is_review_verified, false) = true
        and coalesce(submissions.is_deposit_verified, false) = true
    )::integer as complete_count
  from scoped_products
  left join public.submissions
    on submissions.product_id = scoped_products.id
  group by scoped_products.id
),
product_rows as (
  select
    scoped_products.*,
    coalesce(product_counts.submission_count, 0) as submission_count,
    coalesce(product_counts.purchase_count, 0) as purchase_count,
    coalesce(product_counts.review_count, 0) as review_count,
    coalesce(product_counts.complete_count, 0) as complete_count
  from scoped_products
  left join product_counts
    on product_counts.product_id = scoped_products.id
),
bundle_meta as (
  select
    bundle_key,
    min(id) as representative_product_id,
    min(id) filter (where is_visible_product) as first_visible_product_id,
    count(*)::integer as bundle_product_count,
    count(*) filter (where is_visible_product)::integer as bundle_item_count
  from product_rows
  group by bundle_key
),
bundle_rows as (
  select
    representative.id,
    representative.bundle_key as bundle_id,
    coalesce(first_visible.title, representative.title) as title,
    coalesce(first_visible.product_name, null) as product_name,
    coalesce(first_visible.description, null) as description,
    coalesce(first_visible.product_link, null) as product_link,
    representative.company_name,
    coalesce(first_visible.option_name, null) as option_name,
    coalesce(first_visible.review_type, null) as review_type,
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
        'status',
          case
            when product_rows.submission_count > 0
              and product_rows.complete_count = product_rows.submission_count
              then 'completed'
            else 'in_progress'
          end
      )
      order by product_rows.id
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
          'status',
            case
              when product_rows.submission_count > 0
                and product_rows.complete_count = product_rows.submission_count
                then 'completed'
              else 'in_progress'
            end
        )
        order by product_rows.id
      ) filter (where product_rows.is_visible_product),
      '[]'::jsonb
    ) as bundle_visible_items
  from bundle_meta
  join product_rows as representative
    on representative.id = bundle_meta.representative_product_id
  left join product_rows as first_visible
    on first_visible.id = bundle_meta.first_visible_product_id
  join product_rows
    on product_rows.bundle_key = bundle_meta.bundle_key
  group by
    representative.id,
    representative.bundle_key,
    representative.title,
    representative.company_name,
    representative.manager_id,
    representative.product_date,
    representative.created_at,
    representative.sort_date,
    representative.planned_depositor_name,
    representative."deposit_GB",
    first_visible.title,
    first_visible.product_name,
    first_visible.description,
    first_visible.product_link,
    first_visible.option_name,
    first_visible.review_type,
    first_visible.planned_depositor_name,
    first_visible."deposit_GB",
    bundle_meta.bundle_product_count,
    bundle_meta.bundle_item_count
),
status_rows as (
  select
    bundle_rows.*,
    case
      when bundle_rows.submission_count > 0
        and bundle_rows.complete_count = bundle_rows.submission_count
        then 'completed'
      else 'in_progress'
    end as status,
    case
      when bundle_rows."deposit_GB" in (3, 4) then '업체입금'
      else '자체입금'
    end as product_fee_deposit_label,
    case
      when bundle_rows."deposit_GB" in (2, 4) then '없음'
      else '자체입금'
    end as review_fee_deposit_label
  from bundle_rows
),
filtered_rows as (
  select status_rows.*
  from status_rows
  where (
      coalesce(p_view_mode, 'all') = 'all'
      or (p_view_mode = 'completed' and status_rows.status = 'completed')
      or (p_view_mode = 'in_progress' and status_rows.status = 'in_progress')
    )
    and (
      nullif(p_filters #>> '{registered_date,start}', '') is null
      or status_rows.cursor_product_date >= (nullif(p_filters #>> '{registered_date,start}', ''))::date
    )
    and (
      nullif(p_filters #>> '{registered_date,end}', '') is null
      or status_rows.cursor_product_date <= (nullif(p_filters #>> '{registered_date,end}', ''))::date
    )
    and (
      nullif(public.normalize_review_receive_filter_text(p_filters ->> 'company_name'), '') is null
      or public.normalize_review_receive_filter_text(status_rows.company_name)
        like '%' || public.normalize_review_receive_filter_text(p_filters ->> 'company_name') || '%'
    )
    and (
      nullif(public.normalize_review_receive_filter_text(p_filters ->> 'product_name'), '') is null
      or public.normalize_review_receive_filter_text(
          case when status_rows.bundle_item_count = 0 then '품목 미등록' else status_rows.product_name end
        ) like '%' || public.normalize_review_receive_filter_text(p_filters ->> 'product_name') || '%'
    )
    and (
      nullif(public.normalize_review_receive_filter_text(p_filters ->> 'option_name'), '') is null
      or public.normalize_review_receive_filter_text(
          case when status_rows.bundle_item_count = 0 then '품목 미등록' else status_rows.option_name end
        ) like '%' || public.normalize_review_receive_filter_text(p_filters ->> 'option_name') || '%'
    )
    and (
      nullif(public.normalize_review_receive_filter_text(p_filters ->> 'review_type'), '') is null
      or public.normalize_review_receive_filter_text(
          case when status_rows.bundle_item_count = 0 then '품목 미등록' else status_rows.review_type end
        ) like '%' || public.normalize_review_receive_filter_text(p_filters ->> 'review_type') || '%'
    )
    and (
      nullif(public.normalize_review_receive_filter_text(p_filters ->> 'product_fee_deposit_GB'), '') is null
      or public.normalize_review_receive_filter_text(
          case when status_rows.bundle_item_count = 0 then '품목 미등록' else status_rows.product_fee_deposit_label end
        ) like '%' || public.normalize_review_receive_filter_text(p_filters ->> 'product_fee_deposit_GB') || '%'
    )
    and (
      nullif(public.normalize_review_receive_filter_text(p_filters ->> 'review_fee_deposit_GB'), '') is null
      or public.normalize_review_receive_filter_text(
          case when status_rows.bundle_item_count = 0 then '품목 미등록' else status_rows.review_fee_deposit_label end
        ) like '%' || public.normalize_review_receive_filter_text(p_filters ->> 'review_fee_deposit_GB') || '%'
    )
    and (
      nullif(public.normalize_review_receive_filter_text(p_filters ->> 'product_link'), '') is null
      or public.normalize_review_receive_filter_text(
          case when status_rows.bundle_item_count = 0 then '품목 미등록' else status_rows.product_link end
        ) like '%' || public.normalize_review_receive_filter_text(p_filters ->> 'product_link') || '%'
    )
    and (
      nullif(public.normalize_review_receive_filter_text(p_filters ->> 'manager_id'), '') is null
      or public.normalize_review_receive_filter_text(status_rows.manager_id)
        like '%' || public.normalize_review_receive_filter_text(p_filters ->> 'manager_id') || '%'
    )
    and (
      p_cursor_product_date is null
      or p_cursor_product_id is null
      or status_rows.cursor_product_date < p_cursor_product_date
      or (
        status_rows.cursor_product_date = p_cursor_product_date
        and status_rows.id < p_cursor_product_id
      )
    )
)
select
  filtered_rows.id,
  filtered_rows.bundle_id,
  filtered_rows.title,
  filtered_rows.product_name,
  filtered_rows.description,
  filtered_rows.product_link,
  filtered_rows.company_name,
  filtered_rows.option_name,
  filtered_rows.review_type,
  filtered_rows.planned_depositor_name,
  filtered_rows.manager_id,
  filtered_rows.product_date,
  filtered_rows.created_at,
  filtered_rows."deposit_GB",
  filtered_rows.cursor_product_date,
  filtered_rows.purchase_count,
  filtered_rows.review_count,
  filtered_rows.complete_count,
  filtered_rows.submission_count,
  filtered_rows.status,
  filtered_rows.bundle_product_count,
  filtered_rows.bundle_item_count,
  filtered_rows.bundle_items,
  filtered_rows.bundle_visible_items
from filtered_rows
order by filtered_rows.cursor_product_date desc, filtered_rows.id desc
limit least(greatest(coalesce(p_page_size, 50), 1), 200) + 1;
$$;

comment on function public.get_admin_review_receive_product_summaries(
  text,
  boolean,
  text,
  jsonb,
  integer,
  date,
  bigint
) is
  '관리자 리뷰받기 목록용 번들 집계 RPC. 관리자 범위, 진행/완료 상태, 열 필터, 커서 페이지 제한을 DB에서 처리한다.';
