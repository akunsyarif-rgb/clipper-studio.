-- Content Hub organisation: one main platform and one content format per video, plus an optional thumbnail object.
-- Additive only: existing rows get the defaults ('uncategorized' / 'video'). The thumbnail key stays server-side like object_key.
alter table public.media_assets
  add column platform text not null default 'uncategorized'
    check (platform in ('tiktok', 'youtube', 'instagram', 'facebook', 'threads', 'x', 'other', 'uncategorized')),
  add column content_format text not null default 'video'
    check (content_format in ('shorts', 'reels', 'long_form', 'story', 'video')),
  add column thumb_key text;

create index media_assets_user_platform_idx on public.media_assets (user_id, platform, created_at desc);

grant select (platform, content_format) on public.media_assets to authenticated;
