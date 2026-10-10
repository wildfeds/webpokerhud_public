// GitHub release + repo-settings automation for the public repo.
//
//   node scripts/github_release.mjs release <version>
//       Create (or update) the release for tag v<version> on
//       wildfeds/webpokerhud_public: body = that version's CHANGELOG.md
//       entry, asset = webpokerhud-chrome-<version>.zip (replaced if it
//       already exists). The tag must already be pushed (docs/RELEASING.md).
//
//   node scripts/github_release.mjs settings [--discussions]
//       Set description, homepage, topics; turn Wiki and Projects off;
//       Discussions on only with the flag.
//
// Token: a fine-grained PAT scoped to the public repo with Contents (write)
// and, for `settings`, Administration (write). Read from $GITHUB_TOKEN or
// ~/.config/webpokerhud/github_token. Never committed anywhere.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const OWNER = 'wildfeds';
const REPO = 'webpokerhud_public';
const API = 'https://api.github.com';

const SETTINGS = {
  description: 'Live poker HUD for Bovada as a browser extension — free, open source, local-first',
  homepage: 'https://webpokerhud.com',
  topics: ['poker', 'hud', 'firefox-extension', 'chrome-extension', 'bovada', 'poker-stats', 'hand-history'],
};

function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  const file = join(homedir(), '.config', 'webpokerhud', 'github_token');
  if (!existsSync(file)) throw new Error(`no GITHUB_TOKEN and ${file} missing`);
  return readFileSync(file, 'utf8').trim();
}

async function gh(method, path, body, extra = {}) {
  const url = path.startsWith('http') ? path : API + path;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body && !(body instanceof Uint8Array) ? { 'Content-Type': 'application/json' } : {}),
      ...extra.headers,
    },
    body: body instanceof Uint8Array ? body : body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${data?.message ?? text}`);
  return data;
}

// The "## <version> — <date>" section of CHANGELOG.md, without its heading.
function changelogEntry(version) {
  const md = readFileSync('CHANGELOG.md', 'utf8');
  const re = new RegExp(`^## ${version.replace(/\./g, '\\.')}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm');
  const m = md.match(re);
  if (!m) throw new Error(`CHANGELOG.md has no "## ${version}" section`);
  return m[1].trim();
}

async function release(version) {
  if (!version) throw new Error('usage: release <version>');
  const tag = `v${version}`;
  const asset = `webpokerhud-chrome-${version}.zip`;
  if (!existsSync(asset)) throw new Error(`${asset} not found — run: npm run package:chrome-sideload`);
  const body = changelogEntry(version);
  token();   // fail here, clearly, rather than inside the first API call

  // Tag must exist on the remote: the release is created from it.
  await gh('GET', `/repos/${OWNER}/${REPO}/git/ref/tags/${tag}`)
    .catch(err => {
      throw new Error(/404/.test(err.message)
        ? `tag ${tag} is not on GitHub — push it first (docs/RELEASING.md §4)`
        : err.message);
    });

  let rel = await gh('GET', `/repos/${OWNER}/${REPO}/releases/tags/${tag}`).catch(() => null);
  if (rel) {
    rel = await gh('PATCH', `/repos/${OWNER}/${REPO}/releases/${rel.id}`, {
      name: `WebPokerHud ${version}`, body, draft: false, prerelease: false,
    });
    console.log(`updated release ${tag}`);
  } else {
    rel = await gh('POST', `/repos/${OWNER}/${REPO}/releases`, {
      tag_name: tag, name: `WebPokerHud ${version}`, body, draft: false, prerelease: false,
    });
    console.log(`created release ${tag}`);
  }

  // A release offers exactly one download: the Chrome zip. Firefox users
  // install from AMO (an unsigned Firefox zip here would only confuse them),
  // so anything else — stray manual uploads included — is removed, and the
  // Chrome zip is replaced with this build.
  for (const a of rel.assets ?? []) {
    await gh('DELETE', `/repos/${OWNER}/${REPO}/releases/assets/${a.id}`);
    console.log(a.name === asset ? `replaced existing asset ${asset}` : `removed stray asset ${a.name}`);
  }
  const bytes = new Uint8Array(readFileSync(asset));
  const uploadUrl = rel.upload_url.replace(/\{.*\}$/, '') + `?name=${encodeURIComponent(asset)}`;
  await gh('POST', uploadUrl, bytes, {
    headers: { 'Content-Type': 'application/zip', 'Content-Length': String(statSync(asset).size) },
  });
  console.log(`uploaded ${asset} (${statSync(asset).size} bytes)`);
  console.log(rel.html_url);
}

async function settings(flags) {
  token();
  await gh('PATCH', `/repos/${OWNER}/${REPO}`, {
    description: SETTINGS.description,
    homepage: SETTINGS.homepage,
    has_wiki: false,
    has_projects: false,
    has_issues: true,
    has_discussions: flags.includes('--discussions'),
  });
  await gh('PUT', `/repos/${OWNER}/${REPO}/topics`, { names: SETTINGS.topics });
  console.log(`settings applied: description, homepage, topics [${SETTINGS.topics.join(', ')}],`
    + ` wiki off, projects off, discussions ${flags.includes('--discussions') ? 'on' : 'off'}`);
}

const [cmd, ...rest] = process.argv.slice(2);
const run = cmd === 'release' ? release(rest[0]) : cmd === 'settings' ? settings(rest) : null;
if (!run) {
  console.error('usage: node scripts/github_release.mjs release <version> | settings [--discussions]');
  process.exit(2);
}
run.catch(err => { console.error(err.message); process.exit(1); });
