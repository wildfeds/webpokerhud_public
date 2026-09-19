# Support & Community — Design

Implementation design for support and community channels. The product-level
decision lives in [project_design.md §2](../project_design.md): Discord +
GitHub for support, a support email, no self-hosted forum until volume
justifies it.

## Discord — implementation plan

Mostly configuration, very little code. The code that does exist is three
small pieces: invite links in the product, a redirect URL, and (later,
optional) a Pro-role bot.

### Server setup (no code)

- Enable **Community Server** mode: gives rules screening, a member
  onboarding flow, AutoMod, server insights, and announcement channels.
- Channel layout — start minimal, add only when a channel is actually busy:
  - `#announcements` (announcement channel; releases, downtime, news)
  - `#general` — community chat
  - `#support` — **Forum channel**, not plain text: each question is a
    thread with tags (`bug`, `install`, `stats-question`, `billing`,
    `feature-request`) and can be marked answered. This is the support
    queue, searchable, and keeps issues from scrolling away.
  - `#hand-review` — community strategy chat around shared hands (drives
    engagement; JSONL export gives people something concrete to post)
  - `#connector-dev` — for open-source contributors (project_design.md §3),
    community connectors for other platforms
- Roles: `Admin`, `Mod`, `Pro` (subscriber flair — see bot below),
  `Contributor` (merged a PR). Default member role can post everywhere
  except `#announcements`.
- AutoMod: block invite-link spam and scam keywords (crypto audience ⇒
  guaranteed wallet-drainer spam bots; "mention raid" protection on).
  Membership screening: rules acceptance + account-age gate.
- Rules must state: no gambling under local legal age, no staking/selling
  action, no buying/selling accounts — keeps the server clear of the risky
  side of gambling-adjacent (project_design.md §8) and is required posture
  for partner programs later.

### Integrations (webhooks, no custom code)

- GitHub → Discord: the built-in GitHub webhook (`/github` endpoint on a
  Discord webhook) posts releases, new issues, and merged PRs into a
  `#github-feed` channel. Releases additionally get a human-written post in
  `#announcements`.
- Support triage flow: mods answer in the `#support` forum; anything that's
  a confirmed bug gets escalated by a mod into a GitHub Issue with a link
  back to the thread. Discord is the funnel, GitHub is the tracker — bugs
  never live only in chat.

### Product touchpoints (the actual coding, ~an afternoon)

- A stable redirect **`<domain>/discord`** on the website (Cloudflare Pages
  redirect rule) pointing at a non-expiring invite. Everything links to the
  redirect, never the raw invite, so a compromised/leaked invite can be
  rotated without shipping an extension update. (Vanity `discord.gg/<name>`
  URLs need server boost level 3 — not worth chasing; the redirect does the
  same job.)
- Extension popup footer: "Community & support" link → `<domain>/discord`,
  plus the support email. Same links on the website footer and docs pages.
- Error surfaces: where the HUD detects protocol breakage
  (project_design.md §8 — the most likely support event), the error message
  links to `/discord` and the GitHub issues page.

### Pro role bot (later, optional — the only real code)

- Purpose: give paying subscribers a `Pro` role (flair + a `#pro-lounge`
  channel if wanted). Nice-to-have, not launch-blocking.
- Mechanics: portal page "Link Discord" → Discord OAuth2 (`identify`
  scope) → store the Discord user ID on the Supabase `users` row → a tiny
  serverless function (or the existing API) with a bot token assigns/removes
  the role, re-checked against `entitlements.expires_at` on a daily cron.
  No message-content intent, no gateway connection needed — pure REST.
- Skip anything fancier (ticket bots, AI answer bots) until volume exists.

## GitHub (open-source client repo)

- **Issues** with templates: bug report (extension version, browser,
  anonymized hand/log snippet) and feature request. Labels mirror the
  Discord support tags.
- **Discussions** enabled for open-ended Q&A that isn't a bug; docs-worthy
  answers get promoted into the site docs.

## Support email

- One address (e.g. `support@<domain>`) forwarded to the founder's inbox to
  start; needed for the Chrome Web Store listing and billing questions that
  shouldn't happen in public channels. No helpdesk software until volume
  justifies it.

## Launch checklist (maps to project_design.md sequencing step 7)

1. Create server, Community mode, channels, roles, AutoMod, rules.
2. Non-expiring invite + `/discord` redirect on the site.
3. GitHub webhook → `#github-feed`.
4. Links added to extension popup, website footer, docs, error surfaces.
5. Seed content: pinned FAQ in `#support`, install guide link, first
   announcement post.
6. At least one mod besides the founder before the invite goes public.
7. Issue/feature templates + Discussions enabled on the client repo;
   support email live.
