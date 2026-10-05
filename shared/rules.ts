// Small rule helpers shared by the server engine and the client UI,
// so both always agree on what a tag, class, race or effect means.

import type { ClassName, EffectKind, MonsterCard, MonsterTag, PlayerEffect, PublicPlayer, RaceName } from "./types";

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
