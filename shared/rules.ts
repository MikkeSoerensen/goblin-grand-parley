// Small rule helpers shared by the server engine and the client UI,
// so both always agree on what a tag, class or effect means.

import type { ClassName, EffectKind, MonsterCard, MonsterTag, PlayerEffect, PublicPlayer } from "./types";

export const hasTag = (m: Pick<MonsterCard, "tags">, tag: MonsterTag): boolean => m.tags.includes(tag);

// One place to ask "is this player an X?" — Dual Class (two classes) plugs in here later.
export const hasClass = (p: Pick<PublicPlayer, "playerClass">, name: ClassName): boolean =>
  p.playerClass?.className === name;

export const effectTotal = (p: { effects: PlayerEffect[] }, kind: EffectKind): number =>
  p.effects.filter(e => e.kind === kind).reduce((sum, e) => sum + e.amount, 0);

export const hasEffect = (p: { effects: PlayerEffect[] }, kind: EffectKind): boolean =>
  p.effects.some(e => e.kind === kind);
