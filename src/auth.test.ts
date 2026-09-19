import { describe, it, expect } from 'vitest';
import {
  parseAuthCallback, userFromAuthPayload, effectiveTier, needsRefresh,
} from './auth';

describe('parseAuthCallback', () => {
  it('extracts tokens from the redirect fragment', () => {
    const url = 'https://abc.chromiumapp.org/' +
      '#access_token=at-1&refresh_token=rt-1&expires_in=3600&token_type=bearer';
    expect(parseAuthCallback(url)).toEqual({
      accessToken: 'at-1', refreshToken: 'rt-1', expiresIn: 3600,
    });
  });

  it('defaults expires_in to an hour when missing or bad', () => {
    expect(parseAuthCallback('https://x.org/#access_token=a&refresh_token=r')!.expiresIn).toBe(3600);
    expect(parseAuthCallback('https://x.org/#access_token=a&refresh_token=r&expires_in=-5')!.expiresIn).toBe(3600);
  });

  it('returns null when tokens are missing (cancelled / error redirects)', () => {
    expect(parseAuthCallback('https://x.org/#error=access_denied')).toBeNull();
    expect(parseAuthCallback('https://x.org/')).toBeNull();
  });
});

describe('userFromAuthPayload', () => {
  it('maps a Google-shaped Supabase user', () => {
    expect(userFromAuthPayload({
      id: 'u1', email: 'a@b.com',
      user_metadata: { full_name: 'Ann B', avatar_url: 'https://img/x.png' },
    })).toEqual({ id: 'u1', email: 'a@b.com', name: 'Ann B', avatarUrl: 'https://img/x.png' });
  });

  it('falls back to the email local part and picture', () => {
    expect(userFromAuthPayload({
      id: 'u2', email: 'carl@d.com', user_metadata: { picture: 'https://img/p.png' },
    })).toEqual({ id: 'u2', email: 'carl@d.com', name: 'carl', avatarUrl: 'https://img/p.png' });
  });

  it('rejects payloads without an id', () => {
    expect(userFromAuthPayload({ email: 'x@y.z' })).toBeNull();
    expect(userFromAuthPayload(null)).toBeNull();
  });
});

describe('effectiveTier', () => {
  const now = Date.parse('2026-09-17T00:00:00Z');

  it('is pro while plan=pro and unexpired (or no expiry)', () => {
    expect(effectiveTier('pro', null, now)).toBe('pro');
    expect(effectiveTier('pro', '2026-12-01T00:00:00Z', now)).toBe('pro');
  });

  it('drops to free when expired, on other plans, or with a bad date', () => {
    expect(effectiveTier('pro', '2026-01-01T00:00:00Z', now)).toBe('free');
    expect(effectiveTier('free', null, now)).toBe('free');
    expect(effectiveTier(undefined, null, now)).toBe('free');
    expect(effectiveTier('pro', 'not-a-date', now)).toBe('free');
  });
});

describe('needsRefresh', () => {
  it('refreshes inside the 5-minute margin, not outside it', () => {
    const now = 1_000_000_000;
    expect(needsRefresh(now + 10 * 60 * 1000, now)).toBe(false);
    expect(needsRefresh(now + 2 * 60 * 1000, now)).toBe(true);
    expect(needsRefresh(now - 1, now)).toBe(true);
  });
});
