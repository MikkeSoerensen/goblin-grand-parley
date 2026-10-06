// @vitest-environment node
// Team mode: teams of two, the teammate always fights along, one gift per turn, inheritance on leaving.
import { afterEach, describe, expect, it } from "vitest";

import { buildView, handleAction, joinRoom, requiredPasses, setConnected, setRandomSource, TEAM_TUNING, type Room } from "./engine.js";
import { allCardIds, curse, equipment, fixRandom, monster, oneShot, startedTable, ROLL_1, type Table } from "./test-helpers.js";

afterEach(() => setRandomSource(Math.random));

// Players 0+1 are team red, 2+3 team blue (4+5 green …). Ann (0) starts.
const teams = (n = 4) => {
  const t = startedTable(n, undefined, true);
  t.room.settings.threat = "calm";
  return t;
};
const fight = (t: Table, i: number, level: number, extra: Parameters<typeof monster>[2] = {}) => {
  const m = monster(level, { kind: "loseLevel", amount: 1 }, extra);
  t.player(i).hand.push(m);
  t.room.activePlayerIndex = t.room.players.findIndex(p => p.id === t.ids[i]);
  t.room.currentPhase = 2;
  t.room.status = "normalTurn";
  t.room.combatFought = false;
  expect(t.act(i, { type: "lookForTrouble", cardId: m.id })).toBeNull();
  return m;
};
const passAll = (t: Table) => { for (const id of requiredPasses(t.room)) handleAction(t.room, id, { type: "pass" }); };
const sorted = (room: Room) => [...allCardIds(room)].sort();

describe("waiting room", () => {
  const lobby = (n: number) => {
    const rooms = new Map<string, Room>();
    const ids = Array.from({ length: n }, (_, i) => {
      const r = joinRoom(rooms, { name: `P${i}`, roomCode: "HOLD" });
      if (!r.ok) throw new Error(r.error);
      return r.playerId;
    });
    const room = rooms.get("HOLD")!;
    const act = (i: number, msg: Parameters<typeof handleAction>[2]) => handleAction(room, ids[i], msg).error;
    return { room, ids, act };
  };

  it("teams hold two players and must all be full before the start", () => {
    const l = lobby(5);
    expect(l.act(0, { type: "chooseTeam", team: "red" })).toMatch(/holdspil til/);
    l.act(0, { type: "updateSettings", settings: { teamMode: true } });
    expect(l.act(0, { type: "chooseTeam", team: "red" })).toBeNull();
    expect(l.act(1, { type: "chooseTeam", team: "red" })).toBeNull();
    expect(l.act(2, { type: "chooseTeam", team: "red" })).toMatch(/fuldt/);
    expect(l.act(0, { type: "startGame" })).toMatch(/lige antal/);
    l.act(4, { type: "leaveGame" });
    expect(l.act(0, { type: "startGame" })).toMatch(/Alle skal vælge/);
    l.act(2, { type: "chooseTeam", team: "blue" });
    l.act(3, { type: "chooseTeam", team: "green" });
    expect(l.act(0, { type: "startGame" })).toMatch(/præcis 2/);
    l.act(3, { type: "chooseTeam", team: "blue" });
    expect(l.act(0, { type: "startGame" })).toBeNull();
  });

  it("seats the teams alternately: A1, B1, C1, A2, B2, C2", () => {
    const t = teams(6);
    expect(t.room.players.map(p => p.name)).toEqual(["Ann", "Cy", "Ed", "Bo", "Di", "Fi"]);
    expect(t.room.players.map(p => p.team)).toEqual(["red", "blue", "green", "red", "blue", "green"]);
  });

  it("shuffling makes full teams of two", () => {
    const l = lobby(6);
    l.act(0, { type: "updateSettings", settings: { teamMode: true } });
    expect(l.act(3, { type: "shuffleTeams" })).toBeNull();
    const counts = new Map<string, number>();
    for (const p of l.room.players) counts.set(p.team!, (counts.get(p.team!) ?? 0) + 1);
    expect([...counts.values()]).toEqual([2, 2, 2]);
    expect(l.act(0, { type: "startGame" })).toBeNull();
  });

  it("takes the bribery dungeon out of the deck", () => {
    const t = teams();
    expect([...t.room.decks.dungeon, ...t.room.discards.dungeon].some(d => d.cardId === "d-bribery")).toBe(false);
  });
});

describe("fighting as a team", () => {
  it("the teammate joins automatically and is not asked to pass", () => {
    const t = teams();
    fight(t, 0, 3);
    const c = t.room.combat!;
    expect(c.helperId).toBe(t.ids[1]);
    expect(requiredPasses(t.room).sort()).toEqual([t.ids[2], t.ids[3]].sort());
    expect(t.act(0, { type: "askForHelp", helperId: t.ids[2], treasures: 1 })).toMatch(/holdkammerat altid/);
  });

  it("monsters grow with the teammate: a share of their power, shown in the breakdown", () => {
    const t = teams();
    t.player(1).level = 5;
    t.player(1).equipment.head = equipment(3, 400, "head");
    fight(t, 0, 4);
    const v = buildView(t.room, t.ids[0]).combat!;
    const bonus = Math.ceil(8 * TEAM_TUNING.share);
    expect(v.monsterTotal).toBe(4 + bonus);
    expect(v.playerTotal).toBe(1 + 8);
    expect(v.modifiers.some(m => m.startsWith("Holdkamp (Bo"))).toBe(true);
  });

  it("only the attacker gets the levels and the treasure", () => {
    const t = teams();
    t.player(1).level = 6;
    fight(t, 0, 2);
    passAll(t);
    expect(t.act(0, { type: "resolveCombat" })).toBeNull();
    expect(t.player(0).level).toBe(2);
    expect(t.player(0).hand.length).toBe(1);
    expect(t.player(1).level).toBe(6);
    expect(t.player(1).hand.length).toBe(0);
  });

  it("a lost fight: both run, both take the Bad Stuff", () => {
    const t = teams();
    t.player(0).level = 3; t.player(1).level = 3;
    fight(t, 0, 20);
    passAll(t);
    t.act(0, { type: "resolveCombat" });
    expect(t.room.status).toBe("runAwayRoll");
    fixRandom(ROLL_1);
    t.act(0, { type: "runAway" });
    expect(t.room.combat).not.toBeNull(); // still waiting for the teammate
    t.act(1, { type: "runAway" });
    expect(t.room.combat).toBeNull();
    expect([t.player(0).level, t.player(1).level]).toEqual([2, 2]);
  });

  it("an offline teammate, or the Pariah curse, means fighting alone", () => {
    const t = teams();
    setConnected(t.room, t.ids[1], false);
    fight(t, 0, 3);
    expect(t.room.combat!.helperId).toBeNull();

    const u = teams();
    u.player(0).effects.push({ id: "fx", kind: "noHelp", amount: 1, name: "Udstødt", sourceCardId: "c-pariah", expires: "afterNextCombat" });
    fight(u, 0, 3);
    expect(u.room.combat!.helperId).toBeNull();
  });

  it("the Slippers drag an opponent in as an extra fighter who gains nothing but shares the Bad Stuff", () => {
    const t = teams();
    t.player(0).equipment.feet = equipment(0, 600, "feet", { cardId: "e-kneepads" });
    t.player(2).level = 8;
    fight(t, 0, 30);
    expect(t.act(0, { type: "forceHelp", targetId: t.ids[1] })).toMatch(/holdkammerat kæmper allerede/);
    expect(t.act(0, { type: "forceHelp", targetId: t.ids[2] })).toBeNull();
    const c = t.room.combat!;
    expect(c.conscriptId).toBe(t.ids[2]);
    expect(requiredPasses(t.room)).toEqual([t.ids[3]]);
    expect(buildView(t.room, t.ids[0]).combat!.playerTotal).toBe(1 + 1 + 8);
    expect(t.act(0, { type: "forceHelp", targetId: t.ids[3] })).toMatch(/allerede tvunget/);

    passAll(t);
    t.act(0, { type: "resolveCombat" });
    fixRandom(ROLL_1);
    for (const i of [0, 1, 2]) t.act(i, { type: "runAway" });
    expect(t.room.combat).toBeNull();
    expect(t.player(2).level).toBe(7);
  });

  it("the teammate can put cards towards the toll", () => {
    const t = teams();
    const mine = equipment(0, 300, "head");
    const theirs = equipment(0, 300, "feet");
    t.player(0).hand.push(mine);
    t.player(1).hand.push(theirs);
    fight(t, 0, 5); // toll 500g
    expect(t.act(2, { type: "pledgeToll", cardIds: [] })).toMatch(/Kun angriberens holdkammerat/);
    expect(t.act(0, { type: "payToll", cardIds: [mine.id] })).toMatch(/500g/);
    expect(t.act(1, { type: "pledgeToll", cardIds: [theirs.id] })).toBeNull();
    const before = sorted(t.room);
    expect(t.act(0, { type: "payToll", cardIds: [mine.id] })).toBeNull();
    expect(t.room.combat).toBeNull();
    expect(t.player(1).hand).toHaveLength(0);
    expect(sorted(t.room)).toEqual(before);
  });
});

describe("helping each other outside fights", () => {
  it("one gift per own turn; equipment lands in the backpack", () => {
    const t = teams();
    const armor = equipment(2, 400, "armor");
    const potion = oneShot(2);
    t.player(0).hand.push(armor, potion);
    expect(t.act(1, { type: "giveToTeammate", cardId: potion.id })).toMatch(/egen tur/);
    expect(t.act(0, { type: "giveToTeammate", cardId: armor.id })).toBeNull();
    expect(t.player(1).backpack.map(c => c.id)).toEqual([armor.id]);
    expect(t.act(0, { type: "giveToTeammate", cardId: potion.id })).toMatch(/allerede givet/);
  });

  it("charity goes to the weakest opponent, never the teammate", () => {
    const t = teams();
    t.player(1).level = 1; t.player(2).level = 4; t.player(3).level = 2;
    for (let i = 0; i < 7; i++) t.player(0).hand.push(oneShot(1));
    t.room.currentPhase = 4;
    t.act(0, { type: "endTurn" });
    expect(t.room.charity?.candidates).toEqual([t.ids[3]]);
  });

  it("the teammate loots a body first", () => {
    const t = teams();
    t.player(0).hand.push(oneShot(1), oneShot(1));
    t.player(2).level = 9; t.player(3).level = 9;
    const death = curse({ kind: "death" });
    t.player(2).hand.push(death);
    t.act(2, { type: "castCurse", cardId: death.id, targetId: t.ids[0] });
    expect(t.room.looting?.orderQueue[0]).toBe(t.ids[1]);
  });
});

describe("leaving a team game", () => {
  it("the teammate left behind keeps two of the leaver's cards; the rest is discarded", () => {
    const t = teams();
    const a = oneShot(1), b = oneShot(2), c = equipment(1, 200, "head");
    t.player(1).hand.push(a, b);
    t.player(1).equipment.head = c;
    t.room.activePlayerIndex = 1; // Cy's turn, not the leaver's
    const before = sorted(t.room);
    t.act(1, { type: "leaveGame" });
    expect(t.room.status).toBe("looting");
    expect(t.room.looting?.reason).toBe("left");
    expect(t.room.looting?.orderQueue).toEqual([t.ids[0], t.ids[0]]);
    t.act(0, { type: "lootBody", cardId: c.id });
    t.act(0, { type: "lootBody", cardId: b.id });
    expect(t.room.looting).toBeNull();
    expect(t.room.status).toBe("normalTurn");
    expect(t.player(0).hand.map(x => x.id)).toEqual([c.id, b.id]);
    expect(sorted(t.room)).toEqual(before);
  });
});

describe("winning as a team", () => {
  it("one player reaching the goal wins it for the team", () => {
    const t = teams();
    t.player(0).level = 9;
    fight(t, 0, 2);
    passAll(t);
    t.act(0, { type: "resolveCombat" });
    expect(t.room.status).toBe("gameOver");
    expect(buildView(t.room, t.ids[1]).highlights.at(-1)?.text).toMatch(/hold Rød \(Ann og Bo\) VINDER/);
  });
});
