// Validates the repo's example hands against the published JSON Schema so the
// spec can't silently rot (design.md §4). Run via `npm run check:schema`; CI
// runs it on every website PR.
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const schemaPath = path.join(here, '..', 'public', 'schema', 'hand.v1.json');
const examplesDir = path.join(here, '..', '..', 'examples', 'hands_jsonl_objs');

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv2020.default({ allErrors: true });
const validate = ajv.compile(schema);

let hands = 0;
let failures = 0;

for (const file of fs.readdirSync(examplesDir).filter((f) => f.endsWith('.jsonl'))) {
  const lines = fs.readFileSync(path.join(examplesDir, file), 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    hands++;
    const hand = JSON.parse(line);
    if (!validate(hand)) {
      failures++;
      console.error(`${file}:${i + 1} (handId ${hand.handId}) fails schema:`);
      for (const err of validate.errors) {
        console.error(`  ${err.instancePath || '/'} ${err.message}`);
      }
    }
  });
}

if (hands === 0) {
  console.error('validate-schema: no example hands found — refusing to pass vacuously');
  process.exit(1);
}
if (failures > 0) {
  console.error(`validate-schema: ${failures}/${hands} hands FAILED`);
  process.exit(1);
}
console.log(`validate-schema: ${hands} example hands validate against hand.v1.json`);
