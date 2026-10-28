-- The owner's Pexels key (free stock photos). Same protection as user_secrets: RLS on, no policies, no privileges for
-- the API roles, so no client can read it; only the `pexels` Edge Function (service role) touches it. A table of its
-- own so that forgetting the AI key does not delete it, and the other way round.
create table public.user_pexels (
  user_id uuid primary key references auth.users(id) on delete cascade,
  api_key text,
  updated_at timestamptz not null default now()
);

alter table public.user_pexels enable row level security;
revoke all on public.user_pexels from anon, authenticated;

create trigger user_pexels_touch before update on public.user_pexels
  for each row execute function public.touch_updated_at();
