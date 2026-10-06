// @vitest-environment node
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { handleAction, type Room } from "./engine.js";
import { createRoomStore, deserializeRooms, serializeRooms } from "./persistence.js";
import { allCardIds, startedTable } from "./test-helpers.js";

const dirs: string[] = [];
const tempDir = () => {
  const d = mkdtempSync(path.join(tmpdir(), "ggp-"));
  dirs.push(d);
  return d;
};
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe("snapshot round-trip", () => {
  it("restores a game in progress exactly, with every player offline", () => {
    const t = startedTable(3);
    handleAction(t.room, t.ids[0], { type: "kickDoor" });
    const restored = deserializeRooms(serializeRooms(t.rooms)).get("TEST")!;

    expect(restored.status).toBe(t.room.status);
    expect(restored.combat).toEqual(t.room.combat);
    expect(restored.sessions).toEqual(t.room.sessions);
    expect([...allCardIds(restored)].sort()).toEqual([...allCardIds(t.room)].sort());
    expect(restored.players.every(p => !p.connected)).toBe(true);
  });

  it("gives cards in saved games their current names, wherever they are", () => {
    const t = startedTable(2);
    const json = serializeRooms(t.rooms);
    const old = JSON.parse(json);
    const p = old.rooms[0].players[0];
    p.hand.push({ id: "x1", cardId: "m-rat", name: "Old Dragon Name", type: "monster", deck: "door" });
    p.equipment.head = { id: "x2", cardId: "e-helm", name: "Old Helmet Name", type: "equipment", deck: "treasure" };
    old.rooms[0].table.push({ id: "x3-mate-1", cardId: "m-rat", name: "Mate of Old Dragon Name", type: "monster", deck: "door" });

    const r = deserializeRooms(JSON.stringify(old)).get("TEST")!;
    expect(r.players[0].hand.at(-1)?.name).toBe("Cinderwyrm the Unfed");
    expect(r.players[0].equipment.head?.name).toBe("Helm of Many Horns");
    expect(r.table.at(-1)?.name).toBe("Evil Twin of Cinderwyrm the Unfed");
  });

  it("drops rooms nobody has touched for a week", () => {
    const t = startedTable(2);
    const now = Date.now();
    t.room.updatedAt = now - 8 * 24 * 60 * 60 * 1000;
    expect(deserializeRooms(serializeRooms(t.rooms), now).size).toBe(0);
  });

  it("rejects snapshots from an unknown version", () => {
    expect(() => deserializeRooms(JSON.stringify({ version: 99, rooms: [] }))).toThrow(/version/);
  });
});

describe("room store", () => {
  it("flushes to disk and loads it back", () => {
    const file = path.join(tempDir(), "nested", "rooms.json");
    const t = startedTable(2);
    createRoomStore(file, () => t.rooms).flush();
    const loaded = createRoomStore(file, () => new Map<string, Room>()).load();
    expect(loaded.get("TEST")?.players.map(p => p.name)).toEqual(["Ann", "Bo"]);
  });

  it("debounces saves", async () => {
    const file = path.join(tempDir(), "rooms.json");
    const t = startedTable(2);
    const store = createRoomStore(file, () => t.rooms, 20);
    store.scheduleSave();
    store.scheduleSave();
    expect(existsSync(file)).toBe(false);
    await new Promise(r => setTimeout(r, 150));
    expect(existsSync(file)).toBe(true);
  });

  it("quarantines a corrupt file instead of crashing", () => {
    const dir = tempDir();
    const file = path.join(dir, "rooms.json");
    writeFileSync(file, "{ not json");
    const loaded = createRoomStore(file, () => new Map<string, Room>()).load();
    expect(loaded.size).toBe(0);
    expect(existsSync(file)).toBe(false);
    expect(readdirSync(dir).some(f => f.startsWith("rooms.json.corrupt-"))).toBe(true);
  });
});
