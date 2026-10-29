# Supabase

The backend of Clipper Studio (project `clipper-studio`): sign-in and text-only sync of work sessions and transcripts, plus
two Edge Functions. Media never goes here. Full description: `MOTION_STUDIO.md` ("Sinkron antar perangkat", "Kunci Gemini di server").

## Migrations (`migrations/`)

Applied in the order of their timestamps. They are the exact SQL that was applied to the project, so a new Supabase project
can be rebuilt by running them in order (SQL editor, or `supabase db push`).

| File | What it does |
|---|---|
| `20261027121834_clipper_sync_tables.sql` | `app_sessions` and `app_transcripts` with row-level security (each row only its owner's), a size limit per row, an `updated_at` trigger, and the **`only_first_user` trigger on `auth.users`** |
| `20261027124946_only_first_user_grant_auth_admin.sql` | lets the auth service run that trigger (without it every sign-up failed) |
| `20261027125556_user_secrets_for_gemini.sql` | `user_secrets`: the owner's AI key, closed to every client (RLS on, no policies, no privileges) |
| `20261027135153_user_secrets_provider.sql` | `provider` (`google` or `openai`) and `base_url` for OpenAI-format routers |
| `20261029000000_user_youtube_api.sql` | `user_youtube_api`: the owner's YouTube Data API key for the trend radar, closed to every client like `user_pexels` |
| `20261028020000_user_pexels.sql` | `user_pexels`: the owner's Pexels key, closed to every client like `user_secrets` (a table of its own, so forgetting the AI key does not delete it) |

## Before opening the app to other users

- Drop the owner-only trigger: `drop trigger only_first_user on auth.users;`
- Add per-account usage limits to the `gemini` function.

## Edge Functions (`functions/`)

`gemini` (AI proxy; key read from `user_secrets`), `youtube` (captions), `pexels` (stock-photo search and download; key read from `user_pexels`) `trends` (trend radar: Wikipedia surges and Hacker News without a key, YouTube views with the key from `user_youtube_api`; no AI) and `product` (product research done by code: searches the web through DuckDuckGo's HTML page, reads a public product page's structured data, specification tables and text, and hands over a chosen picture; needs no key and no table). All require a signed-in user (`verify_jwt`).
The logic is in `handler.ts` (pure, unit-tested from `lib/*-function.test.ts`); `index.ts` only starts it in Deno. Deploy with
`supabase functions deploy <name>` or from the dashboard.

## Dashboard settings (not expressible as SQL)

- Authentication → Providers → Email: **enabled**; "Confirm email" off (the owner account is created from the dashboard or by the first sign-up).
