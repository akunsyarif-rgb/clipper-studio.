-- Clipper Studio keeps only small text data here (work sessions, transcripts). Media never leaves the device.

create table public.app_sessions (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint app_sessions_size check (pg_column_size(data) < 2000000)
);

create table public.app_transcripts (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cache_key text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, cache_key),
  constraint app_transcripts_size check (pg_column_size(data) < 2000000)
);

alter table public.app_sessions enable row level security;
alter table public.app_transcripts enable row level security;

create policy "own sessions" on public.app_sessions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own transcripts" on public.app_transcripts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

create trigger app_sessions_touch before update on public.app_sessions
  for each row execute function public.touch_updated_at();
create trigger app_transcripts_touch before update on public.app_transcripts
  for each row execute function public.touch_updated_at();

-- Personal phase: only the first account (the owner) can ever be created. Remove this trigger before opening sign-ups.
create or replace function public.only_first_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from auth.users) then
    raise exception 'Pendaftaran ditutup: aplikasi ini masih pribadi.';
  end if;
  return new;
end $$;

revoke execute on function public.only_first_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

create trigger only_first_user before insert on auth.users
  for each row execute function public.only_first_user();
