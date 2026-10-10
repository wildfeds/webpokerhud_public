// Single place for the product identity.
export const SITE_NAME = 'WebPokerHud';
export const SITE_TAGLINE = 'Free Bovada HUD and hand history converter for your browser';
export const SITE_URL = 'https://webpokerhud.com';
// Product version shown on the landing page; keep in step with the
// extension's manifest.json "version" on each release.
export const VERSION = '1.0.1';

export const LAUNCHED = process.env.NEXT_PUBLIC_LAUNCHED === 'true';
// Firefox (AMO) is the store channel — the Chrome Web Store rejected the
// extension under its gambling-content policy (2026-09-25), so Chrome is
// offered as a manual install from the public repo's releases instead.
export const FIREFOX_ADDON_URL = 'https://addons.mozilla.org/firefox/addon/webpokerhud/';
export const GITHUB_URL = 'https://github.com/wildfeds/webpokerhud_public';
export const CHROME_SIDELOAD_URL = `${GITHUB_URL}/releases/latest`;
// Support is GitHub Issues only (decision 2026-10-07; no Discord, no Discussions).
export const ISSUES_URL = `${GITHUB_URL}/issues`;
// No support email: GitHub Issues is the single entrance for support,
// bugs, account and privacy requests (decision 2026-10-07).
