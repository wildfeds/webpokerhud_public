// Popup — hero stats for a selected (time range, stake level). Both selectors
// are persisted; the stake-level list is populated from stored hands. HUD
// visibility toggle and JSONL export live here too.
import { HeroStats, StatsFilter, StakeLevelSummary } from '../analysis';
import { formatStakeLevel, formatDollars, netChartSvg } from '../overlay';
import { HudMessage, HudResponse } from '../messages';
import { mountAccountChip } from '../auth_ui';
import { html, raw, setHtml, SafeHtml } from '../ui/html';

const statsEl  = document.getElementById('stats')!;
const chartEl  = document.getElementById('chart')!;
const rangeEl  = document.getElementById('range') as HTMLSelectElement;
const levelEl  = document.getElementById('level') as HTMLSelectElement;
const toggleEl = document.getElementById('hud-toggle') as HTMLInputElement;
const exportEl = document.getElementById('export-btn') as HTMLButtonElement;
const panelEl  = document.getElementById('panel-btn') as HTMLButtonElement;
const importEl = document.getElementById('import-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status')!;
const storageEl = document.getElementById('storage')!;

const RANGE_KEY = 'stat_range';
const STAKE_KEY = 'stat_stake';
const ALL = 'all';

// Stake levels available under the current time filter (for value → sb/bb lookup).
let levels: StakeLevelSummary[] = [];
let savedStake = ALL;

// ── First-paint snapshot ─────────────────────────────────────────────────────
// The background is an event page that Firefox suspends after ~30s idle, so a
// typical popup open waits ~300ms for it to wake before any stats arrive —
// while the popup sits on "loading…". The last render is therefore kept in
// storage.local (read in the same 4ms get() as the controls) and painted
// immediately when it matches the current selection; the live answer then
// replaces it, silently, only if anything changed.
const SNAPSHOT_KEY = 'popup_snapshot';

interface Snapshot {
  key:      string;                // `${range}|${stake}` the data was rendered for
  levels:   StakeLevelSummary[];
  stats:    HeroStats | null;
  series:   number[];
  storage?: string;                // rendered storage line
}

let snapshot: Snapshot | null = null;
let lastPaintSig = '';

const selectionKey = (): string => `${rangeEl.value}|${levelEl.value}`;

function persistSnapshot(): void {
  if (snapshot) void chrome.storage.local.set({ [SNAPSHOT_KEY]: snapshot });
}

function send(message: HudMessage): Promise<HudResponse> {
  return chrome.runtime.sendMessage(message);
}

const r1 = (x: number) => (Math.round(x * 10) / 10).toString();
const signed = (x: number) => (x >= 0 ? '+' : '') + r1(x);

function chipClass(n: number): string {
  return n > 0 ? 'pos' : n < 0 ? 'neg' : '';
}

// Selected time range → a filter (empty = all time).
function currentFilter(): StatsFilter {
  const windowMs = Number(rangeEl.value);
  return windowMs > 0 ? { fromTime: Date.now() - windowMs } : {};
}

// ── Persisted controls ───────────────────────────────────────────────────────

async function initControls(): Promise<void> {
  const stored = await chrome.storage.local.get({
    hud_visible: true, [RANGE_KEY]: '0', [STAKE_KEY]: ALL, [SNAPSHOT_KEY]: null,
  });
  toggleEl.checked = Boolean(stored.hud_visible);
  rangeEl.value = String(stored[RANGE_KEY]);
  savedStake = String(stored[STAKE_KEY]);
  restoreSnapshot(stored[SNAPSHOT_KEY] as Snapshot | null);

  toggleEl.addEventListener('change', () => {
    void chrome.storage.local.set({ hud_visible: toggleEl.checked });
  });
  rangeEl.addEventListener('change', () => {
    void chrome.storage.local.set({ [RANGE_KEY]: rangeEl.value });
    void reloadLevels();   // available levels can change with the time window
  });
  levelEl.addEventListener('change', () => {
    savedStake = levelEl.value;
    void chrome.storage.local.set({ [STAKE_KEY]: levelEl.value });
    void renderStats();
  });
}

// Fill the stake-level dropdown from `levels`, preserving the desired
// selection when still available (else falling back to All levels).
function fillLevels(desired: string): void {
  setHtml(levelEl, html`${[
    html`<option value="${ALL}">All levels</option>`,
    ...levels.map(l => html`<option value="${l.level}">${formatStakeLevel(l.sb, l.bb)}</option>`),
  ]}`);
  levelEl.value = Array.from(levelEl.options).some(o => o.value === desired) ? desired : ALL;
}

// Paint the last render straight away when it was made for the same
// selection the controls just restored. Nothing here talks to the background.
function restoreSnapshot(snap: Snapshot | null): void {
  if (!snap) return;
  levels = snap.levels;
  fillLevels(savedStake);
  if (snap.key !== selectionKey()) return;
  snapshot = snap;
  paint(snap.stats, snap.series, levelEl.value);
  if (snap.storage) storageEl.textContent = snap.storage;
}

// Populate the stake levels for the current time window, then the stats.
async function reloadLevels(): Promise<void> {
  const res = await send({ type: 'list_stake_levels', filter: currentFilter() });
  levels = res.ok ? res.stakeLevels ?? [] : [];
  fillLevels(levelEl.value || savedStake);
  await renderStats();
}

// ── Stats card ───────────────────────────────────────────────────────────────

function statRow(label: string, value: string, cls = ''): SafeHtml {
  return html`<div class="row"><span class="muted">${label}</span><span class="${cls}">${value}</span></div>`;
}

// bb defined → bb/100; otherwise chips/hand (bb ambiguous across mixed stakes).
function winRateRow(winRate: number, bb?: number): SafeHtml {
  return bb
    ? statRow('Win rate', `${signed((winRate / bb) * 100)} bb/100`, chipClass(winRate))
    : statRow('Win rate', `${signed(winRate)} chips/hand`, chipClass(winRate));
}

function renderCard(stats: HeroStats, label: string, bb?: number): void {
  const net = Math.round(stats.winRate * stats.handsPlayed);   // chips (cents)
  statsEl.className = '';
  setHtml(statsEl, html`<div class="level">
    <div class="level-head">
      <span>${label}</span>
      <span class="hands">${stats.handsPlayed} hands</span>
    </div>
    ${statRow('VPIP / PFR', `${r1(stats.vpip)}% / ${r1(stats.pfr)}%`)}
    ${statRow('3-bet / fold to 3-bet', `${r1(stats.threeBet)}% / ${r1(stats.foldTo3Bet)}%`)}
    ${statRow('AF (pre/flop/turn/river)',
      `${r1(stats.af)} (${r1(stats.afByStreet.preflop)}/${r1(stats.afByStreet.flop)}/${r1(stats.afByStreet.turn)}/${r1(stats.afByStreet.river)})`)}
    ${statRow('WTSD / W$SD', `${r1(stats.wtsd)}% / ${r1(stats.wsd)}%`)}
    ${winRateRow(stats.winRate, bb)}
    ${statRow('Net', formatDollars(net), chipClass(net))}
  </div>`);
}

// Render the card + chart. Skipped when nothing changed since the last paint
// (the common case when live data confirms the snapshot) to avoid a flicker.
function paint(stats: HeroStats | null, series: number[], selected: string): void {
  const sig = JSON.stringify([stats, series, selected, levels]);
  if (sig === lastPaintSig) return;
  lastPaintSig = sig;

  if (!stats || stats.handsPlayed === 0) {
    statsEl.className = 'muted';
    statsEl.textContent = 'No hands for this selection.';
    chartEl.replaceChildren();
    return;
  }

  const level = levels.find(l => l.level === selected);
  // For "All levels" fall back to bb/100 only when a single level exists.
  const bb = level ? level.bb : (levels.length === 1 ? levels[0]!.bb : undefined);
  const label = level ? formatStakeLevel(level.sb, level.bb) : 'All levels';
  renderCard(stats, label, bb);

  // The chart SVG is trusted: generated locally from numbers (raw()).
  const svg = netChartSvg(series);
  setHtml(chartEl, svg
    ? html`<div class="chart-title">Net winnings ($) vs hands</div>${raw(svg)}`
    : html``);
}

async function renderStats(): Promise<void> {
  const selected = levelEl.value;
  const filter = selected === ALL
    ? currentFilter()
    : { ...currentFilter(), stakeLevel: selected };

  const [statsRes, seriesRes] = await Promise.all([
    send({ type: 'get_hero_stats', filter }),
    send({ type: 'get_net_series', filter }),
  ]);
  // The selection may have changed while we waited; a newer render owns it.
  if (levelEl.value !== selected) return;

  const stats = statsRes.ok ? statsRes.stats ?? null : null;
  const series = seriesRes.ok ? seriesRes.series ?? [] : [];
  paint(stats, series, selected);

  snapshot = { key: selectionKey(), levels, stats, series, storage: snapshot?.storage };
  persistSnapshot();
}

// ── Export ───────────────────────────────────────────────────────────────────

panelEl.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

exportEl.addEventListener('click', async () => {
  exportEl.disabled = true;
  statusEl.textContent = 'Exporting…';
  try {
    const res = await send({ type: 'export_hands' });
    statusEl.textContent = res.ok
      ? `Exported ${res.files ?? 0} file(s) to Downloads/webpokerhud/`
      : `Export failed: ${res.error}`;
  } finally {
    exportEl.disabled = false;
  }
});

// ── Import ───────────────────────────────────────────────────────────────────

// Importing needs a file picker, and a popup closes (killing the import) the
// moment the OS dialog takes focus — so the import UI lives in the Analysis
// Panel, which opens as a real tab. This button just takes the user there.
importEl.addEventListener('click', () => {
  statusEl.textContent = 'Import moved to the Analysis Panel (⇪ Import, top bar).';
  chrome.runtime.openOptionsPage();
});

// ── Storage status ───────────────────────────────────────────────────────────

async function renderStorage(): Promise<void> {
  const res = await send({ type: 'get_storage_info' });
  if (!res.ok || !res.storage) return;
  const { persisted, usage } = res.storage;
  const mb = usage !== undefined ? ` · ${(usage / 1_048_576).toFixed(1)} MB used` : '';
  storageEl.textContent = `Storage: ${persisted ? 'persistent ✓' : 'best-effort ⚠'}${mb}`;
  if (snapshot) {
    snapshot.storage = storageEl.textContent;
    persistSnapshot();
  }
}

// ── Host permissions ─────────────────────────────────────────────────────────

// Firefox MV3 treats host permissions as user-revocable (and upgrades adding
// new hosts don't re-prompt), so surface a grant button when access is
// missing. Chrome grants host_permissions at install; the banner never shows
// there. permissions.request must run in a user gesture — the click handler.
async function checkHostPermissions(): Promise<void> {
  const origins = ['https://www.bovada.lv/*', 'https://api.webpokerhud.com/*'];
  const permEl = document.getElementById('perm')!;
  const btnEl  = document.getElementById('perm-btn') as HTMLButtonElement;

  permEl.hidden = await chrome.permissions.contains({ origins });
  btnEl.addEventListener('click', async () => {
    const granted = await chrome.permissions.request({ origins });
    permEl.hidden = granted;
    if (granted) statusEl.textContent = 'Access granted — reload your Bovada tab.';
  });
}

// ── Init ─────────────────────────────────────────────────────────────────────

// Open-latency breakdown (perf hunt): every timestamp is ms since the popup
// document started loading, so the line reads as a waterfall.
const timing: string[] = [`script=${Math.round(performance.now())}`];
const mark = (label: string): void => { timing.push(`${label}=${Math.round(performance.now())}`); };
window.addEventListener('DOMContentLoaded', () => mark('dcl'));
window.addEventListener('load', () => mark('load'));

async function init(): Promise<void> {
  // Google sign-in via the background; tier shown on the chip. Signing in or
  // out doesn't change popup stats (they're computed locally).
  mountAccountChip(document.getElementById('account')!);
  // The permission check only toggles a banner and its first call from a
  // fresh popup costs ~50ms of IPC setup — never let it delay the snapshot
  // paint that initControls does.
  await Promise.all([
    checkHostPermissions().then(() => mark('perms')),
    initControls().then(() => mark('controls')),
  ]);
  await reloadLevels();
  mark('levels+stats');
  await renderStorage();
  mark('storage');
  console.debug(`[WebPokerHud] popup timing (ms from doc start): ${timing.join(' ')}`);
}

void init();
