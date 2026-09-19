import { Hand } from '../model';
import { HandStore } from './hand_store';

// Pure helpers (unit-tested without chrome APIs) ─────────────────────────────

// Group hands into export files, keyed "<platform>_<tableId>".
export function groupHandsByTable(hands: Hand[]): Map<string, Hand[]> {
  const groups = new Map<string, Hand[]>();
  for (const hand of hands) {
    const key = `${hand.platform}_${hand.tableId}`;
    const group = groups.get(key);
    if (group) group.push(hand);
    else groups.set(key, [hand]);
  }
  return groups;
}

// JSONL: one compact JSON hand per line.
export function toJsonl(hands: Hand[]): string {
  return hands.map(h => JSON.stringify(h)).join('\n') + '\n';
}

// chrome.downloads glue ──────────────────────────────────────────────────────

// MV3 service workers have no URL.createObjectURL, so downloads use data: URLs.
function toDataUrl(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:application/x-ndjson;base64,${btoa(binary)}`;
}

// Write all stored hands to Downloads/bovada_hud/<platform>_<tableId>.jsonl,
// one file per table. Returns the number of files written.
export async function exportHands(store: HandStore): Promise<number> {
  const hands = await store.query({});
  const groups = groupHandsByTable(hands);
  for (const [name, group] of groups) {
    await chrome.downloads.download({
      url:            toDataUrl(toJsonl(group)),
      filename:       `bovada_hud/${name}.jsonl`,
      conflictAction: 'overwrite',
      saveAs:         false,
    });
  }
  return groups.size;
}
