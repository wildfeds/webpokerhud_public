// Runs in ISOLATED world — bridges game events from the MAIN world
// (injected.ts via window.postMessage) to the BovadaConnector, persists
// completed hands via the background worker, and renders the HUD overlay.

import { HUD_MESSAGE_SOURCE } from './constants';
import { BovadaConnector } from './connector';
import { HudPanel, SeatChipOverlay, stallState, STALL_CHECK_MS } from './overlay';
import { isHandLive } from './overlay/format';
import { HeroStats, SeatSessionStats } from './analysis';
import { GameState } from './model';
import { HudMessage, HudResponse } from './messages';

const connector = new BovadaConnector();

let panel: HudPanel | null = null;
let seatChips: SeatChipOverlay | null = null;
let tableId = '';
let heroSeat = 0;
let lastGs: GameState | null = null;
let seatRows: SeatSessionStats[] = [];

function send(message: HudMessage): Promise<HudResponse | undefined> {
  return chrome.runtime.sendMessage(message);
}

async function fetchStats(forTable?: string): Promise<HeroStats | null> {
  const filter = forTable ? { tableId: forTable } : {};
  const res = await send({ type: 'get_hero_stats', filter });
  return res?.ok ? res.stats ?? null : null;
}

async function refreshStats(): Promise<void> {
  if (!panel) return;
  const [lifetime, session, seatsRes] = await Promise.all([
    fetchStats(),
    tableId ? fetchStats(tableId) : Promise.resolve(null),
    tableId ? send({ type: 'get_seat_stats', tableId }) : Promise.resolve(undefined),
  ]);
  panel.setStats(lifetime, session);
  seatRows = seatsRes?.ok ? seatsRes.seatStats ?? [] : [];
  // The hero's own stats already have their sections — show opponents only.
  panel.setSeatStats(seatRows.filter(s => s.seat !== heroSeat));
  updateSeatChips();
}

// Chips need both the stats rows and the current table layout — re-render
// whenever either arrives. Occupancy = the CO_TABLE_INFO join snapshot plus
// any seat that has since appeared in the live hand (new arrivals post blinds
// and show up in gs.seats before the next snapshot).
let lastChipLogKey = '';
function updateSeatChips(): void {
  if (!seatChips || !lastGs) return;
  const occupied = new Set<number>(lastGs.occupiedSeats);
  for (const seat of Object.keys(lastGs.seats)) occupied.add(Number(seat));
  const occupiedArr = [...occupied].sort((a, b) => a - b);

  const logKey = `${lastGs.maxSeats}|${lastGs.heroSeat}|${occupiedArr.join(',')}|${seatRows.length}`;
  if (logKey !== lastChipLogKey) {
    lastChipLogKey = logKey;
    console.log(`[WebPokerHud] seat chips: maxSeats=${lastGs.maxSeats} hero=${lastGs.heroSeat}`
      + ` occupied=[${occupiedArr.join(',')}] statsRows=${seatRows.length}`);
  }
  // Sticky hero fallback: a fresh game state (e.g. after a reconnect) can
  // carry heroSeat 0 — without it the hero chip would render as an opponent's.
  seatChips.update(seatRows, lastGs.maxSeats || 9, lastGs.heroSeat || heroSeat, occupiedArr);
}

// The connector only receives events in the frame hosting the RGS WebSocket,
// so creating the panel on the first state_update targets the game frame only.
connector.on('state_update', (gs) => {
  if (!panel) {
    panel = new HudPanel(document);
    seatChips = new SeatChipOverlay(document);
    void createPanelSettings();
    void refreshStats();
  }
  heroSeat = gs.heroSeat || heroSeat;
  lastGs = gs;
  if (gs.tableId && gs.tableId !== tableId) {
    tableId = gs.tableId;
    void refreshStats();
  }
  panel.setLive(gs);
  updateSeatChips();
});

async function createPanelSettings(): Promise<void> {
  if (!panel) return;
  const { hud_visible } = await chrome.storage.local.get({ hud_visible: true });
  panel.setVisible(Boolean(hud_visible));
  seatChips?.setVisible(Boolean(hud_visible));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes['hud_visible']) {
      const visible = Boolean(changes['hud_visible'].newValue);
      panel?.setVisible(visible);
      seatChips?.setVisible(visible);
    }
  });
}

connector.on('hand_complete', (hand) => {
  console.log('[WebPokerHud] hand_complete', hand.handId, hand);
  send({ type: 'hand_complete', hand })
    .then((res) => {
      if (!res) console.error('[WebPokerHud] no response from background');
      else if (!res.ok) console.error('[WebPokerHud] failed to store hand:', res.error);
      else void refreshStats();
    })
    .catch((err: unknown) => console.error('[WebPokerHud] failed to reach background:', err));
});

// Capture watchdog (BF-009): a stuck HUD on a live table means events stopped
// flowing or the connector throws on each one. Guard the dispatch so one
// poisoned event can't look like silence; watchdog the feed itself and, when
// it goes quiet, say so in the HUD strip and on the toolbar badge — the
// failure must never be silent. The strip clears the moment events resume.
let lastEventAt = 0;
let handleErrors = 0;
let stallWarned = false;
let stallShown = false;

function setStalled(stalled: boolean): void {
  if (stalled === stallShown) return;
  stallShown = stalled;
  void send({ type: 'capture_stalled', stalled }).catch(() => undefined);
}

window.addEventListener('message', (event: MessageEvent) => {
  if (!event.data || event.data.source !== HUD_MESSAGE_SOURCE) return;
  lastEventAt = Date.now();
  stallWarned = false;
  if (stallShown) {
    panel?.setStall(null);
    setStalled(false);
  }
  try {
    connector.handleEvent(event.data.msg as Record<string, unknown>);
  } catch (err) {
    // First few in full (the offending event is the bug report), then sampled.
    if (handleErrors++ < 5 || handleErrors % 250 === 0) {
      console.error(`[WebPokerHud] connector.handleEvent threw (#${handleErrors}):`,
        err, JSON.stringify(event.data.msg));
    }
  }
});

setInterval(() => {
  if (lastEventAt === 0) return;   // never saw events in this frame
  const quietMs = Date.now() - lastEventAt;
  const state = stallState(quietMs, !!lastGs && isHandLive(lastGs), true);
  panel?.setStall(state);
  setStalled(state !== null);
  if (state && !stallWarned) {
    stallWarned = true;
    console.warn(`[WebPokerHud] FEED STALLED (${state.kind}): no game events for ${Math.round(quietMs / 1000)}s`
      + ` in this frame (handleEvent errors so far: ${handleErrors}).`
      + ' Check the RGS socket state in DevTools → Network → WS.');
  }
}, STALL_CHECK_MS);

console.log('[WebPokerHud] content script ready');
