// Authoritative Munchkin game engine.
// Pure game rules: no sockets, no file I/O. The transport layer (app.ts) calls
// joinRoom / handleAction / setConnected and broadcasts buildView() afterwards.

import { randomBytes, randomUUID } from "crypto";

import { buildAllDecks, deckCopiesFor } from "../shared/deck.js";
import { effectTotal, hasClass, hasEffect, hasRace, hasTag, isTradable, tollPrice, tradeValue } from "../shared/rules.js";
import type {
  ClassName, RaceName, Card, MonsterCard, EquipmentCard, DungeonCard, PrivatePlayer, PublicPlayer,
  PublicGameState, ClientView, CombatView, Phase, AppStatus, CombatState,
  NegotiationOffer, BadStuffKind, GameAction, ServerToClient, EffectExpiry, PlayerEffect, RoomSettings,
  TradeOffer, TradeView, NegotiationView, Highlight,
} from "../shared/types.js";
import { DEFAULT_SETTINGS, INTERRUPT_CHOICES, THREAT_CHOICES, WIN_LEVELS } from "../shared/types.js";

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

// Wall clock (injectable so tests can fast-forward the interrupt countdown).
let now: () => number = Date.now;
export const setClock = (fn: () => number) => { now = fn; };

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
  trades: TradeOffer[];
  charity: PublicGameState["charity"];
  looting: PublicGameState["looting"];
  log: string[];
  highlights: Highlight[];
  highlightSeq: number;
  winnerId: string | null;
  combatFought: boolean; // tracks if current turn already had combat
  statusBeforeLooting: AppStatus | null; // restored when looting a body is finished
  settings: RoomSettings;
  stats: RoomStats;
  turnNo: number;                          // increases every time the turn passes
  halflingSaleTurn: Record<string, number>; // Halfling: turnNo of their last double-value sale
  updatedAt: number;
}

export interface RoomStats {
  bounties: number;   // treasures paid out to saboteurs of the leader
  turncoats: number;  // helpers who switched sides (Siren)
  tableHits: number;  // Bad Stuff that hit everyone
  sabotages: number;  // cards played by non-fighters to strengthen a monster
  trades: number;     // completed Grand Parley trades
  bribes: number;     // help bought with items
  tolls: number;      // fights bought off
}
export const emptyStats = (): RoomStats => ({ bounties: 0, turncoats: 0, tableHits: 0, sabotages: 0, trades: 0, bribes: 0, tolls: 0 });

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
  if (p.companion) bonus += p.companion.bonus;
  // Dwarves fight best weighed down: +1 per Big item worn, up to +3.
  if (hasRace(p, "Dwarf")) bonus += Math.min(3, allEquipped(p).filter(e => e.isBig).length);
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

// Logs and tells the whole table: shown briefly on every screen.
const shout = (room: Room, msg: string) => {
  log(room, msg);
  room.highlights.push({ id: ++room.highlightSeq, text: msg });
  if (room.highlights.length > 20) room.highlights.shift();
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
  if (c.type === "equipment" && c.forgedWith) {
    room.discards.treasure.push(c.forgedWith);
    delete c.forgedWith;
  }
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
  extraClass: p.extraClass,
  race: p.race,
  extraRace: p.extraRace,
  dualClass: p.dualClass,
  dualRace: p.dualRace,
  companion: p.companion,
  effects: p.effects,
});

// The single player strictly ahead of everyone else (null on a tie).
export const leaderOf = (room: Room): PrivatePlayer | null => {
  const top = Math.max(...room.players.map(p => p.level));
  const leaders = room.players.filter(p => p.level === top);
  return leaders.length === 1 ? leaders[0] : null;
};

// Threat: monsters push back harder the higher the attacker's level.
const THREAT_DIVISOR: Record<RoomSettings["threat"], number> = { calm: 0, normal: 3, brutal: 2 };
const threatBonus = (room: Room, attacker: PrivatePlayer | undefined): number => {
  const d = THREAT_DIVISOR[room.settings.threat];
  return d && attacker ? Math.floor(attacker.level / d) : 0;
};

/** Monster side total plus a readable list of every modifier, for the combat panel. */
const monsterSide = (room: Room, c: CombatState): { total: number; modifiers: string[] } => {
  const mods: string[] = [];
  const attacker = room.players.find(p => p.id === c.attackerId);
  const fighters = [c.attackerId, c.helperId].map(id => room.players.find(p => p.id === id)).filter(Boolean);
  const isLeader = !!attacker && leaderOf(room)?.id === attacker.id;
  const goblins = c.monsters.filter(m => hasTag(m, "goblin")).length;

  let total = c.monsters.reduce((s, m) => {
    let lvl = m.level;
    if (hasDungeon(room, "d-martial")) lvl += 2; // Martial Arts: +2 Lvl
    if (hasDungeon(room, "d-feeble")) lvl = Math.max(1, lvl - 5); // Feeble: -5 Lvl (min 1)
    if (hasDungeon(room, "d-goblin") && hasTag(m, "goblin")) lvl += 3; // Goblin Land
    // Anti-Class: bonus hvis angriber ELLER hjælper er den forhadte class.
    const hated = m.antiClass;
    if (hated && fighters.some(f => f && hasClass(f, hated.className as ClassName))) {
      lvl += hated.bonus;
      mods.push(`${m.name} hates ${hated.className}s: +${hated.bonus}`);
    }
    if (m.packHunter && !c.helperId) {
      lvl += m.packHunter;
      mods.push(`${m.name} hunts in a pack — fighting alone: +${m.packHunter}`);
    }
    if (m.huntsLeader && isLeader) {
      lvl += m.huntsLeader;
      mods.push(`${m.name} hunts the leader: +${m.huntsLeader}`);
    }
    const hatedRace = m.antiRace;
    if (hatedRace && fighters.some(f => f && hasRace(f, hatedRace.raceName))) {
      lvl += hatedRace.bonus;
      mods.push(`${m.name} hates ${hatedRace.raceName}s: +${hatedRace.bonus}`);
    }
    if (m.hordeBonus && c.monsters.length > 1) {
      lvl += m.hordeBonus * (c.monsters.length - 1);
      mods.push(`${m.name} grows with the horde (${c.monsters.length - 1} more): +${m.hordeBonus * (c.monsters.length - 1)}`);
    }
    if (m.swarmBonus && goblins > 1) {
      lvl += m.swarmBonus * (goblins - 1);
      mods.push(`${m.name} commands ${goblins - 1} goblin(s): +${m.swarmBonus * (goblins - 1)}`);
    }
    return s + lvl;
  }, 0) + c.monsterBonuses;

  const threat = threatBonus(room, attacker);
  if (threat > 0) {
    total += threat;
    mods.push(`Threat (${attacker!.name} is level ${attacker!.level}): +${threat}`);
  }
  // Showing off two classes or two races draws the dungeon's attention.
  const extras = attacker && room.settings.threat !== "calm" ? (attacker.extraClass ? 1 : 0) + (attacker.extraRace ? 1 : 0) : 0;
  if (extras > 0) {
    total += 2 * extras;
    mods.push(`Show-off (${attacker!.name} has ${extras === 2 ? "two classes and two races" : attacker!.extraClass ? "two classes" : "two races"}): +${2 * extras}`);
  }
  const turncoat = c.turncoatId ? room.players.find(p => p.id === c.turncoatId) : undefined;
  if (turncoat) {
    const power = computePower(turncoat);
    total += power;
    mods.push(`${turncoat.name} fights for the monster: +${power}`);
  }
  return { total, modifiers: mods };
};

const monsterTotal = (room: Room, c: CombatState): number => monsterSide(room, c).total;

const playerSideTotal = (room: Room, c: CombatState): number => {
  const a = room.players.find(p => p.id === c.attackerId);
  let total = (a ? computePower(a) - effectTotal(a, "combatPenalty") : 0) + c.attackerBonuses;
  const multiMonster = c.monsters.length > 1;
  if (a && multiMonster && a.equipment.armor?.cardId === "e-blood-plate") total += 3;
  const goblinLand = hasDungeon(room, "d-goblin");
  if (a && goblinLand && hasRace(a, "Goblin")) total += 3; // Home Turf
  if (c.helperId) {
    const h = room.players.find(p => p.id === c.helperId);
    if (h) {
      total += computePower(h) - effectTotal(h, "combatPenalty");
      if (h.equipment.hands.some(eq => eq.cardId === "e-martyr-mace")) total += 3;
      if (multiMonster && h.equipment.armor?.cardId === "e-blood-plate") total += 3;
      if (goblinLand && hasRace(h, "Goblin")) total += 3; // Home Turf
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
  const wasWaiting = room.status === "waitingForInterrupts";
  room.status = allPassed(room) ? "inCombat" : "waitingForInterrupts";
  if (room.status === "inCombat") {
    room.combat.interruptDeadline = null;
  } else if (!wasWaiting || !room.combat.interruptDeadline) {
    // A new interrupt window opens: start the countdown.
    const secs = room.settings.interruptSeconds;
    room.combat.interruptDeadline = secs > 0 ? now() + secs * 1000 : null;
  }
};

/** Countdown ran out: everyone who still had to pass is passed. Returns true if anything changed. */
export const expireInterrupts = (room: Room): boolean => {
  const c = room.combat;
  if (!c || room.status !== "waitingForInterrupts" || !c.interruptDeadline || now() < c.interruptDeadline) return false;
  for (const id of requiredPasses(room)) c.passes[id] = true;
  c.interruptDeadline = null;
  shout(room, "⏱️ Time's up — everyone else passes.");
  syncCombatGate(room);
  room.updatedAt = Date.now();
  return true;
};

export const buildView = (room: Room, selfId: string | null): ClientView => {
  const self = room.players.find(p => p.id === selfId) ?? null;
  const combat: CombatView | null = room.combat
    ? {
        ...room.combat,
        monsterTotal: monsterTotal(room, room.combat),
        playerTotal: playerSideTotal(room, room.combat),
        requiredPasses: requiredPasses(room),
        interruptMsLeft: room.combat.interruptDeadline ? Math.max(0, room.combat.interruptDeadline - now()) : null,
        modifiers: monsterSide(room, room.combat).modifiers,
      }
    : null;
  return {
    status: room.status,
    settings: room.settings,
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
    negotiations: room.negotiations.map((o): NegotiationView => {
      const from = room.players.find(p => p.id === o.fromId);
      return { ...o, items: from ? o.itemIds.map(id => ownedCard(from, id)).filter((c): c is Card => !!c) : [] };
    }),
    trades: room.trades
      .filter(t => t.fromId === selfId || t.toId === selfId)
      .map((t): TradeView => {
        const from = room.players.find(p => p.id === t.fromId);
        const to = room.players.find(p => p.id === t.toId);
        return {
          ...t,
          giveCards: from ? t.give.map(id => ownedCard(from, id)).filter((c): c is Card => !!c) : [],
          takeCards: to ? t.take.map(id => allEquipped(to).find(e => e.id === id)).filter((c): c is EquipmentCard => !!c) : [],
        };
      }),
    charity: room.charity,
    looting: room.looting,
    log: room.log.slice(-30),
    highlights: room.highlights.slice(-10),
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
    trades: [],
    charity: null,
    looting: null,
    log: [`Room ${code} created.`],
    highlights: [],
    highlightSeq: 0,
    winnerId: null,
    combatFought: false,
    statusBeforeLooting: null,
    settings: { ...DEFAULT_SETTINGS },
    stats: emptyStats(),
    turnNo: 0,
    halflingSaleTurn: {},
    updatedAt: Date.now(),
  };
};

/** TV mode: the room to watch, created (in the lobby) if nobody has opened it yet. */
export const watchRoom = (rooms: Map<string, Room>, roomCode: string): Room => {
  const code = roomCode.toUpperCase();
  const existing = rooms.get(code);
  if (existing) return existing;
  const room = createRoom(code);
  rooms.set(code, room);
  return room;
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
    playerClass: null, extraClass: null, race: null, extraRace: null, dualClass: null, dualRace: null, companion: null,
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

// ---------- owning and moving cards (The Grand Parley) ----------
// A card the player owns right now: in hand, in the backpack or worn.
const ownedCard = (p: PrivatePlayer, id: string): Card | undefined =>
  p.hand.find(c => c.id === id) ?? p.backpack.find(c => c.id === id) ?? allEquipped(p).find(e => e.id === id);

const takeOwned = (p: PrivatePlayer, id: string): Card | undefined => {
  for (const zone of [p.hand, p.backpack]) {
    const i = zone.findIndex(c => c.id === id);
    if (i >= 0) return zone.splice(i, 1)[0];
  }
  return removeEquipped(p, id) ?? undefined;
};

// Received equipment goes to the backpack (wear it yourself afterwards); anything else to the hand.
const receive = (p: PrivatePlayer, c: Card) => {
  if (c.type === "equipment") p.backpack.push(c);
  else p.hand.push(c);
};

/** Validates a set of valuable cards a player owns; returns the cards or an error. */
const valuables = (p: PrivatePlayer, ids: string[], where: "owned" | "worn"): Card[] | string => {
  if (new Set(ids).size !== ids.length) return "The same card twice.";
  const cards: Card[] = [];
  for (const id of ids) {
    const c = where === "worn" ? allEquipped(p).find(e => e.id === id) : ownedCard(p, id);
    if (!c) return where === "worn" ? `${p.name} isn't wearing that item.` : `${p.name} doesn't have that card.`;
    if (!isTradable(c)) return `${c.name} has no gold value and can't be traded.`;
    cards.push(c);
  }
  return cards;
};

const cardNames = (cards: Card[]) => cards.map(c => c.name).join(", ") || "nothing";

// ---------- lasting effects ----------
export const addEffect = (room: Room, p: PrivatePlayer, effect: Omit<PlayerEffect, "id">): PlayerEffect => {
  const e: PlayerEffect = { ...effect, id: newId() };
  p.effects.push(e);
  shout(room, `🌀 ${p.name} is now affected by ${e.name}.`);
  return e;
};

export const removeEffect = (room: Room, p: PrivatePlayer, effectId: string): boolean => {
  const idx = p.effects.findIndex(e => e.id === effectId);
  if (idx < 0) return false;
  const [e] = p.effects.splice(idx, 1);
  shout(room, `✨ ${e.name} is lifted from ${p.name}.`);
  return true;
};

const expireEffects = (room: Room, p: PrivatePlayer, when: EffectExpiry) => {
  for (const e of p.effects.filter(x => x.expires === when)) removeEffect(room, p, e.id);
};

// ---------- equipment helpers ----------
const handsUsed = (p: PrivatePlayer): number =>
  p.equipment.hands.reduce((n, h) => n + (h.slot === "twoHands" ? 2 : 1), 0);

// Why this player may not wear this item (ignoring slots), or null. Forged papers waive it.
const requirementProblem = (p: PrivatePlayer, card: EquipmentCard): string | null => {
  if (card.forgedWith) return null;
  if (card.cardId === "e-kneepads" && hasClass(p, "Warrior")) return "Warriors are too proud to wear the Kneepads of Allure!";
  if (card.classReq && !hasClass(p, card.classReq)) return `Only a ${card.classReq} can equip this item!`;
  return null;
};

const tryEquip = (p: PrivatePlayer, card: EquipmentCard): string | null => {
  const problem = requirementProblem(p, card);
  if (problem) return problem;
  // Dwarves can haul any number of Big items (the single Big-item slot itself still holds one).
  if (card.isBig && p.equipment.bigItem && !hasRace(p, "Dwarf")) return "You already have a Big item equipped.";
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
    if (eq.classReq && !eq.forgedWith && !hasClass(p, eq.classReq)) {
      removeEquipped(p, eq.id);
      p.backpack.push(eq);
      log(room, `🎒 ${p.name} is no longer a ${eq.classReq}! Their ${eq.name} slides off into their backpack!`);
    }
  }
};

// Loses the most recently gained class (the second class first, if any).
const loseClass = (room: Room, p: PrivatePlayer, msg: string) => {
  const lost = p.extraClass ?? p.playerClass;
  if (!lost) return false;
  log(room, msg);
  room.discards.door.push(lost);
  if (p.extraClass) p.extraClass = null;
  else p.playerClass = null;
  validateClassEquipment(room, p);
  return true;
};

const loseRace = (room: Room, p: PrivatePlayer) => {
  const lost = p.extraRace ?? p.race;
  if (!lost) { log(room, `${p.name} has no race to lose.`); return; }
  room.discards.door.push(lost);
  if (p.extraRace) p.extraRace = null;
  else p.race = null;
  log(room, `🎭 ${p.name} has an identity crisis and is no longer a ${lost.raceName}!`);
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
        discardCard(room, target);
        log(room, `${p.name} loses ${target.name}.`);
      } else log(room, `${p.name} has no matching item to lose.`);
      break;
    }
    case "loseRace": {
      loseRace(room, p);
      break;
    }
    case "addEffect": {
      addEffect(room, p, { ...bs.effect });
      break;
    }
    case "everyoneLosesLevel": {
      shout(room, `🐉 ${p.name}'s failure angers the beast — EVERYONE loses ${bs.amount} level(s)!`);
      room.stats.tableHits++;
      for (const o of room.players.filter(x => !x.isDead)) {
        o.level = Math.max(1, o.level - bs.amount);
        refreshDerived(o);
      }
      break;
    }
    case "loseHandItems": {
      const hands = [...p.equipment.hands];
      if (hands.length === 0) { log(room, `${p.name} has nothing in their hands to lose.`); break; }
      p.equipment.hands = [];
      for (const h of hands) discardCard(room, h);
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
        discardCard(room, c);
      }
      if (p.companion) {
        log(room, `${p.companion.name} flees in the chaos.`);
        discardCard(room, p.companion);
        p.companion = null;
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
          discardCard(room, c);
        }
      }
      break;
    }
    case "loseClassAndLevels": {
      loseClass(room, p, `💀 ${p.name} gets crushed and forgets how to be a ${(p.extraClass ?? p.playerClass)?.name}!`);
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
        shout(room, `💀 The Archfiend's dark presence is too much! ${p.name} DIES instantly!`);
        applyBadStuff(room, p, { kind: "death" });
      } else {
        const oldLevel = p.level;
        p.level = Math.max(1, p.level - bs.amount);
        log(room, `🩸 ${p.name}'s faith is shattered! They lose ${oldLevel - p.level} level(s) → Level ${p.level}.`);
      }
      break;
    }
    case "loseClass": {
      if (!loseClass(room, p, `💀 ${p.name} suffers AMNESIA and forgets how to be a ${(p.extraClass ?? p.playerClass)?.name}!`)) {
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
        discardCard(room, targetItem);
        log(room, `💀 Robin Hood steals ${targetItem.name} from ${p.name}, but there's no one to give it to! It goes to the discard pile.`);
        break;
      }
      const lowest = opponents.reduce((low, op) => (op.level < low.level ? op : low));
      lowest.backpack.push(targetItem);
      refreshDerived(lowest);
      shout(room, `💀 ROBIN HOOD'S REVENGE! ${targetItem.name} is taken from ${p.name} and given to ${lowest.name} (Lvl ${lowest.level})!`);
      break;
    }
    case "death": {
      if (p.equipment.head?.cardId === "e-halo") {
        const halo = p.equipment.head;
        removeEquipped(p, halo.id);
        discardCard(room, halo);
        shout(room, `👼 MIRACLE! ${p.name}'s Halo of Righteousness shatters with a blinding light, saving their life!`);
        break; // Spilleren dør ikke!
      }
      shout(room, `💀 ${p.name} has DIED.`);

      // d-doom: Mister 2 levels ved død!
      if (hasDungeon(room, "d-doom")) {
        const oldLvl = p.level;
        p.level = Math.max(1, p.level - 2);
        log(room, `☠️ Impending Doom! ${p.name} loses ${oldLvl - p.level} level(s) to the dungeon!`);
      }
      // body becomes loot pile
      const pile: Card[] = [...allEquipped(p), ...p.backpack, ...p.hand, ...(p.companion ? [p.companion] : [])];
      p.companion = null;
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
      shout(room, msg(newDungeon.name));
    }
  };
  if (cardId === "p-open") {
    openDungeon(n => `🏰 A new dungeon opens: ${n}!`);
  } else if (cardId === "p-close") {
    const closed = room.activeDungeons.pop();
    if (closed) {
      room.discards.dungeon.push(closed);
      shout(room, `🏚️ ${closed.name} is closed!`);
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
// A non-fighter made the monster side stronger: remember them for the leader bounty.
const markSaboteur = (room: Room, playerId: string) => {
  const c = room.combat;
  if (!c || playerId === c.attackerId || playerId === c.helperId) return;
  c.saboteurs = c.saboteurs ?? [];
  if (!c.saboteurs.includes(playerId)) c.saboteurs.push(playerId);
  room.stats.sabotages++;
};

// Bounty on the leader: when the leader loses a fight, everyone who worked against them gets a treasure.
const payBounty = (room: Room) => {
  const c = room.combat;
  if (!c || c.bountyPaid) return;
  c.bountyPaid = true;
  if (leaderOf(room)?.id !== c.attackerId) return;
  for (const id of c.saboteurs ?? []) {
    const p = room.players.find(x => x.id === id);
    if (!p || p.isDead) continue;
    const t = drawFromDeck(room, "treasure");
    if (!t) continue;
    p.hand.push(t);
    refreshDerived(p);
    room.stats.bounties++;
    shout(room, `💰 BOUNTY! ${p.name} helped bring down the leader and claims a treasure.`);
  }
};

const reopenInterrupts = (room: Room) => {
  resetPasses(room);
  room.status = "waitingForInterrupts";
  if (room.combat) room.combat.interruptDeadline = null; // the countdown restarts
  syncCombatGate(room);
};

// Siren's Call: whoever just joined as helper rolls; on 1-3 they turn on the attacker.
const sirenCheck = (room: Room) => {
  const c = room.combat;
  if (!c || !c.helperId || !c.monsters.some(m => m.sirenCall)) return;
  const helper = room.players.find(p => p.id === c.helperId);
  if (!helper) return;
  const roll = rollD6();
  pendingEvents.push({ type: "rolled", playerId: helper.id, result: roll, reason: "Siren's Call" });
  if (roll >= 4) {
    log(room, `🎶 ${helper.name} resists the Siren's song (rolled ${roll}).`);
    return;
  }
  shout(room, `🎶 ${helper.name} succumbs to the Siren (rolled ${roll}) and now fights FOR the monster!`);
  c.turncoatId = helper.id;
  c.helperId = null;
  c.contract = null;
  c.passes[helper.id] = false;
  room.stats.turncoats++;
  reopenInterrupts(room);
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
  const goal = room.settings.winLevel;
  if (p.level >= goal && !viaCombat) {
    p.level = goal - 1; // strict rule: the winning level is only reached by combat
    return;
  }
  if (p.level >= goal) {
    p.level = goal;
    room.winnerId = p.id;
    room.status = "gameOver";
    shout(room, `🏆 ${p.name} reaches Level ${goal} — VICTORY!`);
  }
};

const isActive = (room: Room, playerId: string) => room.players[room.activePlayerIndex]?.id === playerId;

// Ends the fight once every fighter has run (or died).
const finishRunAwayIfDone = (room: Room) => {
  const combat = room.combat;
  if (!combat) return;
  const ran = combat.ranAway ?? [];
  const done = (id: string | null) => !id || ran.includes(id) || room.players.find(p => p.id === id)?.isDead === true;
  if (!done(combat.attackerId) || !done(combat.helperId)) return;
  endCombat(room);
  room.currentPhase = 3;
  // applyBadStuff kan have skiftet status til "looting".
  if (room.status === "looting") room.statusBeforeLooting = "normalTurn";
  else room.status = "normalTurn";
};

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

    case "updateSettings": {
      if (room.status !== "lobby") return "Settings are locked once the game has started.";
      const next = { ...room.settings, ...msg.settings };
      if (!(WIN_LEVELS as readonly number[]).includes(next.winLevel)) return "Invalid winning level.";
      if (!(INTERRUPT_CHOICES as readonly number[]).includes(next.interruptSeconds)) return "Invalid countdown.";
      if (!(THREAT_CHOICES as readonly string[]).includes(next.threat)) return "Invalid threat.";
      room.settings = next;
      log(room, `⚙️ ${player.name}: play to level ${next.winLevel}, pass countdown ${next.interruptSeconds ? `${next.interruptSeconds}s` : "off"}, monster threat ${next.threat}.`);
      return null;
    }

    case "startGame": {
      if (room.status !== "lobby") return "Already started.";
      if (room.players.length < 2) return "Need at least 2 players.";
      // Fresh decks sized for the table: one set per 6 players.
      const copies = deckCopiesFor(room.players.length);
      const decks = buildAllDecks(copies);
      room.decks = { door: shuffle(decks.door), treasure: shuffle(decks.treasure), dungeon: shuffle(decks.dungeon) };
      room.discards = { door: [], treasure: [], dungeon: [] };
      if (copies > 1) log(room, `🃏 ${room.players.length} players: playing with ${copies} sets of Door and Treasure cards.`);
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

      shout(room, `💀 ${player.name} casts ${card.name} on ${targetPlayer.name}!`);
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
        if (card.ambush) {
          const next = drawFromDeck(room, "door");
          if (next && next.type === "monster") {
            room.table.push(next);
            room.combat!.monsters.push(next);
            shout(room, `⚔️ AMBUSH! ${next.name} (Lvl ${next.level}) charges in alongside ${card.name}!`);
          } else if (next) {
            room.decks.door.push(next); // not a monster: back on top, unseen
            log(room, `👀 ${card.name} was hoping for backup, but none came.`);
          }
        }
      } else if (card.type === "curse") {
        if (player.equipment.none.some(e => e.cardId === "e-spell-amulet")) {
          log(room, `🛡️ ${player.name}'s Amulet of Spell Reflection DESTROYS ${card.name} instantly!`);
        } else if (hasDungeon(room, "d-curses")) {
          shout(room, `💀 DUNGEON OF CURSES: ${card.name} hits EVERYONE!`);
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
      if (player.companion?.upkeep) {
        const cheapest = [...player.hand].sort((a, b) => goldValueOf(a) - goldValueOf(b))[0];
        if (cheapest) {
          player.hand.splice(player.hand.indexOf(cheapest), 1);
          discardCard(room, cheapest);
          log(room, `🪙 ${player.name} pays ${player.companion.name} with ${cheapest.name}.`);
        } else {
          log(room, `💢 ${player.name} can't pay — ${player.companion.name} walks off the job!`);
          discardCard(room, player.companion);
          player.companion = null;
        }
        refreshDerived(player);
      }
      // Charity check
      const charityLimit = hasDungeon(room, "d-infinite") ? Infinity // Dimension of Hoarding
        : (hasDungeon(room, "d-charity") ? 4 : 5) + (hasRace(player, "Dwarf") ? 1 : 0);
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

      // Forged Guild Papers: attach them so the item's requirements are waived.
      let papersIdx = -1;
      if (msg.forgedPapersId) {
        papersIdx = player.hand.findIndex(c => c.id === msg.forgedPapersId);
        const papers = player.hand[papersIdx];
        if (!papers || papers.type !== "forged-papers") {
          player.equipment = before;
          player.backpack = backpackBefore;
          return "Forged Guild Papers not in hand.";
        }
        if (card.forgedWith || !requirementProblem(player, card)) {
          player.equipment = before;
          player.backpack = backpackBefore;
          return "This item has no requirement to forge.";
        }
        card.forgedWith = papers;
      }

      const err = tryEquip(player, card);
      if (err) {
        if (msg.forgedPapersId) delete card.forgedWith;
        player.equipment = before;
        player.backpack = backpackBefore;
        return err;
      }

      if (fromHand) player.hand.splice(idx, 1);
      else player.backpack.splice(player.backpack.findIndex(c => c.id === msg.cardId), 1);
      if (card.forgedWith && msg.forgedPapersId) {
        player.hand.splice(player.hand.findIndex(c => c.id === msg.forgedPapersId), 1);
        log(room, `📜 ${player.name} flashes some very official-looking Guild Papers.`);
      }

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

      // Halfling: once per turn, the most valuable item in the sale counts double.
      const halflingBoost = hasRace(player, "Halfling") && room.halflingSaleTurn[player.id] !== room.turnNo
        ? owned.reduce<Card | null>((best, c) => (!best || goldValueOf(c) > goldValueOf(best) ? c : best), null)
        : null;
      let totalGold = 0;
      for (const c of owned) {
        let val = goldValueOf(c);
        if (hasDungeon(room, "d-clipping")) val = Math.max(0, val - 100);
        if (hasDungeon(room, "d-lavish")) val *= 2;
        if (hasEffect(player, "halfSellValue")) val = Math.floor(val / 2);
        if (c === halflingBoost) val *= 2;
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

      if (halflingBoost) {
        room.halflingSaleTurn[player.id] = room.turnNo;
        log(room, `🥧 ${player.name} haggles like a Halfling: ${halflingBoost.name} sells for double!`);
      }
      const levelsGained = Math.floor(totalGold / 1000);
      const newLevel = Math.min(room.settings.winLevel - 1, player.level + levelsGained); // Man KAN IKKE vinde på et salg
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
        if (player.level >= room.settings.winLevel - 1) return `Du kan ikke bruge dette kort til at vinde spillet (Level ${room.settings.winLevel})!`;
        player.level += 1;
        player.hand.splice(idx, 1);
        room.discards.treasure.push(card);
        log(room, `⬆️ ${player.name} plays ${card.name} and goes up a level!`);
        refreshDerived(player);
        return null;
      }

      if (card.type === "class") {
        if (hasClass(player, card.className)) return `You already are a ${card.className}.`;
        player.hand.splice(idx, 1);
        if (player.playerClass && player.dualClass && !player.extraClass) {
          player.extraClass = card;
          log(room, `✨ ${player.name} (Guild Hopper) becomes a ${card.name} as well!`);
        } else {
          const oldClass = player.playerClass;
          if (oldClass) room.discards.door.push(oldClass);
          player.playerClass = card;
          if (oldClass) log(room, `✨ ${player.name} discards ${oldClass.name} and becomes a ${card.name}!`);
          else log(room, `✨ ${player.name} is now a ${card.name}!`);
        }
        validateClassEquipment(room, player);
        refreshDerived(player);
        return null;
      }

      if (card.type === "race") {
        if (hasRace(player, card.raceName)) return `You already are a ${card.raceName}.`;
        player.hand.splice(idx, 1);
        if (player.race && player.dualRace && !player.extraRace) {
          player.extraRace = card;
          log(room, `🧬 ${player.name} (Mixed Heritage) is now also a ${card.raceName}!`);
        } else {
          const oldRace = player.race;
          if (oldRace) room.discards.door.push(oldRace);
          player.race = card;
          if (oldRace) log(room, `🧬 ${player.name} stops being a ${oldRace.raceName} and becomes a ${card.raceName}!`);
          else log(room, `🧬 ${player.name} is now a ${card.raceName}!`);
        }
        refreshDerived(player);
        return null;
      }

      if (card.type === "companion") {
        player.hand.splice(idx, 1);
        const old = player.companion;
        if (old) {
          discardCard(room, old);
          log(room, `👋 ${player.name} sends ${old.name} away.`);
        }
        player.companion = card;
        log(room, `🐾 ${player.name} recruits ${card.name}!`);
        refreshDerived(player);
        return null;
      }

      if (card.type === "dual") {
        const slot = card.dualKind === "class" ? "dualClass" : "dualRace";
        if (player[slot]) return `You already have ${card.name} in play.`;
        player.hand.splice(idx, 1);
        player[slot] = card;
        log(room, `🌟 ${player.name} plays ${card.name}: they can now have two ${card.dualKind === "class" ? "classes" : "races"}!`);
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
        shout(room, `🧴 ${player.name} throws a Flask of Glue at ${target.name}! If they have to run away, they will automatically fail!`);

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
        markSaboteur(room, player.id);
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
        shout(room, `💖 ${player.name} plays Friendship Potion! The combat ends instantly. No levels or treasures!`);
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
        markSaboteur(room, player.id);
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
        const swarmCaller = !goblinSwarm && hasTag(card, "goblin") && hasRace(player, "Goblin")
          && !(combat.swarmCalled ?? []).includes(player.id);
        if (!undead && !goblinSwarm && !swarmCaller) return "Card cannot be played in combat.";
        if (swarmCaller && !undead) {
          combat.swarmCalled = [...(combat.swarmCalled ?? []), player.id];
          log(room, `📯 ${player.name} calls the swarm: ${card.name} joins the fight!`);
        }

        player.hand.splice(idx, 1);
        combat.monsters.push(card);
        markSaboteur(room, player.id);
        combat.log.push(undead
          ? `🧟 ${player.name} plays ${card.name} directly into combat thanks to the Undead!`
          : `👺 GOBLIN SWARM! ${player.name} plays ${card.name} directly into combat!`);
        reopenInterrupts(room);
        refreshDerived(player);
        return null;
      }

      // Både OneShots og Enhancers skal kunne spilles på begge sider!
      if (card.type !== "oneshot" && card.type !== "enhancer") return "Card cannot be played in combat.";
      const tagged = card.type === "oneshot" && card.tagBonus && msg.side === "attacker"
        && combat.monsters.some(m => hasTag(m, card.tagBonus!.tag));
      const bonusAmount = tagged && card.type === "oneshot" && card.tagBonus ? card.tagBonus.bonus : card.bonus;
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
        if (bonusAmount > 0) markSaboteur(room, player.id);
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
      // Cleric: discard 2 cards to lift one lasting effect from anyone (any time).
      if (msg.ability === "cleanse") {
        if (!hasClass(player, "Cleric")) return "Not a Cleric.";
        const ids = [...new Set(msg.cardIds)];
        if (ids.length !== 2 || !ids.every(id => player.hand.some(c => c.id === id))) return "Discard exactly 2 cards from your hand to cleanse.";
        const target = room.players.find(p => p.id === msg.targetId);
        if (!target || !msg.effectId || !target.effects.some(e => e.id === msg.effectId)) return "No such effect to cleanse.";
        for (const id of ids) discardCard(room, player.hand.splice(player.hand.findIndex(c => c.id === id), 1)[0]);
        log(room, `🙏 ${player.name} prays over ${target.name}.`);
        removeEffect(room, target, msg.effectId);
        refreshDerived(player);
        return null;
      }

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

        const reqRoll = player.equipment.hands.some(h => h.cardId === "e-lockpicks") ? 2 : 3;
        if (roll >= reqRoll) {
          removeEquipped(target, targetEq.id);
          player.backpack.push(targetEq);
          shout(room, `🗡️ ${player.name} rolls ${roll} and successfully STEALS ${targetEq.name} from ${target.name}!`);
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
        shout(room, `🗡️ ${player.name} BACKSTABS ${target.name}! (-2 to their combat score)`);
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
      const itemIds = msg.itemIds ?? [];
      const bribe = valuables(player, itemIds, "owned");
      if (typeof bribe === "string") return bribe;
      const offer: NegotiationOffer = {
        id: newId(),
        fromId: playerId, toId: helper.id,
        treasures: msg.treasures,
        itemIds,
        status: "pending",
      };
      room.negotiations.push(offer);
      log(room, bribe.length
        ? `${player.name} offers ${helper.name} ${msg.treasures} treasure(s) AND ${cardNames(bribe)} for help.`
        : `${player.name} offers ${msg.treasures} treasure(s) for help.`);
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

      shout(room, `💖 ${player.name} uses the Kneepads of Allure to FORCE ${target.name} to help them!`);
      sirenCheck(room);
      return null;
    }

    case "respondHelp": {
      const offer = room.negotiations.find(o => o.id === msg.offerId);
      if (!offer || offer.toId !== playerId) return "Not your offer.";
      if (offer.status !== "pending") return "Already responded.";
      offer.status = msg.accept ? "accepted" : "rejected";
      if (msg.accept && room.combat && !room.combat.helperId && !combatDecided(room)) {
        // The bribe changes hands now — and stays changed, whatever happens in the fight.
        const briber = room.players.find(p => p.id === offer.fromId);
        if (offer.itemIds.length && briber) {
          const items = valuables(briber, offer.itemIds, "owned");
          if (typeof items === "string") {
            room.negotiations = room.negotiations.filter(o => o.status === "pending");
            return `${briber.name} no longer has the offered items — the deal is off.`;
          }
          for (const c of items) { takeOwned(briber, c.id); receive(player, c); }
          refreshDerived(briber);
          refreshDerived(player);
          room.stats.bribes++;
          shout(room, `💰 ${player.name} pockets ${cardNames(items)} up front.`);
        }
        room.combat.helperId = playerId;
        room.combat.contract = { helperId: playerId, treasures: offer.treasures, accepted: true };
        delete room.combat.passes[playerId];
        reopenInterrupts(room);
        shout(room, `🩸 BLOOD OATH: ${player.name} joins for ${offer.treasures} treasure(s). Cannot withdraw.`);
        room.negotiations = [];
        sirenCheck(room);
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
        // Elves learn from the strong: a level only for helping someone higher than themselves.
        const attackerLevelBefore = attacker.level - totalLevels;
        if (helper && hasRace(helper, "Elf") && attackerLevelBefore > helper.level && helper.level < room.settings.winLevel - 1) {
          helper.level += 1;
          log(room, `🧝 ${helper.name} gains a level for helping a stronger hero (Elf).`);
        }
        shout(room, `🏆 Victory! +${totalLevels} level(s), +${attackerShare} treasure(s) to ${attacker.name}${helper ? `, +${helperShare} to ${helper.name}` : ""}.`);

        endCombat(room, true);
        refreshDerived(attacker);
        if (helper) refreshDerived(helper);
        room.status = "normalTurn";
        room.currentPhase = 3;
        checkVictory(room, attacker, true);
      } else {
        room.status = "runAwayRoll";
        shout(room, `Defeat! ${attacker.name}${helper ? ` and ${helper.name}` : ""} must Run Away.`);
        payBounty(room);
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

      // Monsters that don't bother with weak players can't hurt them on the way out.
      const pursuers = combat.monsters.filter(m => m.ignoresLevelAtOrBelow === undefined || player.level > m.ignoresLevelAtOrBelow);
      if (pursuers.length === 0) {
        combat.ranAway.push(playerId);
        log(room, `🐾 ${player.name} is beneath the monsters' notice and simply walks away.`);
        finishRunAwayIfDone(room);
        return null;
      }

      const glued = combat.gluedPlayers?.includes(playerId) === true;
      let roll = rollD6();

      if (allEquipped(player).some(e => e.cardId === "e-shadow-cloak")) {
        roll += 1;
        log(room, `🦇 ${player.name}'s Cloak of Shadows swirls, granting +1 to the escape roll!`);
      }

      if (hasRace(player, "Elf")) roll += 1; // Elves are quick on their feet
      if (hasClass(player, "Thief")) roll += 1; // Thieves know every back door
      if (player.companion?.runBonus) roll += player.companion.runBonus;

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
        shout(room, `🧴 ${player.name} is covered in GLUE and automatically fails to escape!`);
      }
      if (!glued && roll >= 5) {
        log(room, `${player.name} escapes!`);
      } else {
        log(room, `${player.name} fails to escape — Bad Stuff!`);
        for (const m of pursuers) {
          applyBadStuff(room, player, m.badStuff);
          if (player.isDead) break;
        }
      }

      finishRunAwayIfDone(room);
      return null;
    }

    case "flee": {
      if (!room.combat) return "No combat.";
      if (room.combat.attackerId !== playerId) return "Kun angriberen kan overgive sig.";
      if (combatDecided(room)) return "Already running away.";
      room.status = "runAwayRoll";
      room.combat.log.push(`💨 ${player.name} giver op og gør klar til at flygte!`);
      payBounty(room);
      return null;
    }

    case "cowardlyFlee": {
      if (!room.combat) return "No combat.";
      if (!hasDungeon(room, "d-cowards")) return "Dungeon of Cowards is not active.";
      if (room.combat.attackerId !== playerId) return "Only the attacker can trigger a cowardly flee.";
      if (combatDecided(room)) return "Already running away.";
      room.status = "runAwayRoll";
      room.combat.log.push(`🐔 ${player.name} uses the Dungeon of Cowardly Combat to instantly flee without asking!`);
      payBounty(room);
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

    case "proposeTrade": {
      if (room.status !== "normalTurn" || room.combat) return "Trades happen outside of fights.";
      const other = room.players.find(p => p.id === msg.toId);
      if (!other || other.id === playerId) return "Pick another player to trade with.";
      if (player.isDead || other.isDead) return "The dead don't trade.";
      if (msg.give.length === 0 && msg.take.length === 0) return "A trade needs at least one card.";
      if (room.trades.filter(t => t.fromId === playerId).length >= 3) return "You already have 3 open trade offers.";
      const give = valuables(player, msg.give, "owned");
      if (typeof give === "string") return give;
      const take = valuables(other, msg.take, "worn");
      if (typeof take === "string") return take;
      room.trades.push({ id: newId(), fromId: playerId, toId: other.id, give: [...msg.give], take: [...msg.take] });
      log(room, `🤝 ${player.name} proposes a trade to ${other.name}.`);
      return null;
    }

    case "respondTrade": {
      const trade = room.trades.find(t => t.id === msg.tradeId);
      if (!trade || trade.toId !== playerId) return "No such trade offer for you.";
      room.trades = room.trades.filter(t => t.id !== trade.id);
      const from = room.players.find(p => p.id === trade.fromId);
      if (!from) return "The other player is gone.";
      if (!msg.accept) {
        log(room, `🙅 ${player.name} turns down ${from.name}'s trade.`);
        return null;
      }
      if (room.status !== "normalTurn" || room.combat) return "Trades happen outside of fights.";
      // Re-check everything: cards may have moved since the offer was made.
      const give = valuables(from, trade.give, "owned");
      if (typeof give === "string") return `The trade fell through: ${give}`;
      const take = valuables(player, trade.take, "worn");
      if (typeof take === "string") return `The trade fell through: ${take}`;
      for (const c of give) takeOwned(from, c.id);
      for (const c of take) takeOwned(player, c.id);
      for (const c of give) receive(player, c);
      for (const c of take) receive(from, c);
      refreshDerived(from);
      refreshDerived(player);
      room.stats.trades++;
      shout(room, `🤝 ${from.name} and ${player.name} trade: ${cardNames(give)} ⇄ ${cardNames(take)}.`);
      return null;
    }

    case "cancelTrade": {
      const trade = room.trades.find(t => t.id === msg.tradeId);
      if (!trade || trade.fromId !== playerId) return "No such trade offer from you.";
      room.trades = room.trades.filter(t => t.id !== trade.id);
      return null;
    }

    case "payToll": {
      const c = room.combat;
      if (!c || c.attackerId !== playerId) return "Only the attacker can pay a toll.";
      if (room.status !== "waitingForInterrupts" && room.status !== "inCombat") return "Too late to pay — the fight is decided.";
      if (c.monsters.some(m => m.antiClass)) return "This boss can't be bought off.";
      const price = tollPrice(monsterTotal(room, c));
      if (price === null) return "This fight is too big to buy your way out of.";
      const cards = valuables(player, msg.cardIds, "owned");
      if (typeof cards === "string") return cards;
      const paid = cards.reduce((sum, x) => sum + tradeValue(x), 0);
      if (paid < price) return `The toll is ${price}g — you offered ${paid}g.`;
      for (const x of cards) discardCard(room, takeOwned(player, x.id)!);
      shout(room, `🪙 ${player.name} pays a toll of ${cardNames(cards)} (${paid}g) and walks past ${c.monsters.map(m => m.name).join(" & ")}.`);
      room.stats.tolls++;
      endCombat(room);
      room.negotiations = [];
      room.status = "normalTurn";
      room.currentPhase = 3;
      refreshDerived(player);
      return null;
    }

    case "removeEffect": {
      const idx = player.hand.findIndex(c => c.id === msg.cardId);
      const ring = player.hand[idx];
      if (!ring || ring.type !== "remedy") return "You need a Ring of Second Chances.";
      const target = room.players.find(p => p.id === msg.targetId);
      if (!target || !target.effects.some(e => e.id === msg.effectId)) return "No such effect.";
      player.hand.splice(idx, 1);
      discardCard(room, ring);
      log(room, `💍 ${player.name} uses ${ring.name} on ${target.name}.`);
      removeEffect(room, target, msg.effectId);
      refreshDerived(player);
      return null;
    }

    case "sacrificeCompanion": {
      const combat = room.combat;
      if (!combat || room.status !== "runAwayRoll") return "You can only sacrifice a companion while running away.";
      if (playerId !== combat.attackerId && playerId !== combat.helperId) return "Not in this combat.";
      if (combat.ranAway?.includes(playerId)) return "You already got away.";
      const buddy = player.companion;
      if (!buddy?.sacrificable) return "Your companion can't cover your escape.";
      player.companion = null;
      discardCard(room, buddy);
      combat.ranAway = [...(combat.ranAway ?? []), playerId];
      log(room, `🫡 ${buddy.name} throws itself at the monster — ${player.name} escapes!`);
      refreshDerived(player);
      finishRunAwayIfDone(room);
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
      shout(room, `🔄 Sudden Swaps! ${player.name} blindly stole a card from ${helper.name}'s hand!`);
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
  room.turnNo++;
  room.currentPhase = 1;
  room.status = "normalTurn";
  room.combatFought = false;
  room.combat = null;
  room.negotiations = [];
  log(room, `▶ ${room.players[next].name}'s turn.`);
};
