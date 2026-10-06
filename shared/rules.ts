// Small rule helpers shared by the server engine and the client UI,
// so both always agree on what a tag, class, race or effect means.

import type { Card, ClassName, EffectKind, MonsterCard, MonsterTag, PlayerEffect, PublicPlayer, RaceName } from "./types";

// Danish display names. Rules keep using the English ids (ClassName/RaceName).
export const CLASS_LABEL: Record<ClassName, string> = { Warrior: "Kriger", Cleric: "Præst", Thief: "Tyv", Wizard: "Troldmand" };
export const CLASS_PLURAL: Record<ClassName, string> = { Warrior: "krigere", Cleric: "præster", Thief: "tyve", Wizard: "troldmænd" };
export const RACE_LABEL: Record<RaceName, string> = { Goblin: "Goblin", Elf: "Elver", Dwarf: "Dværg", Halfling: "Halvling" };
export const RACE_PLURAL: Record<RaceName, string> = { Goblin: "gobliner", Elf: "elvere", Dwarf: "dværge", Halfling: "halvlinger" };

export const levelsText = (n: number) => `${n} ${n === 1 ? "niveau" : "niveauer"}`;
export const treasuresText = (n: number) => `${n} ${n === 1 ? "skat" : "skatte"}`;

const EFFECT_WHAT: Record<EffectKind, (amount: number) => string> = {
  dicePenalty: n => `−${n} på alle dine terningslag (flugt og tyveri)`,
  combatPenalty: n => `−${n} til din side i kamp`,
  noHelp: () => "Ingen kan hjælpe dig i kamp",
  halfSellValue: () => "Dine genstande sælges kun for halv pris",
};
const EFFECT_UNTIL: Record<PlayerEffect["expires"], string> = {
  permanent: "indtil den fjernes med en Andenchancens Ring eller en Præst",
  afterNextCombat: "i din næste kamp",
  afterCombatWin: "indtil du vinder en kamp",
};
// What a lasting effect does, in plain words (shown when a player taps it).
export const describeEffect = (e: Pick<PlayerEffect, "kind" | "amount" | "expires">): string =>
  `${EFFECT_WHAT[e.kind](e.amount)} — ${EFFECT_UNTIL[e.expires]}.`;

export const hasTag =(m: Pick<MonsterCard, "tags">, tag: MonsterTag): boolean => m.tags.includes(tag);

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
