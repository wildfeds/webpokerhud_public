// Generates src/content/docs/stats.md from the extension's stat glossary
// (../../src/panel/stat_info.ts) so the docs can't drift from the HUD's own
// definitions (design.md §4). The one sanctioned cross-package import; runs
// at build time only (package.json `prebuild`, via tsx). The output is
// committed so `next dev` works without a prior build.
import fs from 'node:fs';
import path from 'node:path';
import { STAT_INFO } from '../../src/panel/stat_info';

const OUT = path.join(import.meta.dirname, '..', 'src', 'content', 'docs', 'stats.md');

const lines: string[] = [
  '---',
  'title: Stat glossary',
  'description: What every stat in the HUD, popup and panel means.',
  'order: 20',
  'section: Reference',
  '---',
  '',
  '<!-- GENERATED FILE — do not edit. Run `npm run gen:stats`; source of',
  '     truth is src/panel/stat_info.ts in the extension. -->',
  '',
  'Every stat shown in the HUD overlay, popup and analysis panel, with the',
  "exact definition the extension computes. These are generated from the",
  "extension's own glossary, so they always match what you see in the tool.",
  '',
];

for (const info of Object.values(STAT_INFO)) {
  lines.push(`## ${info.title}`, '', info.definition, '');
}

fs.writeFileSync(OUT, lines.join('\n'));
console.log(`gen-stat-docs: wrote ${Object.keys(STAT_INFO).length} stats to ${path.relative(process.cwd(), OUT)}`);
