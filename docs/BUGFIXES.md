# Bug Fixes

Running log of bugs found in live use, their root causes, and fixes. Newest
first within each status. Design rationale stays in `design.md`; this file
tracks the *defects* — symptom → root cause → fix → how it was verified.

Entry format:

```
## BF-NNN — short title (STATUS)
Date · Area
Symptom / Root cause / Fix / Verified
```

---

## BF-008 — Hero chip rendered as a sixth opponent chip over the bet area (FIXED)

**2026-09-27 · overlay/seat_chips + content_script**

- **Symptom:** six chips on a 6-max table instead of five; the extra chip sat
  on the hero's stack/bet area, hiding the bet value.
- **Root cause:** `updateSeatChips` passed `lastGs.heroSeat` straight through;
  a post-reconnect game state carries `heroSeat` 0, so the hero filter matched
  nothing and the hero's chip rendered at an opponent anchor.
- **Fix (by design change):** the hero chip is now a feature — it always
  renders (session image awareness) but anchors BELOW the seat container,
  cleared `HERO_CHIP_CLEARANCE_PX` past the action banner, with a green seat
  badge. Hero identification is DOM-first — the one seat container lacking
  Bovada's `isNotMyPlayer` marker (trusted only when unique) — falling back
  to the protocol heroSeat, now sticky across reconnects in the content
  script. Scene-model fallback uses `HERO_CHIP_Y_OFFSET_PX` for the south
  seat.
- **Verified:** 4-table live session in Firefox — one chip per occupied seat,
  hero chip below the seat with green badge, bet values unobstructed;
  `chipRows`/anchor unit tests updated (177 passing).

---

## BF-007 — All-in loss over-counted by the uncalled excess (FIXED)

**2026-09-12 · analysis/hero_stats (loser net)**

- **Symptom:** shoving all-in over a shorter stack and losing recorded the
  *full* shove as lost — but the uncalled excess (what the opponent couldn't
  match) is returned outside the pot; e.g. all-in $16.48 vs an $11.63 call
  loses $11.63, not $16.48.
- **Root cause:** winners carry an authoritative `netWon` (stack delta from
  `CO_RESULT_INFO`), but **losers** have no result row, and `netWonInHand`'s
  fallback summed every action amount — ignoring uncalled-bet refunds. The
  panel replay duplicated the same broken inline computation, and the EV
  line's `invested` had the same flaw.
- **Fix:** new `uncalledRefund(hand, playerId)` — per betting round,
  `max(0, own max totalStreetBet − best opponent totalStreetBet)`, gated on
  the hand containing an ALL_IN action (a refund can only reach a *loser*
  when someone is all-in; an uncalled bet with no all-in wins the pot and
  carries a result row — the gate also keeps partial synthetic hands
  well-defined). `netWonInHand` loser path = refund − invested; the EV
  computation subtracts the refund from `invested`; the replay now calls
  `netWonInHand` instead of its own inline sum.
- **Impact:** every loser-side consumer self-corrects — net series/graphs,
  sessions, stake stats, matrix, trends, WWSF, seat-stats stack-continuity
  (which previously *over*-expected losses after an over-shove, risking
  spurious occupant resets).
- **Verified:** 4 new unit cases (called-for-less shove, multi-street with
  matched earlier streets, plain loss unchanged, hero-called-for-less side —
  no refund); full suite 212 green including the real-log replay pins.

## BF-006 — Replay never shows opponents' revealed hole cards (FIXED)

**2026-09-12 · panel/replay**

- **Symptom:** an all-in hand's replay showed only the hero's cards (e.g.
  hero A♠K♠ vs a BB all-in — the villain's hand invisible), even though the
  stored hand record has the villain's cards.
- **Root cause:** display-only gap. The connector stores revealed cards on
  `hand.players[].cards` (showdown SHOW, and all-in reveals via
  `CO_PCARD_INFO` — which produce **no** SHOW action in the log), but
  `replayHtml` only ever rendered the hero's cards, and `shows` action lines
  carried no cards either.
- **Fix:** the replay header now lists every opponent with two known cards
  (`BB (seat 2): Q♦ Q♣` under the Hero line), and `shows` action lines render
  the revealed cards inline.
- **Verified:** 208 tests still green (markup-only change); visual check on
  the next all-in replay.

## BF-005 — Seat chip covers the player's action banner (FIXED)

**2026-09-06 · overlay/seat_chips**

- **Symptom:** the stat chip rendered on top of the FOLD/BET/CHECK banner
  that Bovada draws directly under each avatar pill (zoomed screenshot:
  chip overlapping seat 4's purple banner).
- **Root cause:** the chip offset (26 calibration px below the pill centre)
  only cleared the pill itself, not the ~22 px banner beneath it.
- **Fix:** `CHIP_Y_OFFSET_PX = 44` — chip centre now sits below the banner;
  the offset scales with the scene like every other coordinate.
- **Verified:** unit tests updated; visual pass pending next session.

## BF-004 — Chips at wrong positions in the two-table layout (FIXED)

**2026-09-06 · overlay/seat_chips**

- **Symptom:** with two side-by-side tables (frames ≈1040×1035), chips landed
  far from the avatars — e.g. the north chip ~60 px above and the S5 chip
  ~80 px below their seats.
- **Root cause:** the round-3 scene model scaled anchors by frame *height*
  only. In a tall half-width frame that gave scale 1.89; the real scene
  scale, measured from the screenshot, was ≈1.20 with ~200 px of *vertical
  centring* — the scene fits the limiting axis, it doesn't stretch.
- **Fix:** `sceneTransform(frameW, frameH)`:
  `scale = min(frameW/844, frameH/547)`, left-anchored horizontally (the chat
  sidebar takes the leftover width), vertically centred in leftover height.
  Anchors converted to calibration pixels at 844×547. The render log now
  prints `scale=… offsetY=…` for future calibration.
- **Verified:** regression test reproduces the 1040×1035 frame and asserts
  the north chip lands within a chip-width of the measured avatar; identity
  at the calibration size; residual error in the wide-tile fit is ≤ ~20 px.

## BF-003 — Chips far from avatars (centred aspect-fit model wrong) (FIXED)

**2026-09-06 · overlay/seat_chips** — design.md "live-debug round 3"

- **Symptom:** every chip ~(+110, +100) px from its avatar in tiled layouts.
- **Root cause:** the solver centred a fixed-ratio content rect over the whole
  frame, but the frame also contains the chat sidebar (right) and controls
  (bottom) — the scene hugs the top-left.
- **Fix:** top-left anchored model (superseded by BF-004's min-fit + vertical
  centring, which also handles tall frames).

## BF-002 — 6-max chips hidden; occupancy over-counted (FIXED)

**2026-09-06 · connector + overlay** — design.md "live-debug round 2"

- **Symptom:** `maxSeats=9 hero=6 occupied=[1..9]` logged on a 6-player table;
  no chips rendered.
- **Root causes:** (a) `CO_OPTION_INFO.maxSeat` is the seat-array width, not
  the table size — it reads 9 on 6-max tables; (b) "nonzero seatState =
  occupied" was wrong (all nine entries nonzero with six players).
- **Fix:** `resolveLayoutSize` falls back to the 6-max layout whenever the
  hero sits in seats 1–6; `decodeOccupiedSeats` counts only states 16/80
  (values captures show for seated players). The true table-size field is
  still unidentified — `gameType2` is the prime candidate; raw
  `CO_OPTION_INFO` is logged at join to settle it.

## BF-001 — Seat chips never rendered (FIXED)

**2026-09-06 · connector** — design.md "live-debug round 1"

- **Symptom:** no chips at all despite the connector tracking hands.
- **Root cause:** `GameState.maxSeats` was never set (default 9) and the v2
  solver hides unknown table sizes — silently.
- **Fix:** decode `maxSeat`, carry it across hand resets, add default
  `0/0 · 0 (0)` chips from the `CO_TABLE_INFO` occupancy snapshot, and log
  every render decision so hiding is never silent again.

---

## BF-010 — Hero chip reset to a single hand after a top-up / refresh (FIXED)

**2026-09-28 · analysis/seat_stats**

- **Symptom:** the hero's own seat chip showed near-empty stats (e.g.
  `0/0 · AF 0 · 1h`) while the HUD session line for the same table read
  several hands (e.g. "6 hands"); most visible right after a page refresh.
- **Root cause:** `computeSeatSessionStats` detects a new seat occupant by a
  stack discontinuity (this hand's `startStack` ≠ last hand's
  `startStack + netWon`) and resets that seat's window. The hero trips this
  constantly — topping up chips, and on refresh the account balance is
  re-read — even though the hero seat never changes occupant.
- **Fix:** exempt `p.isHero` from the occupant-change reset; the hero's
  identity is known and fixed for the session, so their window accumulates
  through top-ups and refreshes. Opponents (anonymous) keep the heuristic.
- **Verified:** new unit test (hero stack jumps 1000→2000, window stays at
  2 hands); full suite green.

---

## BF-009 — One table's capture stalls silently mid-session (OPEN, instrumented)

**2026-09-28 · injected + content_script**

- **Symptom:** one of four tables freezes at "N hands" with a stale LIVE
  section while the table keeps playing; other tables keep recording. No
  console errors in the affected frame (checked live once).
- **Leading theory:** Bovada's Atmosphere stack falls back to XHR
  long-polling after a dropped WebSocket; our tap is WS-only, so the frame
  goes permanently deaf. (No errors rules out the poisoned-parser theory
  for the observed occurrence.)
- **Instrumentation shipped:** RGS socket close/error logging with message
  counts, non-string frame detection, a guarded handleEvent that logs the
  offending event, and a FEED STALLED watchdog (2 min of silence in a
  previously active frame). Next occurrence identifies itself in the
  frame's console.
- **Planned fix once confirmed:** tap the Atmosphere XHR/fetch fallback
  transport alongside WebSocket.

---

## Open / watch list

- **Wide-tile residual offset (~20 px right on the east column)** — the
  min-fit scale slightly over-estimates in wide tiles (measured 1.20 vs
  predicted 1.23 in the two-table layout). Refine with the next screenshot's
  `scale=` log line if it bothers.
- **Single-full-window layout** — never calibrated against the new model;
  check chips the next time one table runs maximised.
- **Seat departures** — occupancy only shrinks on the next `CO_TABLE_INFO`
  snapshot; an empty seat can keep a stale `0/0` chip until then.
- **True table-size field** — still unidentified (candidate: `gameType2`),
  but it no longer gates 9-max: since the v4 DOM anchors, every rendered
  seat (1–9) is anchored by its own digit leaf, so 9-max tables get chips on
  all seats. The field only matters for the scene-model *fallback* (whole
  DOM scan empty), which still assumes 6-max geometry when the hero sits in
  seats 1–6 and stays empty otherwise.
