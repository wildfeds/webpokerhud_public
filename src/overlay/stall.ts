// Capture-stall detection (BF-009). A table frame that was receiving game
// events and then goes quiet has either emptied out or lost its feed (the
// observed failure: the site's socket drops and its transport falls back to
// something the tap doesn't see). The HUD can't tell which from inside the
// frame, so it says so — tighter when a hand was visibly in progress, looser
// when the table was between hands. Pure, unit-tested.

export const STALL_MID_HAND_MS = 60_000;    // a live hand never goes a minute without an event
export const STALL_IDLE_MS     = 180_000;   // between hands, three quiet minutes is suspicious
export const STALL_CHECK_MS    = 15_000;

export interface StallState {
  // 'mid_hand': events stopped while a hand was in progress — almost
  // certainly a dead feed. 'idle': the table was between hands when events
  // stopped — could be an empty table, could be a dead feed.
  kind:     'mid_hand' | 'idle';
  quietMs:  number;
}

// Null while the feed looks healthy (or no event was ever seen).
export function stallState(quietMs: number, handLive: boolean, sawEvents: boolean): StallState | null {
  if (!sawEvents) return null;
  if (handLive) return quietMs >= STALL_MID_HAND_MS ? { kind: 'mid_hand', quietMs } : null;
  return quietMs >= STALL_IDLE_MS ? { kind: 'idle', quietMs } : null;
}

// One-line wording for the HUD strip.
export function stallMessage(s: StallState): string {
  const mins = Math.max(1, Math.round(s.quietMs / 60_000));
  const ago = mins === 1 ? '1 min' : `${mins} min`;
  return s.kind === 'mid_hand'
    ? `Capture stalled mid-hand (${ago} without events). Reload this table tab to resume.`
    : `No table events for ${ago}. If the table is still playing, reload this tab to resume capture.`;
}

// "just now" / "3 min ago" / "2 h ago" / "yesterday" for the popup's
// capture-health line.
export function agoLabel(thenMs: number, now = Date.now()): string {
  const d = Math.max(0, now - thenMs);
  const mins = Math.round(d / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
