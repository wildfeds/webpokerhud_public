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
  'Full analysis panel over your local data',
  'One-click JSONL/JSON export, open format',
  '100% local — no account, no servers',
];

const pro = [
  'Everything in Free',
  'Server-side hand review & session reports',
  'Leak detection',
  'Opponent pool insights (coming)',
  'Priority support',
];

function Check() {
  return <span className="mr-2 text-felt-400">✓</span>;
}

export default function Pricing() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <h1 className="text-center text-3xl font-bold">Pricing</h1>
      <p className="mx-auto mt-3 max-w-xl text-center text-felt-200">
        {SITE_NAME} is free to use, forever. Pro adds server-side analysis,
        paid as <strong>prepaid time</strong> — no card on file, no auto-renew.
      </p>

      <div className="mx-auto mt-12 grid max-w-3xl gap-6 sm:grid-cols-2">
        <div className="rounded-xl border border-felt-800 bg-felt-900 p-6">
          <h2 className="text-xl font-bold">Free</h2>
          <p className="mt-2 text-3xl font-extrabold">$0</p>
          <ul className="mt-6 space-y-2.5 text-sm text-felt-200">
            {free.map((f) => (
              <li key={f}><Check />{f}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border-2 border-felt-500 bg-felt-900 p-6">
          <h2 className="text-xl font-bold">Pro</h2>
          <p className="mt-2 text-3xl font-extrabold">
            ${MONTHLY}
            <span className="text-base font-normal text-felt-300">/month</span>
          </p>
          <p className="text-sm text-felt-300">or ${ANNUAL}/year</p>
          <ul className="mt-6 space-y-2.5 text-sm text-felt-200">
            {pro.map((f) => (
              <li key={f}><Check />{f}</li>
            ))}
          </ul>
          <Link
            href="/account/"
            className="mt-6 block rounded-lg bg-felt-500 px-5 py-2.5 text-center font-semibold text-white hover:bg-felt-400"
          >
            Get Pro
          </Link>
        </div>
      </div>

      <div className="mx-auto mt-12 max-w-2xl space-y-4 text-sm text-felt-300">
        <p>
          <strong className="text-felt-100">Prepaid time, not a subscription trap.</strong>{' '}
          You pay for 1 or 12 months up front (USDC). When it runs out, nothing
          renews and nothing is charged — we email you a reminder and you top
          up if you want to.
        </p>
        <p>
          <strong className="text-felt-100">Why crypto?</strong> Card processors
          treat poker tools as high-risk. USDC keeps the product independent of
          processor policy — and most of our users have it already.
        </p>
      </div>
    </div>
  );
}
