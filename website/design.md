# Website Design Doc

Elaborates §1 "Website" of [project_design.md](../project_design.md). This doc
covers the public marketing/docs site and the account portal — everything a
visitor or paying user touches in a browser outside the extension itself. The
analysis API and payment webhook backend are separate concerns; they appear
here only where the site calls into them.

**Naming placeholder:** the product name and domain are still Open (roadmap
§1). This doc uses `PRODUCT` and `product.example` as placeholders; nothing in
the build depends on the final name, so scaffolding can start now.

---

## 1. Purpose & scope

The site has four jobs, in priority order:

1. **Landing page** — explain what PRODUCT does in one screen, show it (GIF of
   the live HUD over a table), and convert: "Add to Chrome" once launched,
   email waitlist before that.
2. **Docs** — install guide, stat glossary, data-format spec, FAQ,
   troubleshooting, sideload fallback. Docs are markdown living in the repo so
   they version with the code.
3. **Pricing** — the Free vs. Pro table, one price, monthly + annual.
4. **Account portal** — the only dynamic part: magic-link login, subscription
   status, checkout entry point, payment history, data deletion.

Plus two legally required static pages before Chrome Web Store submission:
**Privacy Policy** and **Terms of Service** (roadmap §7).

Out of scope for the website: the analysis API itself and the forum (Discord +
GitHub cover support, roadmap §2). The site ships as a static export today —
no servers to run — but the stack is chosen so that server-side features
(API routes, middleware, server rendering) can be turned on later without a
rewrite if the site outgrows static hosting.

## 2. Site map

| Route | Type | Content |
|---|---|---|
| `/` | static | Landing: hero + HUD GIF, feature grid, privacy pitch ("your hands never leave your machine" for Free), CTA |
| `/docs` | static, md-generated | Docs index |
| `/docs/install` | static | Web Store install + sideload/zip fallback |
| `/docs/quickstart` | static | First session walkthrough, screenshots |
| `/docs/stats` | static | Stat glossary (VPIP, PFR, 3Bet, …) — same definitions the extension's popovers use |
| `/docs/data-format` | static | Hand/GameState spec prose + link to JSON Schema |
| `/schema/hand.v1.json` | static asset | The versioned, MIT-licensed JSON Schema (roadmap §4) |
| `/pricing` | static | Free/Pro comparison, price, "prepaid time blocks, no auto-renew" explained plainly |
| `/account` | dynamic island | Portal: login, entitlement status, checkout, payments, delete-my-data |
| `/privacy`, `/terms` | static | Legal pages |
| `/changelog` | static, md-generated | Release notes (also feeds the Web Store listing text) |

## 3. Stack decision

**Next.js (App Router, static export) + Tailwind CSS, hosted on Cloudflare
Pages.** Rationale vs. the alternatives named in the roadmap:

- **Next.js over Astro.** The deciding factor is flexibility. The site starts
  as 95% static content, but the parts most likely to grow are the dynamic
  ones: the account portal, and possibly co-located backend endpoints
  (checkout, webhooks) if the Supabase Edge Function split ever becomes
  awkward. With Next.js, growing past static hosting means deleting
  `output: 'export'` from the config — the codebase, router, and components
  are already server-capable. One framework and one language (React/TSX)
  across the whole site also keeps the portal and the static pages in a
  single mental model, and favors any future hiring/handoff. The accepted
  tradeoffs vs. Astro: content pages ship the React runtime (~85KB first
  load) instead of zero JS, and the markdown docs pipeline is assembled from
  parts rather than built in (see Docs pipeline, §4). Both are acceptable —
  the docs pipeline is a one-time ~100-line setup, and page weight is
  mitigated by static generation + prefetching.
- **Static export for now.** `output: 'export'` in `next.config.mjs` produces
  plain static files, keeping the "no servers to maintain" property and free
  static hosting. Features that need a server (middleware, API routes, ISR,
  default `next/image` optimization) are off-limits until we deliberately
  drop the export flag; CI enforces this simply by running the export build.
- **Cloudflare Pages over Vercel.** Free tier with unlimited bandwidth (Vercel
  meters it), per-PR preview deployments, first-class monorepo support (set
  root directory to `website/`), and if/when the domain's DNS is on Cloudflare
  anyway, everything lives in one place. Also a natural home later for the
  payment webhook (Pages Functions / Workers) if we don't use a Supabase Edge
  Function. Vercel remains a drop-in fallback — and becomes the path of least
  resistance if we ever drop static export, since server-mode Next.js on
  Cloudflare requires an adapter (OpenNext). Nothing below is
  Cloudflare-specific except the deploy steps.
- **Portal: client-side React.** The `/account` page is a client-component
  tree (`"use client"`), using `@supabase/supabase-js` for auth + data. All
  auth and reads happen browser-side against Supabase RLS, so the page works
  under static export today and needs no changes if the site later gains a
  server.
- **Analytics:** Cloudflare Web Analytics (free, cookieless, no consent
  banner needed). Do **not** add Google Analytics — a privacy-selling product
  with a tracking pixel is self-defeating.

## 4. Repo layout

The site lives in `website/` inside this repo for now. When the repo split
happens (roadmap §3), the site goes with the **open client repo** — the docs
document the client, and open-sourcing the site costs nothing. It is a fully
standalone package: own `package.json`, own lockfile, no imports from the
extension's `src/` (with one deliberate exception, see Docs pipeline below).

```
website/
  design.md              ← this doc
  package.json           ← standalone; not part of the extension build
  next.config.mjs        ← output: 'export', images.unoptimized
  tailwind.config.mjs
  tsconfig.json
  public/
    schema/hand.v1.json  ← published data-format spec
    media/               ← HUD GIF, screenshots, og-image
  src/
    app/
      layout.tsx         ← root layout (nav, footer, meta)
      page.tsx           ← landing
      pricing/page.tsx
      privacy/page.tsx     terms/page.tsx
      changelog/page.tsx
      docs/
        layout.tsx       ← docs shell (sidebar, prev/next)
        [...slug]/page.tsx  ← renders a markdown doc; generateStaticParams
      account/page.tsx   ← thin server shell mounting the client portal
    content/
      docs/              ← markdown docs with frontmatter (see pipeline below)
      changelog/         ← one md file per release
    lib/
      content.ts         ← loads/validates markdown at build time
    components/          ← static components (FeatureGrid, PricingTable, Waitlist)
    portal/              ← "use client" tree: App.tsx, Login.tsx, Account.tsx,
                           Checkout.tsx, supabase.ts
    styles/
```

### Docs pipeline

- Docs are `.md` files in `src/content/docs/` with frontmatter
  (`title`, `order`, `section`). Next.js has no built-in content system, so
  `src/lib/content.ts` provides a small one: glob the files with
  `gray-matter` for frontmatter, validate it with a Zod schema (build fails
  on malformed frontmatter), render markdown → HTML with `remark`/`rehype`,
  and derive the ordered sidebar + prev/next links from `order`/`section`.
  `docs/[...slug]/page.tsx` uses `generateStaticParams()` over the collection
  so every doc becomes a static page at build time. Deliberately not
  Contentlayer or MDX-with-components — plain markdown plus ~100 lines of
  loader keeps zero fragile dependencies.
- **Stat glossary stays in sync with the extension**: the extension already
  has stat definitions with descriptions (design.md §Stat Definitions,
  glossary popovers 32E). A small build-time script
  (`scripts/gen-stat-docs.ts`) imports those definitions from `../src/` and
  emits `docs/stats.md` sections, so the glossary can't drift from what the
  HUD shows. This is the one sanctioned cross-package import, and it runs at
  build time only.
- **JSON Schema**: `public/schema/hand.v1.json` is authored by hand from the
  L1 model, carries `"$id": "https://product.example/schema/hand.v1.json"`,
  and is additive-only per roadmap §4. The `/docs/data-format` page renders
  prose plus field tables; a CI check validates the repo's `examples/*.jsonl`
  hands against the schema so the spec can't silently rot.

## 5. Account portal

The portal is a client-side React tree (`"use client"`) mounted by the
`/account` page. It never needs a server render: Supabase auth happens
browser-side, and all reads go through Supabase's PostgREST with Row-Level
Security. Static hosting therefore covers the whole site.

### Flows

1. **Login** — email field → `supabase.auth.signInWithOtp()` (magic link) →
   redirect back to `/account`. No passwords, ever.
2. **Account view** — shows email, current plan (Free / Pro until
   `expires_at`), days remaining, and a "renew" CTA when < 14 days remain.
   Reads the user's own row from `entitlements` (RLS: `user_id = auth.uid()`).
3. **Checkout** — "Buy 1 month / 12 months" buttons → calls a tiny backend
   endpoint (`create-charge`, a Supabase Edge Function) that creates a
   Coinbase Commerce charge with `metadata.user_id`, then redirects to the
   hosted Coinbase checkout page. The site never touches keys or chain logic.
4. **Post-payment** — Coinbase webhook (separate Edge Function,
   `commerce-webhook`, verifies the shared-secret signature) pushes
   `expires_at` forward on the `entitlements` row. The portal polls the row
   for ~2 minutes after returning from checkout and shows "payment received"
   when it flips. The extension picks up Pro on next token refresh
   (roadmap §6 flow).
5. **Delete my data** — button → Edge Function that deletes the user's rows +
   auth record. Required to honor the privacy-policy promise.

### What the website work item owns vs. depends on

The portal UI, the `create-charge` and `commerce-webhook` Edge Functions, and
the `entitlements`/`payments` table definitions are all part of this work
item — they're small and the portal is untestable without them. The analysis
API's JWT validation (roadmap §5) is **not**; it only shares the Supabase
project.

### Supabase schema (minimum)

```sql
-- auth.users comes from Supabase auth
create table entitlements (
  user_id uuid primary key references auth.users on delete cascade,
  plan text not null default 'free',        -- 'free' | 'pro'
  expires_at timestamptz,                   -- null for free
  updated_at timestamptz not null default now()
);
create table payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  provider text not null,                   -- 'coinbase_commerce'
  provider_charge_id text unique not null,
  amount_usd numeric not null,
  months int not null,
  status text not null,                     -- 'pending' | 'confirmed' | 'failed'
  created_at timestamptz not null default now()
);
-- RLS: users select their own rows; only the service role (webhooks) writes.
```

### Waitlist (pre-launch mode)

Until the extension ships, `/` shows an email waitlist instead of "Add to
Chrome": a `waitlist` Supabase table + insert-only anonymous RLS policy, no
account creation. One env flag (`NEXT_PUBLIC_LAUNCHED=false`) switches the
CTA.

## 6. How to build

Local development (from repo root):

```bash
cd website
npm install
npm run dev        # Next.js dev server on localhost:3000, hot reload
npm run build      # static export → website/out/
npm run preview    # serve the production build locally (npx serve out)
```

- `npm run build` runs `gen-stat-docs` first (package.json `prebuild`), then
  `next build`; with `output: 'export'` the result is plain static files in
  `website/out/` — deployable to any static host. The build itself is the
  guard rail: anything that needs a server (middleware, route handlers,
  un-configured `next/image`) fails the export.
- Env vars (all safe to expose; Next.js requires the `NEXT_PUBLIC_` prefix
  for client-visible vars, inlined at build time):
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_LAUNCHED`. The anon key is public by design — RLS is the
  security boundary. Secrets (Coinbase API key + webhook secret, Supabase
  service role key) live only in Supabase Edge Function config, never in the
  site.
- CI (GitHub Actions): on PRs touching `website/`, run `tsc --noEmit` and
  `next lint`, the schema-vs-examples validation, and the export build.
  Deployment itself is handled by Cloudflare's git integration, not CI.

## 7. How to deploy

One-time setup:

1. Buy the domain (blocked on naming — see Open questions). Put DNS on
   Cloudflare.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → connect the
   GitHub repo.
   - **Root directory:** `website`
   - **Build command:** `npm run build`
   - **Output directory:** `out`
   - Env vars: the three `NEXT_PUBLIC_*` values above.
3. Add the custom domain to the Pages project (auto-TLS).
4. Supabase dashboard: create project → enable email OTP auth → run the
   schema SQL → deploy the two Edge Functions (`supabase functions deploy`)
   → set their secrets (`supabase secrets set`).
5. Coinbase Commerce: create account, API key, point the webhook at the
   `commerce-webhook` function URL, copy the webhook shared secret into
   Supabase secrets.

Ongoing: **push to `main` = production deploy; every PR gets a preview URL**
automatically. Rollback = re-deploy a previous build from the Pages
dashboard. No servers to maintain; the only stateful pieces are Supabase
(managed) and Coinbase (managed).

## 8. Build phases

Sequenced so every phase ends deployed and useful (matches roadmap
"Suggested sequencing" step 1):

- **W1 — Scaffold + landing + waitlist.** Next.js project (static export),
  root layout, landing page with placeholder name, waitlist form,
  privacy-policy stub. Deployed to a `*.pages.dev` URL even before the
  domain exists.
- **W2 — Docs.** Markdown content loader (`lib/content.ts`),
  install/quickstart/stats/data-format pages, publish `hand.v1.json`,
  stat-glossary generation script, CI checks.
- **W3 — Pricing + portal (read-only).** Pricing page; Supabase project,
  schema + RLS, magic-link login, account view showing entitlement. No
  payments yet — Pro rows seeded by hand for testing.
- **W4 — Checkout.** Coinbase Commerce charge creation + webhook → live
  purchase path end-to-end on testnet/sandbox, then real.
- **W5 — Launch polish.** Real name/domain swap, ToS + final privacy policy,
  og-images, changelog, flip `PUBLIC_LAUNCHED`.

## 9. Open questions

- **Name + domain** (roadmap §1) — blocks real copy, `$id` in the schema,
  and the domain purchase; blocks nothing in W1–W4 structurally.
- **Landing visual identity** — needs a real HUD capture session (GIF/screen
  recordings) once the overlay UI is stable; placeholder screenshots until
  then.
- **Docs i18n** — skip until there's demand; Next.js supports it later
  (static export requires the manual sub-path approach, not built-in i18n
  routing).
- **Coinbase Commerce vs. self-hosted USDC watcher** — portal is built
  against a `create-charge` abstraction so swapping the provider (roadmap §6
  option 2) touches only the Edge Functions, not the site.
