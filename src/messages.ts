import { Hand } from './model';
import {
  HeroStats, TableSummary, StakeLevelSummary, StatsFilter,
  SeatSessionStats, PanelData, Tier,
} from './analysis';
import { StorageInfo } from './storage';
import { AuthState } from './auth';

// Runtime messages between content script / popup / panel and the background worker.
// get_panel_data is answered by the analysis server (the background uploads the
// filtered hands to POST /v1/panel and relays the response). Auth (Google via
// Supabase) is owned by the background: UI surfaces only see AuthState.
export type HudMessage =
  | { type: 'hand_complete'; hand: Hand }
  | { type: 'get_hand_count' }
  | { type: 'export_hands' }
  | { type: 'get_hero_stats'; filter?: StatsFilter }
  | { type: 'get_net_series'; filter?: StatsFilter }
  | { type: 'get_panel_data'; window: number; filter?: StatsFilter }
  | { type: 'get_seat_stats'; tableId: string }
  | { type: 'list_tables'; filter?: StatsFilter }
  | { type: 'list_stake_levels'; filter?: StatsFilter }
  | { type: 'get_hand'; handId: string; tableId?: string }
  | { type: 'import_hands'; jsonl: string }
  | { type: 'get_storage_info' }
  | { type: 'get_auth_state' }
  | { type: 'sign_in' }
  | { type: 'sign_out' };

export type HudResponse =
  | {
      ok: true;
      count?: number;
      files?: number;
      stats?: HeroStats | null;
      series?: number[];
      panel?: PanelData;
      tier?: Tier;          // with panel: the server-resolved license tier
      locked?: string[];    // with panel: view names withheld for this tier
      seatStats?: SeatSessionStats[];
      tables?: TableSummary[];
      stakeLevels?: StakeLevelSummary[];
      hand?: Hand | null;
      imported?: number;
      skipped?: number;
      errors?: string[];
      storage?: StorageInfo;
      auth?: AuthState | null;   // null = signed out
    }
  | { ok: false; error: string };
