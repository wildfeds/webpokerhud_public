'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, type Entitlement } from './supabase';
import { startCheckout, confirmOrder, type Plan } from './purchase';

const DAY_MS = 24 * 60 * 60 * 1000;

// Confirm polling: crypto confirmation takes minutes, not seconds.
const POLL_MS = 3000;
const POLL_BUDGET_MS = 5 * 60 * 1000;

type PurchaseState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'confirming' }
  | { kind: 'done' }
  | { kind: 'slow' }       // budget exhausted while still pending
  | { kind: 'error'; message: string };

export default function Account({ user }: { user: User }) {
  const [ent, setEnt] = useState<Entitlement | null | undefined>(undefined);
  const [purchase, setPurchase] = useState<PurchaseState>({ kind: 'idle' });
  const handledParams = useRef(false);

  const refreshEntitlement = useCallback(() => {
    if (!supabase) return;
    supabase
      .from('entitlements')
      .select('*')
      .maybeSingle()
      .then(({ data }) => setEnt(data ?? null));
  }, []);

  useEffect(refreshEntitlement, [refreshEntitlement]);

  const buy = useCallback(async (plan: Plan) => {
    setPurchase({ kind: 'starting' });
    try {
      window.location.href = await startCheckout(plan);
    } catch (err) {
      setPurchase({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  // Handle ?buy=month|year (from the pricing page) and ?order=<uuid> (back
  // from the payment page) once per mount, then clean the URL. The IPN
  // webhook fulfills; this poll just watches the purchases row flip.
  useEffect(() => {
    if (handledParams.current) return;
    handledParams.current = true;
    const params = new URLSearchParams(window.location.search);
    const buyParam = params.get('buy');
    const orderParam = params.get('order');
    if (!buyParam && !orderParam) return;
    window.history.replaceState(null, '', window.location.pathname);

    if (buyParam === 'month' || buyParam === 'year') {
      void buy(buyParam);
      return;
    }
    if (!orderParam) return;

    setPurchase({ kind: 'confirming' });
    const startedAt = Date.now();
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const result = await confirmOrder(orderParam);
        if (result.status === 'completed') {
          setPurchase({ kind: 'done' });
          refreshEntitlement();
          return;
        }
        if (result.status === 'failed' || result.status === 'partially_paid' || result.status === 'refunded') {
          setPurchase({
            kind: 'error',
            message:
              result.status === 'partially_paid'
                ? 'The payment arrived short. Contact support and we will sort it out.'
                : 'The payment did not complete. You were not charged.',
          });
          return;
        }
      } catch {
        // transient — keep polling within the budget
      }
      if (Date.now() - startedAt > POLL_BUDGET_MS) {
        setPurchase({ kind: 'slow' });
        return;
      }
      setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
    };
  }, [buy, refreshEntitlement]);

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
      <div className="flex items-center gap-4 rounded-lg border border-ink-800 bg-ink-900 p-5">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external avatar host
          <img
            src={avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="h-12 w-12 rounded-full"
          />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-600 text-lg font-semibold text-white">
            {displayName[0]?.toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-medium text-white">{displayName}</p>
          <p className="truncate text-sm text-ink-400">{user.email}</p>
        </div>
        <span
          className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${
            isPro ? 'bg-accent-500/15 text-accent-300' : 'bg-ink-800 text-ink-400'
          }`}
        >
          {isPro ? 'Pro' : 'Free'}
        </span>
      </div>

      <div className="rounded-lg border border-ink-800 bg-ink-900 p-5">
        <p className="text-sm text-ink-400">Plan</p>
        {ent === undefined ? (
          <p className="mt-1 text-ink-200">Loading…</p>
        ) : isPro ? (
          <>
            <p className="mt-1 font-medium text-white">
              Pro — {daysLeft} day{daysLeft === 1 ? '' : 's'} left
            </p>
            <p className="mt-1 text-sm text-ink-300">
              Expires {expires!.toLocaleDateString()}
            </p>
          </>
        ) : (
          <p className="mt-1 font-medium text-white">Free</p>
        )}

        {purchase.kind === 'starting' && (
          <p className="mt-3 text-sm text-ink-300">Opening checkout…</p>
        )}
        {purchase.kind === 'confirming' && (
          <p className="mt-3 text-sm text-ink-300">
            Confirming your payment… this usually takes a minute or two.
          </p>
        )}
        {purchase.kind === 'done' && (
          <p className="mt-3 text-sm font-medium text-accent-300">
            Payment received — your Pro time has been added. 🎉
          </p>
        )}
        {purchase.kind === 'slow' && (
          <p className="mt-3 text-sm text-ink-300">
            Still waiting on the network. Your time will be added automatically
            once the payment confirms — check back here later.
          </p>
        )}
        {purchase.kind === 'error' && (
          <p className="mt-3 text-sm text-red-400">{purchase.message}</p>
        )}

        {(purchase.kind === 'idle' || purchase.kind === 'error' || purchase.kind === 'done') && (
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={() => void buy('month')}
              className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-500"
            >
              {isPro ? 'Extend' : 'Get Pro'} — $2.99 / 30 days
            </button>
            <button
              onClick={() => void buy('year')}
              className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-ink-200 hover:bg-ink-800"
            >
              $29.99 / year
            </button>
          </div>
        )}
        <p className="mt-3 text-xs text-ink-400">
          Paid in crypto (USDC and more) via NOWPayments. Prepaid time — no
          card on file, no auto-renew.
        </p>
      </div>

      <button
        onClick={() => supabase?.auth.signOut()}
        className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-200 hover:bg-ink-800"
      >
        Sign out
      </button>
    </div>
  );
}
