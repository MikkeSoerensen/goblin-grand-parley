// Small rule helpers shared by the server engine and the client UI,
// so both always agree on what a tag, class, race or effect means.

import type { Card, ClassName, EffectKind, MonsterCard, MonsterTag, PlayerEffect, PublicPlayer, RaceName } from "./types";

export const hasTag = (m: Pick<MonsterCard, "tags">, tag: MonsterTag): boolean => m.tags.includes(tag);

// One place to ask "is this player an X?" — covers a second class (Guild Hopper).
export const hasClass = (p: Pick<PublicPlayer, "playerClass" | "extraClass">, name: ClassName): boolean =>
  p.playerClass?.className === name || p.extraClass?.className === name;

// Same for races — covers a second race (Mixed Heritage).
export const hasRace = (p: Pick<PublicPlayer, "race" | "extraRace">, name: RaceName): boolean =>
  p.race?.raceName === name || p.extraRace?.raceName === name;

export const effectTotal = (p: { effects: PlayerEffect[] }, kind: EffectKind): number =>
  p.effects.filter(e => e.kind === kind).reduce((sum, e) => sum + e.amount, 0);

export const hasEffect = (p: { effects: PlayerEffect[] }, kind: EffectKind): boolean =>
  p.effects.some(e => e.kind === kind);

// The Grand Parley: only cards with a gold value change hands (they can be sold, so they're worth a level).
export const tradeValue = (c: Card): number => ("goldValue" in c ? c.goldValue : 0);
export const isTradable = (c: Card): boolean => tradeValue(c) > 0;

// Toll: buy your way past a fight. Priced on the fight's total (what the combat panel shows).
export const TOLL_MAX_LEVEL = 16;
export const tollPrice = (monsterTotal: number): number | null => {
  if (monsterTotal > TOLL_MAX_LEVEL) return null;
  if (monsterTotal <= 6) return 500;
  if (monsterTotal <= 10) return 500 + 300 * (monsterTotal - 6);
  return 1700 + 600 * (monsterTotal - 10);
};
