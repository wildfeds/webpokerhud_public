// "Rate us" nudge: once a player has tracked enough hands to have an opinion,
// the popup asks once for a Firefox Add-ons review (reviews drive the AMO
// ranking) — or, on a manual Chrome install where AMO means nothing, for a
// GitHub star. Pure decision logic here (unit-tested); the popup renders it.

export const NUDGE_MIN_HANDS = 100;
export const NUDGE_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;   // "Later" = two weeks

export const AMO_LISTING_URL = 'https://addons.mozilla.org/firefox/addon/webpokerhud/';
export const GITHUB_REPO_URL = 'https://github.com/wildfeds/webpokerhud_public';

// Persisted in chrome.storage.local under NUDGE_KEY. Absent = never shown.
export interface NudgeState {
  state:  'later' | 'rated' | 'dismissed';
  until?: number;   // for 'later': Unix ms when it may show again
}

export const NUDGE_KEY = 'rate_nudge';

export function shouldShowNudge(handCount: number, saved: NudgeState | null | undefined, now = Date.now()): boolean {
  if (handCount < NUDGE_MIN_HANDS) return false;
  if (!saved) return true;
  if (saved.state === 'rated' || saved.state === 'dismissed') return false;
  return (saved.until ?? 0) <= now;
}

export function snooze(now = Date.now()): NudgeState {
  return { state: 'later', until: now + NUDGE_SNOOZE_MS };
}

export interface NudgeTarget {
  headline: string;
  body:     string;
  cta:      string;
  url:      string;
}

// Firefox builds carry browser_specific_settings.gecko in the manifest; that
// is the signal the install came from (or can be reviewed on) AMO.
export function isFirefoxBuild(manifest: Record<string, unknown>): boolean {
  const bss = manifest['browser_specific_settings'] as { gecko?: unknown } | undefined;
  return Boolean(bss?.gecko);
}

export function nudgeTarget(firefox: boolean, handCount: number): NudgeTarget {
  const n = handCount.toLocaleString();
  return firefox
    ? {
        headline: `${n} hands tracked — enjoying WebPokerHud?`,
        body:     'A short review on Firefox Add-ons helps other players find it. It takes a minute.',
        cta:      'Rate on Firefox Add-ons',
        url:      AMO_LISTING_URL,
      }
    : {
        headline: `${n} hands tracked — enjoying WebPokerHud?`,
        body:     'A star on GitHub helps other players find it. It takes a second.',
        cta:      'Star on GitHub',
        url:      GITHUB_REPO_URL,
      };
}
