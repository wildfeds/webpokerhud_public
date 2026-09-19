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
      <p className="rounded-lg bg-felt-800 px-4 py-3 text-felt-100">
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
        className="flex-1 rounded-lg border border-felt-700 bg-felt-900 px-4 py-2.5 text-white placeholder-felt-400 outline-none focus:border-felt-400"
      />
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="rounded-lg bg-felt-500 px-5 py-2.5 font-semibold text-white hover:bg-felt-400 disabled:opacity-50"
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
