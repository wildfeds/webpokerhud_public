import { Hand } from '../model';
import { HandStore } from './hand_store';
import { pokerStarsFileText } from '../share/pokerstars_text';

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

// Chrome MV3 service workers have no URL.createObjectURL, so downloads there
// use data: URLs. Firefox's background is an event page which does have it;
// blob URLs handle large exports better and aren't revoked explicitly — the
// browser reclaims them when the event page suspends.
function toDataUrl(text: string, mime: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:${mime};base64,${btoa(binary)}`;
}

function toDownloadUrl(text: string, mime = 'application/x-ndjson'): string {
  if (typeof URL.createObjectURL === 'function') {
    return URL.createObjectURL(new Blob([text], { type: mime }));
  }
  return toDataUrl(text, mime);
}

// Write all stored hands to Downloads/webpokerhud/<platform>_<tableId>.jsonl,
// one file per table. Returns the number of files written.
export async function exportHands(store: HandStore): Promise<number> {
  const hands = await store.query({});
  const groups = groupHandsByTable(hands);
  for (const [name, group] of groups) {
    await chrome.downloads.download({
      url:            toDownloadUrl(toJsonl(group)),
      filename:       `webpokerhud/${name}.jsonl`,
      conflictAction: 'overwrite',
      saveAs:         false,
    });
  }
  return groups.size;
}

// The converter: every stored hand in PokerStars hand-history text, one
// file per table under Downloads/webpokerhud/pokerstars/, ready for
// PokerTracker 4 / Hand2Note / Holdem Manager to import as a folder. Tables
// whose hands all lack dealt-in players produce no file. Returns the number
// of files written.
export async function exportHandsPokerStars(store: HandStore): Promise<number> {
  const hands = await store.query({});
  let files = 0;
  for (const [name, group] of groupHandsByTable(hands)) {
    const text = pokerStarsFileText(group);
    if (!text) continue;
    await chrome.downloads.download({
      url:            toDownloadUrl(text, 'text/plain'),
      filename:       `webpokerhud/pokerstars/${name}.txt`,
      conflictAction: 'overwrite',
      saveAs:         false,
    });
    files++;
  }
  return files;
}
