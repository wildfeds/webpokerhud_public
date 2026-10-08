# Contributing

Thanks for taking a look. Small, focused changes land fastest.

## Reporting a bug

Use the [bug report template](https://github.com/wildfeds/webpokerhud_public/issues/new/choose).
The three things that make a HUD bug fixable:

1. **Browser and version**, and whether the extension came from Firefox
   Add-ons or a manual Chrome install.
2. **Table type**: stakes, 6-max / 9-max / Zone, how many tables open.
3. **The console filtered by `WebPokerHud`** — on the table tab press F12 →
   Console, type `WebPokerHud` in the filter box, and use the frame picker
   (toolbar icon next to the ⋯ menu) to select the table's frame. Copy
   the lines around the problem. For popup/panel issues, open
   `about:debugging` → *Inspect* on WebPokerHud instead.

A screenshot of the table with the HUD on it is worth a lot: chip
placement bugs are visual.

## Development

```sh
npm ci
cp .env.example .env     # only needed for Google sign-in
npm run watch:firefox    # rebuild dist-firefox/ on change
npm run run:firefox      # Firefox with the extension, live reload
npm test                 # vitest; `npx vitest --watch` while iterating
```

Chrome: `npm run watch`, then "Load unpacked" on `dist/`.

## Where things are

- `src/connector/bovada/` — the protocol decoder; `bovada_connector.ts`
  dispatches each game event by `pid`. Recorded sessions live in
  `examples/` and drive the connector tests (`src/testing/replay.ts`).
- `src/overlay/seat_chips.ts` — chip anchoring. DOM anchors first, a
  calibrated scene model as fallback; see the comments at the top and
  `docs/BUGFIXES.md` for the history.
- `src/analysis/` — pure functions over stored hands. Every stat has a
  test; `stat_info.ts` is the glossary shown in the panel and on the
  website.
- `src/ui/html.ts` — all page markup goes through the escaping `html`
  tag and `setHtml`; never assign `innerHTML`.

## Conventions

- TypeScript strict; no new runtime dependencies without a reason in the
  PR.
- Pure logic gets a unit test; anything touching Bovada's DOM or protocol
  gets a recorded fixture when possible.
- Keep the manifest's permissions unchanged unless the change needs
  them — a permission change re-triggers store review and user consent.
- Bug fixes with a non-obvious root cause get a `docs/BUGFIXES.md` entry
  (symptom → root cause → fix → how it was verified).

## Code of conduct

Be decent. Poker forums can be sharp; this repo doesn't need to be.
