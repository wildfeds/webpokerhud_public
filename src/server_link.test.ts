import { describe, it, expect, vi, afterEach } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { fetchPanelData } from './server_link';
import { emptyPanelData } from './analysis/panel_types';

// Uploads are gzipped (Content-Encoding: gzip) when CompressionStream exists,
// which it does under Node — decode what the stub captured.
function decodeBody(init: RequestInit): unknown {
  const enc = (init.headers as Record<string, string>)['Content-Encoding'];
  const body = init.body as ArrayBuffer | string;
  const text = enc === 'gzip'
    ? gunzipSync(Buffer.from(body as ArrayBuffer)).toString('utf8')
    : String(body);
  return JSON.parse(text);
}

afterEach(() => vi.unstubAllGlobals());

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>): void {
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => impl(url, init)));
}

// chrome.storage.local with stored values (the object-with-defaults form of
// get, as server_link uses it).
function stubChrome(values: Record<string, unknown>): void {
  vi.stubGlobal('chrome', {
    storage: { local: { get: (defaults: Record<string, unknown>) =>
      Promise.resolve({ ...defaults, ...values }) } },
  });
}

describe('fetchPanelData', () => {
  it('POSTs hands to /v1/panel with the Supabase JWT and parses the response', async () => {
    stubChrome({ analysis_server_url: 'http://srv:1/' });
    let requested = '';
    let init: RequestInit | undefined;
    const panel = emptyPanelData(100);
    stubFetch((url, i) => {
      requested = url; init = i;
      return Promise.resolve(new Response(JSON.stringify({
        ok: true, tier: 'pro', locked: [], skipped: 0, panel,
      })));
    });
    const result = await fetchPanelData([], 100, 'jwt-abc');
    expect(requested).toBe('http://srv:1/v1/panel');   // trailing slash normalised
    expect((init!.headers as Record<string, string>)['Authorization']).toBe('Bearer jwt-abc');
    expect(decodeBody(init!)).toEqual({ window: 100, hands: [] });
    expect(result.tier).toBe('pro');
    expect(result.locked).toEqual([]);
    expect(result.panel).toEqual(panel);
  });

  it('omits the Authorization header when signed out and passes locked through', async () => {
    stubChrome({});
    let init: RequestInit | undefined;
    stubFetch((_url, i) => {
      init = i;
      return Promise.resolve(new Response(JSON.stringify({
        ok: true, tier: 'free', locked: ['positions', 'cards', 'sessions', 'trends'],
        skipped: 0, panel: emptyPanelData(100),
      })));
    });
    const result = await fetchPanelData([], 100, null);
    expect((init!.headers as Record<string, string>)['Authorization']).toBeUndefined();
    expect(result.tier).toBe('free');
    expect(result.locked).toEqual(['positions', 'cards', 'sessions', 'trends']);
  });

  it('throws a user-facing message when the server is unreachable', async () => {
    stubChrome({ analysis_server_url: 'http://srv:1' });
    stubFetch(() => Promise.reject(new Error('ECONNREFUSED')));
    await expect(fetchPanelData([], 100)).rejects.toThrow(
      /Analysis server unreachable at http:\/\/srv:1/);
  });

  it('throws the server error on a non-ok response', async () => {
    stubChrome({});
    stubFetch(() => Promise.resolve(new Response(
      JSON.stringify({ ok: false, error: 'expected { hands: hand.v1[], window? }' }),
      { status: 400 })));
    await expect(fetchPanelData([], 100)).rejects.toThrow(
      'Analysis server error: expected { hands: hand.v1[], window? }');
  });
});
