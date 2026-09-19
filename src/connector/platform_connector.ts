import { Hand, GameState } from '../model';

// Typed event map for all connectors.
export type ConnectorEvents = {
  hand_complete: Hand;      // emitted once per completed hand
  state_update:  GameState; // emitted on every significant mid-hand change
  error:         Error;
};

type Listener<K extends keyof ConnectorEvents> = (payload: ConnectorEvents[K]) => void;

// Platform-agnostic connector interface.
// Each platform implements this — Bovada via WebSocket interception,
// PokerStars via hand history file watching, etc.
export interface PlatformConnector {
  on<K extends keyof ConnectorEvents>(event: K, cb: Listener<K>): void;
  off<K extends keyof ConnectorEvents>(event: K, cb: Listener<K>): void;
  destroy(): void;
}

// Minimal typed event emitter mixin — no Node dep required.
export class ConnectorEmitter implements Pick<PlatformConnector, 'on' | 'off'> {
  protected listeners: { [K in keyof ConnectorEvents]: Listener<K>[] } = {
    hand_complete: [],
    state_update:  [],
    error:         [],
  };

  on<K extends keyof ConnectorEvents>(event: K, cb: Listener<K>): void {
    (this.listeners[event] as Listener<K>[]).push(cb);
  }

  off<K extends keyof ConnectorEvents>(event: K, cb: Listener<K>): void {
    const arr = this.listeners[event] as Listener<K>[];
    const i = arr.indexOf(cb);
    if (i !== -1) arr.splice(i, 1);
  }

  protected emit<K extends keyof ConnectorEvents>(event: K, payload: ConnectorEvents[K]): void {
    for (const cb of this.listeners[event] as Listener<K>[]) cb(payload);
  }
}
