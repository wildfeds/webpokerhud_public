import { Hand } from '../model';
import { HandStore } from './hand_store';

export interface ParseResult {
  hands:  Hand[];
  errors: string[];   // one message per rejected line, e.g. "line 4: missing handId"
}

export interface ImportResult {
  imported: number;   // hands written to the store
  skipped:  number;   // lines rejected by validation
  errors:   string[];
}

// Pure helpers (unit-tested without chrome/IndexedDB) ─────────────────────────

// Parse a JSONL export back into Hand objects, validating each line. Bad lines
// are collected in `errors` rather than aborting the whole import.
export function parseHandsJsonl(text: string): ParseResult {
  const hands: Hand[] = [];
  const errors: string[] = [];

  const lines = text.split('\n');
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line === '') return;                       // tolerate blank/trailing lines
    const lineNo = i + 1;

    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      errors.push(`line ${lineNo}: invalid JSON`);
      return;
    }

    const problem = validateHand(obj);
    if (problem) errors.push(`line ${lineNo}: ${problem}`);
    else hands.push(obj as Hand);
  });

  return { hands, errors };
}

// Returns null if the object is a structurally valid Hand, else a short reason.
export function validateHand(obj: unknown): string | null {
  if (typeof obj !== 'object' || obj === null) return 'not an object';
  const h = obj as Record<string, unknown>;

  for (const field of ['handId', 'tableId', 'platform', 'gameType'] as const) {
    if (typeof h[field] !== 'string') return `missing ${field}`;
  }
  for (const field of ['timestamp', 'maxSeats', 'dealerSeat', 'heroSeat', 'totalPot', 'rake'] as const) {
    if (typeof h[field] !== 'number') return `missing ${field}`;
  }
  const stakes = h.stakes as Record<string, unknown> | undefined;
  if (!stakes || typeof stakes.sb !== 'number' || typeof stakes.bb !== 'number') return 'missing stakes';

  for (const field of ['players', 'actions', 'board', 'results'] as const) {
    if (!Array.isArray(h[field])) return `missing ${field}`;
  }
  // Players are the analysis layer's anchor (hero detection, positions): spot-check shape.
  for (const p of h.players as unknown[]) {
    const pl = p as Record<string, unknown>;
    if (typeof pl?.seat !== 'number' || typeof pl?.playerId !== 'string' || typeof pl?.isHero !== 'boolean') {
      return 'malformed player';
    }
  }
  return null;
}

// Store glue ──────────────────────────────────────────────────────────────────

// Parse and persist a JSONL export. save() is an idempotent upsert keyed by
// [platform, handId], so re-importing the same file is safe (no duplicates).
export async function importHandsJsonl(store: HandStore, text: string): Promise<ImportResult> {
  const { hands, errors } = parseHandsJsonl(text);
  for (const hand of hands) {
    await store.save(hand);
  }
  return { imported: hands.length, skipped: errors.length, errors };
}
