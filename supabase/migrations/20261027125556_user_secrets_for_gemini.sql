-- The owner's AI key. No client can read or write this table: RLS is on with no policies and the API roles
-- have no privileges. Only the Edge Function (service role) touches it.
create table public.user_secrets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gemini_key text,
  gemini_model text,
  updated_at timestamptz not null default now()
);

alter table public.user_secrets enable row level security;
revoke all on public.user_secrets from anon, authenticated;

create trigger user_secrets_touch before update on public.user_secrets
  for each row execute function public.touch_updated_at();
