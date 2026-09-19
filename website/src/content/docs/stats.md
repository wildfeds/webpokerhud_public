---
title: Stat glossary
description: What every stat in the HUD, popup and panel means.
order: 20
section: Reference
---

<!-- GENERATED FILE — do not edit. Run `npm run gen:stats`; source of
     truth is src/panel/stat_info.ts in the extension. -->

Every stat shown in the HUD overlay, popup and analysis panel, with the
exact definition the extension computes. These are generated from the
extension's own glossary, so they always match what you see in the tool.

## Steal

Raise first-in from the cutoff, button, or small blind — an attempt to take the blinds before anyone else has entered the pot.

## Steal by position

Your steal frequency split by seat — cutoff / button / small blind. Each is a raise first-in from that position with no one else in the pot.

## Fold BB to steal

Fold in the big blind when facing a single steal-position open (CO/BTN/SB) with no callers.

## Fold SB to steal

Fold in the small blind when facing a single steal-position open (CO/BTN) with no callers.

## Squeeze

Raise facing an open plus at least one cold-caller — “squeezing” the caller between two raises.

## Cold call

Call an open raise at your first decision, from outside the blinds, with no chips already invested.

## 4-bet

Re-raise after your own open was 3-bet.

## Fold to 4-bet

Fold after your own 3-bet was 4-bet.

## Continuation bet

As the preflop aggressor, make the first bet on the street. Turn and river c-bets require having c-bet the street before.

## Fold to c-bet

Fold when facing the preflop aggressor’s continuation bet.

## Check-raise

Check, then raise after an opponent bets on the same street.

## Aggression frequency

Aggressive actions (bets and raises) as a share of all your actions on the street: aggr / (aggr + calls + checks + folds).

## Won when saw flop

Won more money than you put in, over the hands where you saw the flop (WWSF).

## Total winnings

Cumulative net result over all dealt hands, in play order.

## All-in EV (luck-adjusted)

What you “should” have won: in hands that went all-in before the last card with all cards revealed, the actual result is replaced by equity × pot. Running above the total line = running bad; below = running good. Shown only once it differs from the total.

## Fold to 3-bet

% of times you folded after your own preflop raise was re-raised (3-bet).

## Win rate

Average net result per hand played. bb/100 (in the summary above) is the same idea normalised by blind size, so mixed stakes compare.

## bb / 100

Big blinds won per 100 hands — win rate normalised by stake size. Computed per level, then combined, so mixed-stake samples stay comparable.

## Hands won

% of dealt hands where you won money — any pot, with or without showdown.

## Sessions

Continuous stretches of play. A new session starts after 30 minutes without a hand.

## VPIP

Voluntarily put money in pot: % of hands with a preflop call or raise (posting blinds doesn’t count).

## PFR

Preflop raise: % of hands where you raised before the flop.

## 3-bet

Raise when facing exactly the open raise, over your opportunities to do so.

## Aggression factor

(Bets + raises) ÷ calls, across all streets. Higher = more aggressive.

## Went to showdown

% of flops you saw that you took all the way to showdown.

## Won $ at showdown

% of showdowns you reached where you won money (W$SD).
