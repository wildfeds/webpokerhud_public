import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// null when the env isn't configured (e.g. a preview deploy before the
// Supabase project exists) — the portal renders a notice instead of crashing.
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export interface Entitlement {
  user_id: string;
  plan: 'free' | 'pro';
  expires_at: string | null;
  updated_at: string;
}
