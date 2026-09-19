---
title: Data format
description: The versioned, MIT-licensed JSON format for exported hands.
order: 21
section: Reference
---

Your hands are yours. Every hand the extension records can be exported as
[JSON Lines](https://jsonlines.org/) — one `Hand` object per line — in a
**versioned, MIT-licensed format**. The machine-readable contract is the JSON
Schema at [`/schema/hand.v1.json`](/schema/hand.v1.json); this page is the
prose companion.

**Versioning promise:** version 1 will never break. Changes are additive only
(new optional fields); anything breaking bumps the version. A missing
`handVersion` field means version 1. The same schema doubles as the Pro
analysis API's request format.

## Hand

One completed hand — the unit stored and analysed.

| Field | Type | Meaning |
|---|---|---|
| `handVersion` | `1` (optional) | Format version; absent = 1 |
| `handId` | string | Platform-native hand id |
| `tableId` | string | Platform-native table id |
| `platform` | string | e.g. `"bovada"` |
| `timestamp` | integer | Unix ms at hand start |
| `gameType` | string | e.g. `"nlhe"` |
| `stakes` | object | `{ sb, bb }` in chips |
| `maxSeats` | integer | Table size (6, 9, …) |
| `dealerSeat` | integer | Button seat number |
| `heroSeat` | integer | Hero's seat number |
| `players` | `Player[]` | Only seats dealt in |
| `actions` | `Action[]` | Full action history, in order |
| `board` | `Card[]` | Final board (0–5 cards) |
| `totalPot` | number | Total pot before rake |
| `rake` | number | Rake taken |
| `results` | `HandResult[]` | Pot awards and net results |

## Card

A two-character string: rank `2–9`, `T`, `J`, `Q`, `K`, `A` followed by suit
`c`, `d`, `h`, `s`. Examples: `"Ah"`, `"Td"`, `"2c"`.

## Player

| Field | Type | Meaning |
|---|---|---|
| `seat` | integer | Seat number |
| `playerId` | string | Username on named platforms; session-scoped id (`"<platform>:<tableId>:<seat>"`) on anonymous ones |
| `startStack` | number | Stack at hand start, before blinds |
| `cards` | `Card[]` or `null` | Hole cards; `null` until revealed |
| `isHero` | boolean | Whether this is you |

## Action

| Field | Type | Meaning |
|---|---|---|
| `seat` | integer | Acting seat |
| `playerId` | string | Acting player |
| `type` | string | `post_sb`, `post_bb`, `fold`, `check`, `call`, `bet`, `raise`, `all_in`, `show`, `muck` |
| `amount` | number | Chips committed by this action (0 for fold/check/show/muck) |
| `totalStreetBet` | number | Player's total on this street after the action |
| `street` | string | `posting_blinds`, `preflop`, `flop`, `turn`, `river`, `showdown` |
| `stackAfter` | number | Stack remaining after the action |

`bet` is the first aggression on a street; `raise` is aggression after a bet
or raise already exists.

## HandResult

| Field | Type | Meaning |
|---|---|---|
| `seat` | integer | Winning/losing seat |
| `playerId` | string | The player |
| `potWon` | number | Chips awarded from the pot (uncalled-bet returns not included) |
| `netWon` | number | Net chips for the whole hand (end stack − start stack) |

With side pots a player may appear in several `HandResult` entries; `netWon`
is the same whole-hand total in each — don't sum it across entries.

## Validating

Any JSON Schema validator works, e.g. with [ajv](https://ajv.js.org/):

```bash
npx ajv-cli validate -s hand.v1.json -d "hands/*.json" --spec=draft2020
```
