-- Content Hub: one row of metadata per saved video. The video file itself lives in a private Cloudflare R2 bucket and is sent
-- there straight from the browser (presigned URLs from the `media-library` Edge Function). The row stays after the file is
-- deleted (status 'deleted'), so the creator keeps the history.
-- Clients may only READ their own rows (and not the storage columns). Every write goes through the Edge Function (service role).
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  duration_seconds numeric check (duration_seconds is null or duration_seconds >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  source text not null default 'clipper' check (source in ('clipper', 'motion')),
  object_key text not null unique,
  status text not null default 'uploading' check (status in ('uploading', 'ready', 'failed', 'deleting', 'deleted')),
  multipart_upload_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  file_deleted_at timestamptz,
  constraint media_assets_deleted_has_time check ((status = 'deleted') = (file_deleted_at is not null))
);

create index media_assets_user_created_idx on public.media_assets (user_id, created_at desc);

alter table public.media_assets enable row level security;

-- Read-only for the owner. No insert/update/delete policy exists, so no client can change metadata.
create policy "own media metadata" on public.media_assets
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.media_assets from anon, authenticated;
-- Column-level read: the storage key and multipart id stay server-only.
grant select (id, user_id, title, file_name, mime_type, file_size, duration_seconds, width, height, source, status, created_at, updated_at, file_deleted_at)
  on public.media_assets to authenticated;

create trigger media_assets_touch before update on public.media_assets
  for each row execute function public.touch_updated_at();
