// Runs in MAIN world — has direct access to window globals.
// Hooks WebSocket before the poker app connects, filters for the RGS
// game endpoint, strips Atmosphere framing, unwraps the seq/tDiff envelope,
// and forwards each game event to the content script via window.postMessage.

import { HUD_MESSAGE_SOURCE, RGS_URL_FRAGMENT } from './constants';

export interface BovadaEvent {
  pid?: string;
  gid?: string;
  [key: string]: unknown;
}

interface ServerEnvelope {
  seq?: number;
  tDiff?: number;
  data?: BovadaEvent | BovadaEvent[];
}

function parseFrame(raw: string): BovadaEvent[] {
  const match = raw.match(/^\d+\|(.+)$/s);
  const payload = match ? match[1] : raw;

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return [];
  }

  const envelope = parsed as ServerEnvelope;
  if (envelope.data !== undefined) {
    return Array.isArray(envelope.data) ? envelope.data : [envelope.data];
  }
  return [parsed as BovadaEvent];
}

// ── WebSocket hook (Proxy approach) ────────────────────────────────────────
// We use a Proxy on the constructor rather than subclassing NativeWebSocket.
// The Atmosphere library uses its own class extension of WebSocket; stacking
// our subclass on top caused the connection to fail (double construct chain).
// A Proxy intercepts `new WebSocket(...)` while returning a genuine native
// WebSocket instance, so Atmosphere's wrapping and instanceof checks all work.

const NativeWebSocket = window.WebSocket;

window.WebSocket = new Proxy(NativeWebSocket, {
  construct(Target, [url, protocols]: [string | URL, (string | string[])?]) {
    const ws = protocols !== undefined
      ? new Target(url, protocols)
      : new Target(url);

    const urlStr = (url as { toString(): string }).toString();
    console.log('[BovadaHUD] WebSocket created:', urlStr);

    if (urlStr.includes(RGS_URL_FRAGMENT)) {
      console.log('[BovadaHUD] RGS WebSocket hooked');
      ws.addEventListener('message', (event: MessageEvent<string>) => {
        const events = parseFrame(event.data);
        for (const msg of events) {
          window.postMessage({ source: HUD_MESSAGE_SOURCE, msg }, '*');
        }
      });
    }

    return ws;
  },
}) as unknown as typeof WebSocket;

console.log('[BovadaHUD] WebSocket hook installed');
