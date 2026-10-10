# Open Questions & Pending Setup

Everything still undecided or blocked on an external account, collected from
[project_design.md](project_design.md) and [website/design.md](website/design.md).
Fill in the blanks; each item says where the answer gets applied.

## 1. Identity (blocks launch copy)

- [x] **Product name** — must not contain "Bovada"; should survive adding a
  second platform.

  > Name: WebPokerHud

- [ ] **Domain** — buy it, put DNS on Cloudflare.

  > Domain: webpokerhud.com

  Applied in: `website/src/lib/site.ts` (`SITE_NAME`, `SITE_URL`,
  `SUPPORT_EMAIL`), `website/public/schema/hand.v1.json` (`$id`), landing/docs
  copy, this repo's name if it goes public.

## 2. Hosting & infrastructure (blocks live testing/deploy)

- [x] **Cloudflare Pages** — connect the GitHub repo (root dir `website`,
  build `npm run build`, output `out`). Gives a `*.pages.dev` URL before the
  domain exists.

  > Pages URL: webpokerhud.pages.dev

- [x] **Supabase project** — create it, run `website/supabase/schema.sql`,
  enable email OTP auth. Unblocks: waitlist, portal login, W4 Edge Functions.

  > Project URL: https://imyiiqbuyrqzidxdiezg.supabase.co
  > Publishable key: sb_publishable_dmPNPl1OXk0f26Zo_ZY0oQ_ENenn7Zp
  > Tables created; values applied in website/.env.local. Remember the
  > redirect-URL allowlist (localhost:3000/account/ + pages.dev/account/)
  > and the same env vars on Cloudflare Pages.

  Applied in: `website/.env.local` locally + Cloudflare Pages env vars
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

- [ ] **Coinbase Commerce account** (or decide against it, see §5) — API key +
  webhook secret go into Supabase Edge Function secrets, never the site.
  Unblocks: phase W4 checkout.

## 3. Community & support links (site footer/docs point nowhere yet)

- [x] ~~**Discord server** — create it.~~ **Shelved 2026-10-07:** support is
  GitHub Issues only for the initial launch; the invite below is unused.

  > Invite link: https://discord.gg/ghmQJrxxY — applied in site.ts.

- [x] **Support email** — on the product domain once it exists.

  > **Retired 2026-10-07 — no support email; GitHub Issues only.** Was: webpokerhud@gmail.com (interim; swap to
  > support@webpokerhud.com when domain mail is set up).

- [ ] **Public GitHub repo** — depends on the repo split (§6). Docs' sideload
  guide needs a releases page to link.

  > Repo URL: NOT READY YET

  Applied in: `website/src/lib/site.ts` (`DISCORD_URL`, `GITHUB_URL`,
  `SUPPORT_EMAIL`, `CHROME_STORE_URL` at launch),
  `website/src/content/docs/install.md` (release zip link).

## 4. Pricing (page currently shows placeholders)

- [ ] **Price point** — roadmap range ~$10–15/mo, ~$99/yr; site currently
  shows $12/mo, $99/yr. Needs a comparables check (PT4, Hand2Note, DriveHUD).

  > Monthly: $2.99   Annual: $29.99

  Applied in: `website/src/app/pricing/page.tsx` (`MONTHLY`, `ANNUAL`).

## 5. Payments

- [ ] **Confirm Coinbase Commerce for v1** (recommended: least code, ~1% fee)
  vs. self-hosted USDC watcher on Base/Arbitrum (zero fees, more code, v2
  candidate). Portal is built against a `create-charge` abstraction either way.

  > Decision: Use Coinbase Commerce. Setup checklist:
  >
  > 1. Create the account at commerce.coinbase.com (business email =
  >    support address), complete verification.
  > 2. Settings → Security: note the **API key**; Settings → Notifications:
  >    add a webhook endpoint (URL comes from step 4) and note the
  >    **webhook shared secret**.
  > 3. Store both as Supabase **Edge Function secrets**
  >    (`supabase secrets set COINBASE_API_KEY=… COINBASE_WEBHOOK_SECRET=…`)
  >    — never in the site or repo.
  > 4. W4 build: two Edge Functions — `create-charge` (called by the portal,
  >    creates a charge for 1 or 12 months, returns `hosted_url`) and
  >    `coinbase-webhook` (verifies the `X-CC-Webhook-Signature` HMAC against
  >    the shared secret, and on `charge:confirmed` upserts `entitlements`
  >    with the service-role key and inserts a `payments` row keyed by
  >    `provider_charge_id` — the unique constraint makes retries idempotent).
  >    Deploy, then paste the webhook function URL into step 2's endpoint.
  > 5. Test end-to-end with a small real charge (Commerce has no sandbox);
  >    refund/ignore it afterwards.

## 6. Licensing & repo split

- [ ] **Client license** — permissive (MIT) vs. source-available
  (BSL/PolyForm) to deter rebrands. Leaning: source-available for the
  extension, MIT for the data-format spec (the schema file already says MIT).

  > License: Suggested — **FSL-1.1-Apache-2.0** (Functional Source License,
  > fsl.software) for the extension + website: source-available, forbids
  > competing use (the rebrand deterrent), and each release automatically
  > becomes Apache-2.0 after two years, which reads much better to users
  > than a plain proprietary EULA. Keep **MIT** for the data-format spec
  > (already stated in the schema file). Runner-up: PolyForm Shield (similar
  > protection, no time-boxed conversion). Plain BSL also works but needs
  > custom parameters; FSL is the same idea pre-parameterised. Note the
  > Chrome Web Store does not require an OSS license — this choice only
  > affects the public repo.

- [ ] **When to split repos** — open client (extension + website + spec) /
  closed server (analysis API). Roadmap sequencing puts this right after the
  landing page.

  > Timing: **Structure done 2026-09-17.** This repo = client (extension +
  > website + spec), staying as-is; new private sibling repo
  > `~/dev/repos/webpokerhud-server` = Pro analysis API (scaffolded:
  > `/health` + `/v1/analyze` stub; extension popup has a configurable
  > "Analysis server" link, default `http://localhost:8787`). Free-tier
  > analysis stays client-side per the recorded decision.
  >
  > Remaining before flipping THIS repo public: (1) commit a LICENSE file
  > (FSL-1.1-Apache-2.0 suggested above), (2) audit git history for
  > anything unwanted, (3) create the GitHub private repo for the server
  > (`git remote add origin git@github.com:wildfeds/webpokerhud-server.git`
  > after creating it private on github.com, then push), (4) fill §3's
  > repo URL and site.ts `GITHUB_URL`.

## 7. Product & policy decisions

- [ ] **Pro hand uploads: ephemeral vs. retained** — analyze-and-discard, or
  retain for cross-session review (leaning: retain, deletable from portal,
  spelled out in privacy policy). Determines privacy-policy wording.

  > Decision: ___________________

- [ ] **User-defined custom stats/plugins** — good free-tier candidate
  (client-side stat definitions over the open data model); needs its own
  design pass. Decide whether/when.

  > Decision: ___________________

## 8. Content & legal (blocks W5 / Web Store submission)

- [ ] **Real privacy policy + ToS** — current pages are drafts marked "not
  yet in effect"; both required for the Chrome Web Store listing.
- [ ] **HUD capture GIF/screenshots** — landing has a placeholder box; needs
  a recording session once the overlay UI is stable.
- [ ] **Bovada/Ignition ToS research** — read the exact tracker language
  before writing marketing copy (risk framing, roadmap §8).
- [ ] **Chrome Web Store dev account** ($5) + listing draft with privacy
  disclosures.

## Already decided (for reference, no action)

- Stack: Next.js static export + Tailwind on Cloudflare Pages; Supabase auth
  (magic link); two tiers only; prepaid time blocks, no auto-renew; USDC
  payments; Discord + GitHub for support (no forum); data format published as
  versioned MIT spec; free tier fully client-side with no account.
