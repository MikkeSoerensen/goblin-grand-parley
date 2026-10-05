// @vitest-environment node
// Phase 3: lingering curses and remedies, companions, and the Dwarf / Thief buffs.
import { afterEach, describe, expect, it } from "vitest";

import { buildAllDecks } from "../shared/deck.js";
import type { ClassCard, CompanionCard, CurseCard, RaceCard, RemedyCard } from "../shared/types.js";
import { buildView, handleAction, requiredPasses, setRandomSource } from "./engine.js";
import { ROLL_1, curse, equipment, fixRandom, monster, oneShot, startedTable, type Table } from "./test-helpers.js";

afterEach(() => setRandomSource(Math.random));

const deckCard = <T,>(cardId: string): T => {
  const { door, treasure } = buildAllDecks();
  return [...door, ...treasure].find(c => c.cardId === cardId) as T;
};
const cleric = (): ClassCard => ({ id: `cl-${Math.random()}`, cardId: "c-cleric", name: "Cleric", type: "class", deck: "door", className: "Cleric", effectText: "" });
const thief = (): ClassCard => ({ id: `th-${Math.random()}`, cardId: "c-thief", name: "Thief", type: "class", deck: "door", className: "Thief", effectText: "" });
const dwarf = (): RaceCard => ({ id: `dw-${Math.random()}`, cardId: "r-dwarf", name: "Dwarf", type: "race", deck: "door", raceName: "Dwarf", effectText: "" });
const ring = (): RemedyCard => ({ ...deckCard<RemedyCard>("t-ring"), id: `ring-${Math.random()}` });
const buddy = (cardId: string): CompanionCard => ({ ...deckCard<CompanionCard>(cardId), id: `${cardId}-${Math.random()}` });

const fight = (t: Table, level: number, badStuff?: Parameters<typeof monster>[1]) => {
  t.room.settings.threat = "calm";
  const m = monster(level, badStuff);
  t.player(0).hand.push(m);
  t.room.currentPhase = 2;
  expect(t.act(0, { type: "lookForTrouble", cardId: m.id })).toBeNull();
  for (const id of requiredPasses(t.room)) handleAction(t.room, id, { type: "pass" });
  return m;
};
const curseOn = (t: Table, target: number, cardId: string) => {
  const c = { ...deckCard<CurseCard>(cardId), id: `${cardId}-${Math.random()}` };
  const caster = target === 0 ? 1 : 0;
  t.player(caster).hand.push(c);
  expect(t.act(caster, { type: "castCurse", cardId: c.id, targetId: t.ids[target] })).toBeNull();
};

describe("lingering curses", () => {
  it("Goblin on Your Head: −1 on dice until you win a fight", () => {
    const t = startedTable(2);
    curseOn(t, 0, "c-goblin-head");
    expect(t.player(0).effects.map(e => [e.kind, e.amount, e.expires])).toEqual([["dicePenalty", 1, "afterCombatWin"]]);
    expect(t.player(0).effects[0].name).toBe("Goblin on Your Head");
    t.player(0).level = 5;
    fight(t, 1);
    t.act(0, { type: "resolveCombat" });
    expect(t.player(0).effects).toHaveLength(0);
  });

  it("Butterfingers: −2 in the next fight only, win or lose", () => {
    const t = startedTable(2);
    curseOn(t, 0, "c-butterfingers");
    fight(t, 20);
    expect(buildView(t.room, t.ids[0]).combat!.playerTotal).toBe(1 - 2);
    t.act(0, { type: "resolveCombat" });
    fixRandom(0.99);
    t.act(0, { type: "runAway" });
    expect(t.room.combat).toBeNull();
    expect(t.player(0).effects).toHaveLength(0);
  });
});

describe("remedies", () => {
  it("a Ring of Second Chances lifts an effect from any player", () => {
    const t = startedTable(2);
    curseOn(t, 1, "c-coin-purse");
    const r = ring();
    t.player(0).hand.push(r);
    const effectId = t.player(1).effects[0].id;
    expect(t.act(0, { type: "removeEffect", cardId: r.id, targetId: t.ids[1], effectId })).toBeNull();
    expect(t.player(1).effects).toHaveLength(0);
    expect(t.room.discards.treasure).toContain(r);
  });

  it("refuses without a ring or with an unknown effect", () => {
    const t = startedTable(2);
    curseOn(t, 1, "c-coin-purse");
    const potion = oneShot(1);
    t.player(0).hand.push(potion);
    const effectId = t.player(1).effects[0].id;
    expect(t.act(0, { type: "removeEffect", cardId: potion.id, targetId: t.ids[1], effectId })).toMatch(/Ring/);
    const r = ring();
    t.player(0).hand.push(r);
    expect(t.act(0, { type: "removeEffect", cardId: r.id, targetId: t.ids[1], effectId: "nope" })).toMatch(/No such/);
    expect(t.player(0).hand).toContain(r);
  });

  it("a Cleric discards two cards to cleanse anyone", () => {
    const t = startedTable(2);
    curseOn(t, 1, "c-goblin-head");
    const a = oneShot(1), b = oneShot(1);
    t.player(0).hand.push(a, b);
    const effectId = t.player(1).effects[0].id;
    expect(t.act(0, { type: "useClassAbility", ability: "cleanse", cardIds: [a.id, b.id], targetId: t.ids[1], effectId })).toMatch(/Not a Cleric/);
    t.player(0).playerClass = cleric();
    expect(t.act(0, { type: "useClassAbility", ability: "cleanse", cardIds: [a.id, a.id], targetId: t.ids[1], effectId })).toMatch(/exactly 2/);
    expect(t.act(0, { type: "useClassAbility", ability: "cleanse", cardIds: [a.id, b.id], targetId: t.ids[1], effectId })).toBeNull();
    expect(t.player(1).effects).toHaveLength(0);
    expect(t.player(0).hand).toHaveLength(0);
  });
});

describe("companions", () => {
  it("recruiting adds the bonus; a new companion replaces the old", () => {
    const t = startedTable(2);
    const lackey = buddy("t-lackey"), boar = buddy("t-boar");
    t.player(0).hand.push(lackey);
    expect(t.act(0, { type: "playCard", cardId: lackey.id })).toBeNull();
    expect(t.player(0).combatPower).toBe(2);
    t.player(0).hand.push(boar);
    t.act(0, { type: "playCard", cardId: boar.id });
    expect(t.player(0).companion).toBe(boar);
    expect(t.room.discards.treasure).toContain(lackey);
    expect(t.player(0).combatPower).toBe(3);
  });

  it("the Lackey can be sacrificed to escape; the Boar cannot", () => {
    const t = startedTable(2);
    t.player(0).companion = buddy("t-lackey");
    fight(t, 20, { kind: "death" });
    expect(t.act(0, { type: "sacrificeCompanion" })).toMatch(/while running away/);
    t.act(0, { type: "resolveCombat" });
    expect(t.act(0, { type: "sacrificeCompanion" })).toBeNull();
    expect(t.player(0).isDead).toBe(false);
    expect(t.player(0).companion).toBeNull();
    expect(t.room.combat).toBeNull();

    const u = startedTable(2);
    u.player(0).companion = buddy("t-boar");
    fight(u, 20);
    u.act(0, { type: "resolveCombat" });
    expect(u.act(0, { type: "sacrificeCompanion" })).toMatch(/can't cover/);
  });

  it("the Battle Boar adds +1 to Run Away", () => {
    const t = startedTable(2);
    t.player(0).companion = buddy("t-boar");
    fight(t, 20);
    t.act(0, { type: "resolveCombat" });
    fixRandom(2 / 6 + 0.01); // d6 → 3, +1 = 4
    expect(handleAction(t.room, t.ids[0], { type: "runAway" }).events[0].result).toBe(4);
  });

  it("the Greedy Mercenary takes the cheapest card each turn, and leaves an empty hand", () => {
    const t = startedTable(2);
    t.player(0).companion = buddy("t-mercenary");
    const cheap = oneShot(1), pricey = equipment(1, 900, "head");
    cheap.goldValue = 100;
    t.player(0).hand.push(pricey, cheap);
    t.room.currentPhase = 4;
    expect(t.act(0, { type: "endTurn" })).toBeNull();
    expect(t.player(0).hand).toEqual([pricey]);
    expect(t.player(0).companion?.cardId).toBe("t-mercenary");

    t.room.activePlayerIndex = 0;
    t.room.currentPhase = 4;
    t.player(0).hand = [];
    t.act(0, { type: "endTurn" });
    expect(t.player(0).companion).toBeNull();
  });

  it("goes into the loot pile on death and is lost with all items", () => {
    const t = startedTable(3);
    const lackey = buddy("t-lackey");
    t.player(1).companion = lackey;
    const death = curse({ kind: "death" });
    t.player(0).hand.push(death);
    t.act(0, { type: "castCurse", cardId: death.id, targetId: t.ids[1] });
    expect(t.player(1).companion).toBeNull();
    expect(t.room.looting?.pile).toContain(lackey);

    const u = startedTable(2);
    u.player(1).companion = buddy("t-boar");
    const strip = curse({ kind: "loseAllItems" });
    u.player(0).hand.push(strip);
    u.act(0, { type: "castCurse", cardId: strip.id, targetId: u.ids[1] });
    expect(u.player(1).companion).toBeNull();
  });
});

describe("Dwarf and Thief buffs", () => {
  it("Dwarf: +1 per Big item worn, at most +3", () => {
    const t = startedTable(2);
    const p = t.player(0);
    p.race = dwarf();
    p.equipment.armor = equipment(0, 100, "armor", { isBig: true });
    expect(buildView(t.room, t.ids[0]).players[0].combatPower).toBe(2);
    p.equipment.bigItem = equipment(0, 100, "bigItem", { isBig: true });
    p.equipment.feet = equipment(0, 100, "feet", { isBig: true });
    p.equipment.hands = [equipment(0, 100, "twoHands", { isBig: true })];
    expect(buildView(t.room, t.ids[0]).players[0].combatPower).toBe(1 + 3);
  });

  it("Thief: +1 to Run Away and steals land on a 3", () => {
    const t = startedTable(2);
    t.player(0).playerClass = thief();
    fight(t, 20);
    t.act(0, { type: "resolveCombat" });
    fixRandom(3 / 6 + 0.01); // d6 → 4, +1 = 5: escapes
    expect(handleAction(t.room, t.ids[0], { type: "runAway" }).events[0].result).toBe(5);

    const u = startedTable(2);
    u.player(0).playerClass = thief();
    const loot = equipment(1, 200, "head");
    u.player(1).equipment.head = loot;
    const pay = oneShot(1);
    u.player(0).hand.push(pay);
    fixRandom(2 / 6 + 0.01); // d6 → 3
    expect(u.act(0, { type: "useClassAbility", ability: "steal", cardIds: [pay.id], targetId: u.ids[1], targetCardId: loot.id })).toBeNull();
    expect(u.player(0).backpack).toContain(loot);
  });

  it("ROLL_1 still fails a plain Run Away (sanity for the buffs above)", () => {
    const t = startedTable(2);
    fight(t, 20, { kind: "loseLevel", amount: 1 });
    t.player(0).level = 3;
    t.act(0, { type: "resolveCombat" });
    fixRandom(ROLL_1);
    t.act(0, { type: "runAway" });
    expect(t.player(0).level).toBe(2);
  });
});
