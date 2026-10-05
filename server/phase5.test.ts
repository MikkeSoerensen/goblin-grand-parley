// @vitest-environment node
// Phase 5: decks that scale with the table.
import { describe, expect, it } from "vitest";

import { buildAllDecks, deckCopiesFor } from "../shared/deck.js";
import { handleAction, joinRoom, type Room } from "./engine.js";
import { allCardIds } from "./test-helpers.js";

const table = (n: number) => {
  const rooms = new Map<string, Room>();
  for (let i = 0; i < n; i++) joinRoom(rooms, { name: `P${i}`, roomCode: "BIG" });
  const room = rooms.get("BIG")!;
  expect(handleAction(room, room.players[0].id, { type: "startGame" }).error).toBeNull();
  return room;
};

describe("decks scale with the number of players", () => {
  it("one set up to 6 players, two up to 12, three beyond", () => {
    expect([2, 6, 7, 12, 13].map(deckCopiesFor)).toEqual([1, 1, 2, 2, 3]);
  });

  it("doubles Door and Treasure (not Dungeon) with unique ids", () => {
    const one = buildAllDecks(1), two = buildAllDecks(2);
    expect(two.door).toHaveLength(one.door.length * 2);
    expect(two.treasure).toHaveLength(one.treasure.length * 2);
    expect(two.dungeon).toHaveLength(one.dungeon.length);
    const ids = [...two.door, ...two.treasure, ...two.dungeon].map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("a 7-player game is dealt from doubled decks, every card unique", () => {
    const small = table(6), big = table(7);
    expect(allCardIds(big).length).toBeGreaterThan(allCardIds(small).length * 1.8);
    const ids = allCardIds(big);
    expect(new Set(ids).size).toBe(ids.length);
    expect(big.players.every(p => p.hand.length === 4)).toBe(true);
  });
});
