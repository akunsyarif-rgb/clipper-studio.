-- Which service the stored key belongs to: Google directly, or an OpenAI-format router (such as OpenRouter) at base_url.
alter table public.user_secrets
  add column provider text not null default 'google' check (provider in ('google', 'openai')),
  add column base_url text;
