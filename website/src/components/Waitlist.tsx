'use client';

import { useState } from 'react';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type Status = 'idle' | 'submitting' | 'done' | 'error';

// Inserts into the `waitlist` table via Supabase's REST endpoint under an
// insert-only anonymous RLS policy (design.md §5 "Waitlist"). No SDK needed
// for a single POST.
export default function Waitlist() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setStatus('error');
      return;
    }
    setStatus('submitting');
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/waitlist`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ email }),
      });
      // 409 = duplicate email; treat as success from the user's perspective.
      setStatus(res.ok || res.status === 409 ? 'done' : 'error');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'done') {
    return (
      <p className="rounded-full border border-ink-800 bg-ink-900 px-5 py-3 text-sm text-ink-100">
        You&apos;re on the list — we&apos;ll email you at launch.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="flex-1 rounded-full border border-ink-700 bg-ink-900 px-5 py-2.5 text-sm text-white placeholder-ink-400 outline-none transition-colors focus:border-accent-400"
      />
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-ink-200 disabled:opacity-50"
      >
        {status === 'submitting' ? 'Joining…' : 'Join the waitlist'}
      </button>
      {status === 'error' && (
        <p className="text-sm text-red-400 sm:basis-full">
          Couldn&apos;t sign you up right now — please try again later.
        </p>
      )}
    </form>
  );
}
