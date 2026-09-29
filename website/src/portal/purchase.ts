// Purchase flow client (docs/PURCHASES.md): the analysis server owns prices and
// talks to the payment provider; the portal just starts a checkout and polls
// for confirmation. Auth is the caller's Supabase JWT.
import { supabase } from './supabase';

// Default to the hosted API so a production build without the env var can
// never point at localhost; dev overrides via .env.local.
const SERVER_URL = (
  process.env.NEXT_PUBLIC_ANALYSIS_SERVER_URL ?? 'https://api.webpokerhud.com'
).replace(/\/$/, '');

export type Plan = 'month' | 'year';

export interface ConfirmResult {
  status: 'pending' | 'completed' | 'partially_paid' | 'refunded' | 'failed';
  plan: 'free' | 'pro';
  expiresAt: string | null;
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const token = supabase
    ? (await supabase.auth.getSession()).data.session?.access_token
    : null;
  if (!token) throw new Error('Sign in first.');
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || data?.ok !== true) {
    throw new Error(typeof data?.error === 'string' ? data.error : `HTTP ${res.status}`);
  }
  return data;
}

// Starts a checkout; resolves to the hosted payment page URL.
export async function startCheckout(plan: Plan): Promise<string> {
  const data = await post('/v1/purchase/checkout', { plan });
  return data.url as string;
}

export async function confirmOrder(orderId: string): Promise<ConfirmResult> {
  const data = await post('/v1/purchase/confirm', { orderId });
  return {
    status: data.status as ConfirmResult['status'],
    plan: data.plan as ConfirmResult['plan'],
    expiresAt: (data.expiresAt as string | null) ?? null,
  };
}
