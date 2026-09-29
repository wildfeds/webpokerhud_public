'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import Account from './Account';
import Login from './Login';
import { supabase } from './supabase';

// Portal state machine: loading → login | account. Auth is entirely
// browser-side (magic link + RLS), so this works under static export
// (design.md §3, §5).
export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    if (!supabase) {
      setUser(null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!supabase) {
    return (
      <p className="rounded-lg bg-ink-800 px-4 py-3 text-ink-200">
        Accounts aren&apos;t available on this deployment yet.
      </p>
    );
  }
  if (user === undefined) return <p className="text-ink-300">Loading…</p>;
  return user ? <Account user={user} /> : <Login />;
}
