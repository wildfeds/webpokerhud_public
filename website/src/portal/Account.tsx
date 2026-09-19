'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, type Entitlement } from './supabase';

const DAY_MS = 24 * 60 * 60 * 1000;

export default function Account({ user }: { user: User }) {
  const [ent, setEnt] = useState<Entitlement | null | undefined>(undefined);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('entitlements')
      .select('*')
      .maybeSingle()
      .then(({ data }) => setEnt(data ?? null));
  }, []);

  const expires = ent?.expires_at ? new Date(ent.expires_at) : null;
  const daysLeft = expires ? Math.ceil((expires.getTime() - Date.now()) / DAY_MS) : null;
  const isPro = ent?.plan === 'pro' && daysLeft !== null && daysLeft > 0;

  // Google supplies name + avatar in user_metadata (see supabase profiles
  // trigger, which mirrors them into the profiles table).
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    user.email ||
    'Account';
  const avatarUrl =
    (typeof meta.avatar_url === 'string' && meta.avatar_url) ||
    (typeof meta.picture === 'string' && meta.picture) ||
    null;

  return (
    <div className="max-w-md space-y-6">
      <div className="flex items-center gap-4 rounded-lg border border-felt-800 bg-felt-900 p-5">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external avatar host
          <img
            src={avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="h-12 w-12 rounded-full"
          />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-felt-500 text-lg font-semibold text-white">
            {displayName[0]?.toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-medium text-white">{displayName}</p>
          <p className="truncate text-sm text-felt-400">{user.email}</p>
        </div>
        <span
          className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${
            isPro ? 'bg-felt-500/20 text-felt-300' : 'bg-felt-800 text-felt-400'
          }`}
        >
          {isPro ? 'Pro' : 'Free'}
        </span>
      </div>

      <div className="rounded-lg border border-felt-800 bg-felt-900 p-5">
        <p className="text-sm text-felt-400">Plan</p>
        {ent === undefined ? (
          <p className="mt-1 text-felt-200">Loading…</p>
        ) : isPro ? (
          <>
            <p className="mt-1 font-medium text-white">
              Pro — {daysLeft} day{daysLeft === 1 ? '' : 's'} left
            </p>
            <p className="mt-1 text-sm text-felt-300">
              Expires {expires!.toLocaleDateString()}
            </p>
          </>
        ) : (
          <p className="mt-1 font-medium text-white">Free</p>
        )}
        {/* Checkout lands in phase W4 (design.md §8). */}
        <p className="mt-3 text-sm text-felt-300">
          {isPro && daysLeft !== null && daysLeft <= 14
            ? 'Renewal opens soon — payments are not live yet.'
            : 'Pro subscriptions open soon.'}
        </p>
      </div>

      <button
        onClick={() => supabase?.auth.signOut()}
        className="rounded-lg border border-felt-700 px-4 py-2 text-sm text-felt-200 hover:bg-felt-800"
      >
        Sign out
      </button>
    </div>
  );
}
