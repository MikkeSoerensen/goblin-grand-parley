// @vitest-environment node
// Phase 1: interrupt countdown (C1), Epic win levels (B8), tag rules in play (B6).
import { afterEach, describe, expect, it } from "vitest";

import { buildAllDecks } from "../shared/deck.js";
import { DEFAULT_SETTINGS, type MonsterCard, type OneShotCard } from "../shared/types.js";
import { buildView, expireInterrupts, handleAction, joinRoom, requiredPasses, setClock, setConnected, setRandomSource, type Room } from "./engine.js";
import { deserializeRooms, serializeRooms } from "./persistence.js";
import { ROLL_1, monster, oneShot, startedTable, type Table } from "./test-helpers.js";

let clock = 1_000_000;
setClock(() => clock);
afterEach(() => { setRandomSource(Math.random); clock = 1_000_000; });

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
const lobby = (n: number) => {
  const rooms = new Map<string, Room>();
  const ids = Array.from({ length: n }, (_, i) => {
    const r = joinRoom(rooms, { name: `P${i}`, roomCode: "LOBBY" });
    if (!r.ok) throw new Error(r.error);
    return r.playerId;
  });
  return { room: rooms.get("LOBBY")!, ids };
};

describe("C1 interrupt countdown", () => {
  it("starts at 15 s by default and auto-passes when it runs out", () => {
    const t = startedTable(3);
    fight(t, 1);
    expect(buildView(t.room, t.ids[0]).combat!.interruptMsLeft).toBe(15_000);
    expect(t.act(1, { type: "pass" })).toBeNull();
    clock += 14_999;
    expect(expireInterrupts(t.room)).toBe(false);
    clock += 1;
    expect(expireInterrupts(t.room)).toBe(true);
    expect(t.room.status).toBe("inCombat");
    expect(t.act(0, { type: "resolveCombat" })).toBeNull();
  });

  it("restarts when someone plays a card", () => {
    const t = startedTable(3);
    fight(t, 1);
    clock += 10_000;
    const potion = oneShot(2);
    t.player(1).hand.push(potion);
    expect(t.act(1, { type: "playInCombat", cardId: potion.id, side: "monster" })).toBeNull();
    expect(buildView(t.room, t.ids[0]).combat!.interruptMsLeft).toBe(15_000);
  });

  it("does not restart when someone merely passes", () => {
    const t = startedTable(3);
    fight(t, 1);
    clock += 5_000;
    t.act(1, { type: "pass" });
    expect(buildView(t.room, t.ids[0]).combat!.interruptMsLeft).toBe(10_000);
  });

  it("stops once everyone has passed, and can be switched off", () => {
    const t = startedTable(2);
    fight(t, 1);
    passAll(t);
    expect(t.room.combat!.interruptDeadline).toBeNull();

    const l = lobby(2);
    expect(handleAction(l.room, l.ids[1], { type: "updateSettings", settings: { interruptSeconds: 0 } }).error).toBeNull();
    handleAction(l.room, l.ids[0], { type: "startGame" });
    const m = monster(1);
    l.room.players[0].hand.push(m);
    l.room.currentPhase = 2;
    handleAction(l.room, l.ids[0], { type: "lookForTrouble", cardId: m.id });
    expect(buildView(l.room, l.ids[0]).combat!.interruptMsLeft).toBeNull();
    clock += 60_000;
    expect(expireInterrupts(l.room)).toBe(false);
  });

  it("restarts when a player reconnects and re-opens the window", () => {
    const t = startedTable(3);
    fight(t, 1);
    t.act(1, { type: "pass" });
    setConnected(t.room, t.ids[2], false);
    expect(t.room.status).toBe("inCombat");
    clock += 3_000;
    setConnected(t.room, t.ids[2], true);
    expect(buildView(t.room, t.ids[0]).combat!.interruptMsLeft).toBe(15_000);
  });
});

describe("B8 winning level", () => {
  it("is chosen in the waiting room and locked after start", () => {
    const l = lobby(2);
    expect(handleAction(l.room, l.ids[0], { type: "updateSettings", settings: { winLevel: 20 } }).error).toBeNull();
    expect(buildView(l.room, l.ids[1]).settings.winLevel).toBe(20);
    handleAction(l.room, l.ids[0], { type: "startGame" });
    expect(handleAction(l.room, l.ids[0], { type: "updateSettings", settings: { winLevel: 10 } }).error).toMatch(/låst/);
  });

  it("caps selling and Level Up! one below the goal, and only combat wins", () => {
    const l = lobby(2);
    handleAction(l.room, l.ids[0], { type: "updateSettings", settings: { winLevel: 15 } });
    handleAction(l.room, l.ids[0], { type: "startGame" });
    const p = l.room.players[0];
    p.level = 13;
    p.hand.push({ id: "up1", cardId: "go-up", name: "Level Up!", type: "go-up-a-level", deck: "treasure", goldValue: 0 });
    expect(handleAction(l.room, p.id, { type: "playCard", cardId: "up1" }).error).toBeNull();
    expect(p.level).toBe(14);
    p.hand.push({ id: "up2", cardId: "go-up", name: "Level Up!", type: "go-up-a-level", deck: "treasure", goldValue: 0 });
    expect(handleAction(l.room, p.id, { type: "playCard", cardId: "up2" }).error).toMatch(/15/);

    // Level 10 is no longer a win
    p.level = 9;
    const m = monster(1);
    p.hand.push(m);
    l.room.currentPhase = 2;
    handleAction(l.room, p.id, { type: "lookForTrouble", cardId: m.id });
    for (const id of requiredPasses(l.room)) handleAction(l.room, id, { type: "pass" });
    handleAction(l.room, p.id, { type: "resolveCombat" });
    expect(p.level).toBe(10);
    expect(l.room.status).not.toBe("gameOver");
  });

  it("rejects invalid settings at the protocol and engine level", () => {
    const l = lobby(2);
    // @ts-expect-error — deliberately invalid
    expect(handleAction(l.room, l.ids[0], { type: "updateSettings", settings: { winLevel: 12 } }).error).toMatch(/Ugyldig/);
  });
});

describe("B6 tags in play", () => {
  it("big monsters ignore weak players: automatic escape, no Bad Stuff", () => {
    const t = startedTable(2);
    t.player(0).level = 4;
    fight(t, 20, { ignoresLevelAtOrBelow: 5 }, { kind: "death" });
    passAll(t);
    t.act(0, { type: "resolveCombat" });
    const { events, error } = handleAction(t.room, t.ids[0], { type: "runAway" });
    expect(error).toBeNull();
    expect(events).toHaveLength(0); // no die was rolled
    expect(t.player(0).isDead).toBe(false);
    expect(t.room.combat).toBeNull();
  });

  it("only monsters that pursue you deal Bad Stuff", () => {
    const t = startedTable(2);
    t.player(0).level = 4;
    fight(t, 20, { ignoresLevelAtOrBelow: 5 }, { kind: "death" });
    t.room.combat!.monsters.push(monster(2, { kind: "loseLevel", amount: 1 }));
    passAll(t);
    t.act(0, { type: "resolveCombat" });
    setRandomSource(() => ROLL_1);
    t.act(0, { type: "runAway" });
    expect(t.player(0).isDead).toBe(false);
    expect(t.player(0).level).toBe(3);
  });

  it("Holy Water gives +5 against Undead and +2 otherwise", () => {
    const holy = (): OneShotCard => ({ ...oneShot(2), cardId: "o-holy-water", tagBonus: { tag: "undead", bonus: 5 } });
    const t = startedTable(2);
    fight(t, 10, { tags: ["undead"] });
    const a = holy();
    t.player(0).hand.push(a);
    t.act(0, { type: "playInCombat", cardId: a.id, side: "attacker" });
    expect(t.room.combat!.attackerBonuses).toBe(5);

    const u = startedTable(2);
    fight(u, 10, { tags: ["beast"] });
    const b = holy();
    u.player(0).hand.push(b);
    u.act(0, { type: "playInCombat", cardId: b.id, side: "attacker" });
    expect(u.room.combat!.attackerBonuses).toBe(2);
  });

  it("the real deck has the new cards wired up", () => {
    const { door, treasure } = buildAllDecks();
    const dragon = door.find((c): c is MonsterCard => c.cardId === "m-rat")!;
    expect(dragon.ignoresLevelAtOrBelow).toBe(5);
    const repellent = treasure.find((c): c is OneShotCard => c.cardId === "o-goblin-repellent")!;
    expect(repellent.tagBonus).toEqual({ tag: "goblin", bonus: 4 });
  });
});

describe("save migration (phase 1)", () => {
  it("gives old rooms default settings and restores 'ignores the weak'", () => {
    const t = startedTable(2);
    const dragon = buildAllDecks().door.find((c): c is MonsterCard => c.cardId === "m-rat")!;
    t.player(0).hand.push(dragon);
    const old = JSON.parse(serializeRooms(t.rooms));
    delete old.rooms[0].settings;
    for (const c of old.rooms[0].players[0].hand) delete c.ignoresLevelAtOrBelow;
    const restored = deserializeRooms(JSON.stringify(old)).get("TEST")!;
    expect(restored.settings).toEqual(DEFAULT_SETTINGS);
    const back = restored.players[0].hand.find(c => c.id === dragon.id) as MonsterCard;
    expect(back.ignoresLevelAtOrBelow).toBe(5);
  });
});
