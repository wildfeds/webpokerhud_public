# Product Roadmap — Poker HUD as a Product

This doc is the overall roadmap for turning the HUD into a commercial product.
Technical architecture lives in [design.md](design.md); the marketing site in
[website/design.md](website/design.md); support & community in
[community/design.md](community/design.md). Sections marked **Open** need a
decision.

## Product shape (agreed baseline)

A Chrome MV3 extension with a freemium split:

| Tier | Features | Where it runs |
|---|---|---|
| **Free** | Live HUD overlay, hero + opponent tracking, popup stat viewer, net-winnings graph, hand **export/import in pure JSON** (open `hand.v1` format), panel **overview** (stats, winnings/EV chart, leaks), hand-history **browser** (all hands, line filters, replays) | Tracking, export/import, and replays are 100% client-side (IndexedDB); the overview and hand list come from the panel API ungated |
| **Pro (subscription)** | Deep **analysis**: position stats, starting-hand matrix, sessions, trends, and the one-click big pots/wins/losses shortcuts in the hand history; future: opponent pool insights | Server-side analysis API, gated by subscription — locked views stay visible (tabs + greyed shortcuts) as the upgrade funnel |

The line between tiers: **your raw hands and the basic picture are free**
(overview, browsing, replaying, exporting, importing — the anti-lock-in
promise); the **deep cuts we compute over them** (positional breakdowns,
matrix, sessions, trends, big-hand retrieval) are the Pro product. Locked
features are displayed greyed/locked, not hidden, so free users always see
what Pro adds.

The free tier is the funnel: it must be genuinely good, and "your hands never
leave your machine" is a privacy selling point in itself. Pro is where compute-
and IP-heavy analysis lives — which is also what makes the gating enforceable
(see §3).

---

## 1. Website

- **Purpose:** landing page (what it does, screenshots/GIF of the HUD),
  docs (install, stat glossary, data-format spec), pricing, account portal
  (login, subscription status, payment).
- **Stack:** Next.js static export (chosen over Astro for flexibility — see
  website/design.md §3) hosted on Cloudflare
  Pages or Vercel; docs generated from markdown in the repo so they version
  with the code. Account portal is the one dynamic part — a small app backed
  by Supabase auth.
- **Open:** product name and domain. The public name should not contain
  "Bovada" (trademark; also the connector architecture is multi-platform by
  design — the name should survive adding a second site).

## 2. Support & community

- Accounts (email sign-up) are needed anyway for subscriptions — Supabase
  auth with email magic-link covers registration for both the portal and
  support identity.
- **Decision:** Discord + GitHub for support. No self-hosted forum for now;
  graduate to Discourse (or similar) only if volume justifies it.
  - Discord server for community/support chat (the norm for poker tools).
  - GitHub Issues/Discussions on the open-source client repo for bugs.
  - A support email address.
- Implementation design: [community/design.md](community/design.md) —
  Discord server setup, GitHub webhook integration, product touchpoints
  (invite redirect + in-product links), optional Pro-role bot, launch
  checklist.

## 3. Packaging & what to open-source

Key fact: **anything shipped inside the extension is readable by users** —
Chrome extensions are unpacked JavaScript; "closed-source client" is only
obfuscation. So the split should follow where the code physically runs:

- **Open-source (client repo):** L1 data model, L2 Bovada connector, L3
  IndexedDB storage, L5 HUD overlay + popup, and the basic client-side stats
  (current `computeHeroStats`). Benefits: trust (users can verify no
  hand-data exfiltration in the free tier), community connectors for other
  platforms, free QA.
- **Closed (server repo):** the analysis engine behind the Pro panel — hand
  review, leak detection, anything expensive or differentiating. The
  extension's Pro panel is a thin client that POSTs hands to the API with the
  user's auth token.
- License for the client: **Open** — permissive (MIT) vs. source-available
  (e.g. BSL/PolyForm) to deter a competitor shipping a rebrand. Leaning
  source-available for the extension, MIT for the data-format spec (§4).
- Distribution: Chrome Web Store listing (needs a $5 dev account, review
  process, privacy disclosures). Keep a sideload/zip fallback documented in
  case of store review friction.

## 4. Data contract — publish it

Yes. Publish the `Hand` / `GameState` JSON format as a **versioned, MIT-licensed
spec** (JSON Schema + prose docs on the site):

- Add an explicit `handVersion: 1` field to the schema; never break v1 —
  additive changes only, breaking changes bump the version.
- Users always get one-click export of their own hands (already have JSONL).
- The same schema doubles as the Pro API request format.
- Future goodwill feature: converters to/from common hand-history text
  formats (PokerTracker/HM-style) for migration in both directions.

This is a trust feature ("your data is yours, in a documented format") and it
lowers adoption risk for users — exactly the reasoning in the brainstorm.

## 5. Subscription & gating

- **Tiers:** keep it to two — Free and Pro. One price, monthly + discounted
  annual. Avoid tier proliferation until there's usage data.
- **Price point (Open, needs market check):** comparables are PokerTracker 4
  (~$99 one-time), Hand2Note (~$10–40/mo tiers), DriveHUD. For a
  single-platform tool aimed at low/mid stakes: **~$10–15/mo, ~$99/yr** feels
  like the right opening range. Cheap enough to be an impulse buy for anyone
  playing real volume.
- **Enforcement:** subscription state lives server-side (Supabase table).
  The analysis API validates the Supabase JWT and checks entitlement on every
  request. Client-side checks are UX only — the real gate is that the
  analysis code isn't in the client at all (§3).
- Because payment is crypto (§6), "subscription" is really **prepaid time
  blocks**: pay → entitlement row gets `expires_at` pushed out 1/12 months →
  renewal reminder emails near expiry. No auto-renew, which also sidesteps
  recurring-billing complexity entirely.
- **Open:** the brainstorm's "should we let users implement …" trailed off —
  if the idea was user-defined custom stats/plugins, that's a good free-tier
  feature (client-side custom stat definitions over the open data model) and
  worth its own design pass later.

## 6. Payment — USDC

- **Why crypto actually makes sense here** (beyond avoiding CC fees): card
  processors (Stripe/PayPal) classify gambling-adjacent products as
  restricted/high-risk — a poker HUD risks account termination mid-business.
  The audience overlaps heavily with crypto users (Bovada itself is
  crypto-funded). So USDC-first is defensible, not just a shortcut.
- **Caveat, stated plainly:** accepting USDC does **not** avoid tax
  obligations — revenue is revenue regardless of rail. It avoids *processor*
  trouble, not tax. Budget for basic accounting from the start.
- **Mechanics:** ETH mainnet gas makes small payments ugly ($1–5 gas on a
  $12 charge). Options:
  1. **Coinbase Commerce** (or similar) — handles address generation, chain
     choice, webhooks to credit the entitlement in Supabase. Least code,
     ~1% fee. **Recommended to start.**
  2. Self-hosted: accept USDC on **Base or Arbitrum** (cents in gas), unique
     payment reference per checkout, a small watcher service credits
     Supabase. More code, zero fees, full control. Good v2.
  - Either way: mainnet-only USDC is fine to launch, but plan to add one L2
    quickly — same token, much cheaper for users.
- Flow: portal checkout → payment → webhook/watcher → `entitlements` row
  updated → extension sees Pro on next token refresh.

## 7. Accounts, data & safety

- **Supabase** (already familiar): auth (email magic link), Postgres for
  `users`, `entitlements`, `payments`. Row-Level Security on everything.
- **Data minimization as policy:** store email + subscription state, nothing
  else; for free users nothing at all (no account needed to use the free
  tier). Hand data: local-only by default; uploaded to the analysis API only
  when a Pro user requests analysis. **Open:** whether Pro hand uploads are
  ephemeral (analyze and discard) or retained (enables cross-session review
  server-side, but is a bigger privacy commitment). Leaning: retain for the
  user's own hand-review feature, deletable from the portal, spelled out in
  the privacy policy.
- Need before launch: privacy policy + ToS pages (also required by the
  Chrome Web Store listing).

## 8. Risks (eyes open)

- **Platform ToS:** real-time tracking tools sit in a gray-to-prohibited zone
  in Bovada/Ignition's terms (their anonymous tables exist specifically to
  blunt tracking). Risk is to *users' accounts* and to product continuity if
  the site changes its protocol. Mitigations: multi-platform connector
  architecture (already designed), free tier keeps users even through
  breakage, fast connector-update pipeline. Research the exact ToS language
  before writing marketing copy.
- **Chrome Web Store review:** gambling-adjacent + WebSocket interception may
  draw scrutiny; keep the sideload path documented.
- **Protocol breakage:** Bovada changing its WS protocol is the single
  biggest operational risk; the open-source client + community helps here.

## Suggested sequencing

1. Name + domain + landing page (static, email waitlist).
2. Split repos: open client / closed server; publish the data-format spec.
3. Supabase auth + portal skeleton (login, show entitlement).
4. Analysis panel moved behind the API; free/Pro gating wired end-to-end.
5. Coinbase Commerce checkout → entitlements.
6. Chrome Web Store submission (privacy policy, ToS ready).
7. Discord + support email; launch.
