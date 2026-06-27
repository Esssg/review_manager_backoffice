create or replace function public.get_admin_product_overview_rows(
  p_admin_id text,
  p_include_company_data boolean default false,
  p_status text default 'all',
  p_filters jsonb default '{}'::jsonb,
  p_page_size integer default 1000,
  p_cursor_product_created_at timestamptz default null,
  p_cursor_product_id bigint default null,
  p_cursor_submission_created_at timestamptz default null,
  p_cursor_submission_id bigint default null
)
returns table (
  product_id bigint,
  submission_id bigint,
  product_created_at timestamptz,
  submission_created_at timestamptz,
  manager_id text,
  title text,
  product_name text,
  deposit_date date,
  description text,
  product_link text,
  is_real_shipping boolean,
  company_name text,
  option_name text,
  review_type text,
  planned_depositor_name text,
  "deposit_GB" integer,
  assign_name text,
  review_photos jsonb,
  order_number text,
  buyer_name text,
  recipient_name text,
  purchase_account text,
  contact text,
  address text,
  bank_name text,
  bank_account text,
  account_holder text,
  amount integer,
  review_fee integer,
  is_purchase_verified boolean,
  is_review_verified boolean,
  is_deposit_verified boolean,
  deposited_at date,
  actual_depositor_name text,
  product_fee_deposit_GB text,
  review_fee_deposit_GB text,
  total_count bigint
)
language sql
stable
as $$
with current_admin as (
  select admins.login_id, nullif(trim(admins.company), '') as company
  from public.admins
  where admins.login_id = p_admin_id
),
manager_scope as (
  select p_admin_id as login_id
  where not coalesce(p_include_company_data, false)
    or not exists (select 1 from current_admin where current_admin.company is not null)

  union

  select admins.login_id
  from public.admins
  join current_admin on current_admin.company is not null
  where coalesce(p_include_company_data, false)
    and admins.company = current_admin.company
),
normalized_inputs as (
  select
    case
      when p_status in ('all', 'purchase', 'review', 'complete') then p_status
      else 'all'
    end as status_key,
    coalesce(p_filters, '{}'::jsonb) as filters,
    least(greatest(coalesce(p_page_size, 1000), 1), 1000) as page_size
),
base_rows as (
  select
    products.id as product_id,
    submissions.id as submission_id,
    products.created_at as product_created_at,
    submissions.created_at as submission_created_at,
    coalesce(products.created_at, '-infinity'::timestamptz) as product_sort_at,
    coalesce(submissions.created_at, 'infinity'::timestamptz) as submission_sort_at,
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
    exists (
      select 1
      from public.evidence_photos
      where evidence_photos.submission_id = submissions.id
        and evidence_photos.photo_type = 'review'
    ) as has_review_photos,
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
    case
      when products."deposit_GB" in (3, 4) then '업체입금'
      else '자체입금'
    end as product_fee_deposit_GB,
    case
      when products."deposit_GB" in (2, 4) then '없음'
      else '자체입금'
    end as review_fee_deposit_GB
  from public.products
  join public.submissions
    on submissions.product_id = products.id
  where products.manager_id in (select manager_scope.login_id from manager_scope)
),
status_rows as (
  select base_rows.*
  from base_rows
  cross join normalized_inputs
  where normalized_inputs.status_key = 'all'
    or (
      normalized_inputs.status_key = 'purchase'
      and base_rows.is_review_verified = false
    )
    or (
      normalized_inputs.status_key = 'review'
      and base_rows.is_review_verified = true
      and base_rows.is_deposit_verified = false
    )
    or (
      normalized_inputs.status_key = 'complete'
      and base_rows.is_review_verified = true
      and base_rows.is_deposit_verified = true
    )
),
filtered_rows as (
  select status_rows.*
  from status_rows
  cross join normalized_inputs
  where (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'manager_id'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.manager_id)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'manager_id') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'title'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.title)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'title') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'description'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.description)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'description') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'product_link'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.product_link)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'product_link') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'company_name'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.company_name)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'company_name') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'product_name'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.product_name)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'product_name') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'option_name'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.option_name)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'option_name') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'review_type'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.review_type)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'review_type') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'assign_name'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.assign_name)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'assign_name') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'review_photos'), '') is null
      or (
        public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'review_photos') in ('has', '사진있음')
        and status_rows.has_review_photos = true
      )
      or (
        public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'review_photos') in ('none', '사진없음')
        and status_rows.has_review_photos = false
      )
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'order_number'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.order_number)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'order_number') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'buyer_name'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.buyer_name)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'buyer_name') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'recipient_name'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.recipient_name)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'recipient_name') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'purchase_account'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.purchase_account)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'purchase_account') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'contact'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.contact)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'contact') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'address'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.address)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'address') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'bank_name'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.bank_name)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'bank_name') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'bank_account'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.bank_account)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'bank_account') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'account_holder'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.account_holder)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'account_holder') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'amount'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.amount::text)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'amount') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'review_fee'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.review_fee::text)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'review_fee') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'planned_depositor_name'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.planned_depositor_name)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'planned_depositor_name') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'is_review_verified'), '') is null
      or (
        public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'is_review_verified') in ('true', '1', '예', 'y', 'yes')
        and status_rows.is_review_verified = true
      )
      or (
        public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'is_review_verified') in ('false', '0', '아니오', 'n', 'no')
        and status_rows.is_review_verified = false
      )
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'is_deposit_verified'), '') is null
      or (
        public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'is_deposit_verified') in ('true', '1', '예', 'y', 'yes')
        and status_rows.is_deposit_verified = true
      )
      or (
        public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'is_deposit_verified') in ('false', '0', '아니오', 'n', 'no')
        and status_rows.is_deposit_verified = false
      )
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'deposited_at'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.deposited_at::text)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'deposited_at') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'actual_depositor_name'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.actual_depositor_name)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'actual_depositor_name') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'product_fee_deposit_GB'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.product_fee_deposit_GB)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'product_fee_deposit_GB') || '%'
    )
    and (
      nullif(public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'review_fee_deposit_GB'), '') is null
      or public.normalize_product_overview_filter_text(status_rows.review_fee_deposit_GB)
        like '%' || public.normalize_product_overview_filter_text(normalized_inputs.filters ->> 'review_fee_deposit_GB') || '%'
    )
),
paged_rows as (
  select
    filtered_rows.*,
    count(*) over() as total_count
  from filtered_rows
  where p_cursor_product_id is null
    or filtered_rows.product_sort_at < coalesce(p_cursor_product_created_at, '-infinity'::timestamptz)
    or (
      filtered_rows.product_sort_at = coalesce(p_cursor_product_created_at, '-infinity'::timestamptz)
      and filtered_rows.product_id > p_cursor_product_id
    )
    or (
      filtered_rows.product_sort_at = coalesce(p_cursor_product_created_at, '-infinity'::timestamptz)
      and filtered_rows.product_id = p_cursor_product_id
      and filtered_rows.submission_sort_at > coalesce(p_cursor_submission_created_at, 'infinity'::timestamptz)
    )
    or (
      filtered_rows.product_sort_at = coalesce(p_cursor_product_created_at, '-infinity'::timestamptz)
      and filtered_rows.product_id = p_cursor_product_id
      and filtered_rows.submission_sort_at = coalesce(p_cursor_submission_created_at, 'infinity'::timestamptz)
      and filtered_rows.submission_id > coalesce(p_cursor_submission_id, 0)
    )
  order by
    filtered_rows.product_sort_at desc,
    filtered_rows.product_id asc,
    filtered_rows.submission_sort_at asc,
    filtered_rows.submission_id asc
  limit (select normalized_inputs.page_size + 1 from normalized_inputs)
)
select
  paged_rows.product_id,
  paged_rows.submission_id,
  paged_rows.product_created_at,
  paged_rows.submission_created_at,
  paged_rows.manager_id,
  paged_rows.title,
  paged_rows.product_name,
  paged_rows.deposit_date,
  paged_rows.description,
  paged_rows.product_link,
  paged_rows.is_real_shipping,
  paged_rows.company_name,
  paged_rows.option_name,
  paged_rows.review_type,
  paged_rows.planned_depositor_name,
  paged_rows."deposit_GB",
  paged_rows.assign_name,
  coalesce(review_photo_rows.review_photos, '[]'::jsonb) as review_photos,
  paged_rows.order_number,
  paged_rows.buyer_name,
  paged_rows.recipient_name,
  paged_rows.purchase_account,
  paged_rows.contact,
  paged_rows.address,
  paged_rows.bank_name,
  paged_rows.bank_account,
  paged_rows.account_holder,
  paged_rows.amount,
  paged_rows.review_fee,
  paged_rows.is_purchase_verified,
  paged_rows.is_review_verified,
  paged_rows.is_deposit_verified,
  paged_rows.deposited_at,
  paged_rows.actual_depositor_name,
  paged_rows.product_fee_deposit_GB,
  paged_rows.review_fee_deposit_GB,
  paged_rows.total_count
from paged_rows
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'id', evidence_photos.id,
      'submission_id', evidence_photos.submission_id,
      'photo_type', evidence_photos.photo_type,
      'image_url', evidence_photos.image_url,
      'created_at', evidence_photos.created_at
    )
    order by evidence_photos.created_at, evidence_photos.id
  ) as review_photos
  from public.evidence_photos
  where evidence_photos.submission_id = paged_rows.submission_id
    and evidence_photos.photo_type = 'review'
) as review_photo_rows on true;
$$;
