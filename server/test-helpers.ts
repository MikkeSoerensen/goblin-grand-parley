// Shared fixtures for engine/transport tests.

import type {
  BadStuffKind, Card, CurseCard, EnhancerCard, EquipmentCard, MonsterCard, OneShotCard, Slot,
} from "../shared/types.js";
import { TEAM_IDS } from "../shared/types.js";
import { createRoom, handleAction, joinRoom, setRandomSource, type Room } from "./engine.js";

let seq = 0;
const tid = (p: string) => `t-${p}-${++seq}`;

export const monster = (level: number, badStuff: BadStuffKind = { kind: "loseLevel", amount: 1 }, extra: Partial<MonsterCard> = {}): MonsterCard => ({
  id: tid("m"), cardId: "m-test", name: `Test Monster ${level}`, type: "monster", deck: "door",
  level, treasures: 1, levelsAwarded: 1, badStuff, badStuffText: "test", ...extra, tags: extra.tags ?? [],
});

export const equipment = (bonus: number, goldValue: number, slot: Slot = "head", extra: Partial<EquipmentCard> = {}): EquipmentCard => ({
  id: tid("e"), cardId: "e-test", name: `Test Gear +${bonus}`, type: "equipment", deck: "treasure",
  bonus, goldValue, slot, isBig: false, ...extra,
});

export const oneShot = (bonus: number): OneShotCard => ({
  id: tid("o"), cardId: "o-test", name: `Potion ${bonus}`, type: "oneshot", deck: "treasure",
  bonus, goldValue: 100, target: "either",
});

export const enhancer = (bonus: number): EnhancerCard => ({
  id: tid("x"), cardId: "x-test", name: `Enhancer ${bonus}`, type: "enhancer", deck: "treasure",
  bonus, goldValue: 0, target: "monster",
});

export const curse = (effect: BadStuffKind): CurseCard => ({
  id: tid("c"), cardId: "c-test", name: "Test Curse", type: "curse", deck: "door", effect, effectText: "test",
});

// Deterministic PRNG (mulberry32).
export const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Forces every die roll / shuffle to return `value` (0 ≤ value < 1). */
export const fixRandom = (value: number) => setRandomSource(() => value);
export const ROLL_1 = 0;     // d6 → 1
export const ROLL_6 = 0.99;  // d6 → 6

export interface Table {
  room: Room;
  rooms: Map<string, Room>;
  ids: string[];
  tokens: string[];
  act: (playerIdx: number, msg: Parameters<typeof handleAction>[2]) => string | null;
  player: (idx: number) => Room["players"][number];
}

/** A started game with `n` players, empty hands and player 0 active. */
export const startedTable = (n: number, names = ["Ann", "Bo", "Cy", "Di", "Ed", "Fi", "Gus", "Hal"], teams = false): Table => {
  const rooms = new Map<string, Room>();
  const ids: string[] = [];
  const tokens: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = joinRoom(rooms, { name: names[i], roomCode: "TEST" });
    if (!r.ok) throw new Error(r.error);
    ids.push(r.playerId);
    tokens.push(r.token);
  }
  const room = rooms.get("TEST")!;
  if (teams) {
    // Players 0+1, 2+3, 4+5 … are teammates. Seats become 0, 2, 4 …, 1, 3, 5 ….
    handleAction(room, ids[0], { type: "updateSettings", settings: { teamMode: true } });
    ids.forEach((id, i) => {
      const e = handleAction(room, id, { type: "chooseTeam", team: TEAM_IDS[Math.floor(i / 2)] }).error;
      if (e) throw new Error(e);
    });
  }
  const err = handleAction(room, ids[0], { type: "startGame" }).error;
  if (err) throw new Error(err);
  // Empty the dealt hands (into the discard piles, so no card leaves the game).
  for (const p of room.players) {
    for (const c of p.hand) (c.deck === "door" ? room.discards.door : room.discards.treasure).push(c);
    p.hand = []; p.handCount = 0;
  }
  return {
    room, rooms, ids, tokens,
    act: (i, msg) => handleAction(room, ids[i], msg).error,
    player: i => room.players.find(p => p.id === ids[i])!,
  };
};

/** Every card instance in every zone of the room (combat clones excluded). */
export const allCardIds = (room: Room): string[] => {
  const out: Card[] = [
    ...room.decks.door, ...room.decks.treasure, ...room.decks.dungeon,
    ...room.discards.door, ...room.discards.treasure, ...room.discards.dungeon,
    ...room.activeDungeons,
    ...(room.looting?.pile ?? []),
  ];
  for (const p of room.players) {
    out.push(...p.hand, ...p.backpack);
    const e = p.equipment;
    for (const c of [e.head, e.armor, e.feet, e.bigItem]) if (c) out.push(c);
    out.push(...e.hands, ...e.none);
    for (const c of [p.playerClass, p.extraClass, p.race, p.extraRace, p.dualClass, p.dualRace, p.companion]) if (c) out.push(c);
  }
  // Forged papers ride along on the item they were played with, wherever it is.
  for (const c of [...out]) if (c.type === "equipment" && c.forgedWith) out.push(c.forgedWith);
  const combatIds = new Set<string>();
  for (const m of room.combat?.monsters ?? []) {
    if (!m.id.includes("-mate-")) { out.push(m); combatIds.add(m.id); }
  }
  // Table mirrors monsters that are in combat; anything else on the table is its own card.
  for (const t of room.table) if (!combatIds.has(t.id)) out.push(t);
  return out.map(c => c.id);
};

export { createRoom };
