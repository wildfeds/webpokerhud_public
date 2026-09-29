import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME } from '@/lib/site';

export const metadata: Metadata = { title: 'Pricing' };

// Opening price point per roadmap §5 (~$10–15/mo, ~$99/yr) — placeholder
// until the market check lands.
const MONTHLY = 2.99;
const ANNUAL = 29.99;

const free = [
  'Live HUD overlay with real-time stats',
  'Automatic hand tracking (hero + opponents)',
  'Popup stat viewer & net-winnings graph',
  'Analysis overview: stats, winnings & EV charts, leak highlights',
  'Hand-history browser with street-by-street replays',
  'Hand export & import in pure JSON — your data is always yours',
  '100% local tracking — no account needed',
];

const pro = [
  'Everything in Free',
  'Position stats, starting-hand matrix, sessions & trends',
  'Big pots, big wins & big losses shortcuts in the hand history',
  'Opponent pool insights (coming)',
  'Priority support',
];

function Check() {
  return <span className="mr-2 text-accent-400">✓</span>;
}

export default function Pricing() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <h1 className="text-center text-3xl font-bold">Pricing</h1>
      <p className="mx-auto mt-3 max-w-xl text-center text-ink-200">
        {SITE_NAME} is free to use, forever. Pro adds server-side analysis,
        paid as <strong>prepaid time</strong> — no card on file, no auto-renew.
      </p>

      <div className="mx-auto mt-12 grid max-w-3xl gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-ink-800 bg-ink-900/40 p-6">
          <h2 className="text-lg font-medium text-white">Free</h2>
          <p className="mt-2 text-3xl font-semibold tracking-tight">$0</p>
          <ul className="mt-6 space-y-2.5 text-sm text-ink-200">
            {free.map((f) => (
              <li key={f}><Check />{f}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-accent-500/50 bg-ink-900/40 p-6 ring-1 ring-accent-500/20">
          <h2 className="text-lg font-medium text-white">Pro</h2>
          <p className="mt-2 text-3xl font-semibold tracking-tight">
            ${MONTHLY}
            <span className="text-base font-normal text-ink-300">/month</span>
          </p>
          <p className="text-sm text-ink-300">
            or{' '}
            <Link href="/account/?buy=year" className="underline decoration-ink-600 underline-offset-2 hover:text-ink-100">
              ${ANNUAL}/year
            </Link>
          </p>
          <ul className="mt-6 space-y-2.5 text-sm text-ink-200">
            {pro.map((f) => (
              <li key={f}><Check />{f}</li>
            ))}
          </ul>
          <Link
            href="/account/?buy=month"
            className="mt-6 block rounded-full bg-white px-5 py-2.5 text-center text-sm font-semibold text-ink-950 transition-colors hover:bg-ink-200"
          >
            Get Pro
          </Link>
        </div>
      </div>

      <div className="mx-auto mt-12 max-w-2xl space-y-4 text-sm text-ink-300">
        <p>
          <strong className="text-ink-100">Prepaid time, not a subscription trap.</strong>{' '}
          You pay for 1 or 12 months up front (USDC). When it runs out, nothing
          renews and nothing is charged — we email you a reminder and you top
          up if you want to.
        </p>
        <p>
          <strong className="text-ink-100">Why crypto?</strong> Card processors
          treat poker tools as high-risk. USDC keeps the product independent of
          processor policy — and most of our users have it already.
        </p>
      </div>
    </div>
  );
}
