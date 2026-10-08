# Releasing

Every release ships to three places from one commit: Firefox Add-ons, the
public GitHub repo (release + snapshot), and the website version badge.

## 1. Prepare

- [ ] Bump `"version"` in `manifest.json` and `package.json` (same value).
- [ ] Bump `VERSION` in `website/src/lib/site.ts` (major.minor).
- [ ] Add a `CHANGELOG.md` entry (user-facing, three to eight bullets).
- [ ] `npm test` green; `npx tsc --noEmit` clean.
- [ ] Live check in Firefox: `npm run build:firefox`, load
      `dist-firefox/manifest.json` at `about:debugging`, play a hand.

## 2. Package

```sh
npm run package:firefox:verify     # add-on zip + source zip, reproducibility diff
npm run package:chrome-sideload    # webpokerhud-chrome-<v>.zip (keeps the pinned ID)
```

`verify` must print `N files identical`. The Firefox build is gated on
`web-ext lint` (0 errors).

## 3. Firefox Add-ons

Developer Hub → WebPokerHud → *Upload New Version* → `webpokerhud-firefox-<v>.zip`
→ "Yes" to build tools → `webpokerhud-<v>-source.zip` → version notes
from the changelog. If **permissions changed**, say so in the notes and
expect a human review; users see a re-consent prompt on update.

## 4. Public repo

Snapshot (never push private history — see the memory/notes on the split):

1. Clone `git@github.com:wildfeds/webpokerhud_public.git` into a scratch dir.
2. `git archive HEAD | tar -x -C <stage>`; delete the ops-only docs
   (`docs/LAUNCH.md`, `docs/PURCHASES.md`, `docs/STORE_LISTING.md`,
   `docs/AMO_LISTING.md`, `docs/POST_LAUNCH.md`, `docs/store_assets`,
   `docs/store_upload`).
3. Sweep: `grep -rIln "<your personal email>\|PRIVATE KEY\|service_role\|IPN_SECRET\|sk_live\|ghp_" <stage>`
   must print nothing.
4. In the clone: `git rm -rq .`, copy the stage over, `git add -A`,
   review `git diff --cached --stat`.
5. Commit as `wildfeds <8731676+wildfeds@users.noreply.github.com>`
   (set `GIT_AUTHOR_*` and `GIT_COMMITTER_*`), tag `v<version>`, push
   `main` and the tag.
6. GitHub → Releases → *Draft a new release* from the tag, title
   `WebPokerHud <version>`, body = changelog entry, attach
   `webpokerhud-chrome-<v>.zip`. The website's Chrome links resolve to
   `/releases/latest`.

## 5. Website

Push `main` of the private repo — Cloudflare Pages deploys it. Check the
badge version on webpokerhud.com and that `/docs/install` still matches
the install flow.

## 6. After

- [ ] Reload your own Firefox install from AMO (auto-update may take a day).
- [ ] Note anything that went wrong here so the next release is smoother.
