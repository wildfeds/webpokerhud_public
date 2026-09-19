import Waitlist from '@/components/Waitlist';
import { CHROME_STORE_URL, LAUNCHED, SITE_NAME } from '@/lib/site';

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
    title: 'One-click export',
    body: 'Your hands are yours: export everything as JSONL/JSON in an open, documented format at any time.',
  },
  {
    title: 'Pro analysis',
    body: 'Optional subscription adds a full analysis panel: hand review, session reports and leak detection.',
  },
];

export default function Home() {
  return (
    <>
      <section className="mx-auto max-w-5xl px-4 py-20 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
          Know your table. <span className="text-felt-300">In real time.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-felt-200">
          {SITE_NAME} is a Chrome extension that overlays live stats on your
          poker table — hands tracked automatically, winnings graphed, and in
          the free tier your data never leaves your machine.
        </p>
        <div className="mt-8 flex justify-center">
          {LAUNCHED ? (
            <a
              href={CHROME_STORE_URL}
              className="rounded-lg bg-felt-500 px-6 py-3 font-semibold text-white hover:bg-felt-400"
            >
              Add to Chrome — it&apos;s free
            </a>
          ) : (
            <Waitlist />
          )}
        </div>
        {/* Placeholder for the HUD capture GIF (design.md §9) */}
        <div className="mx-auto mt-14 flex aspect-video max-w-3xl items-center justify-center rounded-xl border border-felt-800 bg-felt-900 text-felt-400">
          HUD demo capture coming soon
        </div>
      </section>

      <section className="border-t border-felt-800 bg-felt-900/50">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-16 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title}>
              <h2 className="font-semibold text-white">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-felt-200">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h2 className="text-2xl font-bold">Private by architecture, not by promise</h2>
        <p className="mt-4 leading-relaxed text-felt-200">
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
