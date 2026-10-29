-- The production history (scripts, SEO packs, render and download log) of each video, as text, so it follows the creator
-- between devices. One row per video; a deleted video stays as a small "deleted" row so another device does not bring it back.
create table public.app_history (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_ms bigint not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint app_history_size check (data is null or pg_column_size(data) < 500000)
);

alter table public.app_history enable row level security;

create policy "own history" on public.app_history
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create trigger app_history_touch before update on public.app_history
  for each row execute function public.touch_updated_at();
