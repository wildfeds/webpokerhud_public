// Package the extension for store upload.
//
//   node scripts/package_store.mjs            → Chrome Web Store zip from dist/
//   node scripts/package_store.mjs chrome-sideload
//                                              → Chrome manual-install zip (GitHub
//                                                release): keeps the manifest key so
//                                                the extension ID — and with it the
//                                                Google sign-in redirect — stays the
//                                                pinned one; only localhost is dropped
//   node scripts/package_store.mjs firefox    → AMO add-on zip + reviewer source zip
//   node scripts/package_store.mjs firefox --verify
//                                              → also rebuild from the source zip
//                                                in a temp dir and diff against
//                                                the add-on zip (what AMO does)
//
// Chrome: the store rejects manifests containing "key" (it assigns the
// published extension its own ID), while local unpacked builds rely on the
// key for a stable dev ID — so the key is stripped from a COPY; dist/ is
// untouched. The store-assigned ID must be present in Supabase redirect URLs
// and the server's CORS_ORIGINS alongside the dev ID (docs/STORE_LISTING.md).
//
// Firefox: builds dist-firefox/ in production mode, gates on `web-ext lint`
// (errors fail the package), zips it, and produces the source archive AMO
// requires for bundled code — the buildable tree plus a BUILD.md carrying
// the exact commands and the VITE_* values baked into the bundle (the
// Supabase anon key is public by design; it ships in the built extension
// anyway). See docs/AMO_LISTING.md.
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const target = ['firefox', 'chrome-sideload'].includes(args[0]) ? args[0] : 'chrome';
const verify = args.includes('--verify');
const root = process.cwd();

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${cmdArgs.join(' ')} failed (exit ${r.status})`);
}

function zipDir(dir, out) {
  rmSync(out, { force: true });
  // -X drops platform extra fields so the archive bytes are stable across runs.
  execFileSync('zip', ['-qrX', out, '.'], { cwd: dir });
}

// ── Chrome ──────────────────────────────────────────────────────────────────

function packageChrome({ sideload = false } = {}) {
  if (sideload) {
    console.log('building dist/ (production)…');
    run('npx', ['vite', 'build'], { env: { ...process.env, NODE_ENV: 'production' } });
  }
  const stage = mkdtempSync(join(tmpdir(), 'wph-store-'));
  try {
    cpSync('dist', stage, { recursive: true });
    const manifestPath = join(stage, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!sideload) delete manifest.key;
    // localhost is a dev convenience (local analysis server); it grants users
    // nothing and only widens the permission surface a reviewer must judge.
    manifest.host_permissions =
      manifest.host_permissions.filter((h) => !h.includes('localhost'));
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

    const out = join(root, sideload
      ? `webpokerhud-chrome-${manifest.version}.zip`
      : `webpokerhud-${manifest.version}.zip`);
    zipDir(stage, out);
    console.log(`wrote ${out} (${sideload ? 'manifest key kept for a stable ID' : 'manifest key stripped'}; dist/ untouched)`);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

// ── Firefox / AMO ───────────────────────────────────────────────────────────

// Everything a reviewer needs to reproduce dist-firefox/ byte for byte.
// Excluded on purpose: node_modules (npm ci restores them from the lockfile),
// build outputs, the website (a separate app), extension-key.pem (Chrome
// signing key), and .env (its two values go into BUILD.md instead).
const SOURCE_PATHS = [
  'manifest.json', 'package.json', 'package-lock.json',
  'vite.config.ts', 'tsconfig.json', 'vitest.config.ts', '.env.example',
  'LICENSE', 'src', 'public', 'scripts',
];

function readEnv() {
  if (!existsSync('.env')) {
    throw new Error('.env missing — the AMO source package must carry the VITE_* values baked into the build');
  }
  const env = {};
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*(VITE_[A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
    if (!env[k]) throw new Error(`${k} not set in .env`);
  }
  return env;
}

function buildInstructions(version, env) {
  const node = process.version;
  return `# Building WebPokerHud ${version} for Firefox (AMO reviewer instructions)

This archive is the complete source of the submitted add-on. The build is
deterministic: the same commands on the same toolchain reproduce the
uploaded zip byte for byte.

## Toolchain

- Node.js ${node} (any 22.x works; the lockfile pins every dependency)
- npm (bundled with Node)
- Linux or macOS shell (the packager uses \`zip\`)

## Steps

    npm ci
    cat > .env <<'EOF'
${Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n')}
EOF
    NODE_ENV=production TARGET_BROWSER=firefox npx vite build

The add-on is now in \`dist-firefox/\` — the same files, in the same
layout, as the uploaded zip. \`npm test\` runs the unit suite; \`npx web-ext
lint --source-dir dist-firefox\` reproduces our pre-submission lint.

## About the .env values

\`VITE_*\` variables are inlined by Vite at build time. The Supabase anon
key is a public client key by design (row-level security is the boundary)
and is visible in the built extension; it is reproduced here only so the
build matches.

## Layout

- \`manifest.json\` — a single template; \`{{chrome}}.\`/\`{{firefox}}.\`
  key prefixes are resolved per target by vite-plugin-web-extension
- \`src/injected.ts\` — MAIN-world WebSocket tap (game events)
- \`src/content_script.ts\`, \`src/connector/\` — event → hand state machine
- \`src/overlay/\` — the on-table HUD; \`src/popup/\`, \`src/panel/\` — pages
- \`src/storage/\` — IndexedDB hand store; \`src/analysis/\` — stats
- \`src/ui/html.ts\` — escape-by-default templating (no innerHTML)

## Testing without a poker-site account

\`examples/sample_hands.jsonl\` is a real (anonymized) hand-history export.
Open the add-on's Analysis Panel (toolbar popup → "Open analysis panel"),
click "⇪ Import" and choose that file: the popup stats, the Overview,
the hand browser and the street-by-street replays all populate from it.
`;
}

// A real export reviewers can import to exercise the popup/panel without a
// poker-site account (they can't log into a US real-money site). The hero's
// playerId is the account number — swapped for a placeholder throughout.
const SAMPLE_SRC = 'examples/hands_jsonl_objs/bovada_37419844.jsonl';
const SAMPLE_DST = 'examples/sample_hands.jsonl';

function anonymizedSample() {
  const lines = readFileSync(SAMPLE_SRC, 'utf8').split('\n').filter(Boolean);
  return lines.map(line => {
    const hand = JSON.parse(line);
    const hero = hand.players?.find(p => p.isHero)?.playerId;
    return hero ? line.split(JSON.stringify(hero)).join('"hero"') : line;
  }).join('\n') + '\n';
}

function stageSource(version, env) {
  const stage = mkdtempSync(join(tmpdir(), 'wph-src-'));
  for (const p of SOURCE_PATHS) {
    if (!existsSync(p)) continue;
    cpSync(p, join(stage, p), { recursive: true });
  }
  mkdirSync(join(stage, 'examples'), { recursive: true });
  writeFileSync(join(stage, SAMPLE_DST), anonymizedSample());
  writeFileSync(join(stage, 'BUILD.md'), buildInstructions(version, env));
  return stage;
}

function hashTree(dir) {
  const out = new Map();
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.set(relative(dir, p), createHash('sha256').update(readFileSync(p)).digest('hex'));
    }
  };
  walk(dir);
  return out;
}

// Rebuild from the staged source in isolation and compare with dist-firefox/.
function verifyReproducible(sourceStage, env) {
  const work = mkdtempSync(join(tmpdir(), 'wph-verify-'));
  try {
    cpSync(sourceStage, work, { recursive: true });
    writeFileSync(join(work, '.env'),
      Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
    console.log('verify: npm ci in a clean tree (this takes a moment)…');
    run('npm', ['ci', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: work });
    run('npx', ['vite', 'build'], {
      cwd: work, env: { ...process.env, NODE_ENV: 'production', TARGET_BROWSER: 'firefox' },
    });
    const a = hashTree(join(root, 'dist-firefox'));
    const b = hashTree(join(work, 'dist-firefox'));
    const diffs = [...new Set([...a.keys(), ...b.keys()])].filter(k => a.get(k) !== b.get(k));
    if (diffs.length) {
      throw new Error(`verify: rebuild differs from dist-firefox/ in: ${diffs.join(', ')}`);
    }
    console.log(`verify: OK — ${a.size} files identical after a clean rebuild from the source zip`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function packageFirefox() {
  const env = readEnv();

  console.log('building dist-firefox/ (production)…');
  run('npx', ['vite', 'build'], {
    env: { ...process.env, NODE_ENV: 'production', TARGET_BROWSER: 'firefox' },
  });

  console.log('linting…');
  run('npx', ['web-ext', 'lint', '--source-dir', 'dist-firefox', '--warnings-as-errors=false']);

  const manifest = JSON.parse(readFileSync('dist-firefox/manifest.json', 'utf8'));
  const version = manifest.version;
  const addon = join(root, `webpokerhud-firefox-${version}.zip`);
  zipDir(join(root, 'dist-firefox'), addon);
  console.log(`wrote ${addon}`);

  const sourceStage = stageSource(version, env);
  try {
    const source = join(root, `webpokerhud-${version}-source.zip`);
    zipDir(sourceStage, source);
    console.log(`wrote ${source} (buildable tree + BUILD.md)`);
    if (verify) verifyReproducible(sourceStage, env);
  } finally {
    rmSync(sourceStage, { recursive: true, force: true });
  }
}

if (target === 'firefox') packageFirefox();
else packageChrome({ sideload: target === 'chrome-sideload' });
