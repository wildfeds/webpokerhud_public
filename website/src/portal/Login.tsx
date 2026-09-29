'use client';

import { useState } from 'react';
import { supabase } from './supabase';

type Status = 'idle' | 'redirecting' | 'error';

export default function Login() {
  const [status, setStatus] = useState<Status>('idle');

  async function signIn() {
    if (!supabase) return;
    setStatus('redirecting');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/account/` },
    });
    // On success the browser navigates away; reaching here means it failed.
    if (error) setStatus('error');
  }

  return (
    <div className="flex max-w-md flex-col gap-3">
      <p className="text-ink-200">
        Sign in with your Google account — no passwords, ever.
      </p>
      <button
        onClick={signIn}
        disabled={status === 'redirecting'}
        className="flex items-center justify-center gap-3 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-ink-200 disabled:opacity-50"
      >
        {/* Google "G" */}
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.4 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.4 5.8c4.4-4.1 7.2-10.1 7.2-17.5z" />
          <path fill="#FBBC05" d="M10.4 28.7a14.5 14.5 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z" />
          <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.4-5.8c-2 1.4-4.7 2.3-7.8 2.3-6.3 0-11.7-3.9-13.6-9.3l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
        </svg>
        {status === 'redirecting' ? 'Redirecting…' : 'Sign in with Google'}
      </button>
      {status === 'error' && (
        <p className="text-sm text-red-400">Couldn&apos;t start sign-in — try again.</p>
      )}
    </div>
  );
}
