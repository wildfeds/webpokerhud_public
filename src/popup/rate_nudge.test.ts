import { describe, it, expect } from 'vitest';
import {
  shouldShowNudge, snooze, nudgeTarget, isFirefoxBuild,
  NUDGE_MIN_HANDS, NUDGE_SNOOZE_MS, AMO_LISTING_URL, GITHUB_REPO_URL,
} from './rate_nudge';

describe('shouldShowNudge', () => {
  const now = 1_800_000_000_000;

  it('waits for the hand threshold', () => {
    expect(shouldShowNudge(NUDGE_MIN_HANDS - 1, null, now)).toBe(false);
    expect(shouldShowNudge(NUDGE_MIN_HANDS, null, now)).toBe(true);
    expect(shouldShowNudge(5000, undefined, now)).toBe(true);
  });

  it('never shows again once rated or dismissed', () => {
    expect(shouldShowNudge(5000, { state: 'rated' }, now)).toBe(false);
    expect(shouldShowNudge(5000, { state: 'dismissed' }, now)).toBe(false);
  });

  it('snoozes for two weeks', () => {
    const later = snooze(now);
    expect(later).toEqual({ state: 'later', until: now + NUDGE_SNOOZE_MS });
    expect(shouldShowNudge(5000, later, now)).toBe(false);
    expect(shouldShowNudge(5000, later, now + NUDGE_SNOOZE_MS - 1)).toBe(false);
    expect(shouldShowNudge(5000, later, now + NUDGE_SNOOZE_MS)).toBe(true);
  });
});

describe('nudgeTarget', () => {
  it('asks for an AMO review on Firefox and a GitHub star elsewhere', () => {
    const ff = nudgeTarget(true, 1234);
    expect(ff.url).toBe(AMO_LISTING_URL);
    expect(ff.headline).toContain('1,234 hands');
    expect(ff.cta).toContain('Firefox Add-ons');
    const ch = nudgeTarget(false, 100);
    expect(ch.url).toBe(GITHUB_REPO_URL);
    expect(ch.cta).toContain('GitHub');
  });
});

describe('isFirefoxBuild', () => {
  it('keys off the gecko manifest block', () => {
    expect(isFirefoxBuild({ browser_specific_settings: { gecko: { id: 'x' } } })).toBe(true);
    expect(isFirefoxBuild({})).toBe(false);
    expect(isFirefoxBuild({ browser_specific_settings: {} })).toBe(false);
  });
});
