---
title: Hand history converter
description: Export your Bovada hands in PokerStars format for PokerTracker 4, Hand2Note or Holdem Manager.
order: 22
section: Reference
---

Bovada's own hand histories arrive a day late, in a format most tools do
not read. WebPokerHud captures every hand you play as it happens, and the
converter writes those hands as **PokerStars-format text files** — the
format every tracker and study tool imports: PokerTracker 4, Hand2Note,
Holdem Manager 3, Flopzilla, GTO trainers.

It is free, works offline, and needs no account. Nothing is uploaded.

## Export

Open the Analysis Panel (toolbar icon → **Open analysis panel**) and click
**⇩ For PT4 / Hand2Note** in the top bar — or use **Export for PT4 /
Hand2Note** in the popup. The extension writes one text file per table
to

```
Downloads/webpokerhud/pokerstars/bovada_<tableId>.txt
```

Every stored hand is included each time (files are overwritten), so you
can re-export after each session and let your tracker's duplicate
detection skip what it already has.

## Import into your tracker

- **PokerTracker 4**: *File → Import → Import from Folder*, pick
  `Downloads/webpokerhud/pokerstars`, site **PokerStars**. PT4 asks which
  player is you the first time — choose **Hero**. Tick *Auto Import* on the
  folder to pick up future exports automatically.
- **Hand2Note**: *Import → Add folder* with the same folder; room
  PokerStars; hero name **Hero**.
- **Holdem Manager 3**: *Import → From folder*.

Stakes import as real-money USD cash games.

## What the files contain

The hands are written exactly the way PokerStars writes a cash-game
history, with these conventions:

| | |
|---|---|
| Hero | `Hero` |
| Opponents | `Player<seat>` — Bovada tables are anonymous, so a seat is the only identity there is. The same label on another table is a different person. |
| Table | `'Bovada <tableId>'`, with the real table size (`6-max`, `9-max`) and button seat |
| Time | Hand start in US Eastern time (`ET`), the zone PokerStars histories use, so trackers need no offset |
| Amounts | Dollars and cents; blinds posted, raises as *raises $X to $Y*, all-ins marked |
| Uncalled bets | Returned to the bettor the moment betting ends, as PokerStars does |
| Showdown | Every revealed hand with its name (*a pair of Kings*); Bovada reveals cards on all-ins, so those show too |
| Rake | The real rake, in the summary line |

Hands where you were not dealt in (observed while sitting out) are
skipped.

## Caveats

- **Opponent stats are session-scoped.** Because `Player6` on one table is
  not `Player6` on the next, opponent statistics in your tracker only mean
  something within one table session — the same limit every Bovada tool
  has. Your own stats, graphs and reports are complete.
- **Run it once only.** Hands that were run twice are not supported (Bovada
  cash tables do not run it twice).
- **Zone (fast-fold) and tournaments** are not captured by the extension
  yet, so they are not in the export.

The same hands are also available as [JSON Lines](/docs/data-format/) in
an open, documented format — the converter is one view of that data.
