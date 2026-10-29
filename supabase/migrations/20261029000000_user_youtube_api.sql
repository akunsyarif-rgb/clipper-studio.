-- The owner's YouTube Data API key (used only to read public view counts for the trend radar). Same protection as
-- user_secrets and user_pexels: RLS on, no policies, no privileges for the API roles, so no client can read it; only the
-- `trends` Edge Function (service role) touches it.
create table public.user_youtube_api (
  user_id uuid primary key references auth.users(id) on delete cascade,
  api_key text,
  updated_at timestamptz not null default now()
);

alter table public.user_youtube_api enable row level security;
revoke all on public.user_youtube_api from anon, authenticated;

create trigger user_youtube_api_touch before update on public.user_youtube_api
  for each row execute function public.touch_updated_at();
