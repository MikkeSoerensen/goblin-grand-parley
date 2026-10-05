// Snapshot persistence: every room is written to one JSON file so a game
// survives a server restart or crash. Writes are atomic (tmp file + rename).

import { promises as fs, renameSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import path from "path";

import { MONSTER_IGNORES, MONSTER_TAGS } from "../shared/deck.js";
import { DEFAULT_SETTINGS, type Card } from "../shared/types.js";
import { emptyStats, type Room } from "./engine.js";

const SNAPSHOT_VERSION = 1;
const ROOM_TTL_MS = 7 * 24 * 60 * 60 * 1000; // rooms untouched for a week are dropped

interface Snapshot {
  version: number;
  savedAt: number;
  rooms: Room[];
}

const isRoomLike = (r: unknown): r is Room => {
  if (typeof r !== "object" || r === null) return false;
  const o = r as Record<string, unknown>;
  return typeof o.code === "string" && Array.isArray(o.players) && typeof o.sessions === "object"
    && typeof o.decks === "object" && typeof o.status === "string";
};

export const serializeRooms = (rooms: Map<string, Room>): string => {
  const snap: Snapshot = { version: SNAPSHOT_VERSION, savedAt: Date.now(), rooms: [...rooms.values()] };
  return JSON.stringify(snap);
};

// Every card instance in a room, wherever it currently is.
const allCards = (r: Room): Card[] => [
  ...r.decks.door, ...r.decks.treasure, ...r.decks.dungeon,
  ...r.discards.door, ...r.discards.treasure, ...r.discards.dungeon,
  ...r.table, ...(r.combat?.monsters ?? []), ...(r.looting?.pile ?? []),
  ...r.players.flatMap(p => [...p.hand, ...p.backpack]),
];

// Brings snapshots written by older versions up to the current shape.
const migrateRoom = (r: Room) => {
  r.statusBeforeLooting = r.statusBeforeLooting ?? null;
  r.settings = { ...DEFAULT_SETTINGS, ...r.settings }; // before waiting-room settings existed
  r.stats = { ...emptyStats(), ...r.stats };
  for (const p of r.players) {
    p.equipment.none = p.equipment.none ?? []; // before slotless items existed
    p.effects = p.effects ?? [];               // before lasting effects existed
  }
  for (const c of allCards(r)) {
    if (c.type !== "monster") continue;
    if (!Array.isArray(c.tags)) c.tags = [...(MONSTER_TAGS[c.cardId] ?? [])];
    if (c.ignoresLevelAtOrBelow === undefined && MONSTER_IGNORES[c.cardId] !== undefined) c.ignoresLevelAtOrBelow = MONSTER_IGNORES[c.cardId];
  }
};

// Restored players start offline; they come back via their session token.
export const deserializeRooms = (json: string, now = Date.now()): Map<string, Room> => {
  const data: unknown = JSON.parse(json);
  if (typeof data !== "object" || data === null) throw new Error("Snapshot is not an object.");
  const snap = data as Partial<Snapshot>;
  if (snap.version !== SNAPSHOT_VERSION) throw new Error(`Unsupported snapshot version ${String(snap.version)}.`);
  if (!Array.isArray(snap.rooms)) throw new Error("Snapshot has no rooms array.");

  const rooms = new Map<string, Room>();
  for (const r of snap.rooms) {
    if (!isRoomLike(r)) continue;
    if (now - (r.updatedAt ?? 0) > ROOM_TTL_MS) continue;
    migrateRoom(r);
    for (const p of r.players) p.connected = false;
    rooms.set(r.code, r);
  }
  return rooms;
};

export interface RoomStore {
  load(): Map<string, Room>;
  scheduleSave(): void;
  flush(): void;
}

// Debounced writer. `flush` is synchronous so it can run on process exit.
export const createRoomStore = (file: string, rooms: () => Map<string, Room>, debounceMs = 200): RoomStore => {
  let timer: NodeJS.Timeout | null = null;
  let writing: Promise<void> = Promise.resolve();

  const ensureDir = () => mkdirSync(path.dirname(file), { recursive: true });

  const writeAsync = () => {
    const body = serializeRooms(rooms());
    const tmp = `${file}.tmp`;
    writing = writing
      .then(async () => {
        ensureDir();
        await fs.writeFile(tmp, body, "utf8");
        await fs.rename(tmp, file);
      })
      .catch(err => console.error("⚠️  Could not save game state:", err));
  };

  return {
    load() {
      if (!existsSync(file)) return new Map();
      try {
        return deserializeRooms(readFileSync(file, "utf8"));
      } catch (err) {
        const quarantine = `${file}.corrupt-${Date.now()}`;
        renameSync(file, quarantine);
        console.error(`⚠️  Saved game state was unreadable and has been moved to ${quarantine}:`, err);
        return new Map();
      }
    },
    scheduleSave() {
      if (timer) return;
      timer = setTimeout(() => { timer = null; writeAsync(); }, debounceMs);
    },
    flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      ensureDir();
      const tmp = `${file}.flush.tmp`; // separate from the async writer's tmp file
      writeFileSync(tmp, serializeRooms(rooms()), "utf8");
      renameSync(tmp, file);
    },
  };
};
