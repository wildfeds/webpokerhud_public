// Regenerate examples/hands_and_raw_log/hands_object_1.txt from the raw log
// using the current connector. Run with: npx vite-node scripts/regen_fixture.ts
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { replayLogFile } from '../src/testing/replay';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../examples/hands_and_raw_log');
const hands = replayLogFile(join(dir, 'raw_logs_1.txt'));
writeFileSync(join(dir, 'hands_object_1.txt'),
  hands.map(h => JSON.stringify(h, null, 4)).join('\n') + '\n');
console.log(`wrote ${hands.length} hands to hands_object_1.txt`);
