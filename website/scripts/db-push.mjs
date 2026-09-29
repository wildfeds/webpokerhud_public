// Apply supabase/schema.sql to the project database. The schema file is
// idempotent, so this is safe to re-run after every edit:
//
//   npm run db:push
//
// Needs SUPABASE_DB_URL in website/.env.local (gitignored) — the "Session
// pooler" connection string from the Supabase dashboard's Connect dialog
// (contains the database password: keep it out of tracked files).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function envFromDotfile(name) {
  try {
    const line = readFileSync(join(root, '.env.local'), 'utf8')
      .split('\n')
      .find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim() : undefined;
  } catch {
    return undefined;
  }
}

// Session-mode pooler (or direct) URLs are right for DDL; the
// transaction-mode pooler (DATABASE_URL, ?pgbouncer=true) is a last resort.
const url =
  ['SUPABASE_DB_URL', 'DIRECT_URL', 'CONNECTION_STRING', 'DATABASE_URL']
    .map((n) => process.env[n] ?? envFromDotfile(n))
    .find(Boolean);
if (!url) {
  console.error(
    'No database URL found. Add SUPABASE_DB_URL (or DIRECT_URL) to\n' +
    'website/.env.local — the Session pooler URI from the Supabase\n' +
    "dashboard's Connect → Connection string.");
  process.exit(1);
}

const sql = readFileSync(join(root, 'supabase', 'schema.sql'), 'utf8');
const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  await client.query(sql);   // multi-statement: applied as one script
  console.log('schema.sql applied.');
} catch (err) {
  console.error(`schema push failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
