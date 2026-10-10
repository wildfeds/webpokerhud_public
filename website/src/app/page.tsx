import Waitlist from '@/components/Waitlist';
import {
  CHROME_SIDELOAD_URL, FIREFOX_ADDON_URL, LAUNCHED, SITE_NAME, VERSION,
} from '@/lib/site';

const features = [
  {
    title: 'Live HUD overlay',
    body: 'Real-time stats rendered directly over the table — VPIP, PFR, 3-bet and more, updating as hands play out.',
  },
  {
    title: 'Hero & opponent tracking',
    body: 'Every hand you play is captured and tracked automatically. No hand-history imports, no folder watching.',
  },
  {
    title: 'Winnings graph',
    body: 'A cumulative net-winnings graph across all your sessions, one click from the toolbar.',
  },
  {
    title: 'Your data stays local',
    body: 'The free tier is 100% client-side. Hands live in your browser and never touch our servers.',
  },
  {
    title: 'Hand history converter',
    body: 'Export every hand in PokerStars format for PokerTracker 4, Hand2Note or Holdem Manager — or as JSONL in an open, documented format. No 24-hour wait.',
  },
  {
    title: 'Pro analysis',
    body: 'Optional subscription adds a full analysis panel: hand review, session reports and leak detection.',
  },
];

// What this release explicitly supports vs. what is on the way — shown on
// the landing page so nobody installs expecting more than v1.0 delivers.
const supportedNow = [
  'Bovada cash games — No-Limit Hold’em',
  '6-max tables: full HUD, per-seat stat chips, position stats',
  'Multi-tabling — every table gets its own HUD',
  'Analysis panel: overview, hand history with replays, JSON export/import',
  'Hand history converter: PokerStars-format export for PokerTracker 4, Hand2Note, Holdem Manager',
  'Firefox on desktop (128 or newer) — one-click install from Firefox Add-ons',
  'Chrome on desktop — manual install (see below)',
];

const comingNext = [
  '9-max tables (hands already tracked; HUD layout being finished)',
  'Tournaments and fast-fold formats',
  'More poker sites — the connector layer is platform-agnostic by design',
];

const shots = [
  {
    src: '/media/hud-multitable.webp',
    alt: 'Four poker tables tiled in one window, each with live HUD stats and its own HUD panel',
    caption: 'Multi-tabling? Every table gets its own HUD — four at once, every seat tracked.',
    wide: true,
  },
  {
    src: '/media/popup.webp',
    alt: 'The toolbar popup showing hero stats and a net-winnings graph',
    caption: 'The toolbar popup: your core stats and winnings graph, one click away.',
  },
  {
    src: '/media/analysis-overview.webp',
    alt: 'Analysis overview with bankroll graph, all-in EV line, full stat grid and leak highlights',
    caption: 'The analysis panel: winnings vs. all-in EV, a full stat grid, and automatic leak highlights.',
  },
  {
    src: '/media/pro-cards.webp',
    alt: 'Starting-hand matrix colored by net result for every hole-card combination',
    caption: 'Pro: the starting-hand matrix — see which hole cards actually make you money.',
  },
  {
    src: '/media/pro-trend.webp',
    alt: 'Rolling VPIP/PFR and bb/100 trend charts',
    caption: 'Pro: rolling VPIP / PFR and bb/100 trends to catch your game drifting.',
  },
  {
    src: '/media/pro-position.webp',
    alt: 'Stats broken down by table position',
    caption: 'Pro: every stat split by position, from UTG to the big blind.',
    wide: true,
  },
];

export default function Home() {
  return (
    <>
      <section className="relative mx-auto max-w-5xl overflow-x-clip px-4 pt-24 pb-20 text-center">
        {/* Soft accent glow behind the hero. A pre-blurred radial gradient,
            not filter:blur() — large blur radii are pathologically slow on
            iOS Safari. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-96 max-w-2xl bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.16),transparent_65%)]"
        />
        <p className="relative mx-auto inline-flex items-center gap-2 rounded-full border border-ink-800 bg-ink-900/60 px-3.5 py-1.5 text-xs font-medium text-ink-300">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
          v{VERSION} · Free, open-source Firefox extension
        </p>
        <h1 className="relative mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">
          A free HUD for Bovada.{' '}
          <span className="bg-gradient-to-r from-accent-300 to-accent-500 bg-clip-text text-transparent">
            In your browser.
          </span>
        </h1>
        <p className="relative mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-300">
          {SITE_NAME} overlays live stats on your Bovada table, keeps every
          hand you play on your own machine, and converts your history to
          PokerStars format for PokerTracker or Hand2Note — free and open
          source. Only the deeper server-side analysis costs anything.
        </p>
        <div className="relative mt-10 flex flex-col items-center gap-3">
          {LAUNCHED ? (
            <>
              <a
                href={FIREFOX_ADDON_URL}
                className="rounded-full bg-white px-7 py-3 text-sm font-semibold text-ink-950 transition-colors hover:bg-ink-200"
              >
                Add to Firefox — it&apos;s free
              </a>
              <a href="#chrome" className="text-sm text-ink-400 underline-offset-4 hover:text-ink-200 hover:underline">
                Using Chrome? Manual install ↓
              </a>
            </>
          ) : (
            <Waitlist />
          )}
        </div>
        <div className="relative mx-auto mt-16 max-w-3xl overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/60">
          <img
            src="/media/hud-table.webp"
            alt="A live Bovada table with WebPokerHud seat stats over every player and the HUD panel open"
            width={1643}
            height={1007}
            fetchPriority="high"
          />
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-ink-800 bg-ink-900/40 p-6 transition-colors hover:border-ink-700"
            >
              <h2 className="text-[15px] font-medium text-white">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-300">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl border-t border-ink-800/70 px-4 py-20">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-white">
          What v{VERSION} supports
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-ink-300">
          We&apos;d rather be explicit than surprising: here is exactly what
          this release covers, and what ships next.
        </p>
        <div className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-ink-800 bg-ink-900/40 p-6">
            <h3 className="text-[15px] font-medium text-white">
              Supported in v{VERSION}
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-ink-300">
              {supportedNow.map((s) => (
                <li key={s}>
                  <span className="mr-2 text-accent-400">✓</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-ink-800 bg-ink-900/40 p-6">
            <h3 className="text-[15px] font-medium text-white">Coming next</h3>
            <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-ink-300">
              {comingNext.map((s) => (
                <li key={s}>
                  <span className="mr-2 text-ink-500">→</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="chrome" className="mx-auto max-w-3xl border-t border-ink-800/70 px-4 py-20">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-white">
          Using Chrome?
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-ink-300">
          The Chrome Web Store does not list tools that run on poker sites, so
          on Chrome {SITE_NAME} installs manually. It takes about a minute and
          the extension works exactly the same.
        </p>
        <ol className="mx-auto mt-8 max-w-xl list-decimal space-y-3 pl-6 text-sm leading-relaxed text-ink-300">
          <li>
            Download the latest{' '}
            <a href={CHROME_SIDELOAD_URL} className="text-accent-300 underline-offset-4 hover:underline">
              Chrome release zip
            </a>{' '}
            and unzip it somewhere you will keep it (the folder must stay in place).
          </li>
          <li>
            Open <code className="rounded bg-ink-800 px-1.5 py-0.5 text-ink-100">chrome://extensions</code>{' '}
            and switch on <strong className="text-ink-100">Developer mode</strong> (top right).
          </li>
          <li>
            Click <strong className="text-ink-100">Load unpacked</strong> and choose the unzipped folder.
          </li>
        </ol>
        <p className="mx-auto mt-6 max-w-xl text-center text-xs text-ink-500">
          Chrome shows a “developer mode extensions” notice on startup for
          manually installed extensions — that is expected. Updates: download
          the new release and repeat step 3 on the same folder.
        </p>
      </section>

      <section className="mx-auto max-w-5xl border-t border-ink-800/70 px-4 py-20">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-white">
          See it in action
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {shots.map((s) => (
            <figure
              key={s.src}
              className={`overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/40 ${
                s.wide ? 'sm:col-span-2' : ''
              }`}
            >
              <img src={s.src} alt={s.alt} loading="lazy" className="w-full" />
              <figcaption className="px-4 py-3 text-sm text-ink-300">{s.caption}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl border-t border-ink-800/70 px-4 py-20 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-white">
          Private by architecture, not by promise
        </h2>
        <p className="mt-4 leading-relaxed text-ink-300">
          The free tier has no account, no sign-up and no server. The client is
          open source, so you can verify that yourself. Hands are only ever
          uploaded when a Pro subscriber explicitly asks for server-side
          analysis — and the data format is public, so you can always take your
          hands elsewhere.
        </p>
      </section>
    </>
  );
}
