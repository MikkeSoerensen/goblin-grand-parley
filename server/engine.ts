// Authoritative Munchkin game engine.
// Pure game rules: no sockets, no file I/O. The transport layer (app.ts) calls
// joinRoom / handleAction / setConnected and broadcasts buildView() afterwards.

import { randomBytes, randomUUID } from "crypto";

import { buildAllDecks } from "../shared/deck.js";
import { effectTotal, hasClass, hasEffect, hasTag } from "../shared/rules.js";
import type {
  ClassName, Card, MonsterCard, EquipmentCard, DungeonCard, PrivatePlayer, PublicPlayer,
  PublicGameState, ClientView, CombatView, Phase, AppStatus, CombatState,
  NegotiationOffer, BadStuffKind, GameAction, ServerToClient, EffectExpiry, PlayerEffect,
} from "../shared/types.js";

// ---------- randomness (injectable for deterministic tests) ----------
let random: () => number = Math.random;
export const setRandomSource = (fn: () => number) => { random = fn; };
const rollD6 = () => 1 + Math.floor(random() * 6);

const shuffle = <T,>(a: T[]): T[] => {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const newId = () => randomUUID().replace(/-/g, "").slice(0, 12);
const newToken = () => randomBytes(24).toString("base64url");

// ---------- Room ----------
export interface Room {
  code: string;
  players: PrivatePlayer[];
  sessions: Record<string, string>; // playerId -> session token (never sent to clients)
  decks: { door: Card[]; treasure: Card[]; dungeon: Card[] };
  discards: { door: Card[]; treasure: Card[]; dungeon: Card[] };
  activeDungeons: DungeonCard[];
  table: Card[];
  status: AppStatus;
  activePlayerIndex: number;
  currentPhase: Phase;
  combat: CombatState | null;
  negotiations: NegotiationOffer[];
  charity: PublicGameState["charity"];
  looting: PublicGameState["looting"];
  log: string[];
  winnerId: string | null;
  combatFought: boolean; // tracks if current turn already had combat
  statusBeforeLooting: AppStatus | null; // restored when looting a body is finished
  updatedAt: number;
}

export type RoomEvent = Extract<ServerToClient, { type: "rolled" }>;

// Events raised while handling one action (dice rolls). Drained by handleAction.
let pendingEvents: RoomEvent[] = [];

const hasDungeon = (room: Room, cardId: string) => room.activeDungeons.some(d => d.cardId === cardId);

const computePower = (p: PrivatePlayer): number => {
  let bonus = 0;
  if (p.equipment.head) bonus += p.equipment.head.bonus;
  if (p.equipment.armor) bonus += p.equipment.armor.bonus;
  if (p.equipment.feet) bonus += p.equipment.feet.bonus;
  if (p.equipment.bigItem) bonus += p.equipment.bigItem.bonus;
  for (const h of p.equipment.hands) bonus += h.bonus;
  for (const n of p.equipment.none) bonus += n.bonus; // slotless items (amulets)
  return p.level + bonus;
};

const refreshDerived = (p: PrivatePlayer) => {
  p.combatPower = computePower(p);
  p.handCount = p.hand.length;
  p.backpackCount = p.backpack.length;
};

const log = (room: Room, msg: string) => {
  room.log.push(msg);
  if (room.log.length > 200) room.log.shift();
};

const drawFromDeck = (room: Room, deck: "door" | "treasure" | "dungeon"): Card | null => {
  if (room.decks[deck].length === 0) {
    if (room.discards[deck].length === 0) return null;
    room.decks[deck] = shuffle(room.discards[deck]);
    room.discards[deck] = [];
    log(room, `(Reshuffled ${deck} discard pile)`);
  }
  return room.decks[deck].pop() ?? null;
};

const discardCard = (room: Room, c: Card) => {
  if (c.deck === "door") room.discards.door.push(c);
  else if (c.deck === "dungeon") room.discards.dungeon.push(c);
  else room.discards.treasure.push(c);
};

const goldValueOf = (c: Card): number => ("goldValue" in c ? c.goldValue : 0);

// ---------- views ----------
const toPublic = (p: PrivatePlayer): PublicPlayer => ({
  id: p.id, name: p.name, level: p.level, equipment: p.equipment,
  handCount: p.hand.length, backpackCount: p.backpack.length,
  combatPower: computePower(p), isDead: p.isDead, connected: p.connected,
  playerClass: p.playerClass,
  effects: p.effects,
});

const monsterTotal = (room: Room, c: CombatState): number => {
  const fighters = [c.attackerId, c.helperId].map(id => room.players.find(p => p.id === id)).filter(Boolean);
  return c.monsters.reduce((s, m) => {
    let lvl = m.level;
    if (hasDungeon(room, "d-martial")) lvl += 2; // Martial Arts: +2 Lvl
    if (hasDungeon(room, "d-feeble")) lvl = Math.max(1, lvl - 5); // Feeble: -5 Lvl (min 1)
    if (hasDungeon(room, "d-goblin") && hasTag(m, "goblin")) lvl += 3; // Goblin Land
    // Anti-Class: bonus hvis angriber ELLER hjælper er den forhadte class.
    const hated = m.antiClass;
    if (hated && fighters.some(f => f && hasClass(f, hated.className as ClassName))) lvl += hated.bonus;
    return s + lvl;
  }, 0) + c.monsterBonuses;
};

const playerSideTotal = (room: Room, c: CombatState): number => {
  const a = room.players.find(p => p.id === c.attackerId);
  let total = (a ? computePower(a) - effectTotal(a, "combatPenalty") : 0) + c.attackerBonuses;
  const multiMonster = c.monsters.length > 1;
  if (a && multiMonster && a.equipment.armor?.cardId === "e-blood-plate") total += 3;
  if (c.helperId) {
    const h = room.players.find(p => p.id === c.helperId);
    if (h) {
      total += computePower(h) - effectTotal(h, "combatPenalty");
      if (h.equipment.hands.some(eq => eq.cardId === "e-martyr-mace")) total += 3;
      if (multiMonster && h.equipment.armor?.cardId === "e-blood-plate") total += 3;
    }
  }
  return total;
};

// Who must click Pass before the attacker may resolve. Disconnected players are
// excluded so a phone going to sleep never deadlocks a combat.
export const requiredPasses = (room: Room): string[] => {
  const c = room.combat;
  if (!c) return [];
  return room.players
    .filter(p => !p.isDead && p.connected && p.id !== c.attackerId && p.id !== c.helperId)
    .map(p => p.id);
};

const allPassed = (room: Room): boolean => {
  const c = room.combat;
  if (!c) return false;
  return requiredPasses(room).every(id => c.passes[id] === true);
};

// Re-evaluates the interrupt gate after passes or (dis)connections change.
const syncCombatGate = (room: Room) => {
  if (!room.combat) return;
  if (room.status !== "waitingForInterrupts" && room.status !== "inCombat") return;
  room.status = allPassed(room) ? "inCombat" : "waitingForInterrupts";
};

export const buildView = (room: Room, selfId: string | null): ClientView => {
  const self = room.players.find(p => p.id === selfId) ?? null;
  const combat: CombatView | null = room.combat
    ? {
        ...room.combat,
        monsterTotal: monsterTotal(room, room.combat),
        playerTotal: playerSideTotal(room, room.combat),
        requiredPasses: requiredPasses(room),
      }
    : null;
  return {
    status: room.status,
    players: room.players.map(toPublic),
    activePlayerIndex: room.activePlayerIndex,
    currentPhase: room.currentPhase,
    doorDeckCount: room.decks.door.length,
    treasureDeckCount: room.decks.treasure.length,
    dungeonDeckCount: room.decks.dungeon.length,
    doorDiscardCount: room.discards.door.length,
    treasureDiscardCount: room.discards.treasure.length,
    dungeonDiscardCount: room.discards.dungeon.length,
    activeDungeons: room.activeDungeons,
    table: room.table,
    combat,
    negotiations: room.negotiations,
    charity: room.charity,
    looting: room.looting,
    log: room.log.slice(-30),
    winnerId: room.winnerId,
    self,
  };
};

// ---------- room creation & sessions ----------
export const createRoom = (code: string): Room => {
  const decks = buildAllDecks();
  return {
    code,
    players: [],
    sessions: {},
    decks: { door: shuffle(decks.door), treasure: shuffle(decks.treasure), dungeon: shuffle(decks.dungeon) },
    discards: { door: [], treasure: [], dungeon: [] },
    activeDungeons: [],
    table: [],
    status: "lobby",
    activePlayerIndex: 0,
    currentPhase: 1,
    combat: null,
    negotiations: [],
    charity: null,
    looting: null,
    log: [`Room ${code} created.`],
    winnerId: null,
    combatFought: false,
    statusBeforeLooting: null,
    updatedAt: Date.now(),
  };
};

export interface JoinRequest { name: string; roomCode: string; token?: string }
export type JoinResult =
  | { ok: true; room: Room; playerId: string; token: string }
  | { ok: false; error: string };

// Identity is the session token, not the name. A name can only be reclaimed
// without a token when its owner is offline (e.g. lost browser storage).
export const joinRoom = (rooms: Map<string, Room>, req: JoinRequest): JoinResult => {
  const code = req.roomCode.toUpperCase();
  const name = req.name.trim().slice(0, 20);
  const existing = rooms.get(code);
  const room = existing ?? createRoom(code);

  if (req.token) {
    const byToken = Object.entries(room.sessions).find(([, t]) => t === req.token);
    const player = byToken && room.players.find(p => p.id === byToken[0]);
    if (player) {
      player.connected = true;
      log(room, `${player.name} reconnected.`);
      syncCombatGate(room);
      room.updatedAt = Date.now();
      return { ok: true, room, playerId: player.id, token: req.token };
    }
  }

  const byName = room.players.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (byName) {
    if (byName.connected) return { ok: false, error: `The name "${byName.name}" is already taken in this room.` };
    const token = newToken();
    room.sessions[byName.id] = token;
    byName.connected = true;
    log(room, `${byName.name} reconnected.`);
    syncCombatGate(room);
    room.updatedAt = Date.now();
    return { ok: true, room, playerId: byName.id, token };
  }

  if (room.status !== "lobby") {
    return { ok: false, error: "Game already in progress; use your existing player name to reconnect." };
  }

  const player: PrivatePlayer = {
    id: newId(), name: name || "Player",
    level: 1,
    equipment: { head: null, armor: null, feet: null, hands: [], bigItem: null, none: [] },
    hand: [], backpack: [], handCount: 0, backpackCount: 0,
    combatPower: 1, isDead: false, connected: true, effects: [],
    playerClass: null,
  };
  const token = newToken();
  room.players.push(player);
  room.sessions[player.id] = token;
  log(room, `${player.name} joined ${code}.`);
  if (!existing) rooms.set(code, room);
  room.updatedAt = Date.now();
  return { ok: true, room, playerId: player.id, token };
};

export const setConnected = (room: Room, playerId: string, connected: boolean) => {
  const p = room.players.find(x => x.id === playerId);
  if (!p || p.connected === connected) return;
  p.connected = connected;
  if (!connected) log(room, `${p.name} disconnected.`);
  syncCombatGate(room);
  room.updatedAt = Date.now();
};

// ---------- lasting effects ----------
export const addEffect = (room: Room, p: PrivatePlayer, effect: Omit<PlayerEffect, "id">): PlayerEffect => {
  const e: PlayerEffect = { ...effect, id: newId() };
  p.effects.push(e);
  log(room, `🌀 ${p.name} is now affected by ${e.name}.`);
  return e;
};

export const removeEffect = (room: Room, p: PrivatePlayer, effectId: string): boolean => {
  const idx = p.effects.findIndex(e => e.id === effectId);
  if (idx < 0) return false;
  const [e] = p.effects.splice(idx, 1);
  log(room, `✨ ${e.name} is lifted from ${p.name}.`);
  return true;
};

const expireEffects = (room: Room, p: PrivatePlayer, when: EffectExpiry) => {
  for (const e of p.effects.filter(x => x.expires === when)) removeEffect(room, p, e.id);
};

// ---------- equipment helpers ----------
const handsUsed = (p: PrivatePlayer): number =>
  p.equipment.hands.reduce((n, h) => n + (h.slot === "twoHands" ? 2 : 1), 0);

const tryEquip = (p: PrivatePlayer, card: EquipmentCard): string | null => {
  if (card.cardId === "e-kneepads" && hasClass(p, "Warrior")) {
    return "Warriors are too proud to wear the Kneepads of Allure!";
  }
  if (card.classReq && !hasClass(p, card.classReq)) {
    return `Only a ${card.classReq} can equip this item!`;
  }
  if (card.isBig && p.equipment.bigItem) return "You already have a Big item equipped.";
  switch (card.slot) {
    case "head":
      if (p.equipment.head) return "Head slot occupied.";
      p.equipment.head = card; break;
    case "armor":
      if (p.equipment.armor) return "Armor slot occupied.";
      p.equipment.armor = card; break;
    case "feet":
      if (p.equipment.feet) return "Feet slot occupied.";
      p.equipment.feet = card; break;
    case "hand":
      if (handsUsed(p) >= 2) return "Both hands full.";
      p.equipment.hands.push(card); break;
    case "twoHands":
      if (handsUsed(p) > 0) return "Need both hands free.";
      p.equipment.hands.push(card); break;
    case "bigItem":
      p.equipment.bigItem = card; break;
    case "none":
      // Slotless (fx amuletter): optager ingen plads.
      p.equipment.none.push(card); break;
  }
  return null;
};

const SINGLE_SLOTS = ["head", "armor", "feet", "bigItem"] as const;

const removeEquipped = (p: PrivatePlayer, cardId: string): EquipmentCard | null => {
  for (const s of SINGLE_SLOTS) {
    const eq = p.equipment[s];
    if (eq && eq.id === cardId) { p.equipment[s] = null; return eq; }
  }
  for (const list of [p.equipment.hands, p.equipment.none]) {
    const idx = list.findIndex(h => h.id === cardId);
    if (idx >= 0) return list.splice(idx, 1)[0];
  }
  return null;
};

const allEquipped = (p: PrivatePlayer): EquipmentCard[] => {
  const arr: EquipmentCard[] = [];
  if (p.equipment.head) arr.push(p.equipment.head);
  if (p.equipment.armor) arr.push(p.equipment.armor);
  if (p.equipment.feet) arr.push(p.equipment.feet);
  if (p.equipment.bigItem) arr.push(p.equipment.bigItem);
  arr.push(...p.equipment.hands);
  arr.push(...p.equipment.none);
  return arr;
};

// Udstyr med classReq glider ned i rygsækken, når spilleren ikke længere har den class.
const validateClassEquipment = (room: Room, p: PrivatePlayer) => {
  for (const eq of allEquipped(p)) {
    if (eq.classReq && !hasClass(p, eq.classReq)) {
      removeEquipped(p, eq.id);
      p.backpack.push(eq);
      log(room, `🎒 ${p.name} is no longer a ${eq.classReq}! Their ${eq.name} slides off into their backpack!`);
    }
  }
};

const loseClass = (room: Room, p: PrivatePlayer, msg: string) => {
  if (!p.playerClass) return false;
  log(room, msg);
  room.discards.door.push(p.playerClass);
  p.playerClass = null;
  validateClassEquipment(room, p);
  return true;
};

const discardHand = (room: Room, p: PrivatePlayer) => {
  for (const c of p.hand) discardCard(room, c);
  p.hand = [];
};

const isEquipment = (c: Card): c is EquipmentCard => c.type === "equipment";

// ---------- bad stuff ----------
const applyBadStuff = (room: Room, p: PrivatePlayer, bs: BadStuffKind) => {
  switch (bs.kind) {
    case "loseLevel": {
      const lost = Math.min(bs.amount, Math.max(0, p.level - 1));
      p.level = Math.max(1, p.level - bs.amount);
      log(room, `${p.name} loses ${lost} level(s) → Level ${p.level}.`);
      break;
    }
    case "loseItem": {
      let target: EquipmentCard | null = null;
      const slot = bs.slot;
      const equipped = allEquipped(p);
      if (slot === "any" || slot === "biggest") {
        if (equipped.length === 0 && !p.backpack.some(isEquipment)) { log(room, `${p.name} has no items to lose.`); break; }
        if (equipped.length > 0) {
          target = slot === "biggest"
            ? equipped.slice().sort((a, b) => b.bonus - a.bonus)[0]
            : equipped[0];
        }
      } else if (slot === "hand") target = p.equipment.hands[0] ?? null;
      else if (slot === "twoHands") target = p.equipment.hands.find(h => h.slot === "twoHands") ?? null;
      else if (slot === "none") target = p.equipment.none[0] ?? null;
      else target = p.equipment[slot];
      // also check backpack if no equipped match
      if (!target && (slot === "any" || slot === "biggest")) {
        const eqInBackpack = p.backpack.filter(isEquipment);
        if (eqInBackpack.length) target = slot === "biggest"
          ? eqInBackpack.sort((a, b) => b.bonus - a.bonus)[0]
          : eqInBackpack[0];
      }
      if (target) {
        const removed = removeEquipped(p, target.id);
        if (!removed) {
          const bIdx = p.backpack.findIndex(c => c.id === target!.id);
          if (bIdx >= 0) p.backpack.splice(bIdx, 1);
        }
        room.discards.treasure.push(target);
        log(room, `${p.name} loses ${target.name}.`);
      } else log(room, `${p.name} has no matching item to lose.`);
      break;
    }
    case "loseHandItems": {
      const hands = [...p.equipment.hands];
      if (hands.length === 0) { log(room, `${p.name} has nothing in their hands to lose.`); break; }
      p.equipment.hands = [];
      for (const h of hands) room.discards.treasure.push(h);
      log(room, `${p.name} loses everything in their hands: ${hands.map(h => h.name).join(", ")}.`);
      break;
    }
    case "loseAllItems": {
      const all = [...allEquipped(p), ...p.backpack.filter(isEquipment)];
      for (const c of all) {
        if (!removeEquipped(p, c.id)) {
          const idx = p.backpack.findIndex(x => x.id === c.id);
          if (idx >= 0) p.backpack.splice(idx, 1);
        }
        room.discards.treasure.push(c);
      }
      log(room, `${p.name} loses ALL equipment!`);
      break;
    }
    case "loseHandEquipAndLevel": {
      const lost = Math.min(bs.amount, Math.max(0, p.level - 1));
      if (lost > 0) {
        p.level -= lost;
        log(room, `🩸 The Devourer drains ${p.name}'s magic! They lose ${lost} level(s) → Level ${p.level}.`);
      }
      if (p.hand.length > 0) {
        log(room, `🃏 All ${p.hand.length} cards in ${p.name}'s hand are consumed by the Devourer!`);
        discardHand(room, p);
      }
      const equipped = allEquipped(p);
      if (equipped.length > 0) {
        log(room, `🛡️ All of ${p.name}'s equipped items disintegrate!`);
        for (const c of equipped) {
          removeEquipped(p, c.id);
          room.discards.treasure.push(c);
        }
      }
      break;
    }
    case "loseClassAndLevels": {
      loseClass(room, p, `💀 ${p.name} gets crushed and forgets how to be a ${p.playerClass?.name}!`);
      const lost = Math.min(bs.amount, Math.max(0, p.level - 1));
      if (lost > 0) {
        p.level -= lost;
        log(room, `🩸 The Juggernaut smashes ${p.name} down ${lost} level(s) → Level ${p.level}.`);
      }
      break;
    }
    case "loseClassAndHand": {
      loseClass(room, p, `💀 The Sphinx strips ${p.name} of their Class!`);
      if (p.hand.length > 0) {
        log(room, `🃏 The Sphinx's gaze scatters all ${p.hand.length} cards from ${p.name}'s hand!`);
        discardHand(room, p);
      }
      break;
    }
    case "loseLevelsOrDie": {
      if (p.level <= bs.threshold) {
        log(room, `💀 The Archfiend's dark presence is too much! ${p.name} DIES instantly!`);
        applyBadStuff(room, p, { kind: "death" });
      } else {
        const oldLevel = p.level;
        p.level = Math.max(1, p.level - bs.amount);
        log(room, `🩸 ${p.name}'s faith is shattered! They lose ${oldLevel - p.level} level(s) → Level ${p.level}.`);
      }
      break;
    }
    case "loseClass": {
      if (!loseClass(room, p, `💀 ${p.name} suffers AMNESIA and forgets how to be a ${p.playerClass?.name}!`)) {
        log(room, `💀 ${p.name} suffers Amnesia, but they already had no class to forget!`);
      }
      break;
    }
    case "robinHood": {
      const equipped = allEquipped(p);
      if (equipped.length === 0) {
        log(room, `💀 ${p.name} has no equipped items for Robin Hood to steal.`);
        break;
      }
      const targetItem = equipped.reduce((prev, curr) => (curr.goldValue > prev.goldValue ? curr : prev));
      removeEquipped(p, targetItem.id);
      const opponents = room.players.filter(op => op.id !== p.id && !op.isDead);
      if (opponents.length === 0) {
        room.discards.treasure.push(targetItem);
        log(room, `💀 Robin Hood steals ${targetItem.name} from ${p.name}, but there's no one to give it to! It goes to the discard pile.`);
        break;
      }
      const lowest = opponents.reduce((low, op) => (op.level < low.level ? op : low));
      lowest.backpack.push(targetItem);
      refreshDerived(lowest);
      log(room, `💀 ROBIN HOOD'S REVENGE! ${targetItem.name} is taken from ${p.name} and given to ${lowest.name} (Lvl ${lowest.level})!`);
      break;
    }
    case "death": {
      if (p.equipment.head?.cardId === "e-halo") {
        const halo = p.equipment.head;
        removeEquipped(p, halo.id);
        room.discards.treasure.push(halo);
        log(room, `👼 MIRACLE! ${p.name}'s Halo of Righteousness shatters with a blinding light, saving their life!`);
        break; // Spilleren dør ikke!
      }
      log(room, `💀 ${p.name} has DIED.`);

      // d-doom: Mister 2 levels ved død!
      if (hasDungeon(room, "d-doom")) {
        const oldLvl = p.level;
        p.level = Math.max(1, p.level - 2);
        log(room, `☠️ Impending Doom! ${p.name} loses ${oldLvl - p.level} level(s) to the dungeon!`);
      }
      // body becomes loot pile
      const pile: Card[] = [...allEquipped(p), ...p.backpack, ...p.hand];
      p.equipment = { head: null, armor: null, feet: null, hands: [], bigItem: null, none: [] };
      p.backpack = []; p.hand = [];
      p.isDead = true;
      p.effects = [];
      // Looting order: highest level opponents first, excluding dead one.
      const order = room.players
        .filter(o => o.id !== p.id && !o.isDead)
        .sort((a, b) => b.level - a.level)
        .map(o => o.id);
      if (pile.length > 0 && order.length > 0 && !room.looting) {
        room.statusBeforeLooting = room.status;
        room.looting = { deadId: p.id, pile, orderQueue: order };
        room.status = "looting";
      } else {
        // Ingen at plyndre — eller et andet lig plyndres allerede (Dungeon of Curses): kortene kasseres.
        for (const c of pile) discardCard(room, c);
      }
      break;
    }
  }
  refreshDerived(p);
};

// ---------- portals ----------
const resolvePortal = (room: Room, cardId: string) => {
  const openDungeon = (msg: (name: string) => string) => {
    const newDungeon = drawFromDeck(room, "dungeon");
    if (newDungeon && newDungeon.type === "dungeon") {
      room.activeDungeons.push(newDungeon);
      log(room, msg(newDungeon.name));
    }
  };
  if (cardId === "p-open") {
    openDungeon(n => `🏰 A new dungeon opens: ${n}!`);
  } else if (cardId === "p-close") {
    const closed = room.activeDungeons.pop();
    if (closed) {
      room.discards.dungeon.push(closed);
      log(room, `🏚️ ${closed.name} is closed!`);
    } else {
      log(room, `...but there were no active dungeons to close.`);
    }
  } else if (cardId === "p-swap") {
    while (room.activeDungeons.length > 0) room.discards.dungeon.push(room.activeDungeons.pop()!);
    openDungeon(n => `🌌 Dimensional Shift! New dungeon: ${n}!`);
  }
};

// ---------- combat ----------
const startCombat = (room: Room, attacker: PrivatePlayer, monsterCard: MonsterCard) => {
  room.combat = {
    monsters: [monsterCard],
    monsterBonuses: 0,
    attackerId: attacker.id,
    helperId: null,
    contract: null,
    playedCards: [],
    attackerBonuses: 0,
    passes: Object.fromEntries(room.players.filter(p => p.id !== attacker.id && !p.isDead).map(p => [p.id, false])),
    log: [`⚔️  ${attacker.name} fights ${monsterCard.name} (Lvl ${monsterCard.level})`],
    ranAway: [],
  };
  room.status = "waitingForInterrupts";
  room.combatFought = true;
  syncCombatGate(room);
};

const resetPasses = (room: Room) => {
  if (!room.combat) return;
  for (const k of Object.keys(room.combat.passes)) {
    if (k !== room.combat.attackerId && k !== room.combat.helperId) {
      room.combat.passes[k] = false;
    }
  }
};

// Called after any card is added to an undecided combat.
const reopenInterrupts = (room: Room) => {
  resetPasses(room);
  room.status = "waitingForInterrupts";
  syncCombatGate(room);
};

// Once Run Away is rolled (or the attacker gave up) the fight is decided.
const combatDecided = (room: Room) => room.status === "runAwayRoll";

// Mate-kloner findes kun under kampen; de må aldrig ende i bunken som ekstra kort.
const MATE_CLONE_MARK = "-mate-";
const discardMonster = (room: Room, m: MonsterCard) => {
  if (!m.id.includes(MATE_CLONE_MARK)) room.discards.door.push(m);
};

const endCombat = (room: Room, won = false) => {
  const c = room.combat;
  if (!c) return;
  for (const id of [c.attackerId, c.helperId]) {
    const f = id ? room.players.find(p => p.id === id) : undefined;
    if (!f) continue;
    expireEffects(room, f, "afterNextCombat");
    if (won) expireEffects(room, f, "afterCombatWin");
  }
  for (const m of c.monsters) discardMonster(room, m);
  room.table = room.table.filter(t => !c.monsters.some(m => m.id === t.id));
  room.combat = null;
};

// ---------- victory check ----------
const checkVictory = (room: Room, p: PrivatePlayer, viaCombat: boolean) => {
  if (p.level >= 10 && !viaCombat) {
    p.level = 9; // strict rule: cannot reach 10 except via combat
    return;
  }
  if (p.level >= 10) {
    p.level = 10;
    room.winnerId = p.id;
    room.status = "gameOver";
    log(room, `🏆 ${p.name} reaches Level 10 — VICTORY!`);
  }
};

const isActive = (room: Room, playerId: string) => room.players[room.activePlayerIndex]?.id === playerId;

// ---------- handlers ----------
export const handleAction = (room: Room, playerId: string, msg: GameAction): { error: string | null; events: RoomEvent[] } => {
  pendingEvents = [];
  const error = handle(room, playerId, msg);
  const events = pendingEvents;
  pendingEvents = [];
  room.updatedAt = Date.now();
  return { error, events };
};

const handle = (room: Room, playerId: string, msg: GameAction): string | null => {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return "Unknown player.";
  if (room.status === "gameOver") return "The game is over.";

  switch (msg.type) {
    case "rename": {
      const name = msg.name.trim().slice(0, 20);
      if (!name) return "Name cannot be empty.";
      if (room.players.some(p => p.id !== playerId && p.name.toLowerCase() === name.toLowerCase())) return "Name already taken.";
      player.name = name;
      return null;
    }

    case "startGame": {
      if (room.status !== "lobby") return "Already started.";
      if (room.players.length < 2) return "Need at least 2 players.";
      // Deal 4 cards each (2 door + 2 treasure)
      for (const p of room.players) {
        for (let i = 0; i < 2; i++) {
          const d = drawFromDeck(room, "door"); if (d) p.hand.push(d);
          const t = drawFromDeck(room, "treasure"); if (t) p.hand.push(t);
        }
        refreshDerived(p);
      }
      room.status = "normalTurn";
      room.currentPhase = 1;
      room.combatFought = false;
      log(room, `Game started! ${room.players[0].name} goes first.`);
      return null;
    }

    case "castCurse": {
      // Validér offeret FØR kortet fjernes, så det aldrig havner det forkerte sted.
      const targetPlayer = room.players.find(p => p.id === msg.targetId);
      if (!targetPlayer) return "Target player not found.";

      const cIdx = player.hand.findIndex(c => c.id === msg.cardId);
      const bIdx = player.backpack.findIndex(c => c.id === msg.cardId);
      const source = cIdx >= 0 ? player.hand : bIdx >= 0 ? player.backpack : null;
      const at = cIdx >= 0 ? cIdx : bIdx;
      const card = source?.[at];
      if (!source || !card || card.type !== "curse") return "Card not found or not a curse.";
      source.splice(at, 1);

      log(room, `💀 ${player.name} casts ${card.name} on ${targetPlayer.name}!`);
      applyBadStuff(room, targetPlayer, card.effect);
      room.discards.door.push(card);

      refreshDerived(player);
      refreshDerived(targetPlayer);
      return null;
    }

    case "kickDoor": {
      if (room.status !== "normalTurn" || room.currentPhase !== 1) return "Not Kick Door phase.";
      if (!isActive(room, playerId)) return "Not your turn.";
      const card = drawFromDeck(room, "door");
      if (!card) return "No cards in door deck.";

      // --- PORTALER ---
      if (card.type === "portal") {
        log(room, `🌀 ${player.name} kicks the door and finds a PORTAL: ${card.name}!`);
        resolvePortal(room, card.cardId);
        room.discards.door.push(card);
        log(room, `👢 ${player.name} gets to kick open another door!`);
        refreshDerived(player);
        return null;
      }

      // --- ALMINDELIGE KORT ---
      log(room, `🚪 ${player.name} kicks the door: ${card.name}.`);
      if (card.type === "monster") {
        room.table.push(card);
        startCombat(room, player, card);
      } else if (card.type === "curse") {
        if (player.equipment.none.some(e => e.cardId === "e-spell-amulet")) {
          log(room, `🛡️ ${player.name}'s Amulet of Spell Reflection DESTROYS ${card.name} instantly!`);
        } else if (hasDungeon(room, "d-curses")) {
          log(room, `💀 DUNGEON OF CURSES: ${card.name} hits EVERYONE!`);
          for (const target of room.players.filter(p => !p.isDead)) {
            applyBadStuff(room, target, card.effect);
          }
        } else {
          applyBadStuff(room, player, card.effect);
        }
        room.discards.door.push(card);
        room.currentPhase = 2;
      } else {
        // Hvis det IKKE er monster, portal eller curse (f.eks. Wandering Monster, Mate, Class)
        // lægges det direkte i spillerens hånd, og turen går til Phase 2 (Look for trouble/Loot).
        player.hand.push(card);
        log(room, `🃏 ${player.name} puts ${card.name} in their hand.`);
        refreshDerived(player);
        room.currentPhase = 2;
      }
      return null;
    }

    case "lookForTrouble": {
      if (room.currentPhase !== 2 || room.status !== "normalTurn") return "Not Look-for-Trouble phase.";
      if (!isActive(room, playerId)) return "Not your turn.";
      const idx = player.hand.findIndex(c => c.id === msg.cardId);
      const m = player.hand[idx];
      if (!m || m.type !== "monster") return "Pick a monster from hand.";
      player.hand.splice(idx, 1);
      refreshDerived(player);
      room.table.push(m);
      log(room, `${player.name} looks for trouble: ${m.name}.`);
      startCombat(room, player, m);
      return null;
    }

    case "lootRoom": {
      if (room.status !== "normalTurn") return "Finish the current action first.";
      if (room.currentPhase !== 2 && room.currentPhase !== 3) return "Wrong phase.";
      if (room.combatFought) return "Already fought this turn.";
      if (!isActive(room, playerId)) return "Not your turn.";

      const c1 = drawFromDeck(room, "door");
      if (c1) player.hand.push(c1);

      if (hasDungeon(room, "d-generous")) {
        const c2 = drawFromDeck(room, "door");
        if (c2) player.hand.push(c2);
        log(room, `${player.name} loots the room and finds 2 cards thanks to Generous Goblins!`);
      } else {
        log(room, `${player.name} loots the room (face-down).`);
      }

      refreshDerived(player);
      room.currentPhase = 4;
      return null;
    }

    case "endTurn": {
      if (!isActive(room, playerId)) return "Not your turn.";
      // Kun fra en almindelig tur: ellers kunne man slippe for Run Away/Bad Stuff,
      // eller efterlade en halvfærdig plyndring/velgørenhed.
      if (room.status !== "normalTurn" || room.combat) return "Finish the current action first.";
      // Charity check
      const charityLimit = hasDungeon(room, "d-infinite") ? Infinity // Dimension of Hoarding
        : hasDungeon(room, "d-charity") ? 4 : 5;
      if (player.hand.length > charityLimit) {
        const others = room.players.filter(p => p.id !== playerId);
        const minLevel = Math.min(...others.map(p => p.level));
        const candidates = others.filter(p => p.level === minLevel).map(p => p.id);
        room.charity = { fromId: playerId, cardCount: player.hand.length - charityLimit, candidates };
        room.status = "charitySelection";
        log(room, `${player.name} must give ${player.hand.length - charityLimit} card(s) to charity.`);
        return null;
      }
      advanceTurn(room);
      return null;
    }

    case "equip": {
      const idx = player.hand.findIndex(c => c.id === msg.cardId);
      const fromHand = idx >= 0;
      const card = fromHand ? player.hand[idx] : player.backpack.find(c => c.id === msg.cardId);
      if (!card || card.type !== "equipment") return "Not equipment.";

      // Hvis spilleren har valgt "Auto-Swap", pakker vi det blokerende udstyr ned i rygsækken først.
      // Gemmes så det kan rulles tilbage, hvis udrustningen alligevel fejler.
      const before = { ...player.equipment, hands: [...player.equipment.hands] };
      const backpackBefore = [...player.backpack];
      if (msg.forceSwap) {
        const stash = (s: (typeof SINGLE_SLOTS)[number]) => {
          const eq = player.equipment[s];
          if (eq) { player.backpack.push(eq); player.equipment[s] = null; }
        };
        if (card.isBig) stash("bigItem");
        if (card.slot === "head" || card.slot === "armor" || card.slot === "feet") stash(card.slot);
        if (card.slot === "hand" || card.slot === "twoHands") {
          // SMART SWAP: Sorter våbnene fra STÆRKEST til SVAGEST, så .pop() fjerner det svageste.
          player.equipment.hands.sort((a, b) => b.bonus - a.bonus);
          const needed = card.slot === "twoHands" ? 2 : 1;
          let used = handsUsed(player);
          while (used > 2 - needed && player.equipment.hands.length > 0) {
            const removed = player.equipment.hands.pop()!;
            player.backpack.push(removed);
            used -= removed.slot === "twoHands" ? 2 : 1;
          }
        }
      }

      const err = tryEquip(player, card);
      if (err) {
        player.equipment = before;
        player.backpack = backpackBefore;
        return err;
      }

      if (fromHand) player.hand.splice(idx, 1);
      else player.backpack.splice(player.backpack.findIndex(c => c.id === msg.cardId), 1);

      refreshDerived(player);
      log(room, `${player.name} equips ${card.name}.`);
      return null;
    }

    case "unequip": {
      const eq = removeEquipped(player, msg.cardId);
      if (!eq) return "Not equipped.";
      player.backpack.push(eq);
      refreshDerived(player);
      return null;
    }

    case "toBackpack": {
      const idx = player.hand.findIndex(c => c.id === msg.cardId);
      if (idx < 0) return "Not in hand.";
      if (player.hand[idx].type !== "equipment") return "Only equipment goes to backpack.";
      const [c] = player.hand.splice(idx, 1);
      player.backpack.push(c);
      refreshDerived(player);
      return null;
    }

    case "sell": {
      if (hasDungeon(room, "d-poverty")) return "Dungeon of Pathetic Poverty prevents you from selling items!";

      // Dubletter fjernes — ellers kunne samme kort tælle flere gange.
      const ids = [...new Set(msg.cardIds)];
      const owned: Card[] = [];
      for (const id of ids) {
        const c = allEquipped(player).find(e => e.id === id)
          ?? player.backpack.find(x => x.id === id)
          ?? player.hand.find(x => x.id === id);
        if (!c) return "You can only sell cards you own.";
        owned.push(c);
      }

      let totalGold = 0;
      for (const c of owned) {
        let val = goldValueOf(c);
        if (hasDungeon(room, "d-clipping")) val = Math.max(0, val - 100);
        if (hasDungeon(room, "d-lavish")) val *= 2;
        if (hasEffect(player, "halfSellValue")) val = Math.floor(val / 2);
        totalGold += val;
      }

      // Hvis vi er under 1000g, afvises salget (og spilleren beholder sine ting!)
      if (totalGold < 1000) return "Du skal vælge for mindst 1000g for at sælge!";

      for (const c of owned) {
        if (!removeEquipped(player, c.id)) {
          const bIdx = player.backpack.findIndex(x => x.id === c.id);
          if (bIdx >= 0) player.backpack.splice(bIdx, 1);
          else player.hand.splice(player.hand.findIndex(x => x.id === c.id), 1);
        }
        discardCard(room, c);
      }

      const levelsGained = Math.floor(totalGold / 1000);
      const newLevel = Math.min(9, player.level + levelsGained); // Man KAN IKKE vinde på et salg
      log(room, `💰 ${player.name} sells items for ${totalGold}g → +${newLevel - player.level} level(s).`);
      player.level = newLevel;
      refreshDerived(player);
      return null;
    }

    case "playCard": {
      const idx = player.hand.findIndex(c => c.id === msg.cardId);
      if (idx < 0) return "Card not in hand.";
      const card = player.hand[idx];

      if (card.type === "go-up-a-level") {
        if (player.level >= 9) return "Du kan ikke bruge dette kort til at vinde spillet (Level 10)!";
        player.level += 1;
        player.hand.splice(idx, 1);
        room.discards.treasure.push(card);
        log(room, `⬆️ ${player.name} plays ${card.name} and goes up a level!`);
        refreshDerived(player);
        return null;
      }

      if (card.type === "class") {
        const oldClass = player.playerClass;
        if (oldClass) room.discards.door.push(oldClass);
        player.playerClass = card;
        player.hand.splice(idx, 1);
        validateClassEquipment(room, player);

        if (oldClass) log(room, `✨ ${player.name} discards ${oldClass.name} and becomes a ${card.name}!`);
        else log(room, `✨ ${player.name} is now a ${card.name}!`);

        refreshDerived(player);
        return null;
      }

      if (card.type === "portal") {
        if (!isActive(room, playerId)) return "You can only play Portals on your turn.";
        log(room, `🌀 ${player.name} plays a PORTAL from their hand: ${card.name}!`);
        resolvePortal(room, card.cardId);
        player.hand.splice(idx, 1);
        room.discards.door.push(card);
        refreshDerived(player);
        return null;
      }

      if (card.cardId === "o-flask-glue") {
        if (!room.combat) return "Flask of Glue can only be played during a combat!";
        const combat = room.combat;
        if (!msg.targetId) return "You must specify who to glue!";
        const target = room.players.find(p => p.id === msg.targetId);
        if (!target || target.isDead) return "Target not found.";
        if (target.id !== combat.attackerId && target.id !== combat.helperId) return "You can only glue someone who is fighting.";
        if (combat.ranAway?.includes(target.id)) return `${target.name} has already rolled to run away.`;

        combat.gluedPlayers = combat.gluedPlayers ?? [];
        if (!combat.gluedPlayers.includes(target.id)) combat.gluedPlayers.push(target.id);
        log(room, `🧴 ${player.name} throws a Flask of Glue at ${target.name}! If they have to run away, they will automatically fail!`);

        player.hand.splice(idx, 1);
        room.discards.treasure.push(card);
        refreshDerived(player);
        return null;
      }

      return "Dette kort kan ikke spilles på denne måde lige nu.";
    }

    case "discard": {
      const idx = player.hand.findIndex(c => c.id === msg.cardId);
      if (idx < 0) return "Not in hand.";
      const [c] = player.hand.splice(idx, 1);
      discardCard(room, c);
      refreshDerived(player);
      return null;
    }

    // ===== combat actions =====
    case "playInCombat": {
      if (!room.combat) return "No combat.";
      if (combatDecided(room)) return "The fight is decided — time to run!";
      const combat = room.combat;
      const idx = player.hand.findIndex(c => c.id === msg.cardId);
      if (idx < 0) return "Not in hand.";
      const card = player.hand[idx];

      // --- WANDERING MONSTER ---
      if (card.type === "wandering-monster") {
        if (!msg.extraCardId) return "You must select a monster from your hand to wander in!";
        const newMonster = player.hand.find(c => c.id === msg.extraCardId);
        if (!newMonster || newMonster.type !== "monster") return "Selected extra card is not a monster in your hand.";

        // Slet BEGGE kort fra hånden på én gang
        player.hand = player.hand.filter(c => c.id !== card.id && c.id !== newMonster.id);

        combat.monsters.push(newMonster);
        combat.log.push(`🐉 ${player.name} plays Wandering Monster! ${newMonster.name} (Lvl ${newMonster.level}) joins the fight!`);
        room.discards.door.push(card);

        reopenInterrupts(room);
        refreshDerived(player);
        return null;
      }

      // --- FRIENDSHIP POTION: kampen slutter straks, ingen levels eller skatte ---
      if (card.cardId === "o-friendship") {
        player.hand.splice(idx, 1);
        room.discards.treasure.push(card);
        log(room, `💖 ${player.name} plays Friendship Potion! The combat ends instantly. No levels or treasures!`);
        endCombat(room);
        room.negotiations = [];
        room.status = "normalTurn";
        room.currentPhase = 3;
        refreshDerived(player);
        return null;
      }

      // --- MATE ---
      if (card.type === "mate") {
        if (combat.monsters.length === 0) return "No monsters to mate with.";

        // Vi kloner det første monster i kampen
        const targetMonster = combat.monsters[0];
        const clonedMonster: MonsterCard = { ...targetMonster, id: `${targetMonster.id}${MATE_CLONE_MARK}${newId()}`, name: `Mate of ${targetMonster.name}` };

        player.hand.splice(idx, 1);
        combat.monsters.push(clonedMonster);
        combat.log.push(`💞 ${player.name} plays Mate! A second ${targetMonster.name} appears!`);
        room.discards.door.push(card);

        reopenInterrupts(room);
        refreshDerived(player);
        return null;
      }

      if (card.type === "monster") {
        // Undead-dungeon, eller GOBLIN-SVÆRMEN: en Goblin må spilles direkte ind, hvis der allerede er en Goblin i kampen.
        const undead = hasDungeon(room, "d-undead");
        const goblinSwarm = hasTag(card, "goblin") && combat.monsters.some(m => hasTag(m, "goblin"));
        if (!undead && !goblinSwarm) return "Card cannot be played in combat.";

        player.hand.splice(idx, 1);
        combat.monsters.push(card);
        combat.log.push(undead
          ? `🧟 ${player.name} plays ${card.name} directly into combat thanks to the Undead!`
          : `👺 GOBLIN SWARM! ${player.name} plays ${card.name} directly into combat!`);
        reopenInterrupts(room);
        refreshDerived(player);
        return null;
      }

      // Både OneShots og Enhancers skal kunne spilles på begge sider!
      if (card.type !== "oneshot" && card.type !== "enhancer") return "Card cannot be played in combat.";
      const bonusAmount = card.bonus;
      const sign = bonusAmount > 0 ? "+" : "";

      if (msg.side === "attacker") {
        // Hvis man IKKE er med i kampen, må man KUN kaste kort på angriberen for at sabotere dem!
        if (bonusAmount > 0 && player.id !== combat.attackerId && player.id !== combat.helperId) {
          return "Only fighters can buff the attacker. You can only sabotage them with negative cards!";
        }
        combat.attackerBonuses += bonusAmount;
        combat.log.push(`⚔️ ${player.name} plays ${card.name} on the attacker (${sign}${bonusAmount}).`);
      } else {
        // Alle må spille kort på monsteret (både for at buffe og debuffe)
        combat.monsterBonuses += bonusAmount;
        combat.log.push(`👹 ${player.name} plays ${card.name} on the monster (${sign}${bonusAmount}).`);
      }

      player.hand.splice(idx, 1);
      combat.playedCards.push({ byPlayer: player.id, card });
      discardCard(room, card);

      reopenInterrupts(room);
      refreshDerived(player);
      return null;
    }

    case "useClassAbility": {
      // 1. Cleric (Kræver IKKE kamp)
      if (msg.ability === "resurrect") {
        if (!hasClass(player, "Cleric")) return "Not a Cleric.";
        if (!isActive(room, playerId)) return "Not your turn.";
        if (room.status !== "normalTurn" || room.currentPhase !== 1) return "Can only resurrect Door cards at the start of your turn (Phase 1).";
        if (room.discards.door.length === 0) return "Door discard pile is empty.";
        if (msg.cardIds.length !== 1) return "Must discard exactly 1 card to resurrect.";

        const idx = player.hand.findIndex(x => x.id === msg.cardIds[0]);
        if (idx < 0) return "Card not in hand.";
        const resurrectedCard = room.discards.door.pop()!;
        const [discardedCard] = player.hand.splice(idx, 1);
        discardCard(room, discardedCard);

        log(room, `🙏 ${player.name} discards ${discardedCard.name} to RESURRECT the top door card: ${resurrectedCard.name}!`);

        room.currentPhase = 2;
        if (resurrectedCard.type === "monster") {
          room.table.push(resurrectedCard);
          startCombat(room, player, resurrectedCard);
        } else if (resurrectedCard.type === "curse") {
          player.hand.push(resurrectedCard);
          log(room, `💀 The resurrected card was a curse! It goes to ${player.name}'s hand.`);
        } else {
          player.hand.push(resurrectedCard);
          log(room, `✨ ${player.name} puts the resurrected ${resurrectedCard.name} in their hand.`);
        }
        if (hasDungeon(room, "d-healing")) {
          const extra = drawFromDeck(room, "door");
          if (extra) {
            player.hand.push(extra);
            log(room, `✨ Heavenly Healing! ${player.name} draws a bonus door card!`);
          }
        }

        refreshDerived(player);
        return null;
      }

      // TYV: Steal (Må KUN gøres UDEN for kamp)
      if (msg.ability === "steal") {
        if (!hasClass(player, "Thief")) return "Not a Thief.";
        if (room.combat) return "Cannot steal while a combat is active.";
        if (msg.cardIds.length !== 1) return "Must discard exactly 1 card to steal.";
        if (!msg.targetId || !msg.targetCardId) return "Target player or item missing.";

        const target = room.players.find(p => p.id === msg.targetId);
        if (!target || target.isDead || target.id === playerId) return "Invalid target.";

        const targetEq = allEquipped(target).find(e => e.id === msg.targetCardId);
        if (!targetEq) return "Item not found on target's body.";
        if (targetEq.isBig) return "Cannot steal Big items.";

        const idx = player.hand.findIndex(x => x.id === msg.cardIds[0]);
        if (idx < 0) return "Payment card not found in hand.";
        const [discardedCard] = player.hand.splice(idx, 1);
        discardCard(room, discardedCard);

        // Slå med terningen! (Sendes ud til alle ligesom "Run Away")
        let roll = rollD6();
        if (hasDungeon(room, "d-thieves")) roll += 2; // Thieving Thugs
        roll -= effectTotal(player, "dicePenalty");
        pendingEvents.push({ type: "rolled", playerId, result: roll, reason: "Steal Attempt" });

        const reqRoll = player.equipment.hands.some(h => h.cardId === "e-lockpicks") ? 3 : 4;
        if (roll >= reqRoll) {
          removeEquipped(target, targetEq.id);
          player.backpack.push(targetEq);
          log(room, `🗡️ ${player.name} rolls ${roll} and successfully STEALS ${targetEq.name} from ${target.name}!`);
        } else {
          const oldLevel = player.level;
          player.level = Math.max(1, player.level - 1);
          log(room, `🩸 ${player.name} rolls ${roll} and FAILS to steal from ${target.name}. They get whacked and lose ${oldLevel - player.level} level(s)!`);
        }

        refreshDerived(player);
        refreshDerived(target);
        return null;
      }

      // 2. HERFRA og ned kræver de andre evner, at der er en kamp!
      if (!room.combat) return "No combat active.";
      if (combatDecided(room)) return "The fight is decided — time to run!";
      const c = room.combat;

      if (msg.ability === "berserk") {
        if (!hasClass(player, "Warrior")) return "Not a Warrior.";
        if (c.attackerId !== playerId && c.helperId !== playerId) return "You must be in combat to go berserk.";

        c.warriorDiscardCount = c.warriorDiscardCount || {};
        const currentUsed = c.warriorDiscardCount[playerId] || 0;
        const ids = [...new Set(msg.cardIds)];
        if (currentUsed + ids.length > 3) return `You can only discard up to 3 cards (used ${currentUsed}).`;

        let discarded = 0;
        for (const cid of ids) {
          const idx = player.hand.findIndex(x => x.id === cid);
          if (idx >= 0) {
            const [card] = player.hand.splice(idx, 1);
            discardCard(room, card);
            discarded++;
          }
        }
        if (discarded === 0) return "No valid cards discarded.";

        c.warriorDiscardCount[playerId] = currentUsed + discarded;
        const bonusMult = player.equipment.hands.some(h => h.cardId === "e-bloodaxe") ? 2 : 1;
        c.attackerBonuses += discarded * bonusMult;
        log(room, `⚔️ ${player.name} goes BERSERK! Discards ${discarded} card(s) for +${discarded * bonusMult} bonus.`);
        refreshDerived(player);
        return null;
      }

      if (msg.ability === "backstab") {
        if (!hasClass(player, "Thief")) return "Not a Thief.";
        if (!msg.targetId) return "No target specified.";
        const target = room.players.find(p => p.id === msg.targetId);
        if (!target) return "Target not found.";
        if (target.id !== c.attackerId && target.id !== c.helperId) return "Can only backstab players currently in combat.";

        c.backstabbedBy = c.backstabbedBy || {};
        c.backstabbedBy[target.id] = c.backstabbedBy[target.id] || [];
        if (c.backstabbedBy[target.id].includes(playerId)) return "You already backstabbed this player in this combat.";

        if (msg.cardIds.length !== 1) return "Must discard exactly 1 card to backstab.";
        const idx = player.hand.findIndex(x => x.id === msg.cardIds[0]);
        if (idx < 0) return "Card not in hand.";

        const [card] = player.hand.splice(idx, 1);
        discardCard(room, card);

        c.backstabbedBy[target.id].push(playerId);
        c.attackerBonuses -= 2;
        log(room, `🗡️ ${player.name} BACKSTABS ${target.name}! (-2 to their combat score)`);
        refreshDerived(player);
        return null;
      }

      if (msg.ability === "charm") {
        if (!hasClass(player, "Wizard")) return "Not a Wizard.";
        if (c.attackerId !== playerId && c.helperId !== playerId) return "You must be in combat to charm.";
        if (!msg.monsterId) return "No monster selected.";
        const reqCards = player.equipment.hands.some(h => h.cardId === "e-archmage-staff") ? 2 : 3;
        if (player.hand.length < reqCards) return `Need at least ${reqCards} cards in hand to Charm.`;

        const mIdx = c.monsters.findIndex(m => m.id === msg.monsterId);
        if (mIdx < 0) return "Monster not in combat.";
        const monster = c.monsters[mIdx];
        if (monster.immuneToCharm) return `The ${monster.name} is IMMUNE to your Charm spell!`;

        const handSize = player.hand.length;
        for (const card of player.hand) discardCard(room, card);
        player.hand = [];

        c.monsters.splice(mIdx, 1);
        discardMonster(room, monster);
        room.table = room.table.filter(t => t.id !== monster.id);

        c.charmedTreasures = (c.charmedTreasures || 0) + monster.treasures;

        log(room, `🪄 ${player.name} CHARMS the ${monster.name} by discarding their hand (${handSize} cards)!`);
        refreshDerived(player);
        return null;
      }

      return "Invalid ability.";
    }

    case "askForHelp": {
      if (hasDungeon(room, "d-misanthropy")) return "Dungeon of Misanthropic Misery: Everyone fights alone!";
      if (hasDungeon(room, "d-bribery") && msg.treasures < 2) return "Dungeon of Blatant Bribery: You must offer at least 2 treasures!";
      if (!room.combat || room.combat.attackerId !== playerId) return "Only attacker may request help.";
      if (combatDecided(room)) return "The fight is decided — time to run!";
      if (hasEffect(player, "noHelp")) return "Nobody is willing to help you right now (Social Pariah).";
      if (room.combat.helperId) return "Already have a helper.";
      const helper = room.players.find(p => p.id === msg.helperId);
      if (!helper || helper.id === playerId || helper.isDead) return "Invalid helper.";
      if (room.negotiations.some(o => o.toId === helper.id && o.status === "pending")) return "You already have a pending offer to that player.";
      const offer: NegotiationOffer = {
        id: newId(),
        fromId: playerId, toId: helper.id,
        treasures: msg.treasures,
        status: "pending",
      };
      room.negotiations.push(offer);
      log(room, `${player.name} offers ${msg.treasures} treasure(s) for help.`);
      return null;
    }

    case "forceHelp": {
      if (!room.combat || room.combat.attackerId !== playerId) return "Only attacker can force help.";
      if (combatDecided(room)) return "The fight is decided — time to run!";
      if (hasEffect(player, "noHelp")) return "Nobody is willing to help you right now (Social Pariah).";
      if (room.combat.helperId) return "Already have a helper.";
      if (player.equipment.feet?.cardId !== "e-kneepads") return "You do not have the Kneepads of Allure equipped.";

      const target = room.players.find(p => p.id === msg.targetId);
      if (!target || target.isDead || target.id === playerId) return "Invalid target.";

      // Tving dem ind i kampen (og de får 0 skatte for det!)
      room.combat.helperId = target.id;
      room.combat.contract = { helperId: target.id, treasures: 0, accepted: true };
      delete room.combat.passes[target.id];
      room.negotiations = [];
      reopenInterrupts(room);

      log(room, `💖 ${player.name} uses the Kneepads of Allure to FORCE ${target.name} to help them!`);
      return null;
    }

    case "respondHelp": {
      const offer = room.negotiations.find(o => o.id === msg.offerId);
      if (!offer || offer.toId !== playerId) return "Not your offer.";
      if (offer.status !== "pending") return "Already responded.";
      offer.status = msg.accept ? "accepted" : "rejected";
      if (msg.accept && room.combat && !room.combat.helperId && !combatDecided(room)) {
        room.combat.helperId = playerId;
        room.combat.contract = { helperId: playerId, treasures: offer.treasures, accepted: true };
        delete room.combat.passes[playerId];
        reopenInterrupts(room);
        log(room, `🩸 BLOOD OATH: ${player.name} joins for ${offer.treasures} treasure(s). Cannot withdraw.`);
        room.negotiations = [];
        return null;
      }
      room.negotiations = room.negotiations.filter(o => o.status === "pending");
      return null;
    }

    case "pass": {
      if (!room.combat) return "No combat.";
      if (room.combat.attackerId === playerId || room.combat.helperId === playerId) return "Fighters cannot pass.";
      if (player.isDead) return "Dead players cannot vote.";
      room.combat.passes[playerId] = true;
      syncCombatGate(room);
      return null;
    }

    case "resolveCombat": {
      if (!room.combat) return "No combat.";
      if (room.combat.attackerId !== playerId) return "Only attacker may resolve.";
      if (combatDecided(room)) return "The fight is decided — time to run!";

      const c = room.combat;
      if (!allPassed(room)) {
        room.status = "waitingForInterrupts";
        log(room, `⏳ ${player.name} is attempting to win! Opponents must play cards or pass.`);
        return null;
      }

      room.status = "inCombat";

      const attacker = player;
      const helper = c.helperId ? room.players.find(p => p.id === c.helperId) ?? null : null;

      const ms = monsterTotal(room, c);
      const ps = playerSideTotal(room, c);

      const hasWarrior = hasClass(attacker, "Warrior") || (helper !== null && hasClass(helper, "Warrior"));

      log(room, `Resolution: Players ${ps} vs Monsters ${ms}.${hasWarrior ? " (Warrior tie-breaker active!)" : ""}`);

      if (hasWarrior ? ps >= ms : ps > ms) {
        let totalTreasures = c.monsters.reduce((s, m) => s + m.treasures, 0) + (c.charmedTreasures || 0);
        if (hasDungeon(room, "d-wealth")) totalTreasures += 1; // Unexpected Wealth

        const totalLevels = c.monsters.reduce((s, m) => s + m.levelsAwarded, 0);
        const helperShare = c.contract ? Math.min(c.contract.treasures, totalTreasures) : 0;
        const attackerShare = totalTreasures - helperShare;

        for (let i = 0; i < attackerShare; i++) {
          const t = drawFromDeck(room, "treasure"); if (t) attacker.hand.push(t);
        }
        if (helper) {
          for (let i = 0; i < helperShare; i++) {
            const t = drawFromDeck(room, "treasure"); if (t) helper.hand.push(t);
          }
        }

        attacker.level += totalLevels;
        log(room, `🏆 Victory! +${totalLevels} level(s), +${attackerShare} treasure(s) to ${attacker.name}${helper ? `, +${helperShare} to ${helper.name}` : ""}.`);

        endCombat(room, true);
        refreshDerived(attacker);
        if (helper) refreshDerived(helper);
        room.status = "normalTurn";
        room.currentPhase = 3;
        checkVictory(room, attacker, true);
      } else {
        room.status = "runAwayRoll";
        log(room, `Defeat! ${attacker.name}${helper ? ` and ${helper.name}` : ""} must Run Away.`);
      }
      return null;
    }

    case "runAway": {
      if (!room.combat) return "No combat.";
      if (room.status !== "runAwayRoll") return "Not run-away phase.";
      const combat = room.combat;
      if (playerId !== combat.attackerId && playerId !== combat.helperId) return "Not in this combat.";
      combat.ranAway = combat.ranAway ?? [];
      if (combat.ranAway.includes(playerId)) return "You already rolled to run away.";

      const glued = combat.gluedPlayers?.includes(playerId) === true;
      let roll = rollD6();

      if (allEquipped(player).some(e => e.cardId === "e-shadow-cloak")) {
        roll += 1;
        log(room, `🦇 ${player.name}'s Cloak of Shadows swirls, granting +1 to the escape roll!`);
      }

      // Boots of Running Really Fast giver +2!
      if (player.equipment.feet?.cardId === "e-boots-run") {
        roll += 2;
        log(room, `👟 ${player.name}'s Boots of Running Really Fast gives them +2 to escape!`);
      }

      // DUNGEON: d-chaos (Discard et kort for at slå to terninger og tage den højeste)
      if (hasDungeon(room, "d-chaos") && msg.discardId) {
        const idx = player.hand.findIndex(c => c.id === msg.discardId);
        if (idx >= 0) {
          const [discarded] = player.hand.splice(idx, 1);
          discardCard(room, discarded);
          const roll2 = rollD6();
          log(room, `🌪️ ${player.name} discarded ${discarded.name} for Chaos Advantage! Rolled ${roll} & ${roll2}.`);
          roll = Math.max(roll, roll2);
          refreshDerived(player);
        }
      }

      // DUNGEONS: Ændrer terningeslaget (Elven Excess & Poultry)
      if (hasDungeon(room, "d-elven")) roll++;
      if (hasDungeon(room, "d-poultry")) roll--;
      roll -= effectTotal(player, "dicePenalty");

      pendingEvents.push({ type: "rolled", playerId, result: roll, reason: "Run Away" });
      log(room, `🎲 ${player.name} rolls ${roll} to run away.`);
      // Markeres FØR Bad Stuff, så en død midt i rækken aldrig efterlader kampen hængende.
      combat.ranAway.push(playerId);

      if (glued) {
        log(room, `🧴 ${player.name} is covered in GLUE and automatically fails to escape!`);
      }
      if (!glued && roll >= 5) {
        log(room, `${player.name} escapes!`);
      } else {
        log(room, `${player.name} fails to escape — Bad Stuff!`);
        for (const m of combat.monsters) {
          applyBadStuff(room, player, m.badStuff);
          if (player.isDead) break;
        }
      }

      const attackerDone = combat.ranAway.includes(combat.attackerId)
        || room.players.find(p => p.id === combat.attackerId)?.isDead === true;
      const helperDone = !combat.helperId || combat.ranAway.includes(combat.helperId)
        || room.players.find(p => p.id === combat.helperId)?.isDead === true;

      if (attackerDone && helperDone) {
        endCombat(room);
        room.currentPhase = 3;
        // applyBadStuff kan have skiftet status til "looting" (TS kan ikke se det gennem kaldet).
        if ((room.status as AppStatus) === "looting") room.statusBeforeLooting = "normalTurn";
        else room.status = "normalTurn";
      }
      return null;
    }

    case "flee": {
      if (!room.combat) return "No combat.";
      if (room.combat.attackerId !== playerId) return "Kun angriberen kan overgive sig.";
      if (combatDecided(room)) return "Already running away.";
      room.status = "runAwayRoll";
      room.combat.log.push(`💨 ${player.name} giver op og gør klar til at flygte!`);
      return null;
    }

    case "cowardlyFlee": {
      if (!room.combat) return "No combat.";
      if (!hasDungeon(room, "d-cowards")) return "Dungeon of Cowards is not active.";
      if (room.combat.attackerId !== playerId) return "Only the attacker can trigger a cowardly flee.";
      if (combatDecided(room)) return "Already running away.";
      room.status = "runAwayRoll";
      room.combat.log.push(`🐔 ${player.name} uses the Dungeon of Cowardly Combat to instantly flee without asking!`);
      return null;
    }

    case "lootBody": {
      if (!room.looting) return "No looting.";
      const looting = room.looting;
      if (looting.orderQueue[0] !== playerId) return "Not your turn to loot.";
      const idx = looting.pile.findIndex(c => c.id === msg.cardId);
      if (idx < 0) return "Card not in pile.";
      const [c] = looting.pile.splice(idx, 1);
      player.hand.push(c);
      refreshDerived(player);
      log(room, `${player.name} loots ${c.name} from the body.`);
      looting.orderQueue.shift();
      if (looting.pile.length === 0 || looting.orderQueue.length === 0) {
        for (const rest of looting.pile) discardCard(room, rest);
        finishLooting(room, looting.deadId);
      }
      return null;
    }

    case "suddenSwap": {
      if (!room.combat) return "No combat.";
      const combat = room.combat;
      if (combat.attackerId !== playerId) return "Only the attacker can use Sudden Swaps.";
      if (!combat.helperId) return "You don't have a helper to steal from.";
      if (!hasDungeon(room, "d-swapping")) return "Dungeon of Sudden Swaps is not active.";
      if (combat.swapUsed) return "You already stole a card this combat!";
      const helper = room.players.find(p => p.id === combat.helperId);
      if (!helper || helper.hand.length === 0) return "Helper has no cards in hand.";

      const [stolen] = helper.hand.splice(Math.floor(random() * helper.hand.length), 1);
      player.hand.push(stolen);
      combat.swapUsed = true;
      log(room, `🔄 Sudden Swaps! ${player.name} blindly stole a card from ${helper.name}'s hand!`);
      refreshDerived(player);
      refreshDerived(helper);
      return null;
    }

    case "charityGive": {
      if (!room.charity || room.charity.fromId !== playerId) return "No charity.";
      if (!room.charity.candidates.includes(msg.toId)) return "Invalid recipient.";
      const ids = [...new Set(msg.cardIds)];
      if (ids.length !== room.charity.cardCount) return `Must give exactly ${room.charity.cardCount} card(s).`;
      if (!ids.every(id => player.hand.some(c => c.id === id))) return "You can only give cards from your hand.";
      const recipient = room.players.find(p => p.id === msg.toId);
      if (!recipient) return "Invalid recipient.";
      for (const id of ids) {
        const idx = player.hand.findIndex(c => c.id === id);
        const [c] = player.hand.splice(idx, 1);
        recipient.hand.push(c);
      }
      refreshDerived(player); refreshDerived(recipient);
      log(room, `${player.name} gives ${ids.length} card(s) to ${recipient.name}.`);
      room.charity = null;
      advanceTurn(room);
      return null;
    }

    default: {
      const unreachable: never = msg;
      return `Unknown action ${(unreachable as { type: string }).type}.`;
    }
  }
};

const finishLooting = (room: Room, deadId: string) => {
  const prior = room.statusBeforeLooting ?? "normalTurn";
  room.looting = null;
  room.statusBeforeLooting = null;
  const c = room.combat;
  if (c && room.players.find(p => p.id === c.attackerId)?.isDead) {
    // Angriberen er død: kampen er slut for alle.
    endCombat(room);
    room.currentPhase = 3;
  }
  if (room.combat) {
    // Kampen fortsætter (fx en medkæmper mangler at flygte).
    room.status = prior;
    syncCombatGate(room);
  } else if (deadId === room.players[room.activePlayerIndex]?.id) {
    // Den aktive spiller døde: turen går videre.
    advanceTurn(room);
  } else {
    room.status = prior === "looting" || prior === "runAwayRoll" || prior === "waitingForInterrupts" || prior === "inCombat"
      ? "normalTurn"
      : prior;
  }
};

const advanceTurn = (room: Room) => {
  // If active player is dead, give them a fresh hand (2 door + 2 treasure)
  const cur = room.players[room.activePlayerIndex];
  if (cur.isDead && !room.looting) {
    cur.isDead = false;
    for (let i = 0; i < 2; i++) {
      const d = drawFromDeck(room, "door"); if (d) cur.hand.push(d);
      const t = drawFromDeck(room, "treasure"); if (t) cur.hand.push(t);
    }
    refreshDerived(cur);
    log(room, `${cur.name} returns from death with a fresh hand.`);
  }
  // next living player
  let next = room.activePlayerIndex;
  for (let i = 0; i < room.players.length; i++) {
    next = (next + 1) % room.players.length;
    if (!room.players[next].isDead || room.players[next].id === cur.id) break;
  }
  room.activePlayerIndex = next;
  room.currentPhase = 1;
  room.status = "normalTurn";
  room.combatFought = false;
  room.combat = null;
  room.negotiations = [];
  log(room, `▶ ${room.players[next].name}'s turn.`);
};
