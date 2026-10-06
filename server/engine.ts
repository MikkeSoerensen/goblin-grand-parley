// Authoritative Goblin Grand Parley game engine.
// Pure game rules: no sockets, no file I/O. The transport layer (app.ts) calls
// joinRoom / handleAction / setConnected and broadcasts buildView() afterwards.

import { randomBytes, randomUUID } from "crypto";

import { buildAllDecks, deckCopiesFor } from "../shared/deck.js";
import {
  CLASS_LABEL, CLASS_PLURAL, RACE_LABEL, RACE_PLURAL, effectTotal, hasClass, hasEffect, hasRace, hasTag, isTradable,
  levelsText, tollPrice, tradeValue, treasuresText,
} from "../shared/rules.js";
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

const DECK_LABEL = { door: "dørkort", treasure: "skattekort", dungeon: "fangehulskort" } as const;
const THREAT_LABEL: Record<RoomSettings["threat"], string> = { calm: "rolig", normal: "normal", brutal: "brutal" };

const drawFromDeck = (room: Room, deck: "door" | "treasure" | "dungeon"): Card | null => {
  if (room.decks[deck].length === 0) {
    if (room.discards[deck].length === 0) return null;
    room.decks[deck] = shuffle(room.discards[deck]);
    room.discards[deck] = [];
    log(room, `(Kassebunken med ${DECK_LABEL[deck]} er blandet ind igen)`);
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
      mods.push(`${m.name} hader ${CLASS_PLURAL[hated.className as ClassName]}: +${hated.bonus}`);
    }
    if (m.packHunter && !c.helperId) {
      lvl += m.packHunter;
      mods.push(`${m.name} jager i flok — du kæmper alene: +${m.packHunter}`);
    }
    if (m.huntsLeader && isLeader) {
      lvl += m.huntsLeader;
      mods.push(`${m.name} jager føreren: +${m.huntsLeader}`);
    }
    const hatedRace = m.antiRace;
    if (hatedRace && fighters.some(f => f && hasRace(f, hatedRace.raceName))) {
      lvl += hatedRace.bonus;
      mods.push(`${m.name} hader ${RACE_PLURAL[hatedRace.raceName]}: +${hatedRace.bonus}`);
    }
    if (m.hordeBonus && c.monsters.length > 1) {
      lvl += m.hordeBonus * (c.monsters.length - 1);
      mods.push(`${m.name} vokser med horden (${c.monsters.length - 1} mere): +${m.hordeBonus * (c.monsters.length - 1)}`);
    }
    if (m.swarmBonus && goblins > 1) {
      lvl += m.swarmBonus * (goblins - 1);
      mods.push(`${m.name} leder ${goblins - 1} ${goblins - 1 === 1 ? "goblin" : "gobliner"}: +${m.swarmBonus * (goblins - 1)}`);
    }
    return s + lvl;
  }, 0) + c.monsterBonuses;

  const threat = threatBonus(room, attacker);
  if (threat > 0) {
    total += threat;
    mods.push(`Trussel (${attacker!.name} er på niveau ${attacker!.level}): +${threat}`);
  }
  // Showing off two classes or two races draws the dungeon's attention.
  const extras = attacker && room.settings.threat !== "calm" ? (attacker.extraClass ? 1 : 0) + (attacker.extraRace ? 1 : 0) : 0;
  if (extras > 0) {
    total += 2 * extras;
    mods.push(`Blærerøv (${attacker!.name} har ${extras === 2 ? "to klasser og to folk" : attacker!.extraClass ? "to klasser" : "to folk"}): +${2 * extras}`);
  }
  const turncoat = c.turncoatId ? room.players.find(p => p.id === c.turncoatId) : undefined;
  if (turncoat) {
    const power = computePower(turncoat);
    total += power;
    mods.push(`${turncoat.name} kæmper for monsteret: +${power}`);
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
  shout(room, "⏱️ Tiden er gået — alle andre melder pas.");
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
    log: [`Rum ${code} er oprettet.`],
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
  | { ok: false; error: string; freeSeats?: string[] }; // freeSeats: offline players you could take over

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
      log(room, `${player.name} er tilbage.`);
      syncCombatGate(room);
      room.updatedAt = Date.now();
      return { ok: true, room, playerId: player.id, token: req.token };
    }
  }

  const byName = room.players.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (byName) {
    if (byName.connected) {
      return {
        ok: false,
        error: `${byName.name} er stadig forbundet. Hvis det var dig på en anden enhed, så vent et par sekunder og prøv igen.`,
        freeSeats: room.players.filter(p => !p.connected).map(p => p.name),
      };
    }
    const token = newToken();
    room.sessions[byName.id] = token;
    byName.connected = true;
    log(room, `${byName.name} er tilbage.`);
    syncCombatGate(room);
    room.updatedAt = Date.now();
    return { ok: true, room, playerId: byName.id, token };
  }

  if (room.status !== "lobby") {
    const freeSeats = room.players.filter(p => !p.connected).map(p => p.name);
    return {
      ok: false,
      error: freeSeats.length
        ? "Spillet er allerede i gang — overtag en af de ledige pladser."
        : "Spillet er allerede i gang, og alle pladser er optaget.",
      freeSeats,
    };
  }

  const player: PrivatePlayer = {
    id: newId(), name: name || "Spiller",
    level: 1,
    equipment: { head: null, armor: null, feet: null, hands: [], bigItem: null, none: [] },
    hand: [], backpack: [], handCount: 0, backpackCount: 0,
    combatPower: 1, isDead: false, connected: true, effects: [],
    playerClass: null, extraClass: null, race: null, extraRace: null, dualClass: null, dualRace: null, companion: null,
  };
  const token = newToken();
  room.players.push(player);
  room.sessions[player.id] = token;
  log(room, `${player.name} kom ind i ${code}.`);
  if (!existing) rooms.set(code, room);
  room.updatedAt = Date.now();
  return { ok: true, room, playerId: player.id, token };
};

export const setConnected = (room: Room, playerId: string, connected: boolean) => {
  const p = room.players.find(x => x.id === playerId);
  if (!p || p.connected === connected) return;
  p.connected = connected;
  if (!connected) log(room, `${p.name} mistede forbindelsen.`);
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
  if (new Set(ids).size !== ids.length) return "Det samme kort to gange.";
  const cards: Card[] = [];
  for (const id of ids) {
    const c = where === "worn" ? allEquipped(p).find(e => e.id === id) : ownedCard(p, id);
    if (!c) return where === "worn" ? `${p.name} har ikke den genstand på.` : `${p.name} har ikke det kort.`;
    if (!isTradable(c)) return `${c.name} har ingen guldværdi og kan ikke handles.`;
    cards.push(c);
  }
  return cards;
};

const cardNames = (cards: Card[]) => cards.map(c => c.name).join(", ") || "ingenting";

// ---------- lasting effects ----------
export const addEffect = (room: Room, p: PrivatePlayer, effect: Omit<PlayerEffect, "id">): PlayerEffect => {
  const e: PlayerEffect = { ...effect, id: newId() };
  p.effects.push(e);
  shout(room, `🌀 ${p.name} er nu ramt af ${e.name}.`);
  return e;
};

export const removeEffect = (room: Room, p: PrivatePlayer, effectId: string): boolean => {
  const idx = p.effects.findIndex(e => e.id === effectId);
  if (idx < 0) return false;
  const [e] = p.effects.splice(idx, 1);
  shout(room, `✨ ${e.name} er løftet fra ${p.name}.`);
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
  if (card.cardId === "e-kneepads" && hasClass(p, "Warrior")) return "Krigere er for stolte til at gå i Smigrende Tøfler!";
  if (card.classReq && !hasClass(p, card.classReq)) return `Kun en ${CLASS_LABEL[card.classReq]} kan tage denne genstand på!`;
  return null;
};

const tryEquip = (p: PrivatePlayer, card: EquipmentCard): string | null => {
  const problem = requirementProblem(p, card);
  if (problem) return problem;
  // Dwarves can haul any number of Big items (the single Big-item slot itself still holds one).
  if (card.isBig && p.equipment.bigItem && !hasRace(p, "Dwarf")) return "Du har allerede en stor genstand på.";
  switch (card.slot) {
    case "head":
      if (p.equipment.head) return "Du har allerede noget på hovedet.";
      p.equipment.head = card; break;
    case "armor":
      if (p.equipment.armor) return "Du har allerede en rustning på.";
      p.equipment.armor = card; break;
    case "feet":
      if (p.equipment.feet) return "Du har allerede noget på fødderne.";
      p.equipment.feet = card; break;
    case "hand":
      if (handsUsed(p) >= 2) return "Begge hænder er optaget.";
      p.equipment.hands.push(card); break;
    case "twoHands":
      if (handsUsed(p) > 0) return "Du skal have begge hænder fri.";
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
      log(room, `🎒 ${p.name} er ikke længere ${CLASS_LABEL[eq.classReq]}! ${eq.name} glider ned i rygsækken!`);
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
  if (!lost) { log(room, `${p.name} har intet folk at miste.`); return; }
  room.discards.door.push(lost);
  if (p.extraRace) p.extraRace = null;
  else p.race = null;
  log(room, `🎭 ${p.name} får en identitetskrise og er ikke længere ${RACE_LABEL[lost.raceName]}!`);
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
      log(room, `${p.name} mister ${levelsText(lost)} → niveau ${p.level}.`);
      break;
    }
    case "loseItem": {
      let target: EquipmentCard | null = null;
      const slot = bs.slot;
      const equipped = allEquipped(p);
      if (slot === "any" || slot === "biggest") {
        if (equipped.length === 0 && !p.backpack.some(isEquipment)) { log(room, `${p.name} har ingen genstande at miste.`); break; }
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
        log(room, `${p.name} mister ${target.name}.`);
      } else log(room, `${p.name} har ingen passende genstand at miste.`);
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
      shout(room, `🐉 ${p.name}s nederlag gør bæstet rasende — ALLE mister ${levelsText(bs.amount)}!`);
      room.stats.tableHits++;
      for (const o of room.players.filter(x => !x.isDead)) {
        o.level = Math.max(1, o.level - bs.amount);
        refreshDerived(o);
      }
      break;
    }
    case "loseHandItems": {
      const hands = [...p.equipment.hands];
      if (hands.length === 0) { log(room, `${p.name} har intet i hænderne at miste.`); break; }
      p.equipment.hands = [];
      for (const h of hands) discardCard(room, h);
      log(room, `${p.name} mister alt i hænderne: ${hands.map(h => h.name).join(", ")}.`);
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
        log(room, `${p.companion.name} flygter i kaosset.`);
        discardCard(room, p.companion);
        p.companion = null;
      }
      log(room, `${p.name} mister ALT sit udstyr!`);
      break;
    }
    case "loseHandEquipAndLevel": {
      const lost = Math.min(bs.amount, Math.max(0, p.level - 1));
      if (lost > 0) {
        p.level -= lost;
        log(room, `🩸 Fortæreren suger magien ud af ${p.name}! ${p.name} mister ${levelsText(lost)} → niveau ${p.level}.`);
      }
      if (p.hand.length > 0) {
        log(room, `🃏 Alle ${p.hand.length} kort på ${p.name}s hånd bliver fortæret!`);
        discardHand(room, p);
      }
      const equipped = allEquipped(p);
      if (equipped.length > 0) {
        log(room, `🛡️ Alt ${p.name}s påtagne udstyr går i opløsning!`);
        for (const c of equipped) {
          removeEquipped(p, c.id);
          discardCard(room, c);
        }
      }
      break;
    }
    case "loseClassAndLevels": {
      loseClass(room, p, `💀 ${p.name} bliver knust og glemmer, hvordan man er ${(p.extraClass ?? p.playerClass)?.name}!`);
      const lost = Math.min(bs.amount, Math.max(0, p.level - 1));
      if (lost > 0) {
        p.level -= lost;
        log(room, `🩸 Jernkolossen banker ${p.name} ${levelsText(lost)} ned → niveau ${p.level}.`);
      }
      break;
    }
    case "loseClassAndHand": {
      loseClass(room, p, `💀 Sfinksen fratager ${p.name} sin klasse!`);
      if (p.hand.length > 0) {
        log(room, `🃏 Sfinksens blik spreder alle ${p.hand.length} kort fra ${p.name}s hånd!`);
        discardHand(room, p);
      }
      break;
    }
    case "loseLevelsOrDie": {
      if (p.level <= bs.threshold) {
        shout(room, `💀 Ærkedæmonens mørke er for meget! ${p.name} DØR på stedet!`);
        applyBadStuff(room, p, { kind: "death" });
      } else {
        const oldLevel = p.level;
        p.level = Math.max(1, p.level - bs.amount);
        log(room, `🩸 ${p.name}s tro er knust! ${p.name} mister ${levelsText(oldLevel - p.level)} → niveau ${p.level}.`);
      }
      break;
    }
    case "loseClass": {
      if (!loseClass(room, p, `💀 ${p.name} får HUKOMMELSESTAB og glemmer, hvordan man er ${(p.extraClass ?? p.playerClass)?.name}!`)) {
        log(room, `💀 ${p.name} får hukommelsestab, men havde ingen klasse at glemme!`);
      }
      break;
    }
    case "robinHood": {
      const equipped = allEquipped(p);
      if (equipped.length === 0) {
        log(room, `💀 ${p.name} har intet påtaget udstyr, som Robin Hood kan stjæle.`);
        break;
      }
      const targetItem = equipped.reduce((prev, curr) => (curr.goldValue > prev.goldValue ? curr : prev));
      removeEquipped(p, targetItem.id);
      const opponents = room.players.filter(op => op.id !== p.id && !op.isDead);
      if (opponents.length === 0) {
        discardCard(room, targetItem);
        log(room, `💀 Robin Hood stjæler ${targetItem.name} fra ${p.name}, men der er ingen at give den til! Den ryger i kassebunken.`);
        break;
      }
      const lowest = opponents.reduce((low, op) => (op.level < low.level ? op : low));
      lowest.backpack.push(targetItem);
      refreshDerived(lowest);
      shout(room, `💀 ROBIN HOODS HÆVN! ${targetItem.name} tages fra ${p.name} og gives til ${lowest.name} (niv. ${lowest.level})!`);
      break;
    }
    case "death": {
      if (p.equipment.head?.cardId === "e-halo") {
        const halo = p.equipment.head;
        removeEquipped(p, halo.id);
        discardCard(room, halo);
        shout(room, `👼 MIRAKEL! ${p.name}s Retfærdighedens Glorie splintres i et blændende lys og redder livet!`);
        break; // Spilleren dør ikke!
      }
      shout(room, `💀 ${p.name} er DØD.`);

      // d-doom: Mister 2 levels ved død!
      if (hasDungeon(room, "d-doom")) {
        const oldLvl = p.level;
        p.level = Math.max(1, p.level - 2);
        log(room, `☠️ Truende undergang! ${p.name} mister ${levelsText(oldLvl - p.level)} til fangehullet!`);
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
    openDungeon(n => `🏰 Et nyt fangehul åbner: ${n}!`);
  } else if (cardId === "p-close") {
    const closed = room.activeDungeons.pop();
    if (closed) {
      room.discards.dungeon.push(closed);
      shout(room, `🏚️ ${closed.name} er lukket!`);
    } else {
      log(room, `...men der var ingen aktive fangehuller at lukke.`);
    }
  } else if (cardId === "p-swap") {
    while (room.activeDungeons.length > 0) room.discards.dungeon.push(room.activeDungeons.pop()!);
    openDungeon(n => `🌌 Dimensionsskift! Nyt fangehul: ${n}!`);
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
    log: [`⚔️  ${attacker.name} kæmper mod ${monsterCard.name} (niv. ${monsterCard.level})`],
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
    shout(room, `💰 DUSØR! ${p.name} hjalp med at fælde føreren og får en skat.`);
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
  pendingEvents.push({ type: "rolled", playerId: helper.id, result: roll, reason: "Sirenens kald" });
  if (roll >= 4) {
    log(room, `🎶 ${helper.name} modstår Sirenens sang (slog ${roll}).`);
    return;
  }
  shout(room, `🎶 ${helper.name} falder for Sirenen (slog ${roll}) og kæmper nu FOR monsteret!`);
  c.turncoatId = helper.id;
  c.helperId = null;
  c.contract = null;
  c.passes[helper.id] = false;
  room.stats.turncoats++;
  reopenInterrupts(room);
};

// Once Run Away is rolled (or the attacker gave up) the fight is decided.
const combatDecided = (room: Room) => room.status === "runAwayRoll";

// Evil Twin-kloner findes kun under kampen; de må aldrig ende i bunken som ekstra kort.
const MATE_CLONE_MARK = "-mate-";
export const TWIN_PREFIX = "Ond Tvilling af ";
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
    shout(room, `🏆 ${p.name} når niveau ${goal} — SEJR!`);
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
  if (!player) return "Ukendt spiller.";

  // Leaving and restarting work in every state, including after the game is over.
  if (msg.type === "leaveGame") {
    removePlayer(room, playerId);
    return null;
  }
  if (msg.type === "restartGame") {
    if (room.status === "lobby") return "Spillet er ikke startet endnu.";
    restartGame(room, `${player.name} startede et nyt spil — alle tilbage til venteværelset.`);
    return null;
  }
  if (room.status === "gameOver") return "Spillet er slut.";

  switch (msg.type) {
    case "rename": {
      const name = msg.name.trim().slice(0, 20);
      if (!name) return "Navnet må ikke være tomt.";
      if (room.players.some(p => p.id !== playerId && p.name.toLowerCase() === name.toLowerCase())) return "Navnet er allerede taget.";
      player.name = name;
      return null;
    }

    case "removePlayer": {
      if (room.status !== "lobby") return "Spillere kan kun fjernes i venteværelset — brug Forlad spil i stedet.";
      const target = room.players.find(p => p.id === msg.playerId);
      if (!target || target.id === playerId) return "Vælg en anden spiller.";
      if (target.connected) return `${target.name} er forbundet — kun pladser uden forbindelse kan fjernes.`;
      removePlayer(room, target.id);
      return null;
    }

    case "updateSettings": {
      if (room.status !== "lobby") return "Indstillingerne er låst, når spillet er startet.";
      const next = { ...room.settings, ...msg.settings };
      if (!(WIN_LEVELS as readonly number[]).includes(next.winLevel)) return "Ugyldigt vindertrin.";
      if (!(INTERRUPT_CHOICES as readonly number[]).includes(next.interruptSeconds)) return "Ugyldig nedtælling.";
      if (!(THREAT_CHOICES as readonly string[]).includes(next.threat)) return "Ugyldig trussel.";
      room.settings = next;
      log(room, `⚙️ ${player.name}: spil til niveau ${next.winLevel}, pas-nedtælling ${next.interruptSeconds ? `${next.interruptSeconds} sek.` : "slået fra"}, monstertrussel ${THREAT_LABEL[next.threat]}.`);
      return null;
    }

    case "startGame": {
      if (room.status !== "lobby") return "Spillet er allerede startet.";
      if (room.players.length < 2) return "Der skal være mindst 2 spillere.";
      // Fresh decks sized for the table: one set per 6 players.
      const copies = deckCopiesFor(room.players.length);
      const decks = buildAllDecks(copies);
      room.decks = { door: shuffle(decks.door), treasure: shuffle(decks.treasure), dungeon: shuffle(decks.dungeon) };
      room.discards = { door: [], treasure: [], dungeon: [] };
      if (copies > 1) log(room, `🃏 ${room.players.length} spillere: der spilles med ${copies} sæt dør- og skattekort.`);
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
      log(room, `Spillet er i gang! ${room.players[0].name} starter.`);
      return null;
    }

    case "castCurse": {
      // Validér offeret FØR kortet fjernes, så det aldrig havner det forkerte sted.
      const targetPlayer = room.players.find(p => p.id === msg.targetId);
      if (!targetPlayer) return "Spilleren blev ikke fundet.";

      const cIdx = player.hand.findIndex(c => c.id === msg.cardId);
      const bIdx = player.backpack.findIndex(c => c.id === msg.cardId);
      const source = cIdx >= 0 ? player.hand : bIdx >= 0 ? player.backpack : null;
      const at = cIdx >= 0 ? cIdx : bIdx;
      const card = source?.[at];
      if (!source || !card || card.type !== "curse") return "Kortet findes ikke eller er ikke en forbandelse.";
      source.splice(at, 1);

      shout(room, `💀 ${player.name} kaster ${card.name} på ${targetPlayer.name}!`);
      applyBadStuff(room, targetPlayer, card.effect);
      room.discards.door.push(card);

      refreshDerived(player);
      refreshDerived(targetPlayer);
      return null;
    }

    case "kickDoor": {
      if (room.status !== "normalTurn" || room.currentPhase !== 1) return "Det er ikke tid til at sparke døren ind.";
      if (!isActive(room, playerId)) return "Det er ikke din tur.";
      const card = drawFromDeck(room, "door");
      if (!card) return "Der er ingen kort i dørbunken.";

      // --- PORTALER ---
      if (card.type === "portal") {
        log(room, `🌀 ${player.name} sparker døren ind og finder en PORTAL: ${card.name}!`);
        resolvePortal(room, card.cardId);
        room.discards.door.push(card);
        log(room, `👢 ${player.name} må sparke endnu en dør ind!`);
        refreshDerived(player);
        return null;
      }

      // --- ALMINDELIGE KORT ---
      log(room, `🚪 ${player.name} sparker døren ind: ${card.name}.`);
      if (card.type === "monster") {
        room.table.push(card);
        startCombat(room, player, card);
        if (card.ambush) {
          const next = drawFromDeck(room, "door");
          if (next && next.type === "monster") {
            room.table.push(next);
            room.combat!.monsters.push(next);
            shout(room, `⚔️ BAGHOLD! ${next.name} (niv. ${next.level}) stormer ind sammen med ${card.name}!`);
          } else if (next) {
            room.decks.door.push(next); // not a monster: back on top, unseen
            log(room, `👀 ${card.name} håbede på forstærkning, men ingen kom.`);
          }
        }
      } else if (card.type === "curse") {
        if (player.equipment.none.some(e => e.cardId === "e-spell-amulet")) {
          log(room, `🛡️ ${player.name}s Besværgelsesspejlets Amulet KNUSER ${card.name} med det samme!`);
        } else if (hasDungeon(room, "d-curses")) {
          shout(room, `💀 FANGEHULLET MED GRUNDIGE FORBANDELSER: ${card.name} rammer ALLE!`);
          for (const target of room.players.filter(p => !p.isDead)) {
            applyBadStuff(room, target, card.effect);
          }
        } else {
          applyBadStuff(room, player, card.effect);
        }
        room.discards.door.push(card);
        room.currentPhase = 2;
      } else {
        // Hvis det IKKE er monster, portal eller curse (f.eks. Uninvited Guest, Evil Twin, Class)
        // lægges det direkte i spillerens hånd, og turen går til Phase 2 (Look for trouble/Loot).
        player.hand.push(card);
        log(room, `🃏 ${player.name} tager ${card.name} på hånden.`);
        refreshDerived(player);
        room.currentPhase = 2;
      }
      return null;
    }

    case "lookForTrouble": {
      if (room.currentPhase !== 2 || room.status !== "normalTurn") return "Det er ikke tid til at opsøge ballade.";
      if (!isActive(room, playerId)) return "Det er ikke din tur.";
      const idx = player.hand.findIndex(c => c.id === msg.cardId);
      const m = player.hand[idx];
      if (!m || m.type !== "monster") return "Vælg et monster fra din hånd.";
      player.hand.splice(idx, 1);
      refreshDerived(player);
      room.table.push(m);
      log(room, `${player.name} opsøger ballade: ${m.name}.`);
      startCombat(room, player, m);
      return null;
    }

    case "lootRoom": {
      if (room.status !== "normalTurn") return "Gør først det nuværende færdigt.";
      if (room.currentPhase !== 2 && room.currentPhase !== 3) return "Forkert fase.";
      if (room.combatFought) return "Du har allerede kæmpet i denne tur.";
      if (!isActive(room, playerId)) return "Det er ikke din tur.";

      const c1 = drawFromDeck(room, "door");
      if (c1) player.hand.push(c1);

      if (hasDungeon(room, "d-generous")) {
        const c2 = drawFromDeck(room, "door");
        if (c2) player.hand.push(c2);
        log(room, `${player.name} ransager rummet og finder 2 kort takket være de gavmilde gobliner!`);
      } else {
        log(room, `${player.name} ransager rummet (billedsiden nedad).`);
      }

      refreshDerived(player);
      room.currentPhase = 4;
      return null;
    }

    case "endTurn": {
      if (!isActive(room, playerId)) return "Det er ikke din tur.";
      // Kun fra en almindelig tur: ellers kunne man slippe for Run Away/Bad Stuff,
      // eller efterlade en halvfærdig plyndring/velgørenhed.
      if (room.status !== "normalTurn" || room.combat) return "Gør først det nuværende færdigt.";
      if (player.companion?.upkeep) {
        const cheapest = [...player.hand].sort((a, b) => goldValueOf(a) - goldValueOf(b))[0];
        if (cheapest) {
          player.hand.splice(player.hand.indexOf(cheapest), 1);
          discardCard(room, cheapest);
          log(room, `🪙 ${player.name} betaler ${player.companion.name} med ${cheapest.name}.`);
        } else {
          log(room, `💢 ${player.name} kan ikke betale — ${player.companion.name} skrider fra jobbet!`);
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
        log(room, `${player.name} skal give ${player.hand.length - charityLimit} kort til velgørenhed.`);
        return null;
      }
      advanceTurn(room);
      return null;
    }

    case "equip": {
      const idx = player.hand.findIndex(c => c.id === msg.cardId);
      const fromHand = idx >= 0;
      const card = fromHand ? player.hand[idx] : player.backpack.find(c => c.id === msg.cardId);
      if (!card || card.type !== "equipment") return "Det er ikke udstyr.";

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
          return "Du har ikke Forfalskede Laugspapirer på hånden.";
        }
        if (card.forgedWith || !requirementProblem(player, card)) {
          player.equipment = before;
          player.backpack = backpackBefore;
          return "Denne genstand har ingen krav at forfalske.";
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
        log(room, `📜 ${player.name} vifter med nogle meget officielt udseende laugspapirer.`);
      }

      refreshDerived(player);
      log(room, `${player.name} tager ${card.name} på.`);
      return null;
    }

    case "unequip": {
      const eq = removeEquipped(player, msg.cardId);
      if (!eq) return "Det har du ikke på.";
      player.backpack.push(eq);
      refreshDerived(player);
      return null;
    }

    case "toBackpack": {
      const idx = player.hand.findIndex(c => c.id === msg.cardId);
      if (idx < 0) return "Kortet er ikke på din hånd.";
      if (player.hand[idx].type !== "equipment") return "Kun udstyr kan lægges i rygsækken.";
      const [c] = player.hand.splice(idx, 1);
      player.backpack.push(c);
      refreshDerived(player);
      return null;
    }

    case "sell": {
      if (hasDungeon(room, "d-poverty")) return "Den Ynkelige Fattigdoms Fangehul forhindrer dig i at sælge!";

      // Dubletter fjernes — ellers kunne samme kort tælle flere gange.
      const ids = [...new Set(msg.cardIds)];
      const owned: Card[] = [];
      for (const id of ids) {
        const c = allEquipped(player).find(e => e.id === id)
          ?? player.backpack.find(x => x.id === id)
          ?? player.hand.find(x => x.id === id);
        if (!c) return "Du kan kun sælge kort, du ejer.";
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
        log(room, `🥧 ${player.name} prutter som en Halvling: ${halflingBoost.name} sælges for det dobbelte!`);
      }
      const levelsGained = Math.floor(totalGold / 1000);
      const newLevel = Math.min(room.settings.winLevel - 1, player.level + levelsGained); // Man KAN IKKE vinde på et salg
      log(room, `💰 ${player.name} sælger for ${totalGold}g → +${levelsText(newLevel - player.level)}.`);
      player.level = newLevel;
      refreshDerived(player);
      return null;
    }

    case "playCard": {
      const idx = player.hand.findIndex(c => c.id === msg.cardId);
      if (idx < 0) return "Kortet er ikke på din hånd.";
      const card = player.hand[idx];

      if (card.type === "go-up-a-level") {
        if (player.level >= room.settings.winLevel - 1) return `Du kan ikke bruge dette kort til at vinde spillet (niveau ${room.settings.winLevel})!`;
        player.level += 1;
        player.hand.splice(idx, 1);
        room.discards.treasure.push(card);
        log(room, `⬆️ ${player.name} spiller ${card.name} og stiger et niveau!`);
        refreshDerived(player);
        return null;
      }

      if (card.type === "class") {
        if (hasClass(player, card.className)) return `Du er allerede ${card.name}.`;
        player.hand.splice(idx, 1);
        if (player.playerClass && player.dualClass && !player.extraClass) {
          player.extraClass = card;
          log(room, `✨ ${player.name} (Laugshopperen) bliver også ${card.name}!`);
        } else {
          const oldClass = player.playerClass;
          if (oldClass) room.discards.door.push(oldClass);
          player.playerClass = card;
          if (oldClass) log(room, `✨ ${player.name} smider ${oldClass.name} og bliver ${card.name}!`);
          else log(room, `✨ ${player.name} er nu ${card.name}!`);
        }
        validateClassEquipment(room, player);
        refreshDerived(player);
        return null;
      }

      if (card.type === "race") {
        if (hasRace(player, card.raceName)) return `Du er allerede ${card.name}.`;
        player.hand.splice(idx, 1);
        if (player.race && player.dualRace && !player.extraRace) {
          player.extraRace = card;
          log(room, `🧬 ${player.name} (Blandet Blod) er nu også ${card.name}!`);
        } else {
          const oldRace = player.race;
          if (oldRace) room.discards.door.push(oldRace);
          player.race = card;
          if (oldRace) log(room, `🧬 ${player.name} er ikke længere ${oldRace.name} og bliver ${card.name}!`);
          else log(room, `🧬 ${player.name} er nu ${card.name}!`);
        }
        refreshDerived(player);
        return null;
      }

      if (card.type === "companion") {
        player.hand.splice(idx, 1);
        const old = player.companion;
        if (old) {
          discardCard(room, old);
          log(room, `👋 ${player.name} sender ${old.name} væk.`);
        }
        player.companion = card;
        log(room, `🐾 ${player.name} hverver ${card.name}!`);
        refreshDerived(player);
        return null;
      }

      if (card.type === "dual") {
        const slot = card.dualKind === "class" ? "dualClass" : "dualRace";
        if (player[slot]) return `Du har allerede ${card.name} i spil.`;
        player.hand.splice(idx, 1);
        player[slot] = card;
        log(room, `🌟 ${player.name} spiller ${card.name} og kan nu have to ${card.dualKind === "class" ? "klasser" : "folk"}!`);
        refreshDerived(player);
        return null;
      }

      if (card.type === "portal") {
        if (!isActive(room, playerId)) return "Du kan kun spille portaler i din egen tur.";
        log(room, `🌀 ${player.name} spiller en PORTAL fra hånden: ${card.name}!`);
        resolvePortal(room, card.cardId);
        player.hand.splice(idx, 1);
        room.discards.door.push(card);
        refreshDerived(player);
        return null;
      }

      if (card.cardId === "o-flask-glue") {
        if (!room.combat) return "Krukke med Klistret Harpiks kan kun spilles under en kamp!";
        const combat = room.combat;
        if (!msg.targetId) return "Du skal vælge, hvem der skal klistres fast!";
        const target = room.players.find(p => p.id === msg.targetId);
        if (!target || target.isDead) return "Spilleren blev ikke fundet.";
        if (target.id !== combat.attackerId && target.id !== combat.helperId) return "Du kan kun klistre en, der kæmper.";
        if (combat.ranAway?.includes(target.id)) return `${target.name} har allerede slået for at flygte.`;

        combat.gluedPlayers = combat.gluedPlayers ?? [];
        if (!combat.gluedPlayers.includes(target.id)) combat.gluedPlayers.push(target.id);
        shout(room, `🧴 ${player.name} kaster en Krukke med Klistret Harpiks på ${target.name}! Skal de flygte, mislykkes det automatisk!`);

        player.hand.splice(idx, 1);
        room.discards.treasure.push(card);
        refreshDerived(player);
        return null;
      }

      return "Dette kort kan ikke spilles på denne måde lige nu.";
    }

    case "discard": {
      const idx = player.hand.findIndex(c => c.id === msg.cardId);
      if (idx < 0) return "Kortet er ikke på din hånd.";
      const [c] = player.hand.splice(idx, 1);
      discardCard(room, c);
      refreshDerived(player);
      return null;
    }

    // ===== combat actions =====
    case "playInCombat": {
      if (!room.combat) return "Der er ingen kamp.";
      if (combatDecided(room)) return "Kampen er afgjort — nu skal der flygtes!";
      const combat = room.combat;
      const idx = player.hand.findIndex(c => c.id === msg.cardId);
      if (idx < 0) return "Kortet er ikke på din hånd.";
      const card = player.hand[idx];

      // --- WANDERING MONSTER ---
      if (card.type === "wandering-monster") {
        if (!msg.extraCardId) return "Vælg et monster fra din hånd, der skal sendes ind!";
        const newMonster = player.hand.find(c => c.id === msg.extraCardId);
        if (!newMonster || newMonster.type !== "monster") return "Det valgte kort er ikke et monster på din hånd.";

        // Slet BEGGE kort fra hånden på én gang
        player.hand = player.hand.filter(c => c.id !== card.id && c.id !== newMonster.id);

        combat.monsters.push(newMonster);
        markSaboteur(room, player.id);
        combat.log.push(`🐉 ${player.name} spiller Ubuden Gæst! ${newMonster.name} (niv. ${newMonster.level}) blander sig i kampen!`);
        room.discards.door.push(card);

        reopenInterrupts(room);
        refreshDerived(player);
        return null;
      }

      // --- FRIENDSHIP POTION: kampen slutter straks, ingen levels eller skatte ---
      if (card.cardId === "o-friendship") {
        player.hand.splice(idx, 1);
        room.discards.treasure.push(card);
        shout(room, `💖 ${player.name} spiller Våbenhvile-te! Kampen slutter straks. Ingen niveauer eller skatte!`);
        endCombat(room);
        room.negotiations = [];
        room.status = "normalTurn";
        room.currentPhase = 3;
        refreshDerived(player);
        return null;
      }

      // --- MATE ---
      if (card.type === "mate") {
        if (combat.monsters.length === 0) return "Der er intet monster at kopiere.";

        // Vi kloner det første monster i kampen
        const targetMonster = combat.monsters[0];
        const clonedMonster: MonsterCard = { ...targetMonster, id: `${targetMonster.id}${MATE_CLONE_MARK}${newId()}`, name: `${TWIN_PREFIX}${targetMonster.name}` };

        player.hand.splice(idx, 1);
        combat.monsters.push(clonedMonster);
        markSaboteur(room, player.id);
        combat.log.push(`💞 ${player.name} spiller Ond Tvilling! Endnu en ${targetMonster.name} dukker op!`);
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
        if (!undead && !goblinSwarm && !swarmCaller) return "Kortet kan ikke spilles i kamp.";
        if (swarmCaller && !undead) {
          combat.swarmCalled = [...(combat.swarmCalled ?? []), player.id];
          log(room, `📯 ${player.name} kalder på sværmen: ${card.name} blander sig i kampen!`);
        }

        player.hand.splice(idx, 1);
        combat.monsters.push(card);
        markSaboteur(room, player.id);
        combat.log.push(undead
          ? `🧟 ${player.name} spiller ${card.name} direkte ind i kampen takket være Det Ustoppelige Fangehul!`
          : `👺 GOBLINSVÆRM! ${player.name} spiller ${card.name} direkte ind i kampen!`);
        reopenInterrupts(room);
        refreshDerived(player);
        return null;
      }

      // Både OneShots og Enhancers skal kunne spilles på begge sider!
      if (card.type !== "oneshot" && card.type !== "enhancer") return "Kortet kan ikke spilles i kamp.";
      const tagged = card.type === "oneshot" && card.tagBonus && msg.side === "attacker"
        && combat.monsters.some(m => hasTag(m, card.tagBonus!.tag));
      const bonusAmount = tagged && card.type === "oneshot" && card.tagBonus ? card.tagBonus.bonus : card.bonus;
      const sign = bonusAmount > 0 ? "+" : "";

      if (msg.side === "attacker") {
        // Hvis man IKKE er med i kampen, må man KUN kaste kort på angriberen for at sabotere dem!
        if (bonusAmount > 0 && player.id !== combat.attackerId && player.id !== combat.helperId) {
          return "Kun kæmperne kan styrke angriberen. Du kan kun sabotere dem med negative kort!";
        }
        combat.attackerBonuses += bonusAmount;
        combat.log.push(`⚔️ ${player.name} spiller ${card.name} på angriberen (${sign}${bonusAmount}).`);
      } else {
        // Alle må spille kort på monsteret (både for at buffe og debuffe)
        combat.monsterBonuses += bonusAmount;
        if (bonusAmount > 0) markSaboteur(room, player.id);
        combat.log.push(`👹 ${player.name} spiller ${card.name} på monsteret (${sign}${bonusAmount}).`);
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
        if (!hasClass(player, "Cleric")) return "Du er ikke Præst.";
        const ids = [...new Set(msg.cardIds)];
        if (ids.length !== 2 || !ids.every(id => player.hand.some(c => c.id === id))) return "Smid præcis 2 kort fra din hånd for at rense.";
        const target = room.players.find(p => p.id === msg.targetId);
        if (!target || !msg.effectId || !target.effects.some(e => e.id === msg.effectId)) return "Den effekt findes ikke.";
        for (const id of ids) discardCard(room, player.hand.splice(player.hand.findIndex(c => c.id === id), 1)[0]);
        log(room, `🙏 ${player.name} beder over ${target.name}.`);
        removeEffect(room, target, msg.effectId);
        refreshDerived(player);
        return null;
      }

      if (msg.ability === "resurrect") {
        if (!hasClass(player, "Cleric")) return "Du er ikke Præst.";
        if (!isActive(room, playerId)) return "Det er ikke din tur.";
        if (room.status !== "normalTurn" || room.currentPhase !== 1) return "Du kan kun genoplive dørkort i starten af din tur (fase 1).";
        if (room.discards.door.length === 0) return "Dørenes kassebunke er tom.";
        if (msg.cardIds.length !== 1) return "Smid præcis 1 kort for at genoplive.";

        const idx = player.hand.findIndex(x => x.id === msg.cardIds[0]);
        if (idx < 0) return "Kortet er ikke på din hånd.";
        const resurrectedCard = room.discards.door.pop()!;
        const [discardedCard] = player.hand.splice(idx, 1);
        discardCard(room, discardedCard);

        log(room, `🙏 ${player.name} smider ${discardedCard.name} og GENOPLIVER det øverste dørkort: ${resurrectedCard.name}!`);

        room.currentPhase = 2;
        if (resurrectedCard.type === "monster") {
          room.table.push(resurrectedCard);
          startCombat(room, player, resurrectedCard);
        } else if (resurrectedCard.type === "curse") {
          player.hand.push(resurrectedCard);
          log(room, `💀 Det genoplivede kort var en forbandelse! Den havner på ${player.name}s hånd.`);
        } else {
          player.hand.push(resurrectedCard);
          log(room, `✨ ${player.name} tager det genoplivede ${resurrectedCard.name} på hånden.`);
        }
        if (hasDungeon(room, "d-healing")) {
          const extra = drawFromDeck(room, "door");
          if (extra) {
            player.hand.push(extra);
            log(room, `✨ Himmelsk helbredelse! ${player.name} trækker et ekstra dørkort!`);
          }
        }

        refreshDerived(player);
        return null;
      }

      // TYV: Steal (Må KUN gøres UDEN for kamp)
      if (msg.ability === "steal") {
        if (!hasClass(player, "Thief")) return "Du er ikke Tyv.";
        if (room.combat) return "Du kan ikke stjæle under en kamp.";
        if (msg.cardIds.length !== 1) return "Smid præcis 1 kort for at stjæle.";
        if (!msg.targetId || !msg.targetCardId) return "Vælg en spiller og en genstand.";

        const target = room.players.find(p => p.id === msg.targetId);
        if (!target || target.isDead || target.id === playerId) return "Ugyldigt mål.";

        const targetEq = allEquipped(target).find(e => e.id === msg.targetCardId);
        if (!targetEq) return "Spilleren har ikke den genstand på.";
        if (targetEq.isBig) return "Store genstande kan ikke stjæles.";

        const idx = player.hand.findIndex(x => x.id === msg.cardIds[0]);
        if (idx < 0) return "Betalingskortet er ikke på din hånd.";
        const [discardedCard] = player.hand.splice(idx, 1);
        discardCard(room, discardedCard);

        // Slå med terningen! (Sendes ud til alle ligesom "Run Away")
        let roll = rollD6();
        if (hasDungeon(room, "d-thieves")) roll += 2; // Thieving Thugs
        roll -= effectTotal(player, "dicePenalty");
        pendingEvents.push({ type: "rolled", playerId, result: roll, reason: "Tyveriforsøg" });

        const reqRoll = player.equipment.hands.some(h => h.cardId === "e-lockpicks") ? 2 : 3;
        if (roll >= reqRoll) {
          removeEquipped(target, targetEq.id);
          player.backpack.push(targetEq);
          shout(room, `🗡️ ${player.name} slår ${roll} og STJÆLER ${targetEq.name} fra ${target.name}!`);
        } else {
          const oldLevel = player.level;
          player.level = Math.max(1, player.level - 1);
          log(room, `🩸 ${player.name} slår ${roll} og MISLYKKES med at stjæle fra ${target.name}. ${player.name} får tæv og mister ${levelsText(oldLevel - player.level)}!`);
        }

        refreshDerived(player);
        refreshDerived(target);
        return null;
      }

      // 2. HERFRA og ned kræver de andre evner, at der er en kamp!
      if (!room.combat) return "Der er ingen kamp i gang.";
      if (combatDecided(room)) return "Kampen er afgjort — nu skal der flygtes!";
      const c = room.combat;

      if (msg.ability === "berserk") {
        if (!hasClass(player, "Warrior")) return "Du er ikke Kriger.";
        if (c.attackerId !== playerId && c.helperId !== playerId) return "Du skal være med i kampen for at gå berserk.";

        c.warriorDiscardCount = c.warriorDiscardCount || {};
        const currentUsed = c.warriorDiscardCount[playerId] || 0;
        const ids = [...new Set(msg.cardIds)];
        if (currentUsed + ids.length > 3) return `Du kan højst smide 3 kort (brugt: ${currentUsed}).`;

        let discarded = 0;
        for (const cid of ids) {
          const idx = player.hand.findIndex(x => x.id === cid);
          if (idx >= 0) {
            const [card] = player.hand.splice(idx, 1);
            discardCard(room, card);
            discarded++;
          }
        }
        if (discarded === 0) return "Ingen gyldige kort blev smidt.";

        c.warriorDiscardCount[playerId] = currentUsed + discarded;
        const bonusMult = player.equipment.hands.some(h => h.cardId === "e-bloodaxe") ? 2 : 1;
        c.attackerBonuses += discarded * bonusMult;
        log(room, `⚔️ ${player.name} går BERSERK! Smider ${discarded} kort for +${discarded * bonusMult}.`);
        refreshDerived(player);
        return null;
      }

      if (msg.ability === "backstab") {
        if (!hasClass(player, "Thief")) return "Du er ikke Tyv.";
        if (!msg.targetId) return "Vælg et mål.";
        const target = room.players.find(p => p.id === msg.targetId);
        if (!target) return "Spilleren blev ikke fundet.";
        if (target.id !== c.attackerId && target.id !== c.helperId) return "Du kan kun dolke spillere, der er med i kampen.";

        c.backstabbedBy = c.backstabbedBy || {};
        c.backstabbedBy[target.id] = c.backstabbedBy[target.id] || [];
        if (c.backstabbedBy[target.id].includes(playerId)) return "Du har allerede dolket denne spiller i denne kamp.";

        if (msg.cardIds.length !== 1) return "Smid præcis 1 kort for at dolke.";
        const idx = player.hand.findIndex(x => x.id === msg.cardIds[0]);
        if (idx < 0) return "Kortet er ikke på din hånd.";

        const [card] = player.hand.splice(idx, 1);
        discardCard(room, card);

        c.backstabbedBy[target.id].push(playerId);
        c.attackerBonuses -= 2;
        shout(room, `🗡️ ${player.name} DOLKER ${target.name} I RYGGEN! (−2 til kampstyrken)`);
        refreshDerived(player);
        return null;
      }

      if (msg.ability === "charm") {
        if (!hasClass(player, "Wizard")) return "Du er ikke Troldmand.";
        if (c.attackerId !== playerId && c.helperId !== playerId) return "Du skal være med i kampen for at fortrylle.";
        if (!msg.monsterId) return "Vælg et monster.";
        const reqCards = player.equipment.hands.some(h => h.cardId === "e-archmage-staff") ? 2 : 3;
        if (player.hand.length < reqCards) return `Du skal have mindst ${reqCards} kort på hånden for at fortrylle.`;

        const mIdx = c.monsters.findIndex(m => m.id === msg.monsterId);
        if (mIdx < 0) return "Monsteret er ikke med i kampen.";
        const monster = c.monsters[mIdx];
        if (monster.immuneToCharm) return `${monster.name} er IMMUN over for din Fortryllelse!`;

        const handSize = player.hand.length;
        for (const card of player.hand) discardCard(room, card);
        player.hand = [];

        c.monsters.splice(mIdx, 1);
        discardMonster(room, monster);
        room.table = room.table.filter(t => t.id !== monster.id);

        c.charmedTreasures = (c.charmedTreasures || 0) + monster.treasures;

        log(room, `🪄 ${player.name} FORTRYLLER ${monster.name} ved at smide sin hånd (${handSize} kort)!`);
        refreshDerived(player);
        return null;
      }

      return "Ugyldig evne.";
    }

    case "askForHelp": {
      if (hasDungeon(room, "d-misanthropy")) return "Menneskehadets Fangehul: Alle kæmper alene!";
      if (hasDungeon(room, "d-bribery") && msg.treasures < 2) return "Fangehullet med Åbenlys Bestikkelse: Du skal tilbyde mindst 2 skatte!";
      if (!room.combat || room.combat.attackerId !== playerId) return "Kun angriberen kan bede om hjælp.";
      if (combatDecided(room)) return "Kampen er afgjort — nu skal der flygtes!";
      if (hasEffect(player, "noHelp")) return "Ingen vil hjælpe dig lige nu (Udstødt).";
      if (room.combat.helperId) return "Du har allerede en hjælper.";
      const helper = room.players.find(p => p.id === msg.helperId);
      if (!helper || helper.id === playerId || helper.isDead) return "Ugyldig hjælper.";
      if (room.negotiations.some(o => o.toId === helper.id && o.status === "pending")) return "Du har allerede et åbent tilbud til den spiller.";
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
        ? `${player.name} tilbyder ${helper.name} ${treasuresText(msg.treasures)} OG ${cardNames(bribe)} for hjælp.`
        : `${player.name} tilbyder ${treasuresText(msg.treasures)} for hjælp.`);
      return null;
    }

    case "forceHelp": {
      if (!room.combat || room.combat.attackerId !== playerId) return "Kun angriberen kan tvinge nogen til at hjælpe.";
      if (combatDecided(room)) return "Kampen er afgjort — nu skal der flygtes!";
      if (hasEffect(player, "noHelp")) return "Ingen vil hjælpe dig lige nu (Udstødt).";
      if (room.combat.helperId) return "Du har allerede en hjælper.";
      if (player.equipment.feet?.cardId !== "e-kneepads") return "Du har ikke Smigrende Tøfler på.";

      const target = room.players.find(p => p.id === msg.targetId);
      if (!target || target.isDead || target.id === playerId) return "Ugyldigt mål.";

      // Tving dem ind i kampen (og de får 0 skatte for det!)
      room.combat.helperId = target.id;
      room.combat.contract = { helperId: target.id, treasures: 0, accepted: true };
      delete room.combat.passes[target.id];
      room.negotiations = [];
      reopenInterrupts(room);

      shout(room, `💖 ${player.name} bruger Smigrende Tøfler og TVINGER ${target.name} til at hjælpe!`);
      sirenCheck(room);
      return null;
    }

    case "respondHelp": {
      const offer = room.negotiations.find(o => o.id === msg.offerId);
      if (!offer || offer.toId !== playerId) return "Tilbuddet er ikke til dig.";
      if (offer.status !== "pending") return "Du har allerede svaret.";
      offer.status = msg.accept ? "accepted" : "rejected";
      if (msg.accept && room.combat && !room.combat.helperId && !combatDecided(room)) {
        // The bribe changes hands now — and stays changed, whatever happens in the fight.
        const briber = room.players.find(p => p.id === offer.fromId);
        if (offer.itemIds.length && briber) {
          const items = valuables(briber, offer.itemIds, "owned");
          if (typeof items === "string") {
            room.negotiations = room.negotiations.filter(o => o.status === "pending");
            return `${briber.name} har ikke længere de tilbudte genstande — aftalen er droppet.`;
          }
          for (const c of items) { takeOwned(briber, c.id); receive(player, c); }
          refreshDerived(briber);
          refreshDerived(player);
          room.stats.bribes++;
          shout(room, `💰 ${player.name} stikker ${cardNames(items)} i lommen på forhånd.`);
        }
        room.combat.helperId = playerId;
        room.combat.contract = { helperId: playerId, treasures: offer.treasures, accepted: true };
        delete room.combat.passes[playerId];
        reopenInterrupts(room);
        shout(room, `🩸 BLODSED: ${player.name} hjælper for ${treasuresText(offer.treasures)}. Kan ikke trække sig.`);
        room.negotiations = [];
        sirenCheck(room);
        return null;
      }
      room.negotiations = room.negotiations.filter(o => o.status === "pending");
      return null;
    }

    case "pass": {
      if (!room.combat) return "Der er ingen kamp.";
      if (room.combat.attackerId === playerId || room.combat.helperId === playerId) return "Kæmperne kan ikke melde pas.";
      if (player.isDead) return "Døde spillere kan ikke melde pas.";
      room.combat.passes[playerId] = true;
      syncCombatGate(room);
      return null;
    }

    case "resolveCombat": {
      if (!room.combat) return "Der er ingen kamp.";
      if (room.combat.attackerId !== playerId) return "Kun angriberen kan afgøre kampen.";
      if (combatDecided(room)) return "Kampen er afgjort — nu skal der flygtes!";

      const c = room.combat;
      if (!allPassed(room)) {
        room.status = "waitingForInterrupts";
        log(room, `⏳ ${player.name} prøver at vinde! Modstanderne skal spille kort eller melde pas.`);
        return null;
      }

      room.status = "inCombat";

      const attacker = player;
      const helper = c.helperId ? room.players.find(p => p.id === c.helperId) ?? null : null;

      const ms = monsterTotal(room, c);
      const ps = playerSideTotal(room, c);

      const hasWarrior = hasClass(attacker, "Warrior") || (helper !== null && hasClass(helper, "Warrior"));

      log(room, `Afgørelse: Spillere ${ps} mod monstre ${ms}.${hasWarrior ? " (Kriger vinder ved uafgjort!)" : ""}`);

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
          log(room, `🧝 ${helper.name} stiger et niveau for at hjælpe en stærkere helt (Elver).`);
        }
        shout(room, `🏆 Sejr! +${levelsText(totalLevels)} og +${treasuresText(attackerShare)} til ${attacker.name}${helper ? `, +${helperShare} til ${helper.name}` : ""}.`);

        endCombat(room, true);
        refreshDerived(attacker);
        if (helper) refreshDerived(helper);
        room.status = "normalTurn";
        room.currentPhase = 3;
        checkVictory(room, attacker, true);
      } else {
        room.status = "runAwayRoll";
        shout(room, `Nederlag! ${attacker.name}${helper ? ` og ${helper.name}` : ""} må flygte.`);
        payBounty(room);
      }
      return null;
    }

    case "runAway": {
      if (!room.combat) return "Der er ingen kamp.";
      if (room.status !== "runAwayRoll") return "Det er ikke tid til at flygte.";
      const combat = room.combat;
      if (playerId !== combat.attackerId && playerId !== combat.helperId) return "Du er ikke med i denne kamp.";
      combat.ranAway = combat.ranAway ?? [];
      if (combat.ranAway.includes(playerId)) return "Du har allerede slået for at flygte.";

      // Monsters that don't bother with weak players can't hurt them on the way out.
      const pursuers = combat.monsters.filter(m => m.ignoresLevelAtOrBelow === undefined || player.level > m.ignoresLevelAtOrBelow);
      if (pursuers.length === 0) {
        combat.ranAway.push(playerId);
        log(room, `🐾 ${player.name} er under monstrenes værdighed og går bare sin vej.`);
        finishRunAwayIfDone(room);
        return null;
      }

      const glued = combat.gluedPlayers?.includes(playerId) === true;
      let roll = rollD6();

      if (allEquipped(player).some(e => e.cardId === "e-shadow-cloak")) {
        roll += 1;
        log(room, `🦇 ${player.name}s Skyggekappe hvirvler og giver +1 på flugtslaget!`);
      }

      if (hasRace(player, "Elf")) roll += 1; // Elves are quick on their feet
      if (hasClass(player, "Thief")) roll += 1; // Thieves know every back door
      if (player.companion?.runBonus) roll += player.companion.runBonus;

      // Boots of Hasty Retreat giver +2!
      if (player.equipment.feet?.cardId === "e-boots-run") {
        roll += 2;
        log(room, `👟 ${player.name}s Støvler til Hastig Retræte giver +2 på flugten!`);
      }

      // DUNGEON: d-chaos (Discard et kort for at slå to terninger og tage den højeste)
      if (hasDungeon(room, "d-chaos") && msg.discardId) {
        const idx = player.hand.findIndex(c => c.id === msg.discardId);
        if (idx >= 0) {
          const [discarded] = player.hand.splice(idx, 1);
          discardCard(room, discarded);
          const roll2 = rollD6();
          log(room, `🌪️ ${player.name} smed ${discarded.name} for et kaos-omslag! Slog ${roll} og ${roll2}.`);
          roll = Math.max(roll, roll2);
          refreshDerived(player);
        }
      }

      // DUNGEONS: Ændrer terningeslaget (Elven Excess & Poultry)
      if (hasDungeon(room, "d-elven")) roll++;
      if (hasDungeon(room, "d-poultry")) roll--;
      roll -= effectTotal(player, "dicePenalty");

      pendingEvents.push({ type: "rolled", playerId, result: roll, reason: "Flugt" });
      log(room, `🎲 ${player.name} slår ${roll} for at flygte.`);
      // Markeres FØR Bad Stuff, så en død midt i rækken aldrig efterlader kampen hængende.
      combat.ranAway.push(playerId);

      if (glued) {
        shout(room, `🧴 ${player.name} sidder fast i HARPIKS og slipper ikke væk!`);
      }
      if (!glued && roll >= 5) {
        log(room, `${player.name} slipper væk!`);
      } else {
        log(room, `${player.name} slipper ikke væk — straf!`);
        for (const m of pursuers) {
          applyBadStuff(room, player, m.badStuff);
          if (player.isDead) break;
        }
      }

      finishRunAwayIfDone(room);
      return null;
    }

    case "flee": {
      if (!room.combat) return "Der er ingen kamp.";
      if (room.combat.attackerId !== playerId) return "Kun angriberen kan overgive sig.";
      if (combatDecided(room)) return "Du er allerede på flugt.";
      room.status = "runAwayRoll";
      room.combat.log.push(`💨 ${player.name} giver op og gør klar til at flygte!`);
      payBounty(room);
      return null;
    }

    case "cowardlyFlee": {
      if (!room.combat) return "Der er ingen kamp.";
      if (!hasDungeon(room, "d-cowards")) return "Kujonernes Fangehul er ikke aktivt.";
      if (room.combat.attackerId !== playerId) return "Kun angriberen kan stikke af som en kujon.";
      if (combatDecided(room)) return "Du er allerede på flugt.";
      room.status = "runAwayRoll";
      room.combat.log.push(`🐔 ${player.name} bruger Kujonernes Fangehul og flygter med det samme uden at spørge!`);
      payBounty(room);
      return null;
    }

    case "lootBody": {
      if (!room.looting) return "Der er intet at plyndre.";
      const looting = room.looting;
      if (looting.orderQueue[0] !== playerId) return "Det er ikke din tur til at plyndre.";
      const idx = looting.pile.findIndex(c => c.id === msg.cardId);
      if (idx < 0) return "Kortet er ikke i bunken.";
      const [c] = looting.pile.splice(idx, 1);
      player.hand.push(c);
      refreshDerived(player);
      log(room, `${player.name} plyndrer ${c.name} fra liget.`);
      looting.orderQueue.shift();
      if (looting.pile.length === 0 || looting.orderQueue.length === 0) {
        for (const rest of looting.pile) discardCard(room, rest);
        finishLooting(room, looting.deadId);
      }
      return null;
    }

    case "proposeTrade": {
      if (room.status !== "normalTurn" || room.combat) return "Der handles kun uden for kampe.";
      const other = room.players.find(p => p.id === msg.toId);
      if (!other || other.id === playerId) return "Vælg en anden spiller at handle med.";
      if (player.isDead || other.isDead) return "De døde handler ikke.";
      if (msg.give.length === 0 && msg.take.length === 0) return "En handel skal have mindst ét kort.";
      if (room.trades.filter(t => t.fromId === playerId).length >= 3) return "Du har allerede 3 åbne handelstilbud.";
      const give = valuables(player, msg.give, "owned");
      if (typeof give === "string") return give;
      const take = valuables(other, msg.take, "worn");
      if (typeof take === "string") return take;
      room.trades.push({ id: newId(), fromId: playerId, toId: other.id, give: [...msg.give], take: [...msg.take] });
      log(room, `🤝 ${player.name} foreslår en handel til ${other.name}.`);
      return null;
    }

    case "respondTrade": {
      const trade = room.trades.find(t => t.id === msg.tradeId);
      if (!trade || trade.toId !== playerId) return "Der er intet sådant handelstilbud til dig.";
      room.trades = room.trades.filter(t => t.id !== trade.id);
      const from = room.players.find(p => p.id === trade.fromId);
      if (!from) return "Den anden spiller er væk.";
      if (!msg.accept) {
        log(room, `🙅 ${player.name} siger nej til ${from.name}s handel.`);
        return null;
      }
      if (room.status !== "normalTurn" || room.combat) return "Der handles kun uden for kampe.";
      // Re-check everything: cards may have moved since the offer was made.
      const give = valuables(from, trade.give, "owned");
      if (typeof give === "string") return `Handlen faldt til jorden: ${give}`;
      const take = valuables(player, trade.take, "worn");
      if (typeof take === "string") return `Handlen faldt til jorden: ${take}`;
      for (const c of give) takeOwned(from, c.id);
      for (const c of take) takeOwned(player, c.id);
      for (const c of give) receive(player, c);
      for (const c of take) receive(from, c);
      refreshDerived(from);
      refreshDerived(player);
      room.stats.trades++;
      shout(room, `🤝 ${from.name} og ${player.name} handler: ${cardNames(give)} ⇄ ${cardNames(take)}.`);
      return null;
    }

    case "cancelTrade": {
      const trade = room.trades.find(t => t.id === msg.tradeId);
      if (!trade || trade.fromId !== playerId) return "Du har intet sådant handelstilbud.";
      room.trades = room.trades.filter(t => t.id !== trade.id);
      return null;
    }

    case "payToll": {
      const c = room.combat;
      if (!c || c.attackerId !== playerId) return "Kun angriberen kan betale told.";
      if (room.status !== "waitingForInterrupts" && room.status !== "inCombat") return "For sent at betale — kampen er afgjort.";
      if (c.monsters.some(m => m.antiClass)) return "Denne boss kan ikke købes fri.";
      const price = tollPrice(monsterTotal(room, c));
      if (price === null) return "Denne kamp er for stor til at købe sig ud af.";
      const cards = valuables(player, msg.cardIds, "owned");
      if (typeof cards === "string") return cards;
      const paid = cards.reduce((sum, x) => sum + tradeValue(x), 0);
      if (paid < price) return `Tolden er ${price}g — du tilbød ${paid}g.`;
      for (const x of cards) discardCard(room, takeOwned(player, x.id)!);
      shout(room, `🪙 ${player.name} betaler told med ${cardNames(cards)} (${paid}g) og går forbi ${c.monsters.map(m => m.name).join(" & ")}.`);
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
      if (!ring || ring.type !== "remedy") return "Du skal bruge en Andenchancens Ring.";
      const target = room.players.find(p => p.id === msg.targetId);
      if (!target || !target.effects.some(e => e.id === msg.effectId)) return "Den effekt findes ikke.";
      player.hand.splice(idx, 1);
      discardCard(room, ring);
      log(room, `💍 ${player.name} bruger ${ring.name} på ${target.name}.`);
      removeEffect(room, target, msg.effectId);
      refreshDerived(player);
      return null;
    }

    case "sacrificeCompanion": {
      const combat = room.combat;
      if (!combat || room.status !== "runAwayRoll") return "Du kan kun ofre en følgesvend under en flugt.";
      if (playerId !== combat.attackerId && playerId !== combat.helperId) return "Du er ikke med i denne kamp.";
      if (combat.ranAway?.includes(playerId)) return "Du er allerede sluppet væk.";
      const buddy = player.companion;
      if (!buddy?.sacrificable) return "Din følgesvend kan ikke dække din flugt.";
      player.companion = null;
      discardCard(room, buddy);
      combat.ranAway = [...(combat.ranAway ?? []), playerId];
      log(room, `🫡 ${buddy.name} kaster sig over monsteret — ${player.name} slipper væk!`);
      refreshDerived(player);
      finishRunAwayIfDone(room);
      return null;
    }

    case "suddenSwap": {
      if (!room.combat) return "Der er ingen kamp.";
      const combat = room.combat;
      if (combat.attackerId !== playerId) return "Kun angriberen kan bruge pludselige byt.";
      if (!combat.helperId) return "Du har ingen hjælper at stjæle fra.";
      if (!hasDungeon(room, "d-swapping")) return "De Pludselige Byttes Fangehul er ikke aktivt.";
      if (combat.swapUsed) return "Du har allerede stjålet et kort i denne kamp!";
      const helper = room.players.find(p => p.id === combat.helperId);
      if (!helper || helper.hand.length === 0) return "Hjælperen har ingen kort på hånden.";

      const [stolen] = helper.hand.splice(Math.floor(random() * helper.hand.length), 1);
      player.hand.push(stolen);
      combat.swapUsed = true;
      shout(room, `🔄 Pludselige byt! ${player.name} stjal blindt et kort fra ${helper.name}s hånd!`);
      refreshDerived(player);
      refreshDerived(helper);
      return null;
    }

    case "charityGive": {
      if (!room.charity || room.charity.fromId !== playerId) return "Du skal ikke give til velgørenhed.";
      if (!room.charity.candidates.includes(msg.toId)) return "Ugyldig modtager.";
      const ids = [...new Set(msg.cardIds)];
      if (ids.length !== room.charity.cardCount) return `Du skal give præcis ${room.charity.cardCount} kort.`;
      if (!ids.every(id => player.hand.some(c => c.id === id))) return "Du kan kun give kort fra din hånd.";
      const recipient = room.players.find(p => p.id === msg.toId);
      if (!recipient) return "Ugyldig modtager.";
      for (const id of ids) {
        const idx = player.hand.findIndex(c => c.id === id);
        const [c] = player.hand.splice(idx, 1);
        recipient.hand.push(c);
      }
      refreshDerived(player); refreshDerived(recipient);
      log(room, `${player.name} giver ${ids.length} kort til ${recipient.name}.`);
      room.charity = null;
      advanceTurn(room);
      return null;
    }

    default: {
      const unreachable: never = msg;
      return `Ukendt handling ${(unreachable as { type: string }).type}.`;
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

// Everything a player holds goes to the discard piles.
const discardBelongings = (room: Room, p: PrivatePlayer) => {
  const held: Card[] = [
    ...p.hand, ...p.backpack, ...allEquipped(p),
    ...[p.playerClass, p.extraClass, p.race, p.extraRace, p.dualClass, p.dualRace, p.companion].filter((c): c is NonNullable<typeof c> => !!c),
  ];
  for (const c of held) discardCard(room, c);
  p.hand = []; p.backpack = [];
  p.equipment = { head: null, armor: null, feet: null, hands: [], bigItem: null, none: [] };
  p.playerClass = p.extraClass = null;
  p.race = p.extraRace = null;
  p.dualClass = p.dualRace = null;
  p.companion = null;
};

/** Removes a seat for good. Safe in any state: fights, looting, charity and deals are untangled. */
export const removePlayer = (room: Room, playerId: string) => {
  const idx = room.players.findIndex(p => p.id === playerId);
  if (idx < 0) return;
  const p = room.players[idx];
  const wasActive = idx === room.activePlayerIndex && room.status !== "lobby";

  if (room.status !== "lobby") {
    discardBelongings(room, p);
    room.negotiations = room.negotiations.filter(o => o.fromId !== playerId && o.toId !== playerId);
    room.trades = room.trades.filter(t => t.fromId !== playerId && t.toId !== playerId);

    const c = room.combat;
    if (c) {
      delete c.passes[playerId];
      c.saboteurs = c.saboteurs?.filter(id => id !== playerId);
      c.swarmCalled = c.swarmCalled?.filter(id => id !== playerId);
      if (c.turncoatId === playerId) c.turncoatId = null;
      if (c.attackerId === playerId) {
        endCombat(room); // the fight goes with them
        if (room.status !== "looting") room.status = "normalTurn";
      } else if (c.helperId === playerId) {
        c.helperId = null;
        c.contract = null;
        c.ranAway = c.ranAway?.filter(id => id !== playerId);
        if (room.status === "runAwayRoll") finishRunAwayIfDone(room);
      }
    }

    if (room.looting) {
      if (room.looting.deadId === playerId) {
        for (const card of room.looting.pile) discardCard(room, card);
        room.looting = null;
        room.status = room.combat ? (room.statusBeforeLooting ?? "normalTurn") : "normalTurn";
        room.statusBeforeLooting = null;
      } else {
        room.looting.orderQueue = room.looting.orderQueue.filter(id => id !== playerId);
        if (room.looting.orderQueue.length === 0) {
          for (const card of room.looting.pile) discardCard(room, card);
          finishLooting(room, room.looting.deadId);
        }
      }
    }

    if (room.charity) {
      room.charity.candidates = room.charity.candidates.filter(id => id !== playerId);
      if (room.charity.fromId === playerId || room.charity.candidates.length === 0) {
        room.charity = null;
        if (room.status === "charitySelection") room.status = "normalTurn";
      }
    }
  }

  room.players.splice(idx, 1);
  delete room.sessions[playerId];
  delete room.halflingSaleTurn[playerId];
  if (idx < room.activePlayerIndex) room.activePlayerIndex--;

  if (room.status === "lobby") {
    log(room, `${p.name} forlod venteværelset.`);
    return;
  }
  shout(room, `🚪 ${p.name} forlod spillet.`);

  if (room.players.length < 2) {
    restartGame(room, "Der er ikke spillere nok tilbage — alle tilbage til venteværelset.");
    return;
  }
  room.activePlayerIndex %= room.players.length;
  if (wasActive) {
    // The next player in line (now at the leaver's old position) takes over a fresh turn.
    room.combat = null;
    room.negotiations = [];
    room.charity = null;
    if (!room.looting) room.status = "normalTurn";
    room.currentPhase = 1;
    room.combatFought = false;
    room.turnNo++;
    log(room, `▶ ${room.players[room.activePlayerIndex].name}s tur.`);
  }
  syncCombatGate(room);
};

/** Same players, fresh game: everyone back to the waiting room at level 1. Settings are kept. */
export const restartGame = (room: Room, reason: string) => {
  const fresh = createRoom(room.code);
  for (const p of room.players) {
    discardBelongings(room, p);
    Object.assign(p, {
      level: 1, isDead: false, effects: [], handCount: 0, backpackCount: 0, combatPower: 1,
    });
  }
  Object.assign(room, {
    decks: fresh.decks, discards: fresh.discards, activeDungeons: [], table: [],
    status: "lobby" as AppStatus, activePlayerIndex: 0, currentPhase: 1 as Phase,
    combat: null, negotiations: [], trades: [], charity: null, looting: null,
    winnerId: null, combatFought: false, statusBeforeLooting: null,
    stats: emptyStats(), turnNo: 0, halflingSaleTurn: {},
  });
  shout(room, `🔄 ${reason}`);
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
    log(room, `${cur.name} vender tilbage fra de døde med en frisk hånd.`);
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
  log(room, `▶ ${room.players[next].name}s tur.`);
};
