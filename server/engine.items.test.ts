// @vitest-environment node
// Class-unique items, anti-class bosses, trolling potions and the newer dungeons.
import { afterEach, describe, expect, it } from "vitest";

import type { ClassCard, DungeonCard, OneShotCard } from "../shared/types.js";
import { buildView, handleAction, requiredPasses, setRandomSource } from "./engine.js";
import { ROLL_1, ROLL_6, curse, equipment, fixRandom, monster, oneShot, startedTable, type Table } from "./test-helpers.js";

afterEach(() => setRandomSource(Math.random));

type ClassName = ClassCard["className"];
const cls = (name: ClassName): ClassCard => ({
  id: `cls-${name}-${Math.random()}`, cardId: `c-${name.toLowerCase()}`, name, type: "class", deck: "door", className: name, effectText: "",
});
const dungeon = (cardId: string): DungeonCard => ({ id: `dg-${cardId}`, cardId, name: cardId, type: "dungeon", deck: "dungeon", effectText: "" });
const potion = (cardId: string): OneShotCard => ({ ...oneShot(0), cardId });

const fight = (t: Table, level: number, extra: Parameters<typeof monster>[2] = {}, badStuff?: Parameters<typeof monster>[1]) => {
  const m = monster(level, badStuff, extra);
  t.player(0).hand.push(m);
  t.room.currentPhase = 2;
  expect(t.act(0, { type: "lookForTrouble", cardId: m.id })).toBeNull();
  return m;
};
const passAll = (t: Table) => {
  for (const id of requiredPasses(t.room)) expect(handleAction(t.room, id, { type: "pass" }).error).toBeNull();
};
const totals = (t: Table) => {
  const c = buildView(t.room, t.ids[0]).combat!;
  return { players: c.playerTotal, monsters: c.monsterTotal };
};
const withHelper = (t: Table, helperIdx = 1) => {
  t.act(0, { type: "askForHelp", helperId: t.ids[helperIdx], treasures: 0 });
  expect(t.act(helperIdx, { type: "respondHelp", offerId: t.room.negotiations[0].id, accept: true })).toBeNull();
};

describe("class-restricted equipment", () => {
  it("only lets the right class equip a class item", () => {
    const t = startedTable(2);
    const axe = equipment(3, 800, "twoHands", { cardId: "e-bloodaxe", classReq: "Warrior" });
    t.player(0).hand.push(axe);
    expect(t.act(0, { type: "equip", cardId: axe.id })).toMatch(/Only a Warrior/);
    t.player(0).playerClass = cls("Warrior");
    expect(t.act(0, { type: "equip", cardId: axe.id })).toBeNull();
  });

  it("equips a slotless amulet instead of losing it", () => {
    const t = startedTable(2);
    t.player(0).playerClass = cls("Wizard");
    const amulet = equipment(2, 500, "none", { cardId: "e-spell-amulet", classReq: "Wizard" });
    t.player(0).hand.push(amulet);
    expect(t.act(0, { type: "equip", cardId: amulet.id })).toBeNull();
    expect(t.player(0).equipment.none).toEqual([amulet]);
    expect(t.player(0).combatPower).toBe(3);
  });

  it("moves class items to the backpack when the class is replaced", () => {
    const t = startedTable(2);
    const p = t.player(0);
    p.playerClass = cls("Warrior");
    const plate = equipment(3, 600, "armor", { cardId: "e-blood-plate", classReq: "Warrior" });
    p.equipment.armor = plate;
    const thief = cls("Thief");
    p.hand.push(thief);
    expect(t.act(0, { type: "playCard", cardId: thief.id })).toBeNull();
    expect(p.equipment.armor).toBeNull();
    expect(p.backpack).toContain(plate);
  });

  it("moves class items to the backpack on Amnesia", () => {
    const t = startedTable(2);
    const p = t.player(1);
    p.playerClass = cls("Cleric");
    const mace = equipment(4, 700, "hand", { cardId: "e-martyr-mace", classReq: "Cleric" });
    p.equipment.hands.push(mace);
    const amnesia = curse({ kind: "loseClass" });
    t.player(0).hand.push(amnesia);
    expect(t.act(0, { type: "castCurse", cardId: amnesia.id, targetId: t.ids[1] })).toBeNull();
    expect(p.playerClass).toBeNull();
    expect(p.backpack).toContain(mace);
  });
});

describe("item powers", () => {
  it("Halo of Righteousness prevents a death once", () => {
    const t = startedTable(2);
    const p = t.player(1);
    p.playerClass = cls("Cleric");
    p.equipment.head = equipment(3, 600, "head", { cardId: "e-halo", classReq: "Cleric" });
    const death = curse({ kind: "death" });
    t.player(0).hand.push(death);
    t.act(0, { type: "castCurse", cardId: death.id, targetId: t.ids[1] });
    expect(p.isDead).toBe(false);
    expect(p.equipment.head).toBeNull();
  });

  it("Amulet of Spell Reflection cancels a curse from the door", () => {
    const t = startedTable(2);
    const p = t.player(0);
    p.level = 5;
    p.equipment.none.push(equipment(2, 500, "none", { cardId: "e-spell-amulet", classReq: "Wizard" }));
    t.room.decks.door.push(curse({ kind: "loseLevel", amount: 3 }));
    expect(t.act(0, { type: "kickDoor" })).toBeNull();
    expect(p.level).toBe(5);
    expect(t.room.currentPhase).toBe(2);
  });

  it("Blood-Spattered Plate and Mace of the Martyr add to the fighters' total", () => {
    const t = startedTable(2);
    t.player(0).equipment.armor = equipment(3, 600, "armor", { cardId: "e-blood-plate" });
    t.player(1).equipment.hands.push(equipment(4, 700, "hand", { cardId: "e-martyr-mace" }));
    fight(t, 1);
    withHelper(t);
    // 1 + 3 (plate) attacker, 1 + 4 (mace bonus) + 3 (helping) helper — plate only counts vs 2+ monsters
    expect(totals(t).players).toBe(4 + 8);
    t.room.combat!.monsters.push(monster(1));
    expect(totals(t).players).toBe(4 + 8 + 3);
  });

  it("Bloodaxe doubles Berserk", () => {
    const t = startedTable(2);
    const p = t.player(0);
    p.playerClass = cls("Warrior");
    p.equipment.hands.push(equipment(3, 800, "twoHands", { cardId: "e-bloodaxe" }));
    fight(t, 1);
    const fodder = oneShot(1);
    p.hand.push(fodder);
    expect(t.act(0, { type: "useClassAbility", ability: "berserk", cardIds: [fodder.id] })).toBeNull();
    expect(t.room.combat!.attackerBonuses).toBe(2);
  });

  it("Archmage staff lowers Charm to 2 cards, but the Devourer is immune", () => {
    const t = startedTable(2);
    const p = t.player(0);
    p.playerClass = cls("Wizard");
    p.equipment.hands.push(equipment(4, 800, "twoHands", { cardId: "e-archmage-staff" }));
    const devourer = fight(t, 14, { immuneToCharm: true });
    p.hand.push(oneShot(1), oneShot(1));
    expect(t.act(0, { type: "useClassAbility", ability: "charm", cardIds: [], monsterId: devourer.id })).toMatch(/IMMUNE/);
    const goblin = monster(1);
    t.room.combat!.monsters.push(goblin);
    expect(t.act(0, { type: "useClassAbility", ability: "charm", cardIds: [], monsterId: goblin.id })).toBeNull();
  });

  it("Lockpicks let a Thief steal on a 3", () => {
    const t = startedTable(2);
    const p = t.player(0);
    p.playerClass = cls("Thief");
    p.equipment.hands.push(equipment(2, 500, "hand", { cardId: "e-lockpicks" }));
    const loot = equipment(1, 200, "head");
    t.player(1).equipment.head = loot;
    const payment = oneShot(1);
    p.hand.push(payment);
    fixRandom(2 / 6 + 0.01); // d6 → 3
    expect(t.act(0, { type: "useClassAbility", ability: "steal", cardIds: [payment.id], targetId: t.ids[1], targetCardId: loot.id })).toBeNull();
    expect(p.backpack).toContain(loot);
  });

  it("Cloak of Shadows adds exactly +1 to Run Away", () => {
    const t = startedTable(2);
    t.player(0).equipment.armor = equipment(3, 600, "armor", { cardId: "e-shadow-cloak" });
    fight(t, 20);
    passAll(t);
    t.act(0, { type: "resolveCombat" });
    fixRandom(3 / 6 + 0.01); // d6 → 4, +1 = 5 escapes (it was +2 when counted twice)
    const { events } = handleAction(t.room, t.ids[0], { type: "runAway" });
    expect(events[0].result).toBe(5);
  });
});

describe("anti-class bosses", () => {
  it("get their bonus only against the hated class", () => {
    const t = startedTable(2);
    fight(t, 14, { antiClass: { className: "Warrior", bonus: 5 } });
    expect(totals(t).monsters).toBe(14);
    t.player(0).playerClass = cls("Warrior");
    expect(totals(t).monsters).toBe(19);
  });

  it("Juggernaut takes class (and its items) and 2 levels", () => {
    const t = startedTable(2);
    const p = t.player(0);
    p.level = 5;
    p.playerClass = cls("Warrior");
    fight(t, 14, {}, { kind: "loseClassAndLevels", amount: 2 });
    passAll(t);
    t.act(0, { type: "resolveCombat" });
    fixRandom(ROLL_1);
    t.act(0, { type: "runAway" });
    expect(p.playerClass).toBeNull();
    expect(p.level).toBe(3);
  });

  it("Archfiend kills at or below the threshold", () => {
    const t = startedTable(2);
    t.player(0).level = 2;
    t.player(0).hand.push(oneShot(1));
    fight(t, 16, {}, { kind: "loseLevelsOrDie", amount: 2, threshold: 2 });
    passAll(t);
    t.act(0, { type: "resolveCombat" });
    fixRandom(ROLL_1);
    t.act(0, { type: "runAway" });
    expect(t.player(0).isDead).toBe(true);
  });
});

describe("trolling potions", () => {
  it("Flask of Glue makes a fighter fail Run Away even on a 6", () => {
    const t = startedTable(2);
    fight(t, 20);
    const glue = potion("o-flask-glue");
    t.player(1).hand.push(glue);
    expect(t.act(1, { type: "playCard", cardId: glue.id, targetId: t.ids[1] })).toMatch(/fighting/);
    expect(t.act(1, { type: "playCard", cardId: glue.id, targetId: t.ids[0] })).toBeNull();
    passAll(t);
    t.act(0, { type: "resolveCombat" });
    const before = t.player(0).level = 3;
    fixRandom(ROLL_6);
    t.act(0, { type: "runAway" });
    expect(t.player(0).level).toBe(before - 1);
  });

  it("Friendship Potion ends the fight with no rewards", () => {
    const t = startedTable(2);
    const m = fight(t, 20);
    const friends = potion("o-friendship");
    t.player(1).hand.push(friends);
    expect(t.act(1, { type: "playInCombat", cardId: friends.id })).toBeNull();
    expect(t.room.combat).toBeNull();
    expect(t.room.status).toBe("normalTurn");
    expect(t.room.currentPhase).toBe(3);
    expect(t.player(0).level).toBe(1);
    expect(t.room.discards.door).toContain(m);
  });
});

describe("newer dungeons and curses", () => {
  it("Goblin Land gives goblins +3", () => {
    const t = startedTable(2);
    t.room.activeDungeons.push(dungeon("d-goblin"));
    fight(t, 1, { name: "Goblin Grunt", tags: ["goblin"] });
    expect(totals(t).monsters).toBe(4);
  });

  it("Dimension of Hoarding skips charity", () => {
    const t = startedTable(2);
    t.room.activeDungeons.push(dungeon("d-infinite"));
    t.player(0).hand.push(...Array.from({ length: 9 }, () => oneShot(1)));
    expect(t.act(0, { type: "endTurn" })).toBeNull();
    expect(t.room.charity).toBeNull();
    expect(t.room.activePlayerIndex).toBe(1);
  });

  it("Sudden Swaps is a one-time action for the attacker", () => {
    const t = startedTable(2);
    t.room.activeDungeons.push(dungeon("d-swapping"));
    fight(t, 1);
    withHelper(t);
    t.player(1).hand.push(oneShot(1), oneShot(2));
    expect(t.act(1, { type: "suddenSwap" })).toMatch(/Only the attacker/);
    expect(t.act(0, { type: "suddenSwap" })).toBeNull();
    expect(t.player(0).hand).toHaveLength(1);
    expect(t.act(0, { type: "suddenSwap" })).toMatch(/already/);
  });

  it("Robin Hood gives the most valuable equipped item to the lowest level opponent", () => {
    const t = startedTable(3);
    t.player(1).level = 4;
    t.player(2).level = 2;
    const cheap = equipment(1, 100, "head"), pricey = equipment(1, 900, "feet");
    t.player(0).equipment.head = cheap;
    t.player(0).equipment.feet = pricey;
    const robin = curse({ kind: "robinHood" });
    t.player(1).hand.push(robin);
    t.act(1, { type: "castCurse", cardId: robin.id, targetId: t.ids[0] });
    expect(t.player(0).equipment.feet).toBeNull();
    expect(t.player(0).equipment.head).toBe(cheap);
    expect(t.player(2).backpack).toContain(pricey);
  });
});
