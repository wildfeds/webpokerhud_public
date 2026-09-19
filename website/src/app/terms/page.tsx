import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/site';

export const metadata: Metadata = { title: 'Terms of Service' };

// Stub — replace with reviewed terms before launch (design.md §8 phase W5).
export default function Terms() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <p className="mt-2 text-sm text-felt-400">Draft — not yet in effect.</p>
      <p className="mt-8 leading-relaxed text-felt-200">
        Terms for using {SITE_NAME} will be published here before launch. Note
        that third-party poker platforms have their own terms regarding
        tracking tools; you are responsible for complying with the terms of any
        platform you play on.
      </p>
    </article>
  );
}
