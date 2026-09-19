// Link to the (closed-source) analysis server. The Analysis Panel's views are
// computed there: the background uploads the filtered hands to POST /v1/panel
// and relays the response. The server derives the caller's tier from the
// Supabase JWT it sends along (signed out → free: Overview + Hands).
//
// The URL has no UI — it defaults to local dev and becomes the hosted API at
// launch; setServerUrl exists for dev overrides from the service-worker
// console.
import { Hand } from './model';
import { PanelData, Tier } from './analysis/panel_types';

// Local dev default; becomes the hosted API URL at launch.
export const DEFAULT_ANALYSIS_SERVER_URL = 'http://localhost:8787';

const STORAGE_KEY = 'analysis_server_url';

export async function getServerUrl(): Promise<string> {
  const stored = await chrome.storage.local.get({ [STORAGE_KEY]: DEFAULT_ANALYSIS_SERVER_URL });
  return String(stored[STORAGE_KEY] || DEFAULT_ANALYSIS_SERVER_URL);
}

export async function setServerUrl(url: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: url.trim() || DEFAULT_ANALYSIS_SERVER_URL });
}

export interface PanelFetchResult {
  tier:   Tier;
  locked: string[];   // view names the server withheld for this tier
  panel:  PanelData;
}

// POST the filtered hands to /v1/panel and return the server-computed panel.
// accessToken is the Supabase JWT (null when signed out). Throws with a
// user-facing message when the server is unreachable or errors; the
// background relays that as { ok: false, error }.
export async function fetchPanelData(
  hands: Hand[], window: number, accessToken: string | null = null, timeoutMs = 30_000,
): Promise<PanelFetchResult> {
  const url = await getServerUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(`${url.replace(/\/$/, '')}/v1/panel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ window, hands }),
        signal: controller.signal,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Analysis server unreachable at ${url} (${detail}). ` +
        `Start it with \`npm run dev\` in webpokerhud-server.`);
    }
    const body: unknown = await res.json().catch(() => null);
    const b = body as { ok?: unknown; error?: unknown; tier?: unknown; locked?: unknown; panel?: unknown };
    if (!res.ok || b?.ok !== true || typeof b.panel !== 'object' || b.panel === null) {
      const detail = typeof b?.error === 'string' ? b.error : `HTTP ${res.status}`;
      throw new Error(`Analysis server error: ${detail}`);
    }
    return {
      tier:   b.tier === 'pro' ? 'pro' : 'free',
      locked: Array.isArray(b.locked) ? b.locked.filter((v): v is string => typeof v === 'string') : [],
      panel:  b.panel as PanelData,
    };
  } finally {
    clearTimeout(timer);
  }
}
