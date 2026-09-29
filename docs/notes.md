# Project Notes & Learnings

Running log of discoveries, gotchas, and decisions made during development. Most recent at the top of each section.

---

## WebSocket Protocol

### Bovada uses the Atmosphere framework
- Header: `X-Atmosphere-Framework: 3.1.5-javascript`
- Two endpoints:
  - `wss://pkscb.bovada.lv/poker-games/rgs` — game events (cards, bets, actions, results)
  - `wss://pkscb.bovada.lv/ws-gateway/lobby` — lobby / table list
- `Content-Type: application/json` in the URL params signals the payload is plain JSON

### Message framing
- **Server → client**: `<length>|{"seq":N,"tDiff":N,"data":{...}}`
  - Strip the leading `<length>|` to get the JSON
  - `seq`: monotonically increasing sequence number
  - `tDiff`: milliseconds since last message
- **Client → server**: raw JSON with no length prefix
- `permessage-deflate` is negotiated but Chrome DevTools decompresses before showing — you see plain text in the Messages tab

### Intercepting in the browser
- TLS is **not** a blocker. The browser terminates TLS before JS sees it.
- A content script can monkey-patch `window.WebSocket` at `document_start` to intercept all frames in plaintext.
- Messages sent before the hook runs are lost — `run_at: document_start` is required.

---

## Card Encoding

### Wrong first guess: `rank * 4 + suit`
Tested against the first captured file (example_message.txt) and seemed plausible, but was not verified against known ground-truth hands.

### Correct encoding: `suit * 13 + rank`
```
card_code = suit * 13 + rank
suit:  0=clubs, 1=diamonds, 2=hearts, 3=spades
rank:  0=Ace, 1=2, 2=3, 3=4, ..., 9=Ten, 10=Jack, 11=Queen, 12=King
32896 = face-down / hidden card
```

**Verified** against 4 ground-truth hands from example_message_current_hand.txt:
| Hand | CO_CARDTABLE_INFO seat1 | Decoded | Confirmed |
|---|---|---|---|
| 1 | `[42, 6]` | 4s 7c | ✓ |
| 2 | `[21, 19]` | 9d 7d | ✓ |
| 3 | `[11, 49]` | Qc Js | ✓ |
| 4 | `[21, 2]` | 9d 3c | ✓ |

Decode function:
```javascript
function decodeCard(code) {
  if (code === 32896) return null;
  const suit = ['c','d','h','s'][Math.floor(code / 13)];
  const rank = ['A','2','3','4','5','6','7','8','9','T','J','Q','K'][code % 13];
  return rank + suit;
}
```

---

## Key Message Types

### Hero hole cards come from CO_CARDTABLE_INFO (not a private message)
- Sent once per hand at the start of preflop
- **Hero's seat**: real card values
- **All other seats**: `[32896, 32896]`
- There is no separate private message — the server sends one `CO_CARDTABLE_INFO` to each client with their own cards filled in and opponents masked.

### CO_SELECT_REQ / CO_SELECT_RES_V2 — the client action round-trip
- `CO_SELECT_REQ` (server → hero only): presents available actions + amounts (`bet`, `raise`, `maxRaise`, `betPot`, `halfPot`, `timeBank`)
- `CO_SELECT_RES_V2` (hero → server): hero's chosen action (`btn`, `bet`)
- `CO_SELECT_INFO` (server → all): broadcasts what the player did, including `account` (remaining stack)

### CO_SELECT_INFO btn bitmask (confirmed values)
| btn | Action |
|---|---|
| 64 | Check |
| 128 | Call |
| 256 | Call (limp / post-blind) |
| 512 | Raise / Open |
| 1024 | Fold |
| 2048 | All-in call |
| 4096 | All-in raise |
| 8192 | Show cards |
| 32768 | Muck |

### tableState bitmask → Street
| value | meaning |
|---|---|
| 1 | Waiting |
| 2 | New hand |
| 4 | Posting blinds |
| 8 | Preflop |
| 16 | Flop |
| 32 | Turn |
| 64 | River |
| 32768 | Showdown |
| 65536 | Result |

### CO_BLIND_INFO btn values
- `btn: 2` = Small Blind
- `btn: 4` = Big Blind

---

## Bovada-Specific Gotchas

### Anonymous tables
- Opponent `nickName` fields are empty strings — no persistent identity.
- Hero `nickName` is populated (e.g. `"560201380440500"`) and consistent across sessions.
- **Decision**: Phase 1 tracks hero stats only. Opponent actions are recorded in `Hand` but not analysed.

### File description error in example_message_current_hand.txt
- The human-readable header says hand 2 is "Q diamond, J diamond".
- The raw JSON shows `seat1:[21,19]` = 9d 7d.
- The JSON is correct; the text had a typo. Always trust the raw messages.

### Duplicate messages in captured logs
- The example files contain some repeated message blocks (same `seq` numbers appear twice). This is a copy-paste artifact from the DevTools capture, not a protocol behaviour.

---

## Chrome Extension & Vite

### vite-plugin-web-extension: disabling auto browser launch
- Setting `browser: undefined` in the plugin config does **not** disable auto-launch.
- Setting `browser: null` maps to `"firefox-desktop"` internally — also wrong.
- **Correct option**: `disableAutoLaunch: true`.

### Watch mode naming
- `vite build --watch` is the right command for extension development (rebuild on save, no dev server).
- Named the npm script `watch` (not `dev`) to avoid confusion with `vite` (dev server mode, which opens a browser and serves files over HTTP — not useful for extensions).

### Content script must use `run_at: document_start`
- The poker app creates its WebSocket connection on page load.
- The hook must be in place before that happens.
- `document_start` fires before any page scripts run.

### WebSocket subclassing breaks the Atmosphere client — use a Proxy instead
- First attempt: `class BovadaWebSocket extends NativeWebSocket` and `window.WebSocket = BovadaWebSocket`.
- Bovada's Atmosphere library does its own class-extension of WebSocket internally. Stacking our subclass on top produced a broken double-`construct` chain: the Network tab showed the WebSocket handshake failing immediately with "Connection was closed abnormally".
- **Fix**: replace the subclass with `window.WebSocket = new Proxy(NativeWebSocket, { construct(...) {...} })`. The Proxy intercepts `new WebSocket(...)` in the calling code, creates a genuine native WebSocket instance, attaches our listener, and returns it. Atmosphere receives a real native WebSocket object — its own wrapping and `instanceof` checks continue to work.

### The poker room runs inside an iframe — `all_frames: true` is required
- Symptom: "WebSocket hook installed" appears in the console (confirming our script runs on the top-level page), but "WebSocket created:" never logs even though WebSocket connections are visible in the Network tab.
- Root cause: Bovada loads each poker table inside a child **iframe**. The iframe has its own `window` object with its own `window.WebSocket`. Our content script, with the default `all_frames: false`, only injected into the top-level frame and never touched the iframe's global.
- Every time you click "Open a new room", Bovada creates a new iframe (and therefore a new WebSocket connection). The Network tab shows all frames' requests, which is why the connections were visible there but our hook in the parent frame never fired.
- **Fix**: add `"all_frames": true` to both content script entries in manifest.json. Chrome then injects our scripts into every child frame whose URL matches the pattern — the Proxy runs in the iframe's MAIN world, intercepts the WebSocket constructor there, and the message bridge works as intended.
- Also broadened the match pattern from `https://www.bovada.lv/static/poker-game/*` to `https://www.bovada.lv/*` so the hook covers the lobby page and any iframe URL Bovada uses.

### manifest.json source vs output
- Source `manifest.json` references TypeScript source paths (`src/background.ts`).
- `vite-plugin-web-extension` rewrites these to compiled output paths (`src/background.js`) in `dist/manifest.json` automatically.
- Load the `dist/` folder in Chrome, not the project root.

---

## Still Unknown / To Investigate

- `seatState` bitmask: values 16, 32, 80 seen but meaning not fully decoded (sitting out vs active vs waiting for BB).
- `gameType` field: `gameType:2, gameType2:5` assumed to be NL Hold'em — not confirmed.
- Seat pixel positions on the canvas — needed when opponent HUD boxes are added (Phase 2).


## Bugs:

1 - Boards object does not record the 3 cards flop. It only records the last 2 cards dealt.

2 - Hero seat should be determined by PLAY_SEAT_INFO instead of CO_TABLE_INFO. 

3 [Fixed] - Read hands_object_1.txt and raw_logs_1.txt; 6 hands were identifies, with its corresponding raw logs.
Analyze why some hands does not populate results

## Future TODOs

1. I notices there are some "stats object"