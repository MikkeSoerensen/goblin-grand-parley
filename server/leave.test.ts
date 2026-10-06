// @vitest-environment node
// Leaving, restarting, cleaning up the waiting room, and taking over a free seat.
import { afterEach, describe, expect, it } from "vitest";

import { buildView, handleAction, joinRoom, requiredPasses, setConnected, setRandomSource, type Room } from "./engine.js";
import { allCardIds, curse, equipment, monster, oneShot, startedTable, type Table } from "./test-helpers.js";

afterEach(() => setRandomSource(Math.random));

const fight = (t: Table, level: number, badStuff?: Parameters<typeof monster>[1]) => {
  t.room.settings.threat = "calm";
  const m = monster(level, badStuff);
  t.player(0).hand.push(m);
  t.room.currentPhase = 2;
  expect(t.act(0, { type: "lookForTrouble", cardId: m.id })).toBeNull();
};
const sorted = (room: Room) => [...allCardIds(room)].sort();

describe("taking over a free seat", () => {
  it("offers the offline seats instead of a dead end", () => {
    const t = startedTable(3);
    setConnected(t.room, t.ids[1], false);
    const r = joinRoom(t.rooms, { name: "Someone New", roomCode: "TEST" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.freeSeats).toEqual(["Bo"]);
    expect(joinRoom(t.rooms, { name: "bo", roomCode: "TEST" }).ok).toBe(true);
  });

  it("explains when the name is still online, and still lists free seats", () => {
    const t = startedTable(3);
    setConnected(t.room, t.ids[2], false);
    const r = joinRoom(t.rooms, { name: "Ann", roomCode: "TEST" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/still connected/);
      expect(r.freeSeats).toEqual(["Cy"]);
    }
  });
});

describe("leaving the game", () => {
  it("the active player leaving passes the turn on; their cards are discarded, none lost", () => {
    const t = startedTable(3);
    t.player(0).hand.push(oneShot(1));
    t.player(0).equipment.head = equipment(1, 300, "head");
    const before = sorted(t.room);
    const bo = t.ids[1];
    expect(t.act(0, { type: "leaveGame" })).toBeNull();
    expect(t.room.players.map(p => p.id)).not.toContain(t.ids[0]);
    expect(t.room.players[t.room.activePlayerIndex].id).toBe(bo);
    expect(t.room.currentPhase).toBe(1);
    expect(t.room.sessions[t.ids[0]]).toBeUndefined();
    expect(sorted(t.room)).toEqual(before); // their cards moved to the discard piles, none vanished
  });

  it("a non-active player leaving keeps the current turn", () => {
    const t = startedTable(3);
    t.room.activePlayerIndex = 2;
    t.act(0, { type: "leaveGame" });
    expect(t.room.players[t.room.activePlayerIndex].id).toBe(t.ids[2]);
  });

  it("the attacker leaving ends the fight", () => {
    const t = startedTable(3);
    fight(t, 10);
    t.act(0, { type: "leaveGame" });
    expect(t.room.combat).toBeNull();
    expect(t.room.status).toBe("normalTurn");
  });

  it("the helper leaving leaves the attacker to fight alone", () => {
    const t = startedTable(3);
    fight(t, 20);
    t.act(0, { type: "askForHelp", helperId: t.ids[1], treasures: 0 });
    t.act(1, { type: "respondHelp", offerId: t.room.negotiations[0].id, accept: true });
    t.act(1, { type: "leaveGame" });
    expect(t.room.combat?.helperId).toBeNull();
    expect(t.room.combat?.attackerId).toBe(t.ids[0]);
  });

  it("the only looter leaving finishes the looting", () => {
    const t = startedTable(4);
    t.player(2).hand.push(oneShot(1));
    t.player(0).isDead = true;
    t.player(3).isDead = true;
    const death = curse({ kind: "death" });
    t.player(1).hand.push(death);
    t.act(1, { type: "castCurse", cardId: death.id, targetId: t.ids[2] });
    expect(t.room.looting?.orderQueue).toEqual([t.ids[1]]);
    t.act(1, { type: "leaveGame" });
    expect(t.room.looting).toBeNull();
    expect(t.room.status).not.toBe("looting");
  });

  it("the attacker leaving while running away does not hang the fight", () => {
    const t = startedTable(3);
    fight(t, 20, { kind: "loseLevel", amount: 1 });
    for (const id of requiredPasses(t.room)) handleAction(t.room, id, { type: "pass" });
    t.act(0, { type: "resolveCombat" });
    expect(t.room.status).toBe("runAwayRoll");
    t.act(0, { type: "leaveGame" });
    expect(t.room.combat).toBeNull();
    expect(t.room.status).toBe("normalTurn");
  });

  it("with fewer than two players left, the table goes back to the waiting room", () => {
    const t = startedTable(2);
    t.act(1, { type: "leaveGame" });
    expect(t.room.status).toBe("lobby");
    expect(t.room.players).toHaveLength(1);
    expect(buildView(t.room, t.ids[0]).highlights.at(-1)?.text).toMatch(/back to the waiting room/);
  });

  it("works after the game is over too", () => {
    const t = startedTable(3);
    t.room.status = "gameOver";
    expect(t.act(2, { type: "leaveGame" })).toBeNull();
    expect(t.room.players).toHaveLength(2);
  });
});

describe("starting over", () => {
  it("sends everyone back to the waiting room at level 1 with the same seats and settings", () => {
    const t = startedTable(3);
    t.room.settings.winLevel = 15;
    t.player(0).level = 7;
    t.player(1).equipment.head = equipment(2, 400, "head");
    fight(t, 4);
    expect(t.act(2, { type: "restartGame" })).toBeNull();
    expect(t.room.status).toBe("lobby");
    expect(t.room.combat).toBeNull();
    expect(t.room.players.map(p => [p.level, p.hand.length, p.equipment.head])).toEqual([[1, 0, null], [1, 0, null], [1, 0, null]]);
    expect(t.room.settings.winLevel).toBe(15);
    expect(Object.keys(t.room.sessions)).toHaveLength(3); // everyone keeps their seat on their device
    expect(t.act(0, { type: "startGame" })).toBeNull();
    expect(t.room.players.every(p => p.hand.length === 4)).toBe(true);
  });

  it("is refused before a game has started", () => {
    const t = startedTable(2);
    t.room.status = "lobby";
    expect(t.act(0, { type: "restartGame" })).toMatch(/hasn't started/);
  });
});

describe("waiting-room cleanup", () => {
  it("removes an offline seat, but never an online one, yourself, or anyone mid-game", () => {
    const rooms = new Map<string, Room>();
    const ids = ["Ann", "Bo", "Cy"].map(name => {
      const r = joinRoom(rooms, { name, roomCode: "WAIT" });
      if (!r.ok) throw new Error(r.error);
      return r.playerId;
    });
    const room = rooms.get("WAIT")!;
    expect(handleAction(room, ids[0], { type: "removePlayer", playerId: ids[1] }).error).toMatch(/connected/);
    expect(handleAction(room, ids[0], { type: "removePlayer", playerId: ids[0] }).error).toMatch(/another/);
    setConnected(room, ids[1], false);
    expect(handleAction(room, ids[0], { type: "removePlayer", playerId: ids[1] }).error).toBeNull();
    expect(room.players.map(p => p.name)).toEqual(["Ann", "Cy"]);

    handleAction(room, ids[0], { type: "startGame" });
    setConnected(room, ids[2], false);
    expect(handleAction(room, ids[0], { type: "removePlayer", playerId: ids[2] }).error).toMatch(/waiting room/);
  });
});
