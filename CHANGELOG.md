# Changelog

## 1.0.1 — 2026-10-09

- Share your graph: "Share graph as image" in the popup and on the panel's
  Overview saves a 1200×630 PNG of the net-winnings line (all-in EV line
  included when it differs) with the headline numbers and a small
  webpokerhud.com footer — and copies it to the clipboard where the
  browser allows — ready to post on Reddit or a forum.
- Hand as text: "Copy as text" under any replay in the panel's Hands tab
  copies the hand in the classic 2+2 hand-converter layout (stacks by
  position, pot per street, folds collapsed, showdown with hand names) —
  paste-ready for TwoPlusTwo or Reddit. A fold-out shows the text first.
- Hand history converter: "Export for PT4 / Hand2Note" (popup and panel)
  writes every hand as PokerStars-format text, one file per table, to
  Downloads/webpokerhud/pokerstars/ — importable as a folder into
  PokerTracker 4, Hand2Note and Holdem Manager. Hero is "Hero", opponents
  "Player<seat>", times in ET. Verified against fpdb's PokerStars importer
  (0 errors on real hands incl. split pots and all-in run-outs). The panel also gets a JSONL ⇩ Export button.
- After 100 tracked hands the popup asks once for a Firefox Add-ons review
  (a GitHub star on manual Chrome installs). "Later" snoozes it two weeks;
  "No thanks" ends it.
- Capture-stall indicator: when a table stops sending events (one minute
  mid-hand, three minutes between hands) the HUD shows a warning strip
  asking you to reload the table tab, the toolbar icon gets a "!" badge on
  that tab, and the popup shows "Last hand captured: N min ago" with a
  warning if any table tab has stalled. Clears by itself when events resume.
- Account chip shows when prepaid Pro time ends ("Pro · until Oct 7, 2027").

## 1.0.0 — 2026-10-02

First release, on Firefox Add-ons.

- Live HUD for Bovada No-Limit Hold'em cash games: stat chips over every
  occupied seat (VPIP / PFR / aggression / hands), your own chip under
  your seat, multi-table support.
- Automatic local hand tracking (IndexedDB), popup with core stats and a
  net-winnings graph, filters by time range and stake level.
- Analysis panel: overview with leak highlights and all-in-EV line, hand
  browser with street-by-street replays and line filters, JSONL
  export/import.
- Optional Pro tier (server-side position stats, starting-hand matrix,
  sessions, trends) with Google sign-in.
- Firefox 128+; Chrome via manual install.
