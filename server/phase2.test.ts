// @vitest-environment node
// Phase 2: races, Guild Hopper / Mixed Heritage, Forged Guild Papers, and the counterweight monsters.
import { afterEach, describe, expect, it } from "vitest";

import { buildAllDecks } from "../shared/deck.js";
import type { ClassCard, ClassName, DualCard, DungeonCard, ForgedPapersCard, MonsterCard, RaceCard, RaceName } from "../shared/types.js";
import { buildView, handleAction, requiredPasses, setRandomSource } from "./engine.js";
import { allCardIds, curse, equipment, fixRandom, monster, startedTable, type Table } from "./test-helpers.js";

afterEach(() => setRandomSource(Math.random));

let n = 0;
const race = (raceName: RaceName): RaceCard => ({ id: `race-${++n}`, cardId: `r-${raceName}`, name: raceName, type: "race", deck: "door", raceName, effectText: "" });
const cls = (className: ClassName): ClassCard => ({ id: `cls-${++n}`, cardId: `c-${className}`, name: className, type: "class", deck: "door", className, effectText: "" });
const dual = (dualKind: DualCard["dualKind"]): DualCard => ({ id: `dual-${++n}`, cardId: `d-${dualKind}`, name: dualKind === "class" ? "Guild Hopper" : "Mixed Heritage", type: "dual", deck: "door", dualKind, effectText: "" });
const papers = (): ForgedPapersCard => ({ id: `fp-${++n}`, cardId: "t-forged-papers", name: "Forged Guild Papers", type: "forged-papers", deck: "treasure", goldValue: 0, effectText: "" });
const dungeon = (cardId: string): DungeonCard => ({ id: `dg-${cardId}`, cardId, name: cardId, type: "dungeon", deck: "dungeon", effectText: "" });

const play = (t: Table, i: number, card: RaceCard | ClassCard | DualCard) => {
  t.player(i).hand.push(card);
  return t.act(i, { type: "playCard", cardId: card.id });
};
const fight = (t: Table, level: number, extra: Partial<MonsterCard> = {}) => {
  const m = monster(level, undefined, extra);
  t.player(0).hand.push(m);
  t.room.currentPhase = 2;
  expect(t.act(0, { type: "lookForTrouble", cardId: m.id })).toBeNull();
  return m;
};
const calm = (t: Table) => { t.room.settings.threat = "calm"; };

describe("races", () => {
  it("a new race replaces the old one; the same race twice is refused", () => {
    const t = startedTable(2);
    expect(play(t, 0, race("Elf"))).toBeNull();
    expect(play(t, 0, race("Elf"))).toMatch(/already/);
    expect(play(t, 0, race("Dwarf"))).toBeNull();
    expect(t.player(0).race?.raceName).toBe("Dwarf");
    expect(t.room.discards.door.some(c => c.type === "race" && c.raceName === "Elf")).toBe(true);
  });

  it("Elf: +1 to Run Away and a level for helping win", () => {
    const t = startedTable(2);
    calm(t);
    t.player(1).race = race("Elf");
    t.player(0).level = 5;
    fight(t, 1);
    t.act(0, { type: "askForHelp", helperId: t.ids[1], treasures: 0 });
    t.act(1, { type: "respondHelp", offerId: t.room.negotiations[0].id, accept: true });
    t.act(0, { type: "resolveCombat" });
    expect(t.player(1).level).toBe(2);

    const u = startedTable(2);
    calm(u);
    u.player(0).race = race("Elf");
    fight(u, 20);
    for (const id of requiredPasses(u.room)) handleAction(u.room, id, { type: "pass" });
    u.act(0, { type: "resolveCombat" });
    fixRandom(3 / 6 + 0.01); // d6 → 4, +1 = 5: escapes
    expect(handleAction(u.room, u.ids[0], { type: "runAway" }).events[0].result).toBe(5);
  });

  it("Dwarf: a second Big item and one more card at Charity", () => {
    const t = startedTable(2);
    const p = t.player(0);
    p.equipment.bigItem = equipment(3, 300, "bigItem", { isBig: true });
    const plate = equipment(4, 1100, "armor", { isBig: true });
    p.hand.push(plate);
    expect(t.act(0, { type: "equip", cardId: plate.id })).toMatch(/Big item/);
    p.race = race("Dwarf");
    expect(t.act(0, { type: "equip", cardId: plate.id })).toBeNull();

    p.hand.push(...Array.from({ length: 6 }, () => equipment(1, 100, "head")));
    t.room.currentPhase = 4;
    expect(t.act(0, { type: "endTurn" })).toBeNull();
    expect(t.room.charity).toBeNull();
  });

  it("Halfling: the best item in a sale counts double, once per turn", () => {
    const t = startedTable(2);
    const p = t.player(0);
    p.race = race("Halfling");
    const a = equipment(1, 500, "head"), b = equipment(1, 500, "feet");
    p.hand.push(a);
    expect(t.act(0, { type: "sell", cardIds: [a.id] })).toBeNull();
    expect(p.level).toBe(2);
    p.hand.push(b);
    expect(t.act(0, { type: "sell", cardIds: [b.id] })).toMatch(/1000/); // already used this turn
  });

  it("Goblin: Swarm Caller plays a goblin into any fight, once per fight", () => {
    const t = startedTable(3);
    calm(t);
    t.player(1).race = race("Goblin");
    fight(t, 4, { tags: ["beast"] });
    const g1 = monster(2, undefined, { tags: ["goblin"] }), g2 = monster(2, undefined, { tags: ["beast"] }), g3 = monster(1, undefined, { tags: ["goblin"] });
    t.player(1).hand.push(g1, g2, g3);
    expect(t.act(1, { type: "playInCombat", cardId: g2.id })).toMatch(/cannot be played/); // not a goblin
    expect(t.act(1, { type: "playInCombat", cardId: g1.id })).toBeNull();
    // Now a goblin is in the fight, so the normal Goblin swarm rule lets more goblins in anyway.
    expect(t.act(1, { type: "playInCombat", cardId: g3.id })).toBeNull();
    expect(t.room.combat!.monsters).toHaveLength(3);
  });

  it("Goblin: Home Turf gives +3 in Goblin Land", () => {
    const t = startedTable(2);
    calm(t);
    t.room.activeDungeons.push(dungeon("d-goblin"));
    t.player(0).race = race("Goblin");
    fight(t, 1);
    expect(buildView(t.room, t.ids[0]).combat!.playerTotal).toBe(1 + 3);
  });

  it("Identity Crisis takes the race", () => {
    const t = startedTable(2);
    t.player(1).race = race("Elf");
    const c = curse({ kind: "loseRace" });
    t.player(0).hand.push(c);
    t.act(0, { type: "castCurse", cardId: c.id, targetId: t.ids[1] });
    expect(t.player(1).race).toBeNull();
  });
});

describe("Guild Hopper and Mixed Heritage", () => {
  it("allows a second class; losing a class takes the newest one first", () => {
    const t = startedTable(2);
    expect(play(t, 0, cls("Warrior"))).toBeNull();
    expect(play(t, 0, dual("class"))).toBeNull();
    expect(play(t, 0, cls("Wizard"))).toBeNull();
    const p = t.player(0);
    expect([p.playerClass?.className, p.extraClass?.className]).toEqual(["Warrior", "Wizard"]);

    const amnesia = curse({ kind: "loseClass" });
    t.player(1).hand.push(amnesia);
    t.act(1, { type: "castCurse", cardId: amnesia.id, targetId: t.ids[0] });
    expect(p.extraClass).toBeNull();
    expect(p.playerClass?.className).toBe("Warrior");
    expect(p.dualClass).not.toBeNull(); // still in play: a new second class can be played
  });

  it("anti-class bosses only get their bonus once even if both classes are hated", () => {
    const t = startedTable(2);
    calm(t);
    t.player(0).playerClass = cls("Warrior");
    t.player(0).extraClass = cls("Warrior");
    fight(t, 14, { antiClass: { className: "Warrior", bonus: 5 } });
    expect(buildView(t.room, t.ids[0]).combat!.monsterTotal).toBe(19);
  });

  it("Mixed Heritage allows a second race", () => {
    const t = startedTable(2);
    play(t, 0, race("Elf"));
    play(t, 0, dual("race"));
    play(t, 0, race("Goblin"));
    expect([t.player(0).race?.raceName, t.player(0).extraRace?.raceName]).toEqual(["Elf", "Goblin"]);
  });

  it("showing off two classes and two races raises the threat (not when calm)", () => {
    const t = startedTable(2);
    const p = t.player(0);
    p.playerClass = cls("Warrior"); p.extraClass = cls("Thief");
    p.race = race("Elf"); p.extraRace = race("Dwarf");
    fight(t, 5);
    const view = buildView(t.room, t.ids[0]).combat!;
    expect(view.monsterTotal).toBe(5 + 4); // level 1 → threat 0, show-off +2 +2
    expect(view.modifiers.some(m => m.startsWith("Show-off"))).toBe(true);
    t.room.settings.threat = "calm";
    expect(buildView(t.room, t.ids[0]).combat!.monsterTotal).toBe(5);
  });
});

describe("Forged Guild Papers", () => {
  it("lets anyone wear a class item, and the papers stay with it", () => {
    const t = startedTable(2);
    const p = t.player(0);
    const axe = equipment(3, 800, "twoHands", { cardId: "e-bloodaxe", classReq: "Warrior" });
    const fp = papers();
    p.hand.push(axe, fp);
    expect(t.act(0, { type: "equip", cardId: axe.id })).toMatch(/Only a Warrior/);
    expect(t.act(0, { type: "equip", cardId: axe.id, forgedPapersId: fp.id })).toBeNull();
    expect(p.equipment.hands[0].forgedWith?.id).toBe(fp.id);
    expect(p.hand).toHaveLength(0);
  });

  it("refuses papers on an item without a requirement", () => {
    const t = startedTable(2);
    const helm = equipment(1, 300, "head");
    const fp = papers();
    t.player(0).hand.push(helm, fp);
    expect(t.act(0, { type: "equip", cardId: helm.id, forgedPapersId: fp.id })).toMatch(/no requirement/);
    expect(t.player(0).hand).toContain(fp);
  });

  it("a forged item survives losing the class", () => {
    const t = startedTable(2);
    const p = t.player(0);
    p.playerClass = cls("Cleric");
    const halo = equipment(3, 600, "head", { cardId: "e-halo", classReq: "Cleric", forgedWith: papers() });
    p.equipment.head = halo;
    const amnesia = curse({ kind: "loseClass" });
    t.player(1).hand.push(amnesia);
    t.act(1, { type: "castCurse", cardId: amnesia.id, targetId: t.ids[0] });
    expect(p.equipment.head).toBe(halo);
  });

  it("when the item is lost, the papers go to the discard pile too", () => {
    const t = startedTable(2);
    const fp = papers();
    const helm = equipment(3, 600, "head", { classReq: "Cleric", forgedWith: fp });
    t.player(1).equipment.head = helm;
    const c = curse({ kind: "loseItem", slot: "head" });
    t.player(0).hand.push(c);
    t.act(0, { type: "castCurse", cardId: c.id, targetId: t.ids[1] });
    expect(t.room.discards.treasure.map(x => x.id)).toEqual(expect.arrayContaining([helm.id, fp.id]));
    expect(helm.forgedWith).toBeUndefined();
  });
});

describe("counterweight monsters", () => {
  it("Ambush: the next Door card joins when it is a monster", () => {
    const t = startedTable(2);
    calm(t);
    const raiders = monster(6, undefined, { ambush: true, tags: ["goblin"] });
    const backup = monster(4);
    t.room.decks.door.push(backup, raiders); // raiders on top
    expect(t.act(0, { type: "kickDoor" })).toBeNull();
    expect(t.room.combat!.monsters.map(m => m.id)).toEqual([raiders.id, backup.id]);
  });

  it("Ambush: a non-monster goes back on top of the deck unseen", () => {
    const t = startedTable(2);
    const raiders = monster(6, undefined, { ambush: true });
    const curseCard = curse({ kind: "loseLevel", amount: 1 });
    t.room.decks.door.push(curseCard, raiders);
    t.act(0, { type: "kickDoor" });
    expect(t.room.combat!.monsters).toHaveLength(1);
    expect(t.room.decks.door[t.room.decks.door.length - 1]).toBe(curseCard);
  });

  it("Horde: +3 for every other monster in the fight", () => {
    const t = startedTable(2);
    calm(t);
    fight(t, 6, { hordeBonus: 3 });
    t.room.combat!.monsters.push(monster(1), monster(1));
    expect(buildView(t.room, t.ids[0]).combat!.monsterTotal).toBe(6 + 1 + 1 + 6);
  });

  it("anti-race monsters punish the hated race, attacker or helper", () => {
    const t = startedTable(2);
    calm(t);
    t.player(1).race = race("Elf");
    fight(t, 12, { antiRace: { raceName: "Elf", bonus: 5 } });
    expect(buildView(t.room, t.ids[0]).combat!.monsterTotal).toBe(12);
    t.act(0, { type: "askForHelp", helperId: t.ids[1], treasures: 0 });
    t.act(1, { type: "respondHelp", offerId: t.room.negotiations[0].id, accept: true });
    expect(buildView(t.room, t.ids[0]).combat!.monsterTotal).toBe(17);
  });

  it("the real deck contains every new card, all cards accounted for", () => {
    const { door, treasure } = buildAllDecks();
    const ids = new Set([...door, ...treasure].map(c => c.cardId));
    for (const id of ["r-goblin", "r-elf", "r-dwarf", "r-halfling", "c-identity", "d-guild-hopper", "d-mixed-heritage",
      "t-forged-papers", "m-gob-raiders", "m-bandits", "m-skeletons", "m-elf-eater", "m-mithril-wyrm", "m-hound", "m-gob-slayer"]) {
      expect(ids.has(id), id).toBe(true);
    }
    const t = startedTable(2);
    const before = allCardIds(t.room).length;
    expect(new Set(allCardIds(t.room)).size).toBe(before);
  });
});
