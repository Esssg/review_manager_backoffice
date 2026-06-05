alter table public.products
  drop constraint if exists products_deposit_gb_check;

update public.products
set "deposit_GB" = 4
where "deposit_GB" = 2;

update public.products
set "deposit_GB" = 1
where "deposit_GB" is null
   or "deposit_GB" not in (1, 2, 3, 4);

alter table public.products
  alter column "deposit_GB" set default 1;

alter table public.products
  add constraint products_deposit_gb_check check ("deposit_GB" in (1, 2, 3, 4));

comment on column public.products."deposit_GB" is
  '입금구분. 1=제품비 자체/리뷰비 자체, 2=제품비 자체/리뷰비 없음, 3=제품비 업체/리뷰비 자체, 4=제품비 업체/리뷰비 없음.';
