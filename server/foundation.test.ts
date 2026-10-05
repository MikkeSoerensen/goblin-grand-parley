// @vitest-environment node
// Phase 0: monster tags, lasting effects, card fixes, deck integrity and save migration.
import { afterEach, describe, expect, it } from "vitest";

import { MONSTER_TAGS, buildAllDecks } from "../shared/deck.js";
import type { DungeonCard, EquipmentCard, MonsterCard, PlayerEffect } from "../shared/types.js";
import { addEffect, buildView, handleAction, requiredPasses, setRandomSource } from "./engine.js";
import { deserializeRooms, serializeRooms } from "./persistence.js";
import { ROLL_1, curse, equipment, fixRandom, monster, oneShot, startedTable, type Table } from "./test-helpers.js";

afterEach(() => setRandomSource(Math.random));

const dungeon = (cardId: string): DungeonCard => ({ id: `dg-${cardId}`, cardId, name: cardId, type: "dungeon", deck: "dungeon", effectText: "" });
const fight = (t: Table, level: number, extra: Partial<MonsterCard> = {}, badStuff?: Parameters<typeof monster>[1]) => {
  const m = monster(level, badStuff, extra);
  t.player(0).hand.push(m);
  t.room.currentPhase = 2;
  expect(t.act(0, { type: "lookForTrouble", cardId: m.id })).toBeNull();
  return m;
};
const passAll = (t: Table) => {
  for (const id of requiredPasses(t.room)) expect(handleAction(t.room, id, { type: "pass" }).error).toBeNull();
};
const effect = (kind: PlayerEffect["kind"], expires: PlayerEffect["expires"], amount = 1): Omit<PlayerEffect, "id"> =>
  ({ kind, amount, expires, name: `Test ${kind}`, sourceCardId: "c-test" });

describe("deck integrity", () => {
  const { door, treasure } = buildAllDecks();
  const monsters = door.filter((c): c is MonsterCard => c.type === "monster");

  it("tags every goblin, and every tagged catalog id exists", () => {
    // Named after goblins but not one of them — listed on purpose.
    const notGoblins = new Set(["m-gob-slayer"]);
    for (const m of monsters) {
      if (m.name.toLowerCase().includes("goblin") && !notGoblins.has(m.cardId)) expect(m.tags, m.name).toContain("goblin");
      if (notGoblins.has(m.cardId)) expect(m.tags, m.name).not.toContain("goblin");
    }
    const ids = new Set(monsters.map(m => m.cardId));
    for (const id of Object.keys(MONSTER_TAGS)) expect(ids.has(id), id).toBe(true);
  });

  it("has no two different equipment cards sharing a name", () => {
    const byName = new Map<string, Set<string>>();
    for (const c of treasure.filter((x): x is EquipmentCard => x.type === "equipment")) {
      byName.set(c.name, (byName.get(c.name) ?? new Set()).add(c.cardId));
    }
    for (const [name, ids] of byName) expect(ids.size, name).toBe(1);
  });
});

describe("monster tags", () => {
  it("Goblin Land works off the tag, not the name", () => {
    const t = startedTable(2);
    t.room.activeDungeons.push(dungeon("d-goblin"));
    fight(t, 1, { name: "Totally Not A Goblin", tags: ["goblin"] });
    expect(buildView(t.room, t.ids[0]).combat!.monsterTotal).toBe(4);
  });

  it("a monster named 'goblin' without the tag gets no goblin bonus", () => {
    const t = startedTable(2);
    t.room.activeDungeons.push(dungeon("d-goblin"));
    fight(t, 1, { name: "Goblin Impostor", tags: [] });
    expect(buildView(t.room, t.ids[0]).combat!.monsterTotal).toBe(1);
  });

  it("Goblin swarm joins only when both monsters are tagged goblin", () => {
    const t = startedTable(2);
    fight(t, 1, { tags: ["goblin"] });
    const notGoblin = monster(1, undefined, { name: "Goblin-shaped Rock", tags: [] });
    const goblin = monster(1, undefined, { tags: ["goblin"] });
    t.player(1).hand.push(notGoblin, goblin);
    expect(t.act(1, { type: "playInCombat", cardId: notGoblin.id })).toMatch(/cannot be played/);
    expect(t.act(1, { type: "playInCombat", cardId: goblin.id })).toBeNull();
  });
});

describe("lasting effects", () => {
  it("dice penalty lowers Run Away rolls", () => {
    const t = startedTable(2);
    addEffect(t.room, t.player(0), effect("dicePenalty", "permanent", 2));
    fight(t, 20);
    passAll(t);
    t.act(0, { type: "resolveCombat" });
    fixRandom(0.99); // d6 → 6, −2 = 4: fails
    const { events } = handleAction(t.room, t.ids[0], { type: "runAway" });
    expect(events[0].result).toBe(4);
  });

  it("combat penalty lowers the fighters' total and wears off on a win", () => {
    const t = startedTable(2);
    t.player(0).level = 5;
    addEffect(t.room, t.player(0), effect("combatPenalty", "afterCombatWin", 2));
    fight(t, 1);
    expect(buildView(t.room, t.ids[0]).combat!.playerTotal).toBe(3);
    passAll(t);
    t.act(0, { type: "resolveCombat" });
    expect(t.player(0).effects).toHaveLength(0);
  });

  it("an 'until you win' effect survives a lost fight", () => {
    const t = startedTable(2);
    addEffect(t.room, t.player(0), effect("combatPenalty", "afterCombatWin"));
    fight(t, 20);
    passAll(t);
    t.act(0, { type: "resolveCombat" });
    fixRandom(0.99);
    t.act(0, { type: "runAway" });
    expect(t.room.combat).toBeNull();
    expect(t.player(0).effects).toHaveLength(1);
  });

  it("noHelp blocks asking for help and wears off after the next combat", () => {
    const t = startedTable(2);
    addEffect(t.room, t.player(0), effect("noHelp", "afterNextCombat"));
    t.player(0).level = 5;
    fight(t, 1);
    expect(t.act(0, { type: "askForHelp", helperId: t.ids[1], treasures: 0 })).toMatch(/Social Pariah/);
    passAll(t);
    t.act(0, { type: "resolveCombat" });
    expect(t.player(0).effects).toHaveLength(0);
  });

  it("halfSellValue halves sale value", () => {
    const t = startedTable(2);
    addEffect(t.room, t.player(0), effect("halfSellValue", "permanent"));
    const a = equipment(1, 1000, "head");
    t.player(0).hand.push(a);
    expect(t.act(0, { type: "sell", cardIds: [a.id] })).toMatch(/1000/);
    const b = equipment(1, 1000, "feet");
    t.player(0).hand.push(b);
    expect(t.act(0, { type: "sell", cardIds: [a.id, b.id] })).toBeNull();
    expect(t.player(0).level).toBe(2);
  });

  it("dying clears all effects", () => {
    const t = startedTable(2);
    addEffect(t.room, t.player(1), effect("dicePenalty", "permanent"));
    const death = curse({ kind: "death" });
    t.player(0).hand.push(death);
    t.act(0, { type: "castCurse", cardId: death.id, targetId: t.ids[1] });
    expect(t.player(1).effects).toHaveLength(0);
  });

  it("effects are public: other players see them", () => {
    const t = startedTable(2);
    addEffect(t.room, t.player(1), effect("dicePenalty", "permanent"));
    const seenByOther = buildView(t.room, t.ids[0]).players.find(p => p.id === t.ids[1])!;
    expect(seenByOther.effects.map(e => e.kind)).toEqual(["dicePenalty"]);
  });
});

describe("card fixes", () => {
  it("Amazon only takes hand items", () => {
    const t = startedTable(2);
    const p = t.player(0);
    const helmet = equipment(1, 300, "head");
    const sword = equipment(2, 400, "hand");
    p.equipment.head = helmet;
    p.equipment.hands.push(sword);
    fight(t, 20, {}, { kind: "loseHandItems" });
    passAll(t);
    t.act(0, { type: "resolveCombat" });
    fixRandom(ROLL_1);
    t.act(0, { type: "runAway" });
    expect(p.equipment.hands).toHaveLength(0);
    expect(p.equipment.head).toBe(helmet);
  });
});

describe("save migration", () => {
  it("restores tags and effects on snapshots from older versions", () => {
    const t = startedTable(2);
    const grunt = buildAllDecks().door.find((c): c is MonsterCard => c.cardId === "m-gob-grunt")!;
    t.player(0).hand.push(grunt, oneShot(1));
    const old = JSON.parse(serializeRooms(t.rooms));
    for (const p of old.rooms[0].players) {
      delete p.effects;
      for (const c of p.hand) delete c.tags;
    }
    const restored = deserializeRooms(JSON.stringify(old)).get("TEST")!;
    expect(restored.players.every(p => Array.isArray(p.effects))).toBe(true);
    const back = restored.players[0].hand.find(c => c.id === grunt.id) as MonsterCard;
    expect(back.tags).toEqual(["goblin"]);
  });
});
