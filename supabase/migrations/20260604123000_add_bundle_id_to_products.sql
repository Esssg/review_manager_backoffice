alter table public.products
  add column if not exists bundle_id integer;

update public.products
set bundle_id = id::integer
where bundle_id is null;

alter table public.products
  alter column title drop not null,
  alter column product_name drop not null;

create index if not exists products_bundle_id_idx
  on public.products (bundle_id);

comment on column public.products.bundle_id is
  '리뷰받기에서 같은 묶음으로 볼 products 식별값. 기존 단일 상품은 products.id와 동일한 값으로 초기화됨.';

comment on column public.products.title is
  '상품 제목. 리뷰받기 번들 생성 시 날짜/업체명만 먼저 저장할 수 있어 null 허용.';

comment on column public.products.product_name is
  '품명. 리뷰받기 번들 생성 시 날짜/업체명만 먼저 저장할 수 있어 null 허용.';
