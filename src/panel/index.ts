// Analysis Panel — full-page off-table review. All aggregate views are
// computed by the analysis server: get_panel_data uploads the locally stored
// (filtered) hands and renders the tier-gated response. Free tier gets
// Overview + Hands; Pro-only views (positions, cards, sessions, trends) show
// an upgrade prompt. Hand replay stays local (reads the IndexedDB record).
import {
  HeroStats, Counter, StatsFilter, StakeLevelSummary, StakeStats, HandSummary,
  Leak, HoleCardMatrix, SessionSummary, RollingStats, PanelData, emptyPanelData,
  POSITION_ORDER, MATRIX_RANKS, seatPositions, counterPct, matrixKeyAt, netWonInHand,
} from '../analysis';
import { Hand, Action, ActionType, Street } from '../model';
import { STAT_INFO } from './stat_info';
import {
  HandFilterState, HandPreset, PRESET_LABELS, BIG_POT_BB,
  defaultHandFilters, presetFilters, activePreset, applyHandFilters,
} from './hand_filters';
import {
  formatStakeLevel, formatDollars, cardLabel, cardColor,
  multiSeriesChartSvg, barChartSvg,
} from '../overlay';
import { HudMessage, HudResponse } from '../messages';
import { mountAccountChip } from '../auth_ui';

const rangeEl   = document.getElementById('range') as HTMLSelectElement;
const levelEl   = document.getElementById('level') as HTMLSelectElement;
const summaryEl = document.getElementById('summary-line')!;

let levels: StakeLevelSummary[] = [];

function send(message: HudMessage): Promise<HudResponse> {
  return chrome.runtime.sendMessage(message);
}

const r1 = (x: number) => (Math.round(x * 10) / 10).toString();
const signed = (x: number) => (x >= 0 ? '+' : '') + r1(x);
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const chipClass = (n: number) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const dollarCell = (cents: number) => `<span class="${chipClass(cents)}">${formatDollars(cents)}</span>`;

// Current filter from the two selectors (empty = all).
function currentFilter(): StatsFilter {
  const windowMs = Number(rangeEl.value);
  const filter: StatsFilter = windowMs > 0 ? { fromTime: Date.now() - windowMs } : {};
  if (levelEl.value && levelEl.value !== 'all') filter.stakeLevel = levelEl.value;
  return filter;
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

function activateTab(view: string): void {
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', (t as HTMLElement).dataset.view === view));
  document.querySelectorAll('.view').forEach(v =>
    v.classList.toggle('active', v.id === `view-${view}`));
}

document.querySelectorAll<HTMLButtonElement>('.tab').forEach(tab => {
  tab.addEventListener('click', () => activateTab(tab.dataset.view!));
});

// ── Controls ─────────────────────────────────────────────────────────────────

async function initControls(): Promise<void> {
  const stored = await chrome.storage.local.get({
    stat_range: '0', stat_stake: 'all', trend_window: '100',
  });
  rangeEl.value = String(stored.stat_range);
  trendWindowEl.value = String(stored.trend_window);

  rangeEl.addEventListener('change', () => {
    void chrome.storage.local.set({ stat_range: rangeEl.value });
    void reloadLevels();
  });
  levelEl.addEventListener('change', () => {
    void chrome.storage.local.set({ stat_stake: levelEl.value });
    void renderAll();
  });
  // Manual refresh: the panel only fetches on load and filter changes, so
  // hands finished while it sits open aren't reflected until this is clicked.
  // Reload the stake-level list too — new hands may introduce a new level.
  const refreshEl = document.getElementById('refresh') as HTMLButtonElement;
  refreshEl.addEventListener('click', () => {
    refreshEl.disabled = true;
    refreshEl.textContent = '↻ Refreshing…';
    void reloadLevels().finally(() => {
      refreshEl.disabled = false;
      refreshEl.textContent = '↻ Refresh';
    });
  });

  trendWindowEl.addEventListener('change', () => {
    void chrome.storage.local.set({ trend_window: trendWindowEl.value });
    // Rolling stats come back with the rest of the panel payload.
    void renderAll();
  });
  renderHandFilterBar();
  await reloadLevels(String(stored.stat_stake));
}

async function reloadLevels(desired = levelEl.value || 'all'): Promise<void> {
  const timeFilter: StatsFilter = Number(rangeEl.value) > 0
    ? { fromTime: Date.now() - Number(rangeEl.value) } : {};
  const res = await send({ type: 'list_stake_levels', filter: timeFilter });
  levels = res.ok ? res.stakeLevels ?? [] : [];

  levelEl.innerHTML = [
    `<option value="all">All levels</option>`,
    ...levels.map(l => `<option value="${l.level}">${formatStakeLevel(l.sb, l.bb)}</option>`),
  ].join('');
  levelEl.value = Array.from(levelEl.options).some(o => o.value === desired) ? desired : 'all';

  await renderAll();
}

// ── Overview ─────────────────────────────────────────────────────────────────

function renderSummary(stake: StakeStats[]): void {
  const cardsEl = document.getElementById('summary-cards')!;
  const tableEl = document.getElementById('stake-table')!;

  if (stake.length === 0) {
    cardsEl.innerHTML = '';
    tableEl.innerHTML = `<div class="empty">No hands for this selection.</div>`;
    summaryEl.textContent = '';
    return;
  }

  const totalHands    = stake.reduce((a, s) => a + s.hands, 0);
  const totalNet      = stake.reduce((a, s) => a + s.net, 0);
  const totalWon      = stake.reduce((a, s) => a + s.handsWon, 0);
  const totalSessions = stake.reduce((a, s) => a + s.sessions, 0);
  const netInBb       = stake.reduce((a, s) => a + (s.bb > 0 ? s.net / s.bb : 0), 0);
  const bb100         = totalHands > 0 ? (netInBb / totalHands) * 100 : 0;
  const winPct        = totalHands > 0 ? (totalWon / totalHands) * 100 : 0;

  summaryEl.textContent = `${totalHands.toLocaleString()} hands · ${formatDollars(totalNet)}`;

  const card = (k: string, v: string, cls = '', key?: string) => {
    const label = key ? `<span class="stat-term" data-stat="${key}">${k}</span>` : k;
    return `<div class="card"><div class="k">${label}</div><div class="v ${cls}">${v}</div></div>`;
  };
  cardsEl.innerHTML = [
    card('Hands', totalHands.toLocaleString()),
    card('Net won', formatDollars(totalNet), chipClass(totalNet)),
    card('bb / 100', signed(bb100), chipClass(bb100), 'bb100'),
    card('Hands won', `${r1(winPct)}%`, '', 'handsWon'),
    card('Sessions', String(totalSessions), '', 'sessions'),
  ].join('');

  tableEl.innerHTML = `<table>
    <thead><tr>
      <th>Stake</th><th>Hands</th><th>Won %</th><th>Sessions</th><th>Net</th><th>bb/100</th>
    </tr></thead>
    <tbody>${stake.map(s => `<tr>
      <td>${formatStakeLevel(s.sb, s.bb)}</td>
      <td>${s.hands.toLocaleString()}</td>
      <td>${r1(s.hands > 0 ? (s.handsWon / s.hands) * 100 : 0)}%</td>
      <td>${s.sessions}</td>
      <td>${dollarCell(s.net)}</td>
      <td class="${chipClass(s.bb100)}">${signed(s.bb100)}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// Line colours: total green, all-in EV orange (PT4 convention).
const LINE_TOTAL = '#7ec97e';
const LINE_RED   = '#ff6b6b';
const LINE_EV    = '#f0a860';

function renderChart(total: number[], ev: number[]): void {
  const el = document.getElementById('chart')!;
  // Hide the EV line while it tracks the total exactly (no adjusted hands yet).
  const evDiffers = ev.some((v, i) => Math.round(v) !== Math.round(total[i] ?? 0));
  const svg = multiSeriesChartSvg([
    { points: total, color: LINE_TOTAL },
    ...(evDiffers ? [{ points: ev, color: LINE_EV }] : []),
  ], 1040, 300);
  if (!svg) {
    el.innerHTML = `<div class="empty">Need at least two hands to plot.</div>`;
    return;
  }
  const last = (xs: number[]) => xs.length > 0 ? xs[xs.length - 1]! : 0;
  const item = (color: string, label: string, key: string, v: number) =>
    `<span><span class="swatch" style="background:${color}"></span><span
       class="stat-term" data-stat="${key}">${label}</span> ${dollarCell(v)}</span>`;
  el.innerHTML = `<div class="chart-legend">
    ${item(LINE_TOTAL, 'Total', 'lineTotal', last(total))}
    ${evDiffers ? item(LINE_EV, 'All-in EV', 'lineEv', Math.round(last(ev))) : ''}
  </div>${svg}`;
}

function renderLeaks(leaks: Leak[]): void {
  const el = document.getElementById('leaks')!;
  if (leaks.length === 0) {
    el.innerHTML = `<div class="empty">No hands for this selection.</div>`;
    return;
  }
  el.innerHTML = leaks.map(l => `<div class="leak ${l.severity}">
    <div class="dot"></div>
    <div><div class="title">${l.title}</div><div class="detail">${l.detail}</div></div>
  </div>`).join('');
}

// ── Advanced stats ───────────────────────────────────────────────────────────

// Below this many opportunities a percentage is too noisy to trust — greyed out.
const MIN_SAMPLE = 15;

// "62 (34)" — pct with opportunity count, dimmed under the min sample.
function fmtCounter(c: Counter): string {
  if (c.d === 0) return '<span class="low">—</span>';
  const txt = `${r1(counterPct(c))} <span class="lbl">(${c.d})</span>`;
  return c.d < MIN_SAMPLE ? `<span class="low">${txt}</span>` : txt;
}

function advRow(label: string, value: string, key?: string): string {
  const lbl = key
    ? `<span class="lbl stat-term" data-stat="${key}">${label}</span>`
    : `<span class="lbl">${label}</span>`;
  return `<div class="adv-row">${lbl}<span>${value}</span></div>`;
}

// ── Stat glossary popover ────────────────────────────────────────────────────
// Hovering a .stat-term shows a definition popover; stats with a recorded
// example hand add a link that expands an inline replay. Clicking the term or
// the popover pins it (closes on click-outside / Escape). Delegated listeners,
// so innerHTML re-renders need no re-binding. Definitions live in
// stat_info.ts (shared with the website's docs build).

const pop = document.createElement('div');
pop.id = 'stat-pop';
pop.hidden = true;
document.body.appendChild(pop);

let lastStats: HeroStats | null = null;   // popover reads examples from here
let popPinned = false;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let openTimer: ReturnType<typeof setTimeout> | undefined;

function cancelHide(): void {
  if (hideTimer !== undefined) { clearTimeout(hideTimer); hideTimer = undefined; }
}

function cancelOpen(): void {
  if (openTimer !== undefined) { clearTimeout(openTimer); openTimer = undefined; }
}

// Grace period so the pointer can travel from the term into the popover.
function scheduleHide(): void {
  if (pop.hidden || popPinned || hideTimer !== undefined) return;
  hideTimer = setTimeout(hidePopover, 300);
}

function hidePopover(): void {
  cancelHide();
  cancelOpen();
  pop.hidden = true;
  popPinned = false;
  delete pop.dataset.key;
}

function openPopover(anchor: HTMLElement, key: string): void {
  // Reopening the same key would destroy an expanded replay — leave it alone.
  if (!pop.hidden && pop.dataset.key === key) return;
  const info = STAT_INFO[key];
  if (!info) return;

  // No viable example (stat is definition-only, or none recorded yet) →
  // the popover shows just the definition.
  const ex = info.example ? lastStats?.examples?.[info.example] : undefined;
  const exampleHtml = ex
    ? `<a href="#" class="pop-link" data-hand="${ex.handId}" data-table="${ex.tableId}">
         Example hand · ${new Date(ex.timestamp).toLocaleString()} ▸
       </a><div class="pop-replay" hidden></div>`
    : '';

  pop.innerHTML = `<div class="pop-title">${info.title}</div>
    <div class="pop-def">${info.definition}</div>${exampleHtml}`;
  pop.dataset.key = key;
  popPinned = false;
  pop.hidden = false;

  const r = anchor.getBoundingClientRect();
  const width = pop.offsetWidth;
  const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 12));
  pop.style.left = `${left + window.scrollX}px`;
  pop.style.top = `${r.bottom + 6 + window.scrollY}px`;
}

async function expandExample(link: HTMLElement): Promise<void> {
  const area = pop.querySelector<HTMLElement>('.pop-replay');
  if (!area) return;
  area.hidden = false;
  area.innerHTML = `<span class="empty">Loading…</span>`;
  const res = await send({ type: 'get_hand', handId: link.dataset.hand!, tableId: link.dataset.table! });
  const hand = res.ok ? res.hand : null;
  area.innerHTML = hand ? replayHtml(hand) : `<span class="empty">Hand not found.</span>`;
}

document.addEventListener('mouseover', e => {
  const el = e.target as HTMLElement;
  const term = el.closest?.<HTMLElement>('.stat-term[data-stat]');
  if (term) {
    cancelHide();
    cancelOpen();
    // Hover never replaces a pinned popover (that takes a click), and a short
    // hover-intent delay keeps a pointer travelling into the popover from
    // opening the row it crosses on the way.
    if (popPinned || (!pop.hidden && pop.dataset.key === term.dataset.stat)) return;
    openTimer = setTimeout(() => { openTimer = undefined; openPopover(term, term.dataset.stat!); }, 150);
    return;
  }
  if (el.closest?.('#stat-pop')) { cancelHide(); cancelOpen(); return; }
  cancelOpen();
  scheduleHide();
});

document.addEventListener('click', e => {
  const el = e.target as HTMLElement;
  const term = el.closest?.<HTMLElement>('.stat-term[data-stat]');
  if (term) { cancelOpen(); openPopover(term, term.dataset.stat!); popPinned = true; cancelHide(); return; }
  if (el.closest?.('#stat-pop')) {
    popPinned = true;
    cancelHide();
    const link = el.closest<HTMLElement>('a.pop-link');
    if (link) { e.preventDefault(); void expandExample(link); }
    return;
  }
  hidePopover();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') hidePopover();
});

function renderAdvanced(stats: HeroStats | null): void {
  const el = document.getElementById('advanced')!;
  if (!stats || stats.handsPlayed === 0) {
    el.innerHTML = `<div class="empty">No hands for this selection.</div>`;
    return;
  }
  const core = `<div class="card"><h3>Core</h3>
    ${advRow('VPIP', `${r1(stats.vpip)}%`, 'vpip')}
    ${advRow('PFR', `${r1(stats.pfr)}%`, 'pfr')}
    ${advRow('3-bet', `${r1(stats.threeBet)}%`, 'threeBet')}
    ${advRow('Fold to 3-bet', `${r1(stats.foldTo3Bet)}%`, 'foldTo3Bet')}
    ${advRow('AF (pre / F / T / R)',
      `${r1(stats.af)} <span class="lbl">(${r1(stats.afByStreet.preflop)} / ${r1(stats.afByStreet.flop)} / ${r1(stats.afByStreet.turn)} / ${r1(stats.afByStreet.river)})</span>`, 'af')}
    ${advRow('WTSD', `${r1(stats.wtsd)}%`, 'wtsd')}
    ${advRow('W$SD', `${r1(stats.wsd)}%`, 'wsd')}
    ${advRow('Win rate', `<span class="${chipClass(stats.winRate)}">${formatDollars(Math.round(stats.winRate))}</span>/hand`, 'winRate')}
  </div>`;
  const preflop = `<div class="card"><h3>Preflop</h3>
    ${advRow('Steal', fmtCounter(stats.steal), 'steal')}
    ${advRow('&nbsp;&nbsp;CO / BTN / SB',
      `${fmtCounter(stats.stealByPos.co)} / ${fmtCounter(stats.stealByPos.btn)} / ${fmtCounter(stats.stealByPos.sb)}`, 'stealByPos')}
    ${advRow('Fold BB to steal', fmtCounter(stats.foldBBToSteal), 'foldBBToSteal')}
    ${advRow('Fold SB to steal', fmtCounter(stats.foldSBToSteal), 'foldSBToSteal')}
    ${advRow('Squeeze', fmtCounter(stats.squeeze), 'squeeze')}
    ${advRow('Cold call', fmtCounter(stats.coldCall), 'coldCall')}
    ${advRow('4-bet', fmtCounter(stats.fourBet), 'fourBet')}
    ${advRow('Fold to 4-bet', fmtCounter(stats.foldTo4Bet), 'foldTo4Bet')}
  </div>`;
  const postflop = `<div class="card"><h3>Postflop</h3>
    ${advRow('C-bet (F / T / R)',
      `${fmtCounter(stats.cbet.flop)} / ${fmtCounter(stats.cbet.turn)} / ${fmtCounter(stats.cbet.river)}`, 'cbet')}
    ${advRow('Fold to c-bet (F / T / R)',
      `${fmtCounter(stats.foldToCbet.flop)} / ${fmtCounter(stats.foldToCbet.turn)} / ${fmtCounter(stats.foldToCbet.river)}`, 'foldToCbet')}
    ${advRow('Check-raise (F / T / R)',
      `${fmtCounter(stats.checkRaise.flop)} / ${fmtCounter(stats.checkRaise.turn)} / ${fmtCounter(stats.checkRaise.river)}`, 'checkRaise')}
    ${advRow('AFq (F / T / R)',
      `${fmtCounter(stats.afq.flop)} / ${fmtCounter(stats.afq.turn)} / ${fmtCounter(stats.afq.river)}`, 'afq')}
    ${advRow('Won when saw flop', fmtCounter(stats.wwsf), 'wwsf')}
  </div>`;
  const note = `<div class="adv-note">Preflop / Postflop values read <strong>% (opportunities)</strong> —
    e.g. “62 (34)” = did it 62% of 34 chances; greyed out under ${MIN_SAMPLE} opportunities.
    Core values are plain percentages of all hands (AF is a ratio).
    Hover a stat name for its definition.</div>`;
  el.innerHTML = core + preflop + postflop + note;
}

// ── Positions ────────────────────────────────────────────────────────────────

function statCells(s: HeroStats): string {
  const net = Math.round(s.winRate * s.handsPlayed);
  return `<td>${s.handsPlayed}</td>
    <td>${r1(s.vpip)}</td>
    <td>${r1(s.pfr)}</td>
    <td>${r1(s.threeBet)}</td>
    <td>${r1(s.af)}</td>
    <td>${r1(s.wtsd)}</td>
    <td>${r1(s.wsd)}</td>
    <td>${dollarCell(net)}</td>`;
}

function renderPositions(byPos: Record<string, HeroStats>, total: HeroStats | null): void {
  const el = document.getElementById('position-table')!;
  const present = POSITION_ORDER.filter(p => byPos[p]);
  if (present.length === 0) {
    el.innerHTML = `<div class="empty">No hands for this selection.</div>`;
    return;
  }
  const h = (label: string, key: string) =>
    `<th><span class="stat-term" data-stat="${key}">${label}</span></th>`;
  const head = `<thead><tr>
    <th>Position</th><th>Hands</th>${h('VPIP', 'vpip')}${h('PFR', 'pfr')}${h('3B', 'threeBet')}
    ${h('AF', 'af')}${h('WTSD', 'wtsd')}${h('W$SD', 'wsd')}<th>Net</th>
  </tr></thead>`;
  const rows = present.map(p => `<tr><td>${p}</td>${statCells(byPos[p]!)}</tr>`).join('');
  const totalRow = total
    ? `<tr style="border-top:2px solid var(--line)"><td><strong>Total</strong></td>${statCells(total)}</tr>`
    : '';
  el.innerHTML = `<table>${head}<tbody>${rows}${totalRow}</tbody></table>`;
}

// ── Starting-hand matrix ─────────────────────────────────────────────────────

function renderMatrix(matrix: HoleCardMatrix): void {
  const el = document.getElementById('matrix')!;
  const cells = Object.values(matrix);
  if (cells.length === 0) {
    el.innerHTML = `<div class="empty">No hands with known hero cards for this selection.</div>`;
    return;
  }
  const maxAbs = Math.max(1, ...cells.map(c => Math.abs(c.net)));

  let html = '<div class="matrix-grid">';
  for (let row = 0; row < MATRIX_RANKS.length; row++) {
    for (let col = 0; col < MATRIX_RANKS.length; col++) {
      const key = matrixKeyAt(row, col);
      const cell = matrix[key];
      if (!cell) {
        html += `<div class="matrix-cell"><div class="key">${key}</div><div class="n">—</div></div>`;
        continue;
      }
      // Shade by net result; sqrt so small samples still register visibly.
      const alpha = (0.12 + 0.55 * Math.sqrt(Math.abs(cell.net) / maxAbs)).toFixed(2);
      const bg = cell.net > 0 ? `rgba(126,201,126,${alpha})`
        : cell.net < 0 ? `rgba(255,107,107,${alpha})` : '';
      const vpipPct = r1((cell.vpip / cell.hands) * 100);
      const title = `${key} — ${cell.hands} hand${cell.hands === 1 ? '' : 's'} · ${formatDollars(cell.net)} · VPIP ${vpipPct}%`;
      html += `<div class="matrix-cell dealt" data-key="${key}" title="${title}"${bg ? ` style="background:${bg}"` : ''}>
        <div class="key">${key}</div><div class="n">${cell.hands}</div></div>`;
    }
  }
  el.innerHTML = html + '</div>';

  el.querySelectorAll<HTMLElement>('.matrix-cell.dealt').forEach(cell => {
    cell.addEventListener('click', () => {
      holeFilter = cell.dataset.key!;
      renderHands();
      activateTab('hands');
    });
  });
}

// ── Sessions ─────────────────────────────────────────────────────────────────

type SessionSortKey = 'start' | 'duration' | 'hands' | 'net' | 'bb100';
let sessionSort: { key: SessionSortKey; dir: 1 | -1 } = { key: 'start', dir: -1 };
let allSessions: SessionSummary[] = [];

const sessionBb100 = (s: SessionSummary) => s.hands > 0 ? (s.netBb / s.hands) * 100 : 0;

function fmtDuration(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

const SESSION_SORT_VAL: Record<SessionSortKey, (s: SessionSummary) => number> = {
  start:    s => s.start,
  duration: s => s.end - s.start,
  hands:    s => s.hands,
  net:      s => s.net,
  bb100:    sessionBb100,
};

function renderSessions(): void {
  const chartEl = document.getElementById('session-chart')!;
  const tableEl = document.getElementById('sessions-table')!;
  if (allSessions.length === 0) {
    chartEl.innerHTML = `<div class="empty">No hands for this selection.</div>`;
    tableEl.innerHTML = '';
    return;
  }

  // Bars stay in play order regardless of the table sort.
  chartEl.innerHTML = barChartSvg(allSessions.map(s => s.net), 1040, 220);

  const { key, dir } = sessionSort;
  const rows = [...allSessions].sort((a, b) => (SESSION_SORT_VAL[key](a) - SESSION_SORT_VAL[key](b)) * dir);
  const th = (k: SessionSortKey, label: string) =>
    `<th class="sortable" data-sort="${k}">${label}${key === k ? (dir === 1 ? ' ▲' : ' ▼') : ''}</th>`;

  tableEl.innerHTML = `<table>
    <thead><tr>
      ${th('start', 'Start')}${th('duration', 'Duration')}${th('hands', 'Hands')}${th('net', 'Net')}${th('bb100', 'bb/100')}
    </tr></thead>
    <tbody>${rows.map(s => `<tr>
      <td>${new Date(s.start).toLocaleString()}</td>
      <td>${fmtDuration(s.end - s.start)}</td>
      <td>${s.hands}</td>
      <td>${dollarCell(s.net)}</td>
      <td class="${chipClass(sessionBb100(s))}">${signed(sessionBb100(s))}</td>
    </tr>`).join('')}</tbody>
  </table>`;

  tableEl.querySelectorAll<HTMLElement>('th.sortable').forEach(h => {
    h.addEventListener('click', () => {
      const k = h.dataset.sort as SessionSortKey;
      sessionSort = k === sessionSort.key
        ? { key: k, dir: sessionSort.dir === 1 ? -1 : 1 }
        : { key: k, dir: -1 };
      renderSessions();
    });
  });
}

// ── Trends ───────────────────────────────────────────────────────────────────

const trendWindowEl = document.getElementById('trend-window') as HTMLSelectElement;
const TREND_VPIP = '#6fa8ff';
const TREND_PFR  = '#7ec97e';

function renderTrends(rolling: RollingStats | null): void {
  const pctEl = document.getElementById('trend-pct')!;
  const bbEl  = document.getElementById('trend-bb')!;
  if (!rolling || rolling.vpip.length < 2) {
    const msg = `<div class="empty">Need more hands than the rolling window
      (${trendWindowEl.value}) to plot a trend.</div>`;
    pctEl.innerHTML = msg;
    bbEl.innerHTML = msg;
    return;
  }
  const pctFmt = (v: number) => `${r1(v)}%`;
  const item = (color: string, label: string, key: string) =>
    `<span><span class="swatch" style="background:${color}"></span><span
       class="stat-term" data-stat="${key}">${label}</span></span>`;
  pctEl.innerHTML = `<div class="chart-legend">
      ${item(TREND_VPIP, 'VPIP', 'vpip')}${item(TREND_PFR, 'PFR', 'pfr')}
    </div>` + multiSeriesChartSvg([
    { points: rolling.vpip, color: TREND_VPIP },
    { points: rolling.pfr,  color: TREND_PFR },
  ], 1040, 260, pctFmt);

  const final = rolling.bb100[rolling.bb100.length - 1]!;
  bbEl.innerHTML = multiSeriesChartSvg(
    [{ points: rolling.bb100, color: final >= 0 ? TREND_PFR : LINE_RED }],
    1040, 260, v => signed(v));
}

// ── Hands + replay ───────────────────────────────────────────────────────────

function cardsHtml(cards: readonly string[]): string {
  if (cards.length === 0) return '<span class="muted">—</span>';
  return cards.map(c => `<span style="color:${cardColor(c as any)}">${cardLabel(c as any)}</span>`).join(' ');
}

let allHands: HandSummary[] = [];      // current selection, newest first
let holeFilter: string | null = null;  // matrix cell key, e.g. "AKs"

// Line filters (34) + big-hands sort/presets (50) — pure logic in hand_filters.ts.
let handFilters: HandFilterState = defaultHandFilters();

function renderHandFilterBar(): void {
  const el = document.getElementById('hand-filters')!;
  const current = activePreset(handFilters);
  const presets = (Object.keys(PRESET_LABELS) as HandPreset[]).map(p =>
    `<button class="preset${p === current ? ' active' : ''}" data-preset="${p}">${PRESET_LABELS[p]}</button>`);
  const sel = (id: keyof HandFilterState, opts: [string, string][]) =>
    `<select data-filter="${id}">${opts.map(([v, l]) =>
      `<option value="${v}"${handFilters[id] === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  el.innerHTML = [
    ...presets,
    sel('sort', [['newest', 'Newest first'], ['pot', 'Biggest pot'],
      ['win', 'Biggest win'], ['loss', 'Biggest loss']]),
    sel('position', [['all', 'All positions'], ...POSITION_ORDER.map(p => [p, p] as [string, string])]),
    sel('result', [['all', 'Won & lost'], ['won', 'Won'], ['lost', 'Lost']]),
    sel('street', [['all', 'Any street'], ['preflop', 'Ended preflop'], ['flop', 'Saw flop'],
      ['turn', 'Saw turn'], ['river', 'Saw river'], ['showdown', 'Showdown']]),
    sel('line', [['all', 'Any line'], ['3bp', '3-bet pot'], ['pfa', 'As PF aggressor']]),
    sel('pot', [['all', 'Any pot'], ['small', '&lt; 10 bb'], ['mid', `10–${BIG_POT_BB} bb`],
      ['big', `${BIG_POT_BB}+ bb`]]),
    `<button class="link-btn" id="reset-hand-filters">Reset</button>`,
  ].join('');
}

document.getElementById('hand-filters')!.addEventListener('change', e => {
  const t = e.target as HTMLSelectElement;
  const id = t.dataset.filter as keyof HandFilterState | undefined;
  if (!id) return;
  (handFilters as unknown as Record<string, string>)[id] = t.value;
  renderHandFilterBar();   // preset highlight may change
  renderHands();
});
document.getElementById('hand-filters')!.addEventListener('click', e => {
  const target = e.target as HTMLElement;
  const preset = target.dataset.preset as HandPreset | undefined;
  if (preset) {
    // Clicking the active preset toggles back to defaults.
    handFilters = preset === activePreset(handFilters) ? defaultHandFilters() : presetFilters(preset);
    renderHandFilterBar();
    renderHands();
    return;
  }
  if (target.id !== 'reset-hand-filters') return;
  handFilters = defaultHandFilters();
  holeFilter = null;
  renderHandFilterBar();
  renderHands();
});

function renderHands(): void {
  const el = document.getElementById('hands-table')!;
  const hands = applyHandFilters(allHands, handFilters, holeFilter);
  const chip = holeFilter
    ? `<div class="filter-chip">Cards: <strong>${holeFilter}</strong>
         <button id="clear-hole-filter" title="Clear filter">✕</button></div>`
    : '';
  const count = `<span class="muted" style="font-size:12px">${hands.length} hand${hands.length === 1 ? '' : 's'} match</span>`;

  if (hands.length === 0) {
    el.innerHTML = `${chip}<div class="empty">No hands for this selection.</div>`;
  } else {
    const rows = hands.slice(0, 500).map(h => `<tr class="clickable" data-hand="${h.handId}" data-table="${h.tableId}">
      <td>${new Date(h.timestamp).toLocaleString()}</td>
      <td>${formatStakeLevel(h.sb, h.bb)}</td>
      <td>${h.position ?? '—'}</td>
      <td class="board-cards">${cardsHtml(h.heroCards)}</td>
      <td class="board-cards">${cardsHtml(h.board)}</td>
      <td>${r1(h.potBb)} bb</td>
      <td>${dollarCell(h.net)}</td>
    </tr>`).join('');
    el.innerHTML = `${chip}${count}<table>
      <thead><tr><th>Time</th><th>Stake</th><th>Pos</th><th>Hand</th><th>Board</th><th>Pot</th><th>Net</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  document.getElementById('clear-hole-filter')?.addEventListener('click', () => {
    holeFilter = null;
    renderHands();
  });
  el.querySelectorAll<HTMLTableRowElement>('tr.clickable').forEach(tr => {
    tr.addEventListener('click', () => {
      void showReplay(tr.dataset.hand!, tr.dataset.table!);
    });
  });
}

// Display groups: which raw streets fold into each replay block, and how much of
// the board is visible by then.
const REPLAY_STREETS: { label: string; streets: Street[]; boardTo: number }[] = [
  { label: 'Preflop', streets: [Street.NEW_HAND, Street.POSTING_BLINDS, Street.PREFLOP], boardTo: 0 },
  { label: 'Flop',    streets: [Street.FLOP],  boardTo: 3 },
  { label: 'Turn',    streets: [Street.TURN],  boardTo: 4 },
  { label: 'River',   streets: [Street.RIVER], boardTo: 5 },
  { label: 'Showdown', streets: [Street.SHOWDOWN, Street.RESULT], boardTo: 5 },
];

const ACTION_VERB: Record<ActionType, string> = {
  [ActionType.POST_SB]: 'posts SB',
  [ActionType.POST_BB]: 'posts BB',
  [ActionType.FOLD]:    'folds',
  [ActionType.CHECK]:   'checks',
  [ActionType.CALL]:    'calls',
  [ActionType.BET]:     'bets',
  [ActionType.RAISE]:   'raises to',
  [ActionType.ALL_IN]:  'all-in',
  [ActionType.SHOW]:    'shows',
  [ActionType.MUCK]:    'mucks',
};

function actionLine(hand: Hand, a: Action, positions: Map<number, string>, heroId: string): string {
  const pos = positions.get(a.seat);
  const who = `${pos ? pos + ' ' : ''}(seat ${a.seat})`;
  const showsAmount = a.amount > 0 &&
    a.type !== ActionType.FOLD && a.type !== ActionType.CHECK && a.type !== ActionType.MUCK;
  const amt = showsAmount ? ` ${usd(a.amount)}` : '';
  // "shows" lines carry the revealed cards when the hand record has them.
  const shown = a.type === ActionType.SHOW
    ? hand.players.find(p => p.seat === a.seat)?.cards : null;
  const shownHtml = shown && shown.length === 2
    ? ` <span class="board-cards">${cardsHtml(shown)}</span>` : '';
  const hero = a.playerId === heroId ? ' hero' : '';
  return `<div class="act${hero}"><span class="who">${who}</span><span>${ACTION_VERB[a.type]}${amt}${shownHtml}</span></div>`;
}

// Street-by-street replay markup for a hand — shared by the Hands tab and the
// stat-glossary popover's inline example.
function replayHtml(hand: Hand): string {
  const heroId = hand.players.find(p => p.isHero)?.playerId ?? '';
  const positions = seatPositions(hand);

  const blocks = REPLAY_STREETS.map(block => {
    const acts = hand.actions.filter(a => block.streets.includes(a.street));
    if (acts.length === 0 && block.label !== 'Preflop') return '';
    const board = hand.board.slice(0, block.boardTo);
    const boardHtml = board.length > 0
      ? `<span class="board-cards">${cardsHtml(board)}</span>` : '';
    const lines = acts.map(a => actionLine(hand, a, positions, heroId)).join('');
    return `<div class="street-block">
      <div class="street-head"><span>${block.label}</span>${boardHtml}</div>
      ${lines || '<div class="act muted">—</div>'}
    </div>`;
  }).join('');

  const heroCards = hand.players.find(p => p.isHero)?.cards ?? [];
  const net = netWonInHand(hand, heroId);

  // Opponents whose hole cards the record knows — revealed at showdown or on
  // all-in (CO_PCARD_INFO), where no SHOW action ever appears in the log.
  const revealed = hand.players
    .filter(p => !p.isHero && (p.cards?.length ?? 0) === 2)
    .map(p => {
      const pos = positions.get(p.seat);
      return `<div><span class="muted">${pos ? pos + ' ' : ''}(seat ${p.seat}):</span>
        <span class="board-cards">${cardsHtml(p.cards!)}</span></div>`;
    })
    .join('');

  return `
    <div style="margin-bottom:10px">
      <div><span class="muted">Hero:</span> <span class="board-cards">${cardsHtml(heroCards)}</span>
      <span class="muted"> · ${formatStakeLevel(hand.stakes.sb, hand.stakes.bb)} · pot ${usd(hand.totalPot)}</span></div>
      ${revealed}
    </div>
    ${blocks}
    <div class="result-line">
      Result: ${dollarCell(net)}
      <span class="muted"> · ${new Date(hand.timestamp).toLocaleString()}</span>
    </div>`;
}

async function showReplay(handId: string, tableId: string): Promise<void> {
  const el = document.getElementById('replay')!;
  el.innerHTML = `<span class="empty">Loading…</span>`;
  const res = await send({ type: 'get_hand', handId, tableId });
  const hand = res.ok ? res.hand : null;
  el.innerHTML = hand ? replayHtml(hand) : `<span class="empty">Hand not found.</span>`;
}

// ── Locked (Pro-only) views ──────────────────────────────────────────────────

const UPGRADE_URL = 'https://webpokerhud.com/pricing';

function upgradeHtml(what: string): string {
  return `<div class="upgrade-box">
    <div class="upgrade-title">🔒 ${what} is a Pro feature</div>
    <p>Sign in with Google (top right) and upgrade to Pro to unlock position
       stats, the starting-hand matrix, sessions and trends.</p>
    <a class="upgrade-btn" href="${UPGRADE_URL}" target="_blank" rel="noreferrer">See plans</a>
  </div>`;
}

// Containers per Pro view; the first gets the upgrade prompt, the rest clear.
const VIEW_CONTAINERS: Record<string, { name: string; ids: string[] }> = {
  positions: { name: 'Stats by position',      ids: ['position-table'] },
  cards:     { name: 'The starting-hand matrix', ids: ['matrix'] },
  sessions:  { name: 'Session tracking',        ids: ['session-chart', 'sessions-table'] },
  trends:    { name: 'Trend charts',            ids: ['trend-pct', 'trend-bb'] },
};

function renderLockedView(view: string): void {
  const spec = VIEW_CONTAINERS[view];
  if (!spec) return;
  spec.ids.forEach((id, i) => {
    document.getElementById(id)!.innerHTML = i === 0 ? upgradeHtml(spec.name) : '';
  });
}

function markLockedTabs(locked: Set<string>): void {
  document.querySelectorAll<HTMLElement>('.tab').forEach(t =>
    t.classList.toggle('locked', locked.has(t.dataset.view ?? '')));
}

// ── Orchestration ────────────────────────────────────────────────────────────

const bannerEl = document.getElementById('server-banner')!;

async function renderAll(): Promise<void> {
  // One message: the background uploads the filtered hands to the analysis
  // server and relays the tier-gated panel payload.
  const res = await send({
    type: 'get_panel_data', window: Number(trendWindowEl.value), filter: currentFilter(),
  });
  const data: PanelData = (res.ok ? res.panel : undefined)
    ?? emptyPanelData(Number(trendWindowEl.value));
  const locked = new Set(res.ok ? res.locked ?? [] : []);

  bannerEl.hidden = res.ok;
  if (!res.ok) bannerEl.textContent = `⚠ ${res.error}`;
  markLockedTabs(locked);

  lastStats = data.stats;
  hidePopover();   // examples may have changed with the filter
  renderSummary(data.stakeStats);
  renderChart(data.netSeries, data.evSeries);
  renderAdvanced(data.stats);
  renderLeaks(data.leaks);

  if (locked.has('positions')) renderLockedView('positions');
  else renderPositions(data.byPosition, data.stats);

  if (locked.has('cards')) renderLockedView('cards');
  else renderMatrix(data.matrix);

  allSessions = data.sessions;
  if (locked.has('sessions')) renderLockedView('sessions');
  else renderSessions();

  if (locked.has('trends')) renderLockedView('trends');
  else renderTrends(data.rolling);

  allHands = data.hands;
  renderHands();
  document.getElementById('replay')!.innerHTML = `<span class="empty">Select a hand to replay.</span>`;
}

// Signing in or out changes the tier, which changes what the server unlocks —
// refetch the panel on any auth change.
mountAccountChip(document.getElementById('account')!, () => void renderAll());
void initControls();
