// @vitest-environment node
// POC "social chaos": threat scaling, elite monster keywords, leader bounty, Siren turncoats.
import { afterEach, describe, expect, it } from "vitest";

import type { MonsterCard, ServerToClient } from "../shared/types.js";
import { buildView, handleAction, requiredPasses, setRandomSource, type Room } from "./engine.js";
import { ROLL_1, ROLL_6, enhancer, fixRandom, monster, startedTable, type Table } from "./test-helpers.js";

afterEach(() => setRandomSource(Math.random));

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
const monsterTotal = (t: Table) => buildView(t.room, t.ids[0]).combat!.monsterTotal;
const modifiers = (t: Table) => buildView(t.room, t.ids[0]).combat!.modifiers;
const threat = (room: Room, threat: Room["settings"]["threat"]) => { room.settings.threat = threat; };
const recruit = (t: Table, helperIdx: number) => {
  t.act(0, { type: "askForHelp", helperId: t.ids[helperIdx], treasures: 0 });
  const offer = t.room.negotiations.find(o => o.toId === t.ids[helperIdx])!;
  return handleAction(t.room, t.ids[helperIdx], { type: "respondHelp", offerId: offer.id, accept: true });
};

describe("threat", () => {
  it("scales with the attacker's level: calm 0, normal level/3, brutal level/2", () => {
    for (const [setting, expected] of [["calm", 0], ["normal", 3], ["brutal", 4]] as const) {
      const t = startedTable(2);
      threat(t.room, setting);
      t.player(0).level = 9;
      fight(t, 5);
      expect(monsterTotal(t), setting).toBe(5 + expected);
    }
  });

  it("explains itself in the combat breakdown", () => {
    const t = startedTable(2);
    t.player(0).level = 6;
    fight(t, 5);
    expect(modifiers(t)).toContain("Threat (Ann is level 6): +2");
  });
});

describe("elite keywords", () => {
  it("pack hunter: +6 alone, gone once someone helps", () => {
    const t = startedTable(2);
    threat(t.room, "calm");
    fight(t, 10, { packHunter: 6 });
    expect(monsterTotal(t)).toBe(16);
    expect(recruit(t, 1).error).toBeNull();
    expect(monsterTotal(t)).toBe(10);
  });

  it("bounty hunter: +6 only against the sole leader", () => {
    const t = startedTable(3);
    threat(t.room, "calm");
    t.player(0).level = 5;
    fight(t, 12, { huntsLeader: 6 });
    expect(monsterTotal(t)).toBe(18);
    t.player(1).level = 5; // a tie: nobody leads
    expect(monsterTotal(t)).toBe(12);
  });

  it("goblin warlord: +2 for every other goblin in the fight", () => {
    const t = startedTable(2);
    threat(t.room, "calm");
    fight(t, 14, { tags: ["goblin"], swarmBonus: 2 });
    const grunt = monster(1, undefined, { tags: ["goblin"] });
    t.player(1).hand.push(grunt);
    expect(t.act(1, { type: "playInCombat", cardId: grunt.id })).toBeNull();
    expect(monsterTotal(t)).toBe(14 + 1 + 2);
  });

  it("hydra: a failed escape costs EVERY player a level", () => {
    const t = startedTable(3);
    for (const i of [0, 1, 2]) t.player(i).level = 4;
    fight(t, 18, {}, { kind: "everyoneLosesLevel", amount: 1 });
    passAll(t);
    t.act(0, { type: "resolveCombat" });
    fixRandom(ROLL_1);
    t.act(0, { type: "runAway" });
    expect([0, 1, 2].map(i => t.player(i).level)).toEqual([3, 3, 3]);
    expect(t.room.stats.tableHits).toBe(1);
  });
});

describe("Siren's call", () => {
  it("a helper who rolls 1-3 switches sides and must then pass like an opponent", () => {
    const t = startedTable(3);
    threat(t.room, "calm");
    fight(t, 14, { sirenCall: true });
    t.player(1).level = 5;
    fixRandom(ROLL_1);
    const { error, events } = recruit(t, 1);
    expect(error).toBeNull();
    expect((events as Extract<ServerToClient, { type: "rolled" }>[])[0].reason).toBe("Siren's Call");
    const c = t.room.combat!;
    expect(c.helperId).toBeNull();
    expect(c.turncoatId).toBe(t.ids[1]);
    expect(monsterTotal(t)).toBe(14 + 5);
    expect(requiredPasses(t.room)).toContain(t.ids[1]);
    expect(t.room.stats.turncoats).toBe(1);
  });

  it("a helper who rolls 4-6 stays loyal", () => {
    const t = startedTable(2);
    fight(t, 14, { sirenCall: true });
    fixRandom(ROLL_6);
    expect(recruit(t, 1).error).toBeNull();
    expect(t.room.combat!.helperId).toBe(t.ids[1]);
  });
});

describe("bounty on the leader", () => {
  const setup = (attackerLevel: number) => {
    const t = startedTable(3);
    threat(t.room, "calm");
    t.player(0).level = attackerLevel;
    t.player(1).level = 3;
    t.player(2).level = 3;
    fight(t, 4);
    const enraged = enhancer(5);
    t.player(1).hand.push(enraged);
    expect(t.act(1, { type: "playInCombat", cardId: enraged.id, side: "monster" })).toBeNull();
    passAll(t);
    return t;
  };

  it("pays a treasure to each saboteur when the leader loses", () => {
    const t = setup(5); // 5 vs 9: leader loses
    const before = t.player(1).hand.length;
    t.act(0, { type: "resolveCombat" });
    expect(t.room.status).toBe("runAwayRoll");
    expect(t.player(1).hand.length).toBe(before + 1);
    expect(t.player(2).hand.length).toBe(0); // didn't sabotage
    expect(t.room.stats.bounties).toBe(1);
  });

  it("pays nothing when the attacker is not the leader", () => {
    const t = setup(3); // tie at 3: no leader
    const before = t.player(1).hand.length;
    t.act(0, { type: "resolveCombat" });
    expect(t.player(1).hand.length).toBe(before);
  });

  it("pays when the leader gives up and flees", () => {
    const t = setup(5);
    const before = t.player(1).hand.length;
    expect(t.act(0, { type: "flee" })).toBeNull();
    expect(t.player(1).hand.length).toBe(before + 1);
  });
});

describe("settings", () => {
  it("threat can be chosen in the waiting room", () => {
    const t = startedTable(2);
    t.room.status = "lobby";
    expect(t.act(0, { type: "updateSettings", settings: { threat: "brutal" } })).toBeNull();
    expect(t.room.settings.threat).toBe("brutal");
  });
});
