import type { Metadata } from 'next';
import { SITE_NAME, SUPPORT_EMAIL } from '@/lib/site';

export const metadata: Metadata = { title: 'Privacy Policy' };

// Stub — replace with the reviewed policy before Chrome Web Store submission
// (design.md §8 phase W5; roadmap §7).
export default function Privacy() {
  return (
    <article className="prose-invert mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-felt-400">Draft — not yet in effect.</p>
      <div className="mt-8 space-y-4 leading-relaxed text-felt-200">
        <p>
          <strong className="text-white">Free tier:</strong> {SITE_NAME} stores
          your hand data locally in your browser (IndexedDB). We operate no
          servers for the free tier and collect no personal data — no account
          is required.
        </p>
        <p>
          <strong className="text-white">Accounts:</strong> if you create an
          account, we store your email address and subscription state, and
          nothing else.
        </p>
        <p>
          <strong className="text-white">Pro analysis:</strong> hands are
          uploaded only when you explicitly request analysis. You can delete
          all server-side data from your account page at any time.
        </p>
        <p>
          Questions: <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </p>
      </div>
    </article>
  );
}
