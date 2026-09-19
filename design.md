# Poker HUD — Design Document

## Progress Summary

| # | Component | Layer | Status |
|---|---|---|---|
| 1 | Game Data Model — Card, Suit, Rank types | L1 Model | ✅ Done |
| 2 | Game Data Model — Street enum | L1 Model | ✅ Done |
| 3 | Game Data Model — Action, ActionType | L1 Model | ✅ Done |
| 4 | Game Data Model — Player interface | L1 Model | ✅ Done |
| 5 | Game Data Model — Hand, HandResult | L1 Model | ✅ Done |
| 6 | Game Data Model — GameState, createEmptyGameState() | L1 Model | ✅ Done |
| 7 | Chrome extension scaffold (Vite + MV3, watch mode) | Infra | ✅ Done |
| 8 | WebSocket interception — Proxy hook in MAIN world | L2 Connector | ✅ Done |
| 9 | iframe injection — all_frames: true, broad URL match | Infra | ✅ Done |
| 10 | postMessage bridge — MAIN world → ISOLATED world | L2 Connector | ✅ Done |
| 11 | Atmosphere frame parsing — strip `<len>\|` prefix, unwrap envelope | L2 Connector | ✅ Done |
| 12 | BovadaConnector — GameState machine, pid → event translation | L2 Connector | ✅ Done |
| 13 | BovadaConnector — emit completed Hand on PLAY_STAGE_END_REQ | L2 Connector | ✅ Done |
| 14 | Background service worker — receive Hand, route to storage | Infra | ✅ Done |
| 15 | IndexedDBStore — save / query Hand objects + JSONL export | L3 Storage | ✅ Done |
| 16 | Analysis — computeHeroStats() (VPIP, PFR, 3-bet, AF, WTSD …) | L4 Analysis | ✅ Done |
| 17 | Overlay — hero stats panel injected into poker page | L5 Display | ✅ Done |
| 18 | Overlay — live hand display (pot, board, street) | L5 Display | ✅ Done |
| 19 | Popup — settings + stat viewer | L5 Display | ✅ Done |
| 20 | Stats grouping (stake level / table) + time filtering | L4/L5 | ✅ Done |
| 21 | Popup — cumulative net-winnings graph (hands × net $) | L4/L5 | ✅ Done |

**Where we are — Phase 1 complete.** All layers (rows 1–21) are implemented. The full loop runs: WebSocket interception → `BovadaConnector` → `Hand` storage in IndexedDB → `computeHeroStats()` → HUD overlay at the table + popup stat viewer (time-range and stake-level filters, a per-selection stat card, and a cumulative net-winnings graph), plus JSONL export for training data. L2 decoding is verified against stack-delta chip accounting (`totalPot === rake + Σ potWon` holds on all captured and live-exported hands).

**Shared filter/grouping layer.** Row 20 was repurposed from the original "separate GameState per socket" infra note (already covered — one connector + overlay per game frame) into the stats service that also backs the Phase 2 analysis panel. A shared `StatsFilter` (`src/analysis/stats_service.ts`) carries `tableId` / `stakeLevel` / `fromTime` / `toTime`; `getHeroStats`, `getNetSeries`, `listTables`, and `listStakeLevels` all honor it. Stake level is the derived key `"<sb>/<bb>"`; **blinds are stored in cents** (`5/10` = `$0.05/$0.10`), formatted via `formatStakeLevel` (`src/overlay/format.ts`). The popup exposes a time-range selector and a stake-level selector; by-table grouping stays available in the service layer (`listTables`) but is hidden from the popup UI.

**Next: Phase 2 — the Analysis Panel** (see the dedicated section below).

---

## Goal

Build a real-time Heads-Up Display (HUD) that tracks hand history and computes statistics to help the hero improve. The architecture is platform-agnostic: Bovada is the first target, but other poker platforms can be added by implementing a new Platform Connector without touching any other layer.

### Player Tracking Scope

| Platform | Player identity | Hero stats | Opponent stats |
|---|---|---|---|
| Bovada | Anonymous tables — opponents have no persistent identity | ✅ Phase 1 | 🔲 Optional / future |
| PokerStars (future) | Named accounts — persistent across sessions | ✅ | ✅ |

**Bovada Phase 1 focuses on the hero only.** Opponent actions are still recorded in each `Hand` object (seat + action type + amount) so the data is available later, but the analysis and display layers will only surface hero statistics until opponent tracking is explicitly added.

---

## System Layers

```
┌─────────────────────────────────────────────┐
│  Layer 5 · Display / Overlay                │  (platform-specific UI)
├─────────────────────────────────────────────┤
│  Layer 4 · Analysis                         │  (pure functions over Hand[])
├─────────────────────────────────────────────┤
│  Layer 3 · Storage                          │  (persist / query Hand objects)
├─────────────────────────────────────────────┤
│  Layer 2 · Platform Connector               │  (source + parse → emit Hand)
├─────────────────────────────────────────────┤
│  Layer 1 · Game Data Model                  │  (canonical types shared by all layers)
└─────────────────────────────────────────────┘
```

Data flows downward during a hand (raw events → GameState) and upward when a hand ends (Hand → Storage → Analysis → Display).

---

## Layer 1 — Game Data Model

Canonical types used by every other layer. Platform-specific connectors must translate their data into these types. No platform-specific fields belong here.

### Card

```typescript
type Suit = 'c' | 'd' | 'h' | 's';
type Rank = '2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'T'|'J'|'Q'|'K'|'A';
type Card = `${Rank}${Suit}`;  // e.g. "Ah", "Td", "2c"
```

### Street

```typescript
enum Street {
  WAITING        = 'waiting',
  NEW_HAND       = 'new_hand',
  POSTING_BLINDS = 'posting_blinds',
  PREFLOP        = 'preflop',
  FLOP           = 'flop',
  TURN           = 'turn',
  RIVER          = 'river',
  SHOWDOWN       = 'showdown',
  RESULT         = 'result',
}
```

### Action

```typescript
enum ActionType {
  POST_SB   = 'post_sb',
  POST_BB   = 'post_bb',
  FOLD      = 'fold',
  CHECK     = 'check',
  CALL      = 'call',
  BET       = 'bet',
  RAISE     = 'raise',
  ALL_IN    = 'all_in',
  SHOW      = 'show',
  MUCK      = 'muck',
}

interface Action {
  seat:      number;
  playerId:  string;
  type:      ActionType;
  amount:    number;      // chips committed this action (0 for fold/check/muck)
  street:    Street;
  stackAfter: number;     // remaining stack after action
}
```

### Player

```typescript
interface Player {
  seat:     number;
  // Named platforms (PokerStars): real username, persistent across sessions.
  // Anonymous platforms (Bovada): seat-scoped token "bovada:<tableId>:<seat>".
  //   Opponent playerIds on Bovada are not meaningful across hands.
  playerId: string;
  stack:    number;       // starting stack for this hand
  cards:    Card[] | null;  // null until shown; hero's own cards always populated
  isHero:   boolean;
}
```

### Hand

`Hand` is the immutable, completed record emitted when a hand ends. It is the atomic unit passed between Layer 2 → 3 → 4. `GameState` is the transient in-memory object that builds up during a hand; it is never persisted.

```typescript
interface Hand {
  handId:     string;           // platform hand ID (e.g. stageNo)
  tableId:    string;           // table identifier
  platform:   string;           // 'bovada', 'pokerstars', etc.
  timestamp:  number;           // Unix ms, hand start
  gameType:   string;           // 'nlhe', 'plo', etc.
  stakes:     { sb: number; bb: number };
  dealerSeat: number;
  heroSeat:   number;
  players:    Player[];
  actions:    Action[];
  board:      Card[];           // final board (up to 5 cards)
  pot:        number;           // total pot at end
  rake:       number;
  result:     {
    seat:     number;
    playerId: string;
    won:      number;           // chips won (net of investment)
  }[];
}
```

### GameState (transient, Layer 2 internal)

```typescript
interface GameState {
  handId:    string;
  tableId:   string;
  street:    Street;
  dealerSeat: number;
  heroSeat:  number;
  board:     Card[];
  pot:       number[];
  rake:      number[];
  seats: Record<number, {
    playerId:  string;
    stack:     number;
    bet:       number;
    cards:     Card[] | null;
    active:    boolean;
    isHero:    boolean;
  }>;
  actions:   Action[];
}
```

---

## Layer 2 — Platform Connector

Responsible for sourcing raw data, parsing platform-specific format, maintaining `GameState` during a hand, and emitting a completed `Hand` when the hand ends.

Each platform implements the `PlatformConnector` interface:

```typescript
interface PlatformConnector extends EventEmitter {
  connect(config: ConnectorConfig): void;
  disconnect(): void;
  // emits: 'hand_complete' (hand: Hand)
  // emits: 'state_update'  (state: GameState)   — for live HUD updates
  // emits: 'error'         (err: Error)
}
```

### Connector Config

```json
{
  "platform": "bovada",
  "strategy": "websocket_intercept",
  "options": {
    "wsEndpoint": "wss://pkscb.bovada.lv/poker-games/rgs"
  }
}
```

```json
{
  "platform": "pokerstars",
  "strategy": "file_watch",
  "options": {
    "handHistoryDir": "C:/PokerStars/HandHistory/username"
  }
}
```

### Strategies

| Strategy | Description | Platforms |
|---|---|---|
| `websocket_intercept` | Monkey-patch `window.WebSocket` inside Chrome extension content script; intercept all frames on the RGS endpoint | Bovada |
| `file_watch` | Watch a directory for new `.txt` hand history files; parse on change | PokerStars, GGPoker |
| `api_poll` | Poll a platform REST API on an interval | Hypothetical |

### Bovada Connector (websocket_intercept)

**Source:** Hook `window.WebSocket` at `document_start` before the poker app runs. Filter for `wss://pkscb.bovada.lv/poker-games/rgs`.

**Framing:** Strip Atmosphere prefix: `"<length>|" + JSON` → parse JSON. Client→server messages have no prefix.

**Translation table** — Bovada `pid` → canonical model:

| Bovada pid | Canonical event |
|---|---|
| `PLAY_STAGE_INFO` | New hand starts; reset `GameState`, set `handId` |
| `CO_TABLE_STATE` | Update `GameState.street` via bitmask (see below) |
| `CO_DEALER_SEAT` | Set `GameState.dealerSeat` |
| `CO_BLIND_INFO` | Append `POST_SB` / `POST_BB` action; amount from `bet` field (covers 10-chip dead blinds, btn 8); update stacks |
| `CO_CARDTABLE_INFO` | Your hole cards (hero seat has real values; others have 32896) |
| `CO_BCARD3_INFO` | Set flop cards on `GameState.board` |
| `CO_BCARD1_INFO` | Append turn (`pos:4`) or river (`pos:5`) card to board |
| `CO_CURRENT_PLAYER` | Note whose turn it is |
| `CO_SELECT_INFO` | Append action (see btn bitmask below); update stack |
| `CO_CHIPTABLE_INFO` | Update pots from `curPot`, rake from `curRake` |
| `CO_PCARD_INFO` | Reveal hole cards at showdown |
| `CO_RESULT_INFO` | Final stacks; `account` is **0-indexed** (`account[i]` = seat `i+1`) |
| `CO_POT_INFO` | Pot awards; `returnHi` is 0-indexed. Excludes uncalled-bet returns (refunded outside the pot), so `netWon` = end stack − start stack, and `totalPot === rake + Σ potWon` |
| `PLAY_STAGE_END_REQ` | Hand complete; serialize `GameState` → `Hand`; emit `hand_complete` |

**Bovada `tableState` bitmask → `Street`:**

| tableState | Street |
|---|---|
| 1 | `WAITING` |
| 2 | `NEW_HAND` |
| 4 | `POSTING_BLINDS` |
| 8 | `PREFLOP` |
| 16 | `FLOP` |
| 32 | `TURN` |
| 64 | `RIVER` |
| 32768 | `SHOWDOWN` |
| 65536 | `RESULT` |

**Bovada `btn` bitmask → `ActionType`** (verified against stack deltas in captured sessions):

| btn | ActionType | CO_SELECT_INFO field semantics |
|---|---|---|
| 64 | `CHECK` | — |
| 128 | `BET` (lead bet) | `bet` = bet amount |
| 256 | `CALL` (incl. limp / SB-complete) | `bet` = chips **added**, not street total |
| 512 | `RAISE` (incl. preflop opens — blinds are the open bet) | `bet` = amount to call, `raise` = raise-to total |
| 1024 | `FOLD` | — |
| 2048 | `ALL_IN` (call) | — |
| 4096 | `ALL_IN` (raise) | — |
| 8192 | `SHOW` | — |
| 32768 | `MUCK` | — |

The connector does not decode per-btn amount fields: chips committed per action are computed from the **stack delta** (`account` before vs after), which is uniform across all action types including all-ins.

**Bovada card encoding:**
```
card_code = suit * 13 + rank
suit:  0=clubs, 1=diamonds, 2=hearts, 3=spades
rank:  0=Ace, 1=2, 2=3, ..., 9=Ten, 10=Jack, 11=Queen, 12=King
32896 = face-down (hidden)
```
```javascript
function decodeCard(code) {
  if (code === 32896) return null;
  const suit = ['c','d','h','s'][Math.floor(code / 13)];
  const rank = ['A','2','3','4','5','6','7','8','9','T','J','Q','K'][code % 13];
  return rank + suit;
}
```

**Player identity on Bovada:** Tables are anonymous. `nickName` is populated only for the hero; opponent `nickName` fields are empty.

- Hero `playerId`: use the hero's `nickName` (e.g. `"560201380440500"`). This is consistent across sessions.
- Opponent `playerId`: use `"bovada:<tableId>:<seat>"` as a seat-scoped token. These are recorded in `Hand.actions` so the data is preserved, but no cross-hand analysis is done on them in Phase 1.

Opponent tracking on Bovada is deferred. It could be revisited later using behavioural fingerprinting (e.g. stack size + timing patterns), but this is out of scope for now.

---

## Layer 3 — Storage

Stores completed `Hand` objects. Provides two interchangeable backends behind a common interface.

```typescript
interface HandStore {
  save(hand: Hand): Promise<void>;
  query(filters: QueryFilters): Promise<Hand[]>;
  count(filters: QueryFilters): Promise<number>;
}

interface QueryFilters {
  platform?:  string;
  tableId?:   string;
  playerId?:  string;       // filter hands where this player appeared
  fromTime?:  number;
  toTime?:    number;
  limit?:     number;
}
```

### Backends

| Backend | Use case | Notes |
|---|---|---|
| `IndexedDBStore` | Chrome extension (in-browser) | Default for Bovada; no server needed |
| `SQLiteStore` | Desktop app or local server | For PokerStars file-watch connector; easier bulk queries |

`Hand` objects are small (typically < 5 KB each) and fit comfortably in either backend.

`IndexedDBStore` (implemented, `src/storage/`): objectStore `hands` keyed by `[platform, handId]` (idempotent upsert), indexes on `timestamp` and `tableId`; queries return hands sorted by timestamp. Because extensions cannot write arbitrary local folders, on-disk training data comes from **Export hands** (popup → background): all stored hands grouped per table and downloaded as `Downloads/bovada_hud/<platform>_<tableId>.jsonl`, one JSON hand per line.

---

## Layer 4 — Analysis

Pure functions over `Hand[]`. No I/O, no side effects. The analysis layer does not know about platforms, storage, or display. It receives hands and returns stats.

### Phase 1 — Hero Stats (Bovada)

```typescript
interface HeroStats {
  playerId:    string;
  handsPlayed: number;
  vpip:        number;   // %
  pfr:         number;   // %
  threeBet:    number;   // %
  foldTo3Bet:  number;   // %
  af:          number;   // aggression factor (all streets combined)
  afByStreet:  { preflop: number; flop: number; turn: number; river: number };
  wtsd:        number;   // went to showdown %
  wsd:         number;   // won at showdown %
  winRate:     number;   // net chips per hand
}

function computeHeroStats(hands: Hand[], heroPlayerId: string): HeroStats;

// Cumulative net chips after each hand the player was dealt in, in play
// order. series[k] = net chips over hands 0..k. Drives the winnings graph.
// Per-hand net matches the Win Rate definition (winner netWon / loser −invested).
function computeNetSeries(hands: Hand[], playerId: string): number[];
```

### Phase 2 — Opponent Stats (named platforms / future)

```typescript
// Same shape as HeroStats; computed per opponent playerId.
function computePlayerStats(hands: Hand[], playerId: string): HeroStats;
// Compute for all players found across the hand set.
function computeAllStats(hands: Hand[]): Record<string, HeroStats>;
```

Opponent stat functions exist in the codebase but are not wired to the display layer for Bovada Phase 1. They become useful automatically when a named-platform connector is added.

### Stat Definitions

| Stat | Definition |
|---|---|
| VPIP | Hands with a voluntary preflop `CALL`/`RAISE`/`ALL_IN` (blind posts and BB checks excluded) / hands played |
| PFR | Hands with a preflop `RAISE` (or all-in raise) / hands played. Preflop opens are `RAISE` (btn 512) |
| 3-Bet % | 3-bets made / opportunities (acting preflop facing exactly the open raise) |
| Fold to 3-Bet | Folds when re-raised after own preflop raise / times facing such a re-raise |
| AF | (bet + raise + all-in-raise) / (call + all-in-call), overall and per street. All-in is a raise iff it beat the prior street max |
| WTSD | Showdowns reached (player and ≥1 other never folded) / hands where player saw the flop |
| W$SD | Showdowns with `potWon > 0` / showdowns reached |
| Win Rate | Chips per hand: winners use `results.netWon` (true stack delta, covers uncalled-bet returns); losers use −Σ invested |

---

## Layer 5 — Display / Overlay

Platform-specific UI, implemented in `src/overlay/` + `src/popup/`.

**HUD overlay** (`HudPanel`, `src/overlay/hud_panel.ts`): a shadow-DOM panel (`position: fixed`, top-right) created lazily on the first `state_update` — the connector only fires in the frame hosting the RGS WebSocket, so the panel appears exactly once per game frame (one per table window). Three sections:
- **Lifetime hero stats** — VPIP · PFR · 3B / AF · WTSD · W$SD / hands · chips-per-hand, fetched from the background via `get_hero_stats` and refreshed after each stored hand.
- **Session** — hands + net chips for the current `tableId` (`get_hero_stats { tableId }`).
- **Live** — street, collected pot, board, and hero hole cards from each `state_update`.

Pure formatters live in `src/overlay/format.ts` (unit-tested); the panel is dumb rendering. Visibility is controlled by `chrome.storage.local.hud_visible`, toggled live from the popup.

**Popup** (`src/popup/`): HUD show/hide toggle, two persisted selectors (time range · stake level), a hero stat card for the current selection (VPIP/PFR, 3-bet, AF, WTSD/W$SD, win rate, net in $), the net-winnings graph, and JSONL export. Grouping by table is retained in the service layer (`list_tables`) but hidden from the popup.

**Net winnings graph:** below the stat card, a dependency-free inline-SVG line chart of cumulative net over the selected hands — **x-axis = hand count** (1…N), **y-axis = net in dollars**. Built by the pure `netChartSvg(series, width, height)` (`src/overlay/net_chart.ts`, unit-tested): plots `computeNetSeries` from a leading 0 baseline, auto-scales y to include 0, draws a dashed zero line, and colors the line green/red by final result. The popup fetches the series with the current `StatsFilter` and re-renders on any selector change; it is hidden when the selection has fewer than two hands.

**Message API** (`src/messages.ts`): `hand_complete`, `get_hand_count`, `export_hands`, `get_hero_stats {filter?}`, `list_tables {filter?}`, `list_stake_levels {filter?}`, `get_net_series {filter?}`. All stat/series/grouping queries carry a `StatsFilter` and are answered by the background worker via `src/analysis/stats_service.ts` (derives the hero id from stored hands' `isHero` flag).

**Phase 2 (deferred):** per-seat opponent stat boxes and seat-to-pixel mapping — only relevant on named platforms.

---

## Phase 2 — Analysis Panel

The popup is intentionally compact (320 px) for quick at-the-table glances. Phase 2 adds a dedicated, full-window **Analysis Panel** for deep off-table review of hero play — spotting leaks, reviewing positional tendencies, browsing and replaying hands, and tracking results over time. This is a new **Layer 5 surface plus additive Layer 4 pure functions**; it needs no connector or storage changes, reading the same IndexedDB through the existing background message API and `StatsFilter`.

**Delivery (implemented).** The panel is an MV3 **options page** (`manifest.json` → `options_ui` with `open_in_tab: true`) served from `src/panel/` and opened full-tab via `chrome.runtime.openOptionsPage()` from an **Open analysis panel** button in the popup. A shared **filter bar** (time range · stake level) at the top drives every widget, reusing `StatsFilter`; the range/level selections persist in `chrome.storage.local` (shared keys with the popup). The page is organised into three tabs — **Overview**, **Positions**, **Hands**.

### Progress

| # | Component | Layer | Status |
|---|---|---|---|
| 22 | Panel scaffold — full-page options view + shared filter bar + tabs | L5 | ✅ Done |
| 23 | Positional stats — VPIP/PFR/3-bet/AF/WTSD by position (+ Total row) | L4/L5 | ✅ Done |
| 24 | Results summary — accumulated win, hands, hands won %, sessions, bb/100 by stake level | L4/L5 | ✅ Done |
| 25 | Hand history browser — filter, list, and replay individual hands | L5 | ✅ Done |
| 27 | Leak highlights — flag stats outside healthy ranges with hints | L4/L5 | ✅ Done |

**Where we are — Phase 2 complete.** New pure L4 modules `src/analysis/position.ts` (`positionOf`, `seatPositions`, `computeStatsByPosition`, `POSITION_ORDER`) and `src/analysis/panel_stats.ts` (`computeSessions`, `computeStakeStats`, `listHandSummaries`, `computeLeaks`) back the panel; all are unit-tested (`position.test.ts`, `panel_stats.test.ts`). `netWonInHand` is now exported from `hero_stats.ts` and reused across the new views. The background message API gained `get_stats_by_position`, `get_stake_stats`, `list_hands`, `get_hand`, and `get_leaks`, all carrying a `StatsFilter` and answered by `stats_service.ts`.

### Design notes

**Panel scaffold (22).** `src/panel/index.html` + `index.ts`, styled to match the popup's dark theme. Overview tab: summary cards (hands · net · bb/100 · hands-won % · sessions), the by-stake results table, a large net-winnings SVG chart (`netChartSvg(series, 1040, 300)`), and leak highlights. Positions tab: per-position stat table. Hands tab: a two-pane hand browser + replay.

**Positional stats (23).** Positions (BTN, SB, BB, UTG, MP, CO, …) are derived from `Hand.dealerSeat` and the dealt-in `players[]` seat order — no new captured data. `seatPositions(hand)` rotates the sorted dealt-in seats to start at the SB (the button *is* the SB heads-up), then labels them from a per-table-size table; `positionOf` / `computeStatsByPosition` build on it. The Positions tab renders VPIP/PFR/3-bet/AF/WTSD/W$SD/Net per position with an overall Total row.

**Results summary by stake level (24).** `computeStakeStats(hands, playerId)` groups the hero's hands by blind level and reports accumulated net, hands, hands-won count, session count, and bb/100. Sessions come from `computeSessions`, which splits hands on a 30-minute idle gap (`SESSION_GAP_MS`). Overall bb/100 across mixed stakes is computed correctly as `Σ(net_level / bb_level) / totalHands × 100`.

**Hand history browser (25).** `list_hands {filter}` returns lightweight `HandSummary` rows (handId, time, stake, position, hero cards, board, net), newest-first. Clicking a row fetches the full `Hand` via `get_hand {handId, tableId}` and renders a street-by-street replay (Preflop/Flop/Turn/River/Showdown) with the board revealed progressively, each action labelled by position + seat with $ amounts, the hero row highlighted, and a net result line. First consumer of stored `actions` beyond aggregate stats; reuses the card formatters in `src/overlay/format.ts`.

**Leak highlights (27).** `computeLeaks(stats)` — pure heuristics over `HeroStats` against healthy 6-max ranges (loose VPIP, wide VPIP/PFR gap, 3-bet too low/high, fold-to-3-bet too high, passive AF, WTSD/W$SD out of band), emitting short explainable hints with a warn/info severity. Requires `MIN_LEAK_HANDS` (100) before firing; otherwise returns a single "not enough hands" note. No ML — a first, explainable pass toward the README's "compute my curve" goal.

**Principles (unchanged from Phase 1):** all computation stays in pure, unit-tested L4 functions; the panel page is dumb rendering; new query messages carry `StatsFilter` and are answered by `stats_service.ts`. L1–L3 and the connector are untouched apart from additive analysis helpers.

---

## Phase 3 — PT4-Class Analytics (Plan)

Phase 2 covers the most-used aggregate views (VPIP/PFR/AF/WTSD, positional breakdown, session accounting, hand replay). Phase 3 closes the remaining gap vs PokerTracker 4 for a hero-only workflow on anonymous tables.

Almost everything below is derivable from the existing `Hand` records — **no new data capture is needed** — but two structural pieces were missing from the first draft of this plan:

1. **A hand evaluator is the keystone, not a luxury.** A pure 7-card evaluator (~200 LOC, exhaustively unit-testable) unlocks four PT4-class features at once: the **all-in EV / luck-adjusted line**, **made-hand category reports** ("profit with top pair+"), **equity display in the replayer**, and **won-hand verification**. The first draft wrongly deferred all-in EV as "requires a solver" — it does not. Flop all-ins enumerate C(45,2) = 990 runouts, turn all-ins 44; both are exact and instant. Preflop all-ins use Monte Carlo (~10k samples, still <100 ms). Bovada reveals hole cards on all-in via `CO_PCARD_INFO`, so the inputs are already stored.
2. **Data durability is a correctness issue, not a nice-to-have.** Chrome may evict IndexedDB under storage pressure, silently destroying a player's entire history. `navigator.storage.persist()` + JSONL **import** (we only have export) must land before the database grows valuable.

### Gap analysis vs PT4 (revised)

| Category | PT4 feature | Notes |
|---|---|---|
| **Reports** | **Starting-hand matrix (13×13)** — profit/frequency heatmap per hole-card combo | PT4's most iconic view; hero cards are stored in every hand. Click a cell → filter the hand browser |
| Reports | Made-hand category report (profit with top pair, overpair, sets…) | Needs the evaluator |
| Reports | Day-of-week / hour-of-day winrate | Tilt & game-selection discipline; trivial from timestamps |
| Reports | Rake paid (total, bb/100) | Already stored per hand |
| **Stats** | **WWSF** (won when saw flop) | Top-5 stat, missed in the first draft |
| Stats | AFq (aggression frequency %) | Modern complement to AF: aggr / (aggr + calls + folds) |
| Stats | Limp % / limp-fold %, cold-call % | Passive-preflop leak detection |
| Stats | Donk bet %, probe bet %, float | Line-level postflop reads |
| Stats | Steal / blind defense, 4-bet, squeeze, c-bet suite, check-raise | Carried over from draft v1 |
| **Graph** | Redline / blueline (non-SD vs SD winnings) | Carried over |
| Graph | **All-in EV line (luck-adjusted winnings)** | Feasible — see keystone note above |
| Graph | Monthly/weekly results calendar | Low effort, high engagement |
| **Filters** | **Line filters**: 3-bet pots, as/vs PF aggressor, pot size, saw showdown, hole cards | PT4's killer feature; our browser only filters time/stake |
| **Replayer** | Graphical table view (seats in a circle, chips, pot) with equity per street | Ours is a text list |
| **Live HUD** | Pot odds facing a bet | Carried over |
| Live HUD | **Session-scoped seat stats** (VPIP/PFR per seat, current session) | The DriveHUD "anonymous mode" trick — seat identity is stable while a player sits |
| **Data** | Import / restore, persistent storage, notes & tags | Durability + annotation |

### Progress

Tiered by priority. **P0** = the analytics core that everything else consumes; **P1** = the views that make it usable daily; **P2** = polish and stretch.

| # | Tier | Component | Layer | Status |
|---|---|---|---|---|
| 30 | P0 | Stat engine v2 — counter-based catalog: steal/defense, 4-bet, fold-to-4-bet, squeeze, cold-call | L4 | ✅ Done |
| 31 | P0 | Stat engine v2 — c-bet + fold-to-c-bet (flop/turn/river); donk/probe/raise-c-bet deferred | L4 | ✅ Done |
| 32 | P0 | Stat engine v2 — check-raise by street, AFq by street, WWSF; check-call/check-fold/limp deferred | L4 | ✅ Done |
| 32E | P0 | Enhancement to 30–32 — stat glossary popovers: hover definition + latest example hand + inline replay | L4/L5 | ✅ Done |
| 33 | P0 | Redline / blueline graph (non-SD vs SD cumulative winnings) | L4/L5 | ➖ Removed |
| 39 | P0 | **Hand evaluator** — pure 7-card ranker + made-hand classifier | L4 | ✅ Done |
| 40 | P0 | **Starting-hand matrix** — 13×13 profit/frequency heatmap, click-to-filter | L4/L5 | ✅ Done |
| 41 | P0 | **Data durability** — `navigator.storage.persist()`, JSONL import/restore | L3 | ✅ Done |
| 34 | P1 | Hand browser: line filters (position, won/lost, street, 3-bet pot, as-PFA, pot size, hole cards) | L4/L5 | ✅ Done |
| 35 | P1 | Trend view — rolling 100/200/500-hand stats over time | L4/L5 | ✅ Done |
| 36 | P1 | Sessions view — sortable table (date, duration, hands, net, bb/100) + net-per-session bar chart | L4/L5 | ✅ Done |
| 37 | P1 | Live HUD — pot odds when facing a bet | L5 | ✅ Done |
| 42 | P1 | All-in EV line — luck-adjusted winnings graph | L4/L5 | ✅ Done |
| 43 | P1 | Live HUD — session-scoped per-seat VPIP/PFR/AF | L4/L5 | ✅ Done |
| 48 | P1 | Enhancement P3a — per-seat stat chips anchored to the table art (v2) | L5 | ✅ Done — awaiting live calibration |
| 49 | P1 | Enhancement P3b — analysis-panel manual refresh | L5 | ✅ Done |
| 50 | P1 | Big hands retrieval — sort by pot / win / loss + one-click presets, pot column | L5 | ✅ Done |
| 38 | P2 | Hand notes / tags — annotate hands in the browser, export sidecar | L3/L5 | 🔲 Todo |
| 44 | P2 | Made-hand category report — profit by hand class at showdown | L4/L5 | 🔲 Todo |
| 45 | P2 | Time reports — day-of-week / hour-of-day winrate; monthly calendar | L4/L5 | 🔲 Todo |
| 46 | P2 | Graphical replayer — SVG table, seats, pot; equity & pot odds per street | L5 | 🔲 Todo |
| 47 | P2 | Rake report — total rake, rake in bb/100 | L4/L5 | 🔲 Todo |

**Where we are — Phase 3 P0 + P1 complete** (33 built then removed in the performance pass). Shipped beyond the original list: the 32E stat-glossary popovers with example-hand replays, the panel performance pass (aggregate `get_panel_data`, `CachedHandStore`, memoised EV), and Enhancement P3 (per-seat stat chips over the table art — three live-debug rounds calibrated the scene model — plus the panel's manual ↻ Refresh). Remaining: the P2 tier (38, 44–47), 9-max chip anchors, and the still-unidentified protocol field for visual table size (chips currently assume 6-max whenever the hero sits in seats 1–6).

---

### Keystone 1 — Stat engine v2 (30–32): counters, not percentages

The draft-v1 `HeroStats` extension (a flat list of ~15 scalar percentages) repeats a design flaw PT4 solved long ago: **a percentage without its sample size is unreadable**. "Fold to 4-bet: 100%" means nothing over 2 opportunities. Instead, every conditional stat becomes a counter pair, and formatting lives in L5:

```typescript
// n = times done, d = opportunities. pct is derived at display time.
interface Counter { n: number; d: number }

interface HeroStatsV2 extends HeroStats {
  // Preflop
  steal:         Counter;   // raise first-in from CO/BTN/SB
  stealByPos:    { co: Counter; btn: Counter; sb: Counter };
  foldBBToSteal: Counter;
  foldSBToSteal: Counter;
  fourBet:       Counter;
  foldTo4Bet:    Counter;
  squeeze:       Counter;   // raise vs open + ≥1 caller
  limp:          Counter;   // call first-in (or over limpers) preflop
  limpFold:      Counter;   // limped, faced a raise, folded
  coldCall:      Counter;   // called an open with no prior investment
  // Postflop
  wwsf:          Counter;   // won the pot | saw flop  ← top-5 stat, was missing
  afq:           { flop: Counter; turn: Counter; river: Counter };  // aggr/(aggr+call+fold)
  cbet:          { flop: Counter; turn: Counter; river: Counter };
  foldToCbet:    { flop: Counter; turn: Counter; river: Counter };
  raiseCbet:     Counter;   // raise vs flop c-bet
  donkFlop:      Counter;   // bet into the PF aggressor
  probeTurn:     Counter;   // bet turn after PFA checked back flop
  checkRaise:    { flop: Counter; turn: Counter; river: Counter };
  checkFold:     { flop: Counter; turn: Counter; river: Counter };
}
```

The UI renders `"62 (34)"` — value with opportunity count — and greys out stats under a minimum sample. Existing `HeroStats` fields keep their shape (percentages) for backward compatibility; new consumers use the counters.

**Status — ✅ Done (30–32).** Implemented in `src/analysis/hero_stats.ts`: `Counter { n, d }`, `counterPct`, and the extended fields spread onto `HeroStats` (all zeroed for empty samples via `newExtCounters`). Rather than rewrite the proven Phase-1 `walkHand`, a **separate `walkExtended` pass** computes the new counters, so existing stats are untouched. `walkExtended` runs a preflop state machine (`walkExtendedPreflop` → returns the preflop-aggressor seat) plus a per-street postflop pass (`walkExtendedStreet`, chaining c-bet eligibility flop→turn→river). Positions come from `seatPositions` (hands on unsupported table sizes contribute non-positional stats only). Unit-tested in `hero_stats_extended.test.ts` (11 cases). Surfaced in the panel Overview tab as an **Advanced stats** card (preflop / postflop columns), formatted `pct (opps)` and dimmed below a 15-opportunity sample.

**Shipped stats.** Preflop: `steal` (+ `stealByPos` co/btn/sb), `foldBBToSteal`, `foldSBToSteal`, `squeeze`, `coldCall`, `fourBet`, `foldTo4Bet`. Postflop: `cbet`/`foldToCbet`/`checkRaise`/`afq` (each flop/turn/river) and `wwsf`. Definitions: **steal** = raise first-in from CO/BTN/SB; **fold-to-steal** = fold in the blinds vs a single steal-position open with no caller; **4-bet** = re-raise after hero's open was 3-bet; **fold-to-4-bet** = fold after hero's 3-bet was 4-bet; **squeeze** = raise vs an open + ≥1 cold-caller; **cold-call** = call an open, out of the blinds, at first decision; **c-bet** = PFA makes the first bet on the street (turn/river require having c-bet the prior street); **fold-to-c-bet** = fold facing the PFA's bet; **check-raise** = check then raise a bet on the same street; **AFq** = aggressive actions / all actions on the street; **WWSF** = net > 0 given the flop was seen.

**Deferred within 30–32** (cheap follow-ups on the same walk, left out to keep the first pass unambiguous): `donk`, `probe`, `raiseCbet`, `checkCall`, `checkFold`, `limp`/`limpFold`. The 4-bet+ tree stops at fold-to-4-bet (5-bet lines are vanishingly rare on these stakes).

#### Enhancement 32E — Stat glossary popovers with example hands

**Problem.** The Advanced stats card presents terms of art (Steal, Fold BB to steal, Squeeze, WWSF…) with no explanation. A player who doesn't already know PT4 vocabulary can't act on them, and even one who does can't see *which of their own hands* a stat is talking about.

**UX.** Hovering a stat label opens a small popover anchored to it:

1. **Definition** — one or two plain-language sentences for the term.
2. **Example hand link** — where the stat has a recorded example, a link labelled with the example's date. Stats that are plain frequencies of a whole-hand property (VPIP, PFR, AF, AFq…) show the definition only.
3. **Sticky behavior** — the popover does not vanish when the pointer travels from the label into it (hide runs on a ~300 ms grace timer, cancelled on entering the popover). Clicking the label — or anywhere inside the popover — **pins** it; a pinned popover closes only on click-outside or Escape, so the user can freely reach the link.
4. **Inline replay** — clicking the example link expands a scrollable street-by-street replay of that hand *inside the popover*, reusing exactly the renderer the Hands tab uses (`replayHtml`, extracted from `showReplay`).

The same popover mechanism serves definition-only tooltips on the Positions-tab column headers (VPIP/PFR/3B/AF/WTSD/W$SD) and on the Overview summary cards (bb/100, Hands won, Sessions). The Advanced stats section is retitled **Stats** and gains a **Core** card mirroring the popup/HUD stat card — VPIP, PFR, 3-bet, fold-to-3-bet, AF by street, WTSD, W$SD, win rate — one stat per row so each carries its own definition popover; the Phase-1 scalars stay percentage-formatted (no opportunity counts), which the card-grid caption spells out.

**Data model (L4).** The example is "the latest hand in which the stat's event actually happened" — the numerator, not merely the opportunity (a *Steal* example is a hand where the hero stole; a *Fold BB to steal* example is a hand where the hero folded). Rather than widening `Counter` (whose strict `{n, d}` shape is asserted all over the tests and needs no per-street granularity here), `HeroStats` gains a parallel map:

```typescript
interface HandRef { handId: string; tableId: string; timestamp: number }
type StatExampleKey =
  | 'steal' | 'foldBBToSteal' | 'foldSBToSteal' | 'squeeze' | 'coldCall'
  | 'fourBet' | 'foldTo4Bet' | 'cbet' | 'foldToCbet' | 'checkRaise' | 'wwsf';
interface HeroStatsV2 { /* … */ examples: Partial<Record<StatExampleKey, HandRef>> }
```

Keys are **per UI row**, so per-street counters (c-bet F/T/R) share one key holding the latest example across streets. `walkExtended` builds a `note(key, made)` closure over the current hand's ref and threads it through the preflop/street walks alongside each `obs(...)`; it overwrites the stored ref when `made` and the hand's timestamp is `>=` the existing one, so the newest example wins regardless of input order. `afq` gets no example (every aggressive action qualifies — an example teaches nothing); the `stealByPos` sub-row gets its own definition-only glossary entry. A popover with no viable example (definition-only stat, or none recorded yet) shows just the definition. A caption under the Advanced stats card explains the `% (opportunities)` value format and the small-sample grey-out.

**Wire & storage.** None. `examples` rides on the existing `get_hero_stats` response; the replay fetch reuses `get_hand {handId, tableId}`. Stats are computed on demand, so there is no migration.

**L5 mechanics (panel).** A static `STAT_INFO` glossary maps a `data-stat` key → `{ title, definition, example? }`. One shared `#stat-pop` element is positioned near the hovered `.stat-term`; open/close uses **delegated** `mouseover`/`click` listeners on `document`, so `renderAdvanced`'s innerHTML re-renders need no re-binding. Because the popover sits directly below its anchor, the pointer crosses the *next* row's label on its way in — a ~150 ms hover-intent delay before opening (and never replacing a pinned popover on mere hover) keeps that transit from swapping the content. Re-rendering (filter change) hides any open popover and refreshes the cached `HeroStats` the popover reads. Reopening the same key while visible is a no-op so an expanded replay isn't destroyed by pointer jitter.

**Out of scope / follow-ups:** popup-side tooltips (320 px popup stays glanceable); an "opportunity example" for stats sitting at 0% (e.g. Steal 0 (12)); per-street example links on F/T/R rows; deep-linking the example into the Hands tab with the row pre-selected.

### Keystone 2 — Hand evaluator (39)

`src/analysis/evaluator.ts` — pure, dependency-free:

```typescript
// Rank a 5–7 card hand. Higher = better; equal values = chop.
function evaluate(cards: Card[]): number;
// Human-readable class for reports: 'high_card' | 'pair' | 'top_pair' |
// 'overpair' | 'two_pair' | 'trips' | 'set' | 'straight' | 'flush' | ...
function classifyHand(hole: Card[], board: Card[]): HandClass;
// Equity of each hand vs the others. Exact enumeration when ≤2 board cards
// remain; Monte Carlo (seeded, 10k samples) preflop.
function equity(holes: Card[][], board: Card[]): number[];
```

Unit tests enumerate the classic edge cases (wheel straight, steel wheel, board-plays chops, kicker battles). This one module unlocks items 40 (matrix can shade by profit *and* by showdown strength), 42 (EV line), 44 (category report), and 46 (replayer equity).

**Status — ✅ Done.** `src/analysis/evaluator.ts`: `evaluate` encodes `category << 20 | five 4-bit tiebreak ranks` so a plain number comparison orders any two hands (6/7-card inputs take the best of 6/21 five-card subsets); `classifyHand(hole, board)` is board-aware (overpair vs top pair vs pair; set vs trips; preflop degrades to pair/high-card); `equity(holes, board)` enumerates exactly on the turn (44 rivers) and flop (C(45,2) runouts) and uses seeded Monte Carlo (`mulberry32`, `EQUITY_MC_SAMPLES` = 10k) preflop, so results are deterministic and testable. Winners split each runout's share equally, so shares always sum to 1. 26 unit tests in `evaluator.test.ts` cover category ordering, the wheel/steel wheel, kicker battles, board-plays chops, classification, and exact-vs-MC equity (including an out-counting check: 15/44 for a flush + wheel + overcard draw vs KK). No consumers yet — 42/44/46 build on it.

### Design notes — remaining items

**Redline / blueline (33).** ➖ *Built, then removed* in the panel performance pass — judged not crucial for a hero-only workflow, and every removed series is one less thing computed and shipped per reload. The Overview chart now draws the total line plus the all-in EV overlay (42). The general-purpose `multiSeriesChartSvg(seriesList, w, h, fmt?)` built for it stays (the trends and EV views use it); `computeRedBlueSeries` itself was deleted (recoverable from git history — the split was showdown vs non-showdown accumulation over `reachedShowdownIn`, which still exists for the line filters).

**Starting-hand matrix (40).** ✅ *Done.* New L4 module `src/analysis/hole_cards.ts` (unit-tested): `holeKey(cards)` → `'AA' | 'AKs' | 'AKo' | …` (higher rank first, null when cards unknown), `matrixKeyAt(row, col)` (pairs on the diagonal, suited above, offsuit below — covers all 169), and `computeHoleCardMatrix(hands, playerId)` → per-key `{ hands, net, vpip }` (VPIP by the same non-blind voluntary-action rule as `walkHand`). Panel tab **Cards**: 13×13 CSS grid, cell shade = net (green/red, √-scaled alpha so small samples register), small number = times dealt, `title` tooltip = hands/net/VPIP. Clicking a dealt cell sets a hole-card filter on the Hands tab (filter chip with ✕ to clear; filtering is in-memory over the already-fetched summaries via `holeKey`) and switches to it — a first slice of the item-34 line filters. New message `get_hole_card_matrix {filter}`.

**Data durability (41).** ✅ *Done.* The background worker requests `navigator.storage.persist()` on startup (`src/storage/persist.ts` → `ensurePersistentStorage`, returns `{ persisted, usage, quota }`), and `unlimitedStorage` is added to the manifest so the extension origin is exempt from quota eviction. **Import hands** (popup button + hidden file input) reads a `.jsonl` export, and the background parses it via `parseHandsJsonl` (`src/storage/import.ts`) — each line validated against the `Hand` shape (`validateHand`), bad lines collected as `errors` rather than aborting — then `importHandsJsonl` upserts each via `store.save()` (idempotent on `[platform, handId]`, so re-import never duplicates). The popup shows the storage status line (`persistent ✓ / best-effort ⚠` + MB used) and the import result (`imported N, skipped M`). New messages: `import_hands { jsonl }`, `get_storage_info`. Unit-tested in `src/storage/import.test.ts` (round-trip, blank/garbage-line tolerance, idempotent re-import). This turns the existing export into a real backup/restore loop and enables device migration.

**Line filters (34).** ✅ *Done.* `HandSummary` gained `streetReached` ('preflop'…'river', from board length), `wasPfa` (last preflop aggressor, via a small `preflopShape` walk with walkHand's aggression rule), `threeBetPot` (≥2 preflop raises), `sawShowdown` (`reachedShowdownIn`, now exported from `hero_stats`), `potBb`, and `holeKey` (from `hole_cards`; the Hands-tab hole filter now reads this field instead of recomputing). A filter bar of selects above the hand table — position · won/lost · street (ended preflop / saw flop / turn / river / showdown) · line (3-bet pot / as-PFA) · pot-size bucket (<10 / 10–30 / 30+ bb, re-cut by item 50's `BIG_POT_BB`) — plus a Reset button that also clears the matrix's cards filter. All in-memory in the panel over the fetched summaries; the pure logic now lives in `src/panel/hand_filters.ts` (see item 50).

**Trend view (35).** ✅ *Done.* `src/analysis/trend.ts` (unit-tested): `computeRollingStats(hands, playerId, window)` → per-hand trailing-window VPIP/PFR/bb-100 via prefix-sum rolling (O(n)), emitting points from hand `window` on (empty when the selection is smaller). **Trends** tab: persisted window selector (100/200/500), a VPIP+PFR chart and a bb/100 chart, both via `multiSeriesChartSvg`, which gained an optional value-formatter arg so axis labels can read `%`/`bb` instead of dollars. Changing the window refetches only `get_rolling_stats {window, filter}`.

**Sessions view (36).** ✅ *Done.* `SessionSummary` gained `netBb` (per-hand net ÷ that hand's bb, so mixed-stake sessions stay meaningful); duration and bb/100 derive in the view. New **Sessions** tab: green/red net-per-session bar chart (`barChartSvg`, new pure fn in `net_chart.ts`, unit-tested; bars stay in play order) above a sortable table (Start · Duration · Hands · Net · bb/100 — click a header to sort, click again to flip). New message `list_sessions {filter}`. Stake-mix column deferred.

**Pot odds (37).** ✅ *Done — simpler than planned.* No connector change at all: `SeatState.streetBet` is already live-maintained per street, so `potOdds(gs)` (`format.ts`, unit-tested in `pot_odds.test.ts`) derives everything — `toCall = max(streetBet) − hero.streetBet`, `pot = Σpots + Σ streetBets`, break-even equity `toCall / (pot + toCall)`. Returns null when there's nothing to call, the hero isn't dealt in, or the hero folded. The HUD's live section shows `call $2.50 into $8.20 → 23% needed` (orange) whenever a bet is outstanding. The planned `CO_SELECT_REQ` capture was unnecessary (and its payload shape unverified). (With 39 done, a later step can add hero hand-class display too.)

**All-in EV line (42).** ✅ *Done.* `src/analysis/ev.ts` (unit-tested): `evAdjustedNet(hand, playerId)` qualifies a hand when its betting contains an `ALL_IN`, the *final* betting action lands before the last board card, and every non-folded contender's cards are stored (Bovada reveals them on all-in); then the result becomes `equity(contenders, boardAtAllIn) × totalPot − invested`, else the actual net. `computeEvSeries` accumulates one point per dealt hand; `get_ev_series {filter}` serves it. The Overview chart overlays it in PT4 orange (`#f0a860`) with a glossary-backed legend entry — hidden while it tracks the total exactly (no adjusted hands in the selection). Honest caveats (in the module header): run-it-once only, rake ignored in the adjusted pot, unrevealed cards fall back to actual.

**Session seat stats (43).** ✅ *Done.* On anonymous Bovada a *seat* keeps its occupant until they leave — within a session, per-seat VPIP/PFR/AF at the current `tableId` is exactly what DriveHUD sells as "anonymous mode". L4: `src/analysis/seat_stats.ts` (unit-tested) — `computeSeatSessionStats(hands, tableId)` takes the trailing run of hands with no `SESSION_GAP_MS` idle gap, accumulates per-seat VPIP/PFR/AF (walkHand's aggression rules), and **resets a seat's window when its start stack doesn't follow from the previous hand's stack + net** (occupant change; a rebuy also trips it, which errs on the fresh-read side). L5: new message `get_seat_stats {tableId}`; the content script refreshes it with the other stats after every completed hand and the HUD shows a compact `seats · vpip/pfr · af (hands)` section listing opponent seats only (hidden until data exists; no pixel mapping — just a labelled list). This supersedes the Phase-1 "opponent tracking deferred" note *for session scope only*; cross-session fingerprinting stays out.

**Notes & tags (38).** `handId → { note, tags[] }` in `chrome.storage.local` (small, fast random access, never mutates the immutable `Hand`). Textarea + tag chips in the replay pane; a "tagged" filter chip in the browser; exported as a `notes.json` sidecar and covered by import (41).

**Category report (44).** For showdown hands, `classifyHand(heroCards, board)` per street → table: profit / frequency by made-hand class ("you lose money with top-pair-weak-kicker calls on the river"). Needs 39.

**Time reports (45).** Winrate × day-of-week and × hour-of-day (bar charts), plus a monthly calendar grid of daily net. Pure timestamp math; strong engagement value for session discipline.

**Graphical replayer (46).** Upgrade the text replay to an SVG table: seats on an ellipse, dealer button, stacks, bet chips, board in the middle, action stepper (◀ ▶ / auto-play). With 39, show hero equity and pot odds per street. Biggest pure-UX item; last because the text replay already covers correctness review.

**Rake report (47).** `Σ rake` over hands hero won (and total table rake), as $ and bb/100 — quantifies the true cost of the anonymous-table convenience. `rake` is already on every stored `Hand`.

### Performance pass (panel load)

The panel's first render had grown slow: `renderAll` issued **10 messages**, each independently re-reading the entire history from IndexedDB and re-walking it (`get_leaks` even recomputed hero stats internally), and the EV line re-paid a 10k-sample Monte Carlo per preflop all-in hand on every reload. Three fixes:

1. **One aggregate query.** `get_panel_data {window, filter}` → `getPanelData` (`stats_service.ts`) fetches the filtered hands **once** and derives every panel view from the same in-memory array — stats, stake table, leaks (reusing the computed stats), positions, net + EV series, hand summaries, matrix, sessions, rolling trends. One message round-trip instead of ten. The granular messages remain for the popup, the HUD, and the panel's window-only trend refetch.
2. **In-memory hand cache.** `CachedHandStore` (`storage/cached_store.ts`, unit-tested) wraps any `HandStore`: the full timestamp-ascending list is loaded from IndexedDB once and all queries are answered by in-memory filtering; any `save` invalidates. The background worker now reads through it, so the popup, HUD seat stats, and panel all stop hammering IndexedDB. Cache lifetime = service-worker lifetime; a worker restart just reloads lazily.
3. **Memoised EV.** Hands are immutable once stored, so `evAdjustedNet` caches per `(platform, handId, playerId)` — each qualifying all-in pays its Monte Carlo once per worker lifetime instead of once per reload.

Removing the red/blue display (33) landed in the same pass.

### Enhancement P3 — seat chips over the table + panel refresh

**P3a — per-seat stat chips (48).** The session seat stats (43) lived only in a list inside the HUD panel; now each occupied opponent seat gets a floating chip near its avatar reading `S<seat> vpip/pfr · af (hands)`. `src/overlay/seat_chips.ts`: the pure `seatChipPositions(maxSeats, heroSeat, seats)` (unit-tested) lays seats on an ellipse in frame-percentage coordinates with the **hero anchored bottom-centre** — Bovada rotates the table so the hero sits at the bottom, and chip positions depend only on each seat's distance from the hero, so no page internals are read and the layout follows the table's rotation automatically. `SeatChipOverlay` renders the chips in its own closed-shadow, pointer-events-none fixed layer (z-index just under the HUD panel); the content script re-renders on every `state_update` (occupancy/layout changes) and after every stats refresh (new numbers), skipping the hero's own seat, and the chips obey the same `hud_visible` toggle as the panel. **Caveat:** the ring's rotation *direction* can only be verified at a live table — `SEAT_DIRECTION` in `seat_chips.ts` is the one-line flip if the on-screen layout turns out mirrored, and the ellipse radii (40/36%) may want tuning against the real table art. This finally supersedes the Phase-1 "seat pixel mapping deferred" note.

#### P3a v2 — Seat tagging: anchoring chips to the real table art

**Status — ✅ implemented** (`src/overlay/seat_chips.ts`: `aspectFitRect`, `seatAnchors`, rewritten `SeatChipOverlay` with a rAF-throttled `resize` relayout; solver unit-tested in `seat_chips.test.ts` — letterboxing both ways, clockwise rotation with wraparound, hero-relative invariance, unknown-size fallback). The calibration constants (`DESIGN_AR`, the 6-max anchor row, `CHIP_Y_OFFSET_FRAC`) still need a live-table pass; 9-max stays hidden until its anchors are measured.

**Live-debug round 1 (chips invisible).** Root cause: `GameState.maxSeats` was **never set** — it stayed at the `createEmptyGameState()` default of 9, and the v2 solver correctly hides chips for table sizes without measured anchors, so every 6-max chip was suppressed. `CO_OPTION_INFO`'s `maxSeat` field is now decoded into `gs.maxSeats` and carried across the `PLAY_STAGE_INFO` hand reset like stakes (regression-tested against `raw_logs_1.txt`). Also added: **default `0/0` chips on landing** — `CO_TABLE_INFO`'s `seatState[]` feeds a new UI-only `GameState.occupiedSeats` (deliberately *not* merged into `gs.seats`: hand records must keep listing dealt-in players only, `seatPositions` depends on it), and the overlay's pure `chipRows(rows, occupiedSeats, heroSeat)` (unit-tested) zero-fills occupied seats without stats (`0/0 · 0 (0)`), rendering the moment the join snapshot arrives. Live occupancy = snapshot ∪ seats seen in the current hand; departures only clear on the next snapshot.

**Live-debug round 2 (`maxSeats=9 hero=6 occupied=[1..9]` on a 6-player table).** Two decode corrections:
- **`maxSeat` is the seat-array width, not the table size** — it reads 9 even on 6-max tables, so it stays only an upper bound. The *visual* size is resolved by `resolveLayoutSize(maxSeats, heroSeat)` (unit-tested): a measured layout for `maxSeats` wins; otherwise **fall back to the 6-max layout whenever the hero sits in seats 1–6** (seats beyond a layout simply get no chip), else hide. The true table-size signal is still being hunted — `gameType2` is the prime candidate; `CO_OPTION_INFO` is now logged whole at join to settle it.
- **`nonzero seatState ≠ occupied`** (all nine entries were nonzero with six players). `decodeOccupiedSeats` (in `bovada_parser.ts`, unit-tested) now counts only the values captures show for seated players — 16 and 80 (`PLAY_SEAT_INFO` also reports `state:16` when seated); 32 is presumed empty/reserved until a capture proves otherwise. Raw `seatState`/`account` arrays are logged on every `CO_TABLE_INFO` to finish the decode.
- **Render-pipeline logging** (each line only when its content changes): the content script logs the chip inputs (`seat chips: maxSeats=… hero=… occupied=[…] statsRows=…`), the overlay logs the render decision (`chips render: layout=6 (fallback from maxSeats=9) hero=… frame=WxH chips=N/M first=S2@(x,y)` or `chips hidden: no layout…`), and the connector logs raw `CO_OPTION_INFO` / `CO_TABLE_INFO` / `PLAY_SEAT_INFO` payloads — all rare join-time events.

**Bug tracking moved:** defects found in live use are now logged in `BUGFIXES.md` (symptom → root cause → fix → verification). Rounds 1–3 below remain as design history; BF-004 (two-table misplacement → min-fit scene transform: `scale = min(frameW/844, frameH/547)`, left-anchored, vertically centred) and BF-005 (chip cleared below the action banner, `CHIP_Y_OFFSET_PX = 44`) supersede round 3's scene model.

**Live-debug round 3 (chips rendered but far from the avatars).** A screenshot with chips *and* avatars visible across two differently-sized tiles killed the centred aspect-fit model: every chip sat ~(+110, +100) px from its avatar, and the two tiles (7% apart in width, 2% in height) showed avatars at near-identical **raw pixel** positions. Conclusion: the frame also contains the chat sidebar (right) and controls (bottom), so the table scene is anchored **top-left** — nothing is centred — and it scales with frame **height** on both axes. The solver was recalibrated accordingly: anchors are now fractions of `frameH` (top-left origin) measured at `frameH ≈ 547` — S (0.618, 0.669) · SW (0.152, 0.581) · NW (0.152, 0.296) · N (0.618, 0.210) · NE (1.091, 0.296) · SE (1.091, 0.581), chip `+0.048·frameH` below the pill — with x clamped inside the frame for narrow layouts. `aspectFitRect`/`DESIGN_AR` were removed. Rotation was confirmed exactly right in the same screenshot (hero-4 table: 5→SW, 6→NW, 1→N, 2→NE, 3→SE). Caveat: calibrated against the tiled multi-table layout; the single-full-window layout may scale differently — the `chips render: frame=WxH first=…` log plus one screenshot will settle it if so.

**What v1 got wrong.** v1 placed chips on a parametric ellipse spanning the whole frame. Live screenshots (6-max, $0.05/$0.10, single- and two-table layouts) show that is wrong on three counts: (a) Bovada's avatars are **not** on an ellipse — they sit at fixed art positions (hero south, two stacked on the west edge, one north, two stacked on the east edge); (b) the table *scene* scales with the frame (browser zoom, tiled multi-table layouts), which an unfitted percentage layer ignores; (c) chip radii/angles were guessed. v2 replaces the ellipse with a **measured anchor table inside an aspect-fitted content rect**.

**Frame model (from the two-table screenshot).** Each table runs in its **own iframe**: with two tables open, two HUD panels render — one whose top-right corner lands at the window's centre (left iframe = left half of the window), one clipped at the right window edge (right iframe). The content script, connector, and overlays are therefore already per-table; every layout question reduces to *this frame's* viewport. The three inputs the solver needs, and where they come from:

1. **Table count (1–4).** Not directly observable from inside a frame (the tab strip lives in the cross-origin top window) — and with per-table iframes it is not *needed*: the tiling (1 = full window, 2 = side-by-side halves, 3–4 = 2×2 grid) is already reflected in the frame's own size. Kept as a derived diagnostic only: `round(window.screen.availWidth / innerWidth)` approximates the horizontal split if ever useful. If a future client build hosts several tables in one frame, this becomes a real input and the solver runs once per sub-rect.
2. **Frame width & height.** `window.innerWidth/innerHeight` in the game frame, re-read on `resize` (fires on browser zoom and on the tiling changing when tables open/close). Every chip position is recomputed from scratch on resize.
3. **Hero seat number.** Already tracked (`GameState.heroSeat` via `PLAY_SEAT_INFO`). Bovada draws the hero at the **south** anchor regardless of seat number; later a user-configurable *preferred seating* offset can shift which visual anchor is "self".

**Layout solver.** Pure function `seatAnchors(maxSeats, heroSeat, frameW, frameH) → Map<seat, {x, y}>` (pixels), in three steps:

1. **Aspect-fit content rect.** The scene keeps a fixed design aspect ratio; fit the largest `DESIGN_W : DESIGN_H` rect centred in the frame (letterboxing the rest), and express all anchors as fractions of that rect. Initial constants measured from the single-table screenshot (frame ≈ 1410×1080 above the control strip): `DESIGN_AR ≈ 1.30`. These are **calibration constants**, expected to be tuned against a live table.
2. **Anchor table per table size.** Normalised avatar-pill centres for 6-max, listed by *visual position* clockwise from south (measured from the screenshot):

   | pos | compass | x% | y% |
   |---|---|---|---|
   | 0 (hero) | S | 49.6 | 80.5 |
   | 1 | SW | 12.4 | 71.0 |
   | 2 | NW | 12.4 | 41.6 |
   | 3 | N | 49.6 | 32.6 |
   | 4 | NE | 86.9 | 41.6 |
   | 5 | SE | 86.9 | 71.0 |

   The chip renders **below** the avatar pill: anchor + ~5% of content-rect height, centred horizontally. A 9-max table needs its own row of nine anchors — to be measured from a 9-max screenshot before enabling chips there (fall back to hiding chips on unknown table sizes rather than guessing).
3. **Rotation.** Confirmed by the screenshot (hero = seat 1: seat 2 SW, 3 NW, 4 N, 5 NE, 6 SE): **seat numbers increase clockwise on screen** and wrap at `maxSeats` (…5, 6, 1, 2…). So `visualPos = ((seat − heroSeat) mod maxSeats + maxSeats) mod maxSeats`, indexing the anchor table directly. The v1 `SEAT_DIRECTION` flip constant dies; the wraparound is the same mod arithmetic for 6- and 9-max. *Preferred seating* later becomes `visualPos = (visualPos + preferredOffset) mod maxSeats`.

**Overlay changes.** `SeatChipOverlay` switches from percentage-of-frame to pixel positions from the solver, adds a `resize` listener (throttled to a frame), and re-renders on the existing triggers (state update, stats refresh). Chips keep the pointer-events-none closed-shadow layer. Only seats that are both occupied this hand and present in the stats rows are drawn; the hero's seat is skipped.

**Testing & calibration.** Unit tests: aspect-fit math (wide frame letterboxes horizontally, tall frame vertically), rotation mapping including wraparound (hero seat 5 → seat 6 at SW, seat 1 at NW), unknown table size → empty result. The anchor percentages themselves can only be validated visually; if they drift across Bovada skins, the escape hatch is a small calibration mode (drag a chip, persist a per-seat offset in `chrome.storage.local`).

**P3b — panel manual refresh (49).** The panel only fetched on load and on filter changes, so hands finished while it sat open never appeared — the background's `CachedHandStore` invalidates correctly on every save; the staleness was the panel page itself. A **↻ Refresh** button in the header re-runs `reloadLevels()` (stake-level list included, since new hands can introduce a new level) → `renderAll()`, recomputing everything from the latest stored hands; it disables itself while the fetch is in flight. Auto-refresh on `hand_complete` (a broadcast from the background) is a possible follow-up; manual matches the "review between sessions" workflow.

### Big hands retrieval (50)

**Goal.** Pull up the memorable hands fast: the biggest pots, the biggest wins, the biggest losses.

**Design decision — no new storage.** `HandSummary` already labels every hand with `potBb` and `net`, so this is purely a *retrieval* feature over the existing Hands browser. The "only save 30bb+ pots" idea was deliberately **not** taken as a storage rule — discarding small pots would corrupt every aggregate stat and the winnings graphs; 30bb instead became the display threshold (`BIG_POT_BB = 30`), and the pot-size filter buckets were re-cut to `<10 / 10–30 / 30+` to match.

**Mechanics.** The Hands-tab filter/sort logic moved out of the page script into the pure module `src/panel/hand_filters.ts` (unit-testable — the page script's `chrome.*`/DOM module-level access made it untestable in place):
- `HandFilterState` gains `sort: 'newest' | 'pot' | 'win' | 'loss'`; `applyHandFilters(hands, state, holeKey)` applies the item-34 filters then the sort (pot → `potBb` desc, win → `net` desc, loss → `net` asc, newest = incoming order).
- `presetFilters(preset)` builds the three one-click states — **Big pots** (sort pot + 30bb+ bucket), **Big wins** (sort win + won only), **Big losses** (sort loss + lost only) — and `activePreset(state)` recognises when the current state *is* a preset, so the button highlights and stays honest when the user hand-tunes a select afterwards.
- UI: three preset buttons + a Sort select in the filter bar; a new **Pot** column labels each row in bb; a match-count line above the table. Reset returns to defaults. The 500-row render cap now applies after sorting, so "top 500 by pot" is exactly that.

### Suggested implementation order

1. **41 (durability)** — small, protects the data everything else feeds on.
2. **30–32 (stat engine v2)** — one refactor of `walkHand` into the street state machine; all counters land together with tests.
3. **33 (red/blue)** + **40 (matrix)** — the two highest-recognition PT4 views, both thin over existing data.
4. **39 (evaluator)** — pure module, exhaustive tests.
5. **34 (filters)** + **36 (sessions)** + **35 (trends)** — panel depth.
6. **37 + 43 (live HUD)** — connector touch + overlay rows.
7. **42, 38, 44–47** — EV line, notes, and P2 polish in any order.

### What stays deferred

- **Cross-session opponent fingerprinting** — behavioural identity matching across sessions on anonymous tables; complex and speculative (session-scoped seat stats in 43 capture most of the practical value).
- **GTO/solver integration, range vs range equity** — out of scope; we track and diagnose, we don't solve.
- **PT4 hand-history import** — bespoke parser; low ROI until a named-platform connector exists.
- **Cloud sync** — IndexedDB is per-device; needs a backend. JSONL import/export (41) covers manual migration meanwhile.

- **`seatState` bitmask:** Values 16, 32, 80 seen in `CO_TABLE_INFO` but not fully decoded (sitting out vs active vs waiting for BB). Needs more capture data.
- **Multi-table:** Each Bovada table opens a separate WebSocket. The background service worker must correlate `tableId` to each connection and maintain separate `GameState` per table.
- **Storage sync:** If a user plays on multiple devices, IndexedDB is not shared. A future cloud sync option would require a backend.

## Repo split & Pro server (S0)

The open-client / closed-server split (OPEN_QUESTIONS §6) is structurally in place:

- **This repo (public-to-be):** extension, website, and the MIT `hand.v1` spec. All shipped analysis stays client-side — the free tier works offline with no account, per the recorded product decision.
- **`webpokerhud-server` (private sibling repo):** the Pro analysis API. Scaffold: dependency-free Node HTTP server (TS), `GET /health` and `POST /v1/analyze` (accepts a JSON array of `hand.v1` records, validates only what it uses, returns a stub summary — the seam where Pro reports grow). CORS `*` for development, tighten at launch. Unit-tested; `npm run dev` → `http://localhost:8787`.
- **Extension link:** `src/server_link.ts` — persisted `analysis_server_url` (default `http://localhost:8787`, becomes the hosted URL at launch), `checkServerHealth` with timeout (unit-tested), and an **Analysis server** field + Test button in the popup. `manifest.json` gained host permissions for `http://localhost/*` and `https://api.webpokerhud.com/*`.
- **Two-build dev workflow:** extension via `npm run watch` here; server via `npm run dev` there; they meet over HTTP.

No shipped feature calls the server yet — first real consumers are the Pro upload path and, per OPEN_QUESTIONS §5, the payment Edge Functions.

## Deferred / Out of Scope (Phase 1)

- **Opponent stat display:** Bovada is anonymous; per-seat HUD boxes are not shown. Data is still recorded.
- **Seat pixel mapping:** Only needed when opponent boxes are added (Phase 2).
- **Behavioural fingerprinting:** Identifying anonymous Bovada opponents across hands via stack size / timing patterns — complex, deferred indefinitely.
