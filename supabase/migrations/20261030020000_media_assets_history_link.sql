-- Links a saved video to its production notes (script, SEO packs, cover prompt) kept in app_history, by that entry's id.
-- Optional and client-visible; the notes themselves stay in app_history.
alter table public.media_assets add column history_id text check (history_id is null or history_id ~ '^[A-Za-z0-9:._-]{1,80}$');

grant select (history_id) on public.media_assets to authenticated;
