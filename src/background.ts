// MV3 background (service worker in Chrome, event page in Firefox) — receives
// completed Hand objects from content scripts and persists them via the
// Storage layer (Layer 3).

import {
  IndexedDBStore, CachedHandStore, exportHands, importHandsJsonl, ensurePersistentStorage,
} from './storage';
import {
  getHeroStats, getNetSeries, getSeatStats, getHand,
  listTables, listStakeLevels, queryFiltered,
} from './analysis';
import { fetchPanelData } from './server_link';
import { getAccessToken, getAuthState, signIn, signOut } from './auth';
import { HudMessage, HudResponse } from './messages';

// Perf hunt: the background is an event page in Firefox and is torn down
// after ~30s idle, so most popup opens wake it cold. Log the startup and any
// message that takes real time, tagged cold/warm, to see where a click goes.
const bgStartedAt = Date.now();
let firstMessageSeen = false;
console.debug(`[WebPokerHud] background started (eval ${Math.round(performance.now())}ms)`);

// All reads go through an in-memory cache; writes pass through and invalidate.
const store = new CachedHandStore(new IndexedDBStore());

// Opt IndexedDB out of eviction as early as possible so the hand history
// survives disk pressure. Best-effort — logs the resulting status.
ensurePersistentStorage()
  .then(info => console.log('[WebPokerHud] storage persisted:', info.persisted))
  .catch(err => console.warn('[WebPokerHud] persist request failed:', err));

async function handleMessage(message: HudMessage): Promise<HudResponse> {
  switch (message.type) {
    case 'hand_complete': {
      await store.save(message.hand);
      const count = await store.count();
      console.log(`[WebPokerHud] saved hand ${message.hand.handId} (${count} total)`);
      return { ok: true, count };
    }
    case 'get_hand_count':
      return { ok: true, count: await store.count() };
    case 'export_hands':
      return { ok: true, files: await exportHands(store) };
    case 'get_hero_stats':
      return { ok: true, stats: await getHeroStats(store, message.filter) };
    case 'get_net_series':
      return { ok: true, series: await getNetSeries(store, message.filter) };
    case 'get_panel_data': {
      // Panel views are computed server-side: upload the filtered hands and
      // relay the (tier-gated) response. The server derives the tier from the
      // Supabase JWT; signed out → no header → free tier. fetchPanelData
      // throws a user-facing message when the server is unreachable.
      const hands = await queryFiltered(store, message.filter);
      const token = await getAccessToken();
      const { tier, locked, panel } = await fetchPanelData(hands, message.window, token);
      return { ok: true, panel, tier, locked };
    }
    case 'get_auth_state':
      return { ok: true, auth: await getAuthState() };
    case 'sign_in':
      return { ok: true, auth: await signIn() };
    case 'sign_out':
      await signOut();
      return { ok: true, auth: null };
    case 'get_seat_stats':
      return { ok: true, seatStats: await getSeatStats(store, message.tableId) };
    case 'list_tables':
      return { ok: true, tables: await listTables(store, message.filter) };
    case 'list_stake_levels':
      return { ok: true, stakeLevels: await listStakeLevels(store, message.filter) };
    case 'get_hand':
      return { ok: true, hand: await getHand(store, message.handId, message.tableId) };
    case 'import_hands': {
      const { imported, skipped, errors } = await importHandsJsonl(store, message.jsonl);
      console.log(`[WebPokerHud] imported ${imported} hand(s), skipped ${skipped}`);
      return { ok: true, imported, skipped, errors, count: await store.count() };
    }
    case 'get_storage_info':
      return { ok: true, storage: await ensurePersistentStorage() };
  }
}

chrome.runtime.onMessage.addListener((message: HudMessage, _sender, sendResponse) => {
  const cold = !firstMessageSeen;
  firstMessageSeen = true;
  const t0 = performance.now();
  const timed = handleMessage(message).finally(() => {
    const ms = Math.round(performance.now() - t0);
    if (ms > 30 || cold) {
      console.debug(`[WebPokerHud] bg ${message.type} took ${ms}ms`
        + (cold ? ` (cold: ${Date.now() - bgStartedAt}ms after startup)` : ''));
    }
  });
  timed
    .catch((err): HudResponse => {
      console.error('[WebPokerHud] background error:', err);
      return { ok: false, error: String(err) };
    })
    .then(sendResponse);
  return true; // keep message channel open for async response
});
