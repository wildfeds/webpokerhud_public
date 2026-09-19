// Google sign-in via Supabase, owned by the background worker. Deliberately
// dependency-free (no supabase-js): the flow is chrome.identity's
// launchWebAuthFlow against Supabase's /auth/v1/authorize, tokens parsed from
// the redirect fragment and kept in chrome.storage.local, refreshed on
// demand. Popup and panel never touch tokens — they message the background
// (get_auth_state / sign_in / sign_out) and render the result.
//
// The user's tier lives in the Supabase `entitlements` table (RLS: each user
// reads their own row); the analysis server re-derives it from the same JWT,
// so the client-side value is display-only.
import { Tier } from './analysis/panel_types';

// Inlined at build time; blank in a checkout without .env (see .env.example),
// in which case sign-in reports "not configured" and everything else still
// works on the free tier.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const authConfigured = (): boolean => SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '';

const SESSION_KEY = 'auth_session';
// Refresh when the access token has less than this long to live.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface AuthUser {
  id:        string;
  email:     string;
  name:      string;
  avatarUrl: string | null;
}

// What the UI surfaces render; tier included so the popup/panel chip can show
// "Pro" without a second round-trip.
export interface AuthState {
  user: AuthUser;
  tier: Tier;
}

interface StoredSession {
  accessToken:  string;
  refreshToken: string;
  expiresAt:    number;   // Unix ms
  user:         AuthUser;
}

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

// Tokens from the OAuth redirect URL's fragment
// (https://<ext-id>.chromiumapp.org/#access_token=…&refresh_token=…&expires_in=…).
export function parseAuthCallback(
  url: string,
): { accessToken: string; refreshToken: string; expiresIn: number } | null {
  const hash = new URL(url).hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  const expiresIn = Number(params.get('expires_in') ?? 3600);
  return { accessToken, refreshToken, expiresIn: expiresIn > 0 ? expiresIn : 3600 };
}

// Supabase /auth/v1/user (or token-refresh `user`) payload → AuthUser.
// Google supplies full_name/name and avatar_url/picture in user_metadata.
export function userFromAuthPayload(body: unknown): AuthUser | null {
  const u = body as {
    id?: unknown; email?: unknown;
    user_metadata?: { full_name?: unknown; name?: unknown; avatar_url?: unknown; picture?: unknown };
  };
  if (typeof u?.id !== 'string') return null;
  const email = typeof u.email === 'string' ? u.email : '';
  const meta = u.user_metadata ?? {};
  const name = [meta.full_name, meta.name].find(v => typeof v === 'string' && v !== '') as string
    ?? (email ? email.split('@')[0]! : 'Account');
  const avatar = [meta.avatar_url, meta.picture].find(v => typeof v === 'string' && v !== '');
  return { id: u.id, email, name, avatarUrl: typeof avatar === 'string' ? avatar : null };
}

// Effective tier from an entitlements row: pro only while unexpired.
export function effectiveTier(
  plan: string | null | undefined, expiresAt: string | null | undefined, now = Date.now(),
): Tier {
  if (plan !== 'pro') return 'free';
  if (expiresAt == null) return 'pro';
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t > now ? 'pro' : 'free';
}

export function needsRefresh(expiresAt: number, now = Date.now()): boolean {
  return expiresAt - now < REFRESH_MARGIN_MS;
}

// ── Session storage ──────────────────────────────────────────────────────────

async function readSession(): Promise<StoredSession | null> {
  const stored = await chrome.storage.local.get(SESSION_KEY);
  return (stored[SESSION_KEY] as StoredSession | undefined) ?? null;
}

async function writeSession(session: StoredSession | null): Promise<void> {
  if (session) await chrome.storage.local.set({ [SESSION_KEY]: session });
  else await chrome.storage.local.remove(SESSION_KEY);
}

// ── Supabase HTTP ────────────────────────────────────────────────────────────

function authHeaders(accessToken?: string): Record<string, string> {
  return {
    apikey: SUPABASE_ANON_KEY,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

async function fetchUser(accessToken: string): Promise<AuthUser | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: authHeaders(accessToken) });
  if (!res.ok) return null;
  return userFromAuthPayload(await res.json());
}

async function refreshSession(session: StoredSession): Promise<StoredSession | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  });
  if (!res.ok) return null;   // refresh token revoked/expired → signed out
  const body = await res.json() as {
    access_token?: string; refresh_token?: string; expires_in?: number; user?: unknown;
  };
  if (!body.access_token || !body.refresh_token) return null;
  return {
    accessToken:  body.access_token,
    refreshToken: body.refresh_token,
    expiresAt:    Date.now() + (body.expires_in ?? 3600) * 1000,
    user:         userFromAuthPayload(body.user) ?? session.user,
  };
}

async function fetchTier(accessToken: string): Promise<Tier> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/entitlements?select=plan,expires_at`,
      { headers: authHeaders(accessToken) });
    if (!res.ok) return 'free';
    const rows = await res.json() as { plan?: string; expires_at?: string | null }[];
    const row = Array.isArray(rows) ? rows[0] : undefined;
    return effectiveTier(row?.plan, row?.expires_at);
  } catch {
    return 'free';
  }
}

// ── Flows (called from the background message handlers) ─────────────────────

// Valid access token for API calls (refreshing if stale), or null when
// signed out. The analysis server derives the tier from this token.
export async function getAccessToken(): Promise<string | null> {
  if (!authConfigured()) return null;
  let session = await readSession();
  if (!session) return null;
  if (needsRefresh(session.expiresAt)) {
    session = await refreshSession(session);
    await writeSession(session);
  }
  return session?.accessToken ?? null;
}

export async function getAuthState(): Promise<AuthState | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const session = (await readSession())!;
  return { user: session.user, tier: await fetchTier(token) };
}

// Interactive Google sign-in. Throws with a user-facing message on failure
// (the background relays it as { ok: false, error }).
export async function signIn(): Promise<AuthState> {
  if (!authConfigured()) {
    throw new Error('Sign-in is not configured in this build (set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — see .env.example).');
  }
  const redirect = chrome.identity.getRedirectURL();
  const authorize = `${SUPABASE_URL}/auth/v1/authorize` +
    `?provider=google&redirect_to=${encodeURIComponent(redirect)}`;

  const callback = await chrome.identity.launchWebAuthFlow({ url: authorize, interactive: true });
  const tokens = callback ? parseAuthCallback(callback) : null;
  if (!tokens) throw new Error('Sign-in was cancelled or the response had no tokens.');

  const user = await fetchUser(tokens.accessToken);
  if (!user) throw new Error('Signed in, but fetching the user profile failed.');

  await writeSession({
    accessToken:  tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt:    Date.now() + tokens.expiresIn * 1000,
    user,
  });
  return { user, tier: await fetchTier(tokens.accessToken) };
}

export async function signOut(): Promise<void> {
  const session = await readSession();
  if (session) {
    // Best-effort server-side revoke; local sign-out succeeds regardless.
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST', headers: authHeaders(session.accessToken),
      });
    } catch { /* offline is fine */ }
  }
  await writeSession(null);
}
