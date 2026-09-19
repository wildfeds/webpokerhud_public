import {
  Hand, GameState, Action, ActionType, Street, Card,
  Player, HandResult, SeatState, createEmptyGameState,
} from '../../model';
import { ConnectorEmitter, PlatformConnector } from '../platform_connector';
import {
  decodeCard, tableStateToStreet,
  blindBtnToActionType, selectBtnToActionType, decodeOccupiedSeats,
} from './bovada_parser';

const PLATFORM = 'bovada';

// Raw event forwarded from injected.ts via window.postMessage
type RawEvent = Record<string, unknown>;

export class BovadaConnector extends ConnectorEmitter implements PlatformConnector {

  // ── Session-level state (survives across hands) ───────────────────────────

  private heroId   = '';
  private tableId  = '';
  private heroSeat = 0;
  // Seat stacks after each hand — seeded from PLAY_SEAT_INFO / PLAY_ACCOUNT_CASH_RES,
  // then updated from CO_RESULT_INFO after every hand.
  private persistedStacks: Record<number, number> = {};

  // ── Per-hand state ────────────────────────────────────────────────────────

  private gs: GameState = createEmptyGameState();
  // Pot winners accumulated from CO_POT_INFO before PLAY_STAGE_END_REQ
  private pendingResults: Array<{ seat: number; playerId: string; potWon: number }> = [];

  // ── Public API ────────────────────────────────────────────────────────────

  handleEvent(ev: RawEvent): void {
    switch (ev['pid'] as string) {
      // Session setup
      case 'CONNECT_LOGIN_INFO':    return this.onConnectLoginInfo(ev);
      case 'PLAY_TABLE_NUMBER':     return this.onPlayTableNumber(ev);
      case 'PLAY_SEAT_INFO':        return this.onPlaySeatInfo(ev);
      case 'PLAY_ACCOUNT_CASH_RES': return this.onPlayAccountCashRes(ev);
      // Hand lifecycle
      case 'PLAY_STAGE_INFO':       return this.onPlayStageInfo(ev);
      case 'CO_OPTION_INFO':        return this.onCoOptionInfo(ev);
      case 'CO_TABLE_INFO':         return this.onCoTableInfo(ev);
      case 'CO_TABLE_STATE':        return this.onCoTableState(ev);
      case 'CO_DEALER_SEAT':        return this.onCoDealerSeat(ev);
      case 'CO_BLIND_INFO':         return this.onCoBlindInfo(ev);
      case 'CO_CARDTABLE_INFO':     return this.onCoCardtableInfo(ev);
      case 'CO_SELECT_INFO':        return this.onCoSelectInfo(ev);
      case 'CO_CHIPTABLE_INFO':     return this.onCoChiptableInfo(ev);
      // Board cards
      case 'CO_BCARD3_INFO':        return this.onCoBcard3Info(ev);
      case 'CO_BCARD1_INFO':        return this.onCoBcard1Info(ev);
      // Showdown / result
      case 'CO_PCARD_INFO':         return this.onCoPcardInfo(ev);
      case 'CO_RESULT_INFO':        return this.onCoResultInfo(ev);
      case 'CO_POT_INFO':           return this.onCoPotInfo(ev);
      case 'PLAY_STAGE_END_REQ':    return this.onPlayStageEndReq();
    }
  }

  destroy(): void {
    this.listeners = { hand_complete: [], state_update: [], error: [] };
  }

  // ── Session-level handlers ────────────────────────────────────────────────

  private onConnectLoginInfo(ev: RawEvent): void {
    this.heroId = String(ev['nickName'] ?? '');
    console.log('[BovadaHUD] Connector: hero id =', this.heroId);
  }

  private onPlayTableNumber(ev: RawEvent): void {
    this.tableId    = String(ev['tableNo'] ?? '');
    this.gs.tableId = this.tableId;
    console.log('[BovadaHUD] Connector: table id =', this.tableId);
  }

  private onPlaySeatInfo(ev: RawEvent): void {
    console.log('[BovadaHUD] PLAY_SEAT_INFO', JSON.stringify(ev));
    const seat     = Number(ev['seat']);
    const account  = Number(ev['account']);
    const nickName = String(ev['nickName'] ?? '');

    if (seat && account > 0) this.persistedStacks[seat] = account;

    if (seat && nickName && nickName === this.heroId) {
      this.heroSeat    = seat;
      this.gs.heroSeat = seat;
      if (this.gs.seats[seat]) {
        this.gs.seats[seat]!.isHero   = true;
        this.gs.seats[seat]!.playerId = this.heroId;
      }
    }
  }

  private onPlayAccountCashRes(ev: RawEvent): void {
    const seat = Number(ev['seat']);
    const cash = Number(ev['cash']);
    if (seat && cash > 0) this.persistedStacks[seat] = cash;
  }

  // ── Per-hand handlers ─────────────────────────────────────────────────────

  private onPlayStageInfo(ev: RawEvent): void {
    const stageNo = String(ev['stageNo'] ?? '');
    // Bovada sends PLAY_STAGE_INFO twice around PLAY_STAGE_END_REQ — ignore duplicate
    if (stageNo === this.gs.handId) return;

    this.gs = {
      ...createEmptyGameState(),
      handId:    stageNo,
      tableId:   this.tableId,
      platform:  PLATFORM,
      timestamp: Date.now(),
      heroSeat:  this.heroSeat,
      stakes:    { ...this.gs.stakes },  // carry over stakes until CO_OPTION_INFO arrives
      gameType:  this.gs.gameType,
      maxSeats:  this.gs.maxSeats,       // table properties survive across hands
      occupiedSeats: [...this.gs.occupiedSeats],
    };
    this.pendingResults = [];

    // Pre-populate known seats from persisted stacks
    for (const [seatStr, stack] of Object.entries(this.persistedStacks)) {
      const seat = Number(seatStr);
      this.gs.seats[seat] = this.makeSeat(seat, stack);
    }
  }

  private onCoOptionInfo(ev: RawEvent): void {
    // Rare join-time event — log it whole while the table-size signal is
    // being hunted ("maxSeat" reads 9 even on 6-max tables; gameType2 is a
    // candidate for the real table-size field).
    console.log('[BovadaHUD] CO_OPTION_INFO', JSON.stringify(ev));
    this.gs.stakes   = { sb: Number(ev['sblind']), bb: Number(ev['bblind']) };
    this.gs.gameType = ev['gameType'] === 2 ? 'nlhe' : String(ev['gameType']);
    // "maxSeat" is the seat-array width (9 even on 6-max tables), kept as an
    // upper bound; the chip layout resolves the visual size separately.
    const maxSeat = Number(ev['maxSeat']);
    if (maxSeat > 0) this.gs.maxSeats = maxSeat;
  }

  private onCoTableInfo(ev: RawEvent): void {
    this.gs.dealerSeat = Number(ev['dealerSeat']);
    // Join-time snapshot: seatState[i] (0-indexed → seat i+1); 16/80 =
    // occupied. Kept as UI-only occupancy — NOT merged into gs.seats, whose
    // entries become the hand record's dealt-in players.
    const seatState = ev['seatState'];
    if (Array.isArray(seatState)) {
      this.gs.occupiedSeats = decodeOccupiedSeats(seatState);
      console.log('[BovadaHUD] CO_TABLE_INFO seatState=' + JSON.stringify(seatState)
        + ' account=' + JSON.stringify(ev['account'])
        + ' → occupied=[' + this.gs.occupiedSeats.join(',') + ']');
      this.emit('state_update', this.gs);   // show seat chips on landing
    }
  }

  private onCoTableState(ev: RawEvent): void {
    const street = tableStateToStreet(Number(ev['tableState']));
    if (!street) return;

    // Reset per-street bet tracking when a new post-flop betting round starts
    const isBettingStreet = street === Street.FLOP || street === Street.TURN || street === Street.RIVER;
    if (isBettingStreet && street !== this.gs.street) {
      for (const s of Object.values(this.gs.seats)) s.streetBet = 0;
    }

    this.gs.street = street;
    this.emit('state_update', this.gs);
  }

  private onCoDealerSeat(ev: RawEvent): void {
    this.gs.dealerSeat = Number(ev['seat']);
  }

  private onCoBlindInfo(ev: RawEvent): void {
    const seat    = Number(ev['seat']);
    const account = Number(ev['account']); // stack AFTER posting
    const btn     = Number(ev['btn']);
    const type    = blindBtnToActionType(btn);
    // 'bet' is the actual posted amount — also correct for dead blinds
    // (btn 8, new player posts BB-sized dead blind, not the SB)
    const amount  = Number(ev['bet']);

    if (!this.gs.seats[seat]) {
      // Seat wasn't in persistedStacks — derive startStack from post-blind stack + blind
      this.gs.seats[seat] = this.makeSeat(seat, account + amount);
    }

    const s = this.gs.seats[seat]!;
    s.stack          = account;
    s.streetBet     += amount;
    s.totalInvested += amount;

    this.gs.actions.push(this.makeAction(seat, type, amount, s.streetBet, account));
  }

  private onCoCardtableInfo(ev: RawEvent): void {
    // Keys: "seat1" … "seat9" — hero's seat has real cards; others have [HIDDEN_CARD, HIDDEN_CARD]
    for (const [key, value] of Object.entries(ev)) {
      if (!key.startsWith('seat')) continue;
      const seat  = Number(key.replace('seat', ''));
      const codes = value as number[];
      if (!Array.isArray(codes) || codes.length !== 2) continue;

      const cards = codes.map(decodeCard).filter((c): c is Card => c !== null);

      if (!this.gs.seats[seat]) {
        this.gs.seats[seat] = this.makeSeat(seat, this.persistedStacks[seat] ?? 0);
      }
      this.gs.seats[seat]!.cards = cards.length === 2 ? cards : null;
    }
    this.emit('state_update', this.gs);
  }

  private onCoSelectInfo(ev: RawEvent): void {
    const seat    = Number(ev['seat']);
    const btn     = Number(ev['btn']);
    const account = Number(ev['account']); // stack AFTER the action

    const s = this.gs.seats[seat];
    if (!s) return;

    const type = selectBtnToActionType(btn);
    // Chips committed this action = stack delta. The 'bet' field is not usable
    // uniformly: it holds chips-added for calls but amount-to-call for raises
    // (the raise-to total is in 'raise').
    const amount = Math.max(0, s.stack - account);

    s.stack          = account;
    s.streetBet     += amount;
    s.totalInvested += amount;
    if (type === ActionType.FOLD) s.isActive = false;

    this.gs.actions.push(this.makeAction(seat, type, amount, s.streetBet, account));
    this.emit('state_update', this.gs);
  }

  private onCoChiptableInfo(ev: RawEvent): void {
    const curPot = ev['curPot'] as number[] | undefined;
    if (Array.isArray(curPot)) this.gs.pots = [...curPot];
    const curRake = ev['curRake'] as number[] | undefined;
    if (Array.isArray(curRake)) this.gs.rake = [...curRake];
  }

  private onCoBcard3Info(ev: RawEvent): void {
    // Flop: three cards in a "bcard" array e.g. {"bcard":[33,23,45]}
    const bcard = ev['bcard'] as number[] | undefined;
    if (!Array.isArray(bcard)) return;
    const cards = bcard.map(decodeCard).filter((c): c is Card => c !== null);
    this.gs.board = cards;
    this.emit('state_update', this.gs);
  }

  private onCoBcard1Info(ev: RawEvent): void {
    // Turn or river: single card
    const c = decodeCard(Number(ev['card']));
    if (c) {
      this.gs.board = [...this.gs.board, c];
      this.emit('state_update', this.gs);
    }
  }

  private onCoPcardInfo(ev: RawEvent): void {
    // Opponent hole cards revealed at showdown
    const seat  = Number(ev['seat']);
    const codes = ev['card'] as number[] | undefined;
    if (!Array.isArray(codes) || !this.gs.seats[seat]) return;
    const cards = codes.map(decodeCard).filter((c): c is Card => c !== null);
    if (cards.length > 0) {
      this.gs.seats[seat]!.cards = cards;
      this.emit('state_update', this.gs);
    }
  }

  private onCoResultInfo(ev: RawEvent): void {
    // account is 0-indexed: account[i] = end-of-hand stack for seat i+1
    // (verified: hero's buy-in appears at index heroSeat-1)
    const accounts = ev['account'] as number[];
    if (!Array.isArray(accounts)) return;
    for (let seat = 1; seat <= 9; seat++) {
      const stack = accounts[seat - 1];
      if (stack == null) continue;
      this.persistedStacks[seat] = stack;
      if (this.gs.seats[seat]) this.gs.seats[seat]!.stack = stack;
    }
  }

  private onCoPotInfo(ev: RawEvent): void {
    // returnHi is 0-indexed: returnHi[i] = chips won by seat (i+1)
    const returnHi = ev['returnHi'] as number[];
    if (!Array.isArray(returnHi)) return;
    for (let i = 0; i < 9; i++) {
      const won = returnHi[i];
      if (!won) continue;
      const seat = i + 1;
      this.pendingResults.push({ seat, playerId: this.playerIdFor(seat), potWon: won });
    }
  }

  private onPlayStageEndReq(): void {
    if (!this.gs.handId) return;

    // Only include seats that were actually dealt in (posted a blind or has cards)
    const activeSeatNums = new Set(this.gs.actions.map(a => a.seat));
    const players: Player[] = Object.entries(this.gs.seats)
      .filter(([seatStr]) => activeSeatNums.has(Number(seatStr)))
      .map(([seatStr, s]) => ({
        seat:       Number(seatStr),
        playerId:   s.playerId,
        startStack: s.startStack,
        cards:      s.cards,
        isHero:     s.isHero,
      }));

    // netWon = end-of-hand stack (set by CO_RESULT_INFO) minus start-of-hand
    // stack. Cannot be derived from potWon - invested: returnHi excludes
    // uncalled-bet returns. Falls back to potWon for seats never observed
    // (hand already in progress when capture started).
    const results: HandResult[] = this.pendingResults.map(r => {
      const s = this.gs.seats[r.seat];
      return {
        seat:     r.seat,
        playerId: r.playerId,
        potWon:   r.potWon,
        netWon:   s ? s.stack - s.startStack : r.potWon,
      };
    });

    const hand: Hand = {
      handId:     this.gs.handId,
      tableId:    this.gs.tableId,
      platform:   PLATFORM,
      timestamp:  this.gs.timestamp,
      gameType:   this.gs.gameType,
      stakes:     { ...this.gs.stakes },
      maxSeats:   this.gs.maxSeats,
      dealerSeat: this.gs.dealerSeat,
      heroSeat:   this.heroSeat,
      players,
      actions:    [...this.gs.actions],
      board:      [...this.gs.board],
      totalPot:   this.gs.pots.reduce((a, b) => a + b, 0),
      rake:       this.gs.rake.reduce((a, b) => a + b, 0),
      results,
    };

    this.emit('hand_complete', hand);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private makeSeat(seat: number, stack: number): SeatState {
    return {
      playerId:      this.playerIdFor(seat),
      startStack:    stack,
      stack,
      streetBet:     0,
      totalInvested: 0,
      cards:         null,
      isActive:      true,
      isHero:        seat === this.heroSeat,
    };
  }

  private makeAction(
    seat: number, type: ActionType, amount: number,
    totalStreetBet: number, stackAfter: number,
  ): Action {
    return {
      seat,
      playerId: this.playerIdFor(seat),
      type,
      amount,
      totalStreetBet,
      street:   this.gs.street,
      stackAfter,
    };
  }

  private playerIdFor(seat: number): string {
    if (seat === this.heroSeat && this.heroId) return this.heroId;
    return `${PLATFORM}:${this.tableId}:${seat}`;
  }
}
