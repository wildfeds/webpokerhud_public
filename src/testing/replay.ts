// Test helpers for replaying captured Bovada sessions through the connector.
import { readFileSync } from 'node:fs';
import { Hand } from '../model';
import { BovadaConnector } from '../connector';

// Mirror of parseFrame in injected.ts: only server→client frames carry the
// Atmosphere "<length>|" prefix; client frames and timestamp lines are skipped.
export function serverEventsFromLog(log: string): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  for (const line of log.split('\n')) {
    const frame = line.split('\t')[0]!;
    const match = frame.match(/^\d+\|(.+)$/s);
    if (!match) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1]!);
    } catch {
      continue; // Atmosphere handshake / non-JSON frame
    }
    const data = (parsed as { data?: unknown }).data ?? parsed;
    events.push(...(Array.isArray(data) ? data : [data]) as Record<string, unknown>[]);
  }
  return events;
}

// Replay a raw capture file; returns every Hand the connector emits.
export function replayLogFile(path: string): Hand[] {
  const emitted: Hand[] = [];
  const connector = new BovadaConnector();
  connector.on('hand_complete', (hand) => emitted.push(hand));
  for (const ev of serverEventsFromLog(readFileSync(path, 'utf8'))) {
    connector.handleEvent(ev);
  }
  connector.destroy();
  return emitted;
}

// Parse a file of concatenated pretty-printed JSON objects (fixture format).
export function parseConcatenatedJson<T>(text: string): T[] {
  const objects: T[] = [];
  let depth = 0, start = -1, inString = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
    } else if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) objects.push(JSON.parse(text.slice(start, i + 1)) as T);
    }
  }
  return objects;
}
