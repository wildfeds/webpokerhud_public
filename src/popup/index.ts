// Popup — hero stats for a selected (time range, stake level). Both selectors
// are persisted; the stake-level list is populated from stored hands. HUD
// visibility toggle and JSONL export live here too.
import { HeroStats, StatsFilter, StakeLevelSummary } from '../analysis';
import { formatStakeLevel, formatDollars, netChartSvg } from '../overlay';
import { HudMessage, HudResponse } from '../messages';
import { mountAccountChip } from '../auth_ui';

const statsEl  = document.getElementById('stats')!;
const chartEl  = document.getElementById('chart')!;
const rangeEl  = document.getElementById('range') as HTMLSelectElement;
const levelEl  = document.getElementById('level') as HTMLSelectElement;
const toggleEl = document.getElementById('hud-toggle') as HTMLInputElement;
const exportEl = document.getElementById('export-btn') as HTMLButtonElement;
const panelEl  = document.getElementById('panel-btn') as HTMLButtonElement;
const importEl = document.getElementById('import-btn') as HTMLButtonElement;
const importFileEl = document.getElementById('import-file') as HTMLInputElement;
const statusEl = document.getElementById('status')!;
const storageEl = document.getElementById('storage')!;

const RANGE_KEY = 'stat_range';
const STAKE_KEY = 'stat_stake';
const ALL = 'all';

// Stake levels available under the current time filter (for value → sb/bb lookup).
let levels: StakeLevelSummary[] = [];
let savedStake = ALL;

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
    hud_visible: true, [RANGE_KEY]: '0', [STAKE_KEY]: ALL,
  });
  toggleEl.checked = Boolean(stored.hud_visible);
  rangeEl.value = String(stored[RANGE_KEY]);
  savedStake = String(stored[STAKE_KEY]);

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

// Populate the stake-level dropdown for the current time window, preserving the
// selection when still available (else falling back to All levels).
async function reloadLevels(): Promise<void> {
  const res = await send({ type: 'list_stake_levels', filter: currentFilter() });
  levels = res.ok ? res.stakeLevels ?? [] : [];

  const desired = levelEl.value || savedStake;
  levelEl.innerHTML = [
    `<option value="${ALL}">All levels</option>`,
    ...levels.map(l => `<option value="${l.level}">${formatStakeLevel(l.sb, l.bb)}</option>`),
  ].join('');
  levelEl.value = Array.from(levelEl.options).some(o => o.value === desired) ? desired : ALL;

  await renderStats();
}

// ── Stats card ───────────────────────────────────────────────────────────────

function statRow(label: string, value: string, cls = ''): string {
  return `<div class="row"><span class="muted">${label}</span><span class="${cls}">${value}</span></div>`;
}

// bb defined → bb/100; otherwise chips/hand (bb ambiguous across mixed stakes).
function winRateRow(winRate: number, bb?: number): string {
  return bb
    ? statRow('Win rate', `${signed((winRate / bb) * 100)} bb/100`, chipClass(winRate))
    : statRow('Win rate', `${signed(winRate)} chips/hand`, chipClass(winRate));
}

function renderCard(stats: HeroStats, label: string, bb?: number): void {
  const net = Math.round(stats.winRate * stats.handsPlayed);   // chips (cents)
  statsEl.className = '';
  statsEl.innerHTML = `<div class="level">
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
  </div>`;
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

  const stats = statsRes.ok ? statsRes.stats : null;
  if (!stats || stats.handsPlayed === 0) {
    statsEl.className = 'muted';
    statsEl.textContent = 'No hands for this selection.';
    chartEl.innerHTML = '';
    return;
  }

  const level = levels.find(l => l.level === selected);
  // For "All levels" fall back to bb/100 only when a single level exists.
  const bb = level ? level.bb : (levels.length === 1 ? levels[0]!.bb : undefined);
  const label = level ? formatStakeLevel(level.sb, level.bb) : 'All levels';
  renderCard(stats, label, bb);

  const series = seriesRes.ok ? seriesRes.series ?? [] : [];
  const svg = netChartSvg(series);
  chartEl.innerHTML = svg ? `<div class="chart-title">Net winnings ($) vs hands</div>${svg}` : '';
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
      ? `Exported ${res.files ?? 0} file(s) to Downloads/bovada_hud/`
      : `Export failed: ${res.error}`;
  } finally {
    exportEl.disabled = false;
  }
});

// ── Import ───────────────────────────────────────────────────────────────────

importEl.addEventListener('click', () => importFileEl.click());

importFileEl.addEventListener('change', async () => {
  const file = importFileEl.files?.[0];
  if (!file) return;
  importEl.disabled = true;
  statusEl.textContent = `Importing ${file.name}…`;
  try {
    const jsonl = await file.text();
    const res = await send({ type: 'import_hands', jsonl });
    if (!res.ok) {
      statusEl.textContent = `Import failed: ${res.error}`;
    } else {
      const skipped = res.skipped ? `, ${res.skipped} skipped` : '';
      statusEl.textContent = `Imported ${res.imported ?? 0} hand(s)${skipped}. ${res.count ?? 0} total.`;
      if (res.errors?.length) console.warn('[BovadaHUD] import errors:', res.errors);
      await renderStats();   // reflect the newly imported hands
    }
  } finally {
    importEl.disabled = false;
    importFileEl.value = '';   // allow re-importing the same file
  }
});

// ── Storage status ───────────────────────────────────────────────────────────

async function renderStorage(): Promise<void> {
  const res = await send({ type: 'get_storage_info' });
  if (!res.ok || !res.storage) return;
  const { persisted, usage } = res.storage;
  const mb = usage !== undefined ? ` · ${(usage / 1_048_576).toFixed(1)} MB used` : '';
  storageEl.textContent = `Storage: ${persisted ? 'persistent ✓' : 'best-effort ⚠'}${mb}`;
}

// ── Init ─────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  // Google sign-in via the background; tier shown on the chip. Signing in or
  // out doesn't change popup stats (they're computed locally).
  mountAccountChip(document.getElementById('account')!);
  await initControls();
  await reloadLevels();
  await renderStorage();
}

void init();
