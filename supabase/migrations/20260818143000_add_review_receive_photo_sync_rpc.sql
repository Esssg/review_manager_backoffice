create or replace function public.sync_review_receive_photo_rows(
  p_submission_id bigint,
  p_new_image_urls text[],
  p_removed_image_urls text[]
)
returns table (image_url text)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if p_submission_id is null then
    raise exception 'p_submission_id is required' using errcode = '22004';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('review-receive-photo:' || p_submission_id::text, 0)
  );

  insert into public.evidence_photos (submission_id, photo_type, image_url)
  select
    p_submission_id,
    'review',
    candidates.image_url
  from (
    select
      pg_catalog.btrim(candidate.image_url) as image_url,
      min(candidate.ordinality) as first_ordinality
    from pg_catalog.unnest(coalesce(p_new_image_urls, '{}'::text[]))
      with ordinality as candidate(image_url, ordinality)
    where nullif(pg_catalog.btrim(candidate.image_url), '') is not null
    group by pg_catalog.btrim(candidate.image_url)
  ) candidates
  where not exists (
    select 1
    from public.evidence_photos existing_photo
    where existing_photo.submission_id = p_submission_id
      and existing_photo.photo_type = 'review'
      and existing_photo.image_url = candidates.image_url
  )
  order by candidates.first_ordinality;

  delete from public.evidence_photos existing_photo
  where existing_photo.submission_id = p_submission_id
    and existing_photo.photo_type = 'review'
    and existing_photo.image_url = any(coalesce(p_removed_image_urls, '{}'::text[]))
    and not (existing_photo.image_url = any(coalesce(p_new_image_urls, '{}'::text[])));

  return query
  select existing_photo.image_url
  from public.evidence_photos existing_photo
  where existing_photo.submission_id = p_submission_id
    and existing_photo.photo_type = 'review'
  group by existing_photo.image_url
  order by min(existing_photo.id);
end;
$$;

revoke all on function public.sync_review_receive_photo_rows(bigint, text[], text[]) from public;
revoke all on function public.sync_review_receive_photo_rows(bigint, text[], text[]) from anon;
revoke all on function public.sync_review_receive_photo_rows(bigint, text[], text[]) from authenticated;
grant execute on function public.sync_review_receive_photo_rows(bigint, text[], text[]) to service_role;

comment on function public.sync_review_receive_photo_rows(bigint, text[], text[]) is
  'Serializes review photo row replacement per submission so a retried upload operation is idempotent.';

notify pgrst, 'reload schema';
