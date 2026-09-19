# Accounts & tiers — setup and local dev

How sign-in works across the three surfaces, the one-time dashboard setup,
and the local dev loop. (Section II — purchases — will build on this.)

## Architecture

- **Identity**: Google OAuth through Supabase Auth. No passwords, no magic
  links. One Supabase project serves the website, the extension, and the
  analysis server.
- **User record**: the `profiles` table (name, email, avatar) is synced from
  `auth.users` by trigger on every sign-up/sign-in. The **tier** lives in
  `entitlements` (`plan` + `expires_at`, service-role writes only). Effective
  tier = `pro` iff `plan='pro'` and unexpired. Schema:
  `website/supabase/schema.sql` (idempotent — safe to re-run).
- **Extension**: the background worker owns the session
  (`src/auth.ts`, dependency-free): `chrome.identity.launchWebAuthFlow` →
  Supabase `/auth/v1/authorize?provider=google` → tokens stored in
  `chrome.storage.local`, refreshed on demand. Popup and panel just render
  `AuthState` via messages and show the Sign in / avatar+name+tier chip.
- **Analysis server**: the extension sends the Supabase JWT as
  `Authorization: Bearer` on `POST /v1/panel`. The server validates it against
  Supabase and reads the caller's `entitlements` row under RLS
  (`webpokerhud-server/src/tiers.ts`). No token → free tier (Overview +
  Hands still work signed out).
- **Website** (`/account`): `supabase-js` with the same Google provider;
  shows avatar, name, email, and tier. No analysis views.

## One-time setup (dashboards)

1. **Google Cloud Console** → APIs & Services → Credentials → Create
   OAuth client ID, type **Web application**. Authorized redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`
   (shown verbatim on the Supabase Google-provider page). Copy client ID +
   secret.
2. **Supabase → Authentication → Providers → Google**: enable, paste the
   client ID and secret.
3. **Supabase → Authentication → URL Configuration → Redirect URLs**, add:
   - `http://localhost:3000/account/` (website dev)
   - `https://webpokerhud.com/account/` (website prod)
   - `https://<extension-id>.chromiumapp.org/*` (extension). Get the ID from
     `chrome://extensions` after loading `dist/` unpacked. Note: the unpacked
     ID is derived from the dist path, so it changes if the path changes —
     re-add the URL then, or pin a stable ID by adding a `"key"` to
     `manifest.json` before store submission.
4. **Supabase → SQL Editor**: run `website/supabase/schema.sql`.

## Env

- **Extension** — copy `.env.example` → `.env` (gitignored):
  ```
  VITE_SUPABASE_URL=https://<project-ref>.supabase.co
  VITE_SUPABASE_ANON_KEY=<anon key>
  ```
  A build without these still works: sign-in reports "not configured" and
  everything runs on the free tier.
- **Website** — `website/.env.local` (already set): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Server** — `webpokerhud-server/.env` (gitignored, loaded by `server.ts`
  at startup): `SUPABASE_URL`, `SUPABASE_ANON_KEY`; optional `DEV_FORCE_TIER`
  (below). Keys defined in `.env` **override** inherited shell env (ambient
  `SUPABASE_*` exports for other projects otherwise misroute tier checks —
  see TODO); in prod there is no `.env` and platform env applies as-is.
  Without them the server warns at startup and resolves every request to
  `free`; startup logs the resolved Supabase URL and `/health` reports
  `tierResolution`. The anon key is public by design — RLS is the security
  boundary.

## Local dev loop

```sh
# 1. server (webpokerhud-server/) — needs .env, see above
npm run dev

# 2. extension (bovada_hud/) — needs .env, see above
npm run build          # then load/reload dist/ in chrome://extensions

# 3. website (bovada_hud/website/), for the /account page
npm run dev            # http://localhost:3000/account
```

Then: popup or panel → **Sign in with Google** → chip shows avatar + name +
**Free**. The panel's Pro tabs stay locked. To grant yourself Pro (SQL
Editor):

```sql
update entitlements
set plan = 'pro', expires_at = now() + interval '30 days', updated_at = now()
where user_id = (select id from auth.users where email = 'you@gmail.com');
```

Refresh the panel: all tabs unlock, chip reads **Pro**. Upgrades take effect
on the next request — the server caches only `pro` resolutions (60 s per
token), so free→pro is never delayed; downgrades show up within a minute.

**Offline shortcut** (no Supabase round-trips): run the server with
`DEV_FORCE_TIER=pro` (or `free`) to force every request's tier.

## TODO

- [x] **Pro entitlement not unlocking the panel** — root cause: the shell
  exports `SUPABASE_URL` (plus S3 creds) for a *different* Supabase project,
  so the server validated tokens against the wrong instance → 401 → `free`
  on every request (chip said Pro because the extension reads entitlements
  directly, with no ambient env in the way). Fixed: `server.ts` loads
  `webpokerhud-server/.env` at startup **overriding** inherited shell env,
  logs the resolved Supabase URL + warns when unconfigured, and `/health`
  reports `tierResolution`; `[tiers]`/`[panel]` request logs name the failing
  step. Also: `tiers.ts` no longer caches `free` resolutions, so upgrades
  unlock on the next request.

## Design notes / decisions made

- The extension talks to Supabase directly for auth and to the analysis
  server for stats; the analysis server never sees Google credentials, only
  the short-lived JWT it can independently verify.
- Tier checks fail closed to `free` everywhere (bad token, expired
  entitlement, Supabase down).
- The old license-key stub and the popup's "Analysis server" section are
  gone; the server URL is storage-only (`setServerUrl` from the service-worker
  console) until the hosted URL ships as the default.
- The `handle_auth_user` trigger also inserts a default `free` entitlements
  row, so every user always has exactly one row to read.
