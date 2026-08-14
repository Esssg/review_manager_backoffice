create table if not exists public.admin_tutorial_progress (
  admin_id text not null references public.admins(login_id) on delete cascade,
  tutorial_version text not null,
  status text not null check (status in ('skipped', 'completed')),
  recorded_at timestamptz not null default now(),
  primary key (admin_id, tutorial_version)
);

create index if not exists admin_tutorial_progress_version_idx
  on public.admin_tutorial_progress (tutorial_version, recorded_at desc);
