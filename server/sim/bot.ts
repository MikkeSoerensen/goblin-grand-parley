// Rule-following bots for the balance simulator. They play through the real engine
// (handleAction) with a simple, reasonable strategy — the point is comparable numbers
// between versions of the rules, not strong play.

import { hasClass } from "../../shared/rules.js";
import type { Card, EquipmentCard, GameAction, MonsterCard, PrivatePlayer } from "../../shared/types.js";
import { buildView, handleAction, requiredPasses, type Room } from "../engine.js";

export type Rng = () => number;

const gold = (c: Card): number => ("goldValue" in c ? c.goldValue : 0);
const byGoldAsc = (a: Card, b: Card) => gold(a) - gold(b);
const activePlayer = (room: Room) => room.players[room.activePlayerIndex];
const leader = (room: Room) => room.players.reduce((best, p) => (p.level > best.level ? p : best));

const equippedInSlot = (p: PrivatePlayer, c: EquipmentCard): number => {
  const e = p.equipment;
  switch (c.slot) {
    case "head": return e.head?.bonus ?? -1;
    case "armor": return e.armor?.bonus ?? -1;
    case "feet": return e.feet?.bonus ?? -1;
    case "bigItem": return e.bigItem?.bonus ?? -1;
    case "hand": return e.hands.length < 2 && !e.hands.some(h => h.slot === "twoHands") ? -1 : Math.min(...e.hands.map(h => h.bonus));
    case "twoHands": return e.hands.length === 0 ? -1 : e.hands.reduce((s, h) => s + h.bonus, 0);
    case "none": return -1;
  }
};

/** Tries actions in order until the engine accepts one. Returns whether anything happened. */
const tryFirst = (room: Room, playerId: string, actions: GameAction[]): GameAction | null => {
  for (const a of actions) {
    if (handleAction(room, playerId, a).error === null) return a;
  }
  return null;
};

/** Per-turn / per-combat memory so bots never repeat a no-op forever. */
export interface BotMemory {
  turnKey: string;
  doneThisTurn: Set<string>;
  combatKey: string;
  doneThisCombat: Set<string>;
}
export const newMemory = (): BotMemory => ({ turnKey: "", doneThisTurn: new Set(), combatKey: "", doneThisCombat: new Set() });

const once = (set: Set<string>, key: string) => {
  if (set.has(key)) return false;
  set.add(key);
  return true;
};

/**
 * Advances the game by one bot decision. Returns false if no bot could do anything
 * (the caller treats repeated false as a stuck game).
 */
export const botStep = (room: Room, mem: BotMemory, rnd: Rng, turnNo: number): boolean => {
  const turnKey = `${turnNo}`;
  if (mem.turnKey !== turnKey) { mem.turnKey = turnKey; mem.doneThisTurn.clear(); }
  // Keyed by turn + attacker, not by monster: monsters can be charmed away mid-fight.
  const combatKey = room.combat ? `${turnNo}:${room.combat.attackerId}` : "";
  if (mem.combatKey !== combatKey) { mem.combatKey = combatKey; mem.doneThisCombat.clear(); }

  switch (room.status) {
    case "looting": {
      const l = room.looting!;
      const best = [...l.pile].sort((a, b) => gold(b) - gold(a))[0];
      return handleAction(room, l.orderQueue[0], { type: "lootBody", cardId: best.id }).error === null;
    }
    case "charitySelection": {
      const ch = room.charity!;
      const giver = room.players.find(p => p.id === ch.fromId)!;
      const cards = [...giver.hand].sort(byGoldAsc).slice(0, ch.cardCount).map(c => c.id);
      return handleAction(room, giver.id, { type: "charityGive", cardIds: cards, toId: ch.candidates[0] }).error === null;
    }
    case "runAwayRoll": {
      const c = room.combat!;
      const fighter = [c.attackerId, c.helperId].find(id => id && !c.ranAway?.includes(id) && !room.players.find(p => p.id === id)?.isDead);
      return !!fighter && handleAction(room, fighter, { type: "runAway" }).error === null;
    }
    case "waitingForInterrupts":
    case "inCombat":
      return combatStep(room, mem, rnd);
    case "normalTurn":
      return turnStep(room, mem, rnd);
    default:
      return false;
  }
};

const combatStep = (room: Room, mem: BotMemory, rnd: Rng): boolean => {
  const c = room.combat!;
  const attacker = room.players.find(p => p.id === c.attackerId)!;

  // 1. Answer help offers.
  for (const offer of room.negotiations.filter(o => o.status === "pending")) {
    const accept = offer.treasures >= 1 || rnd() < 0.3;
    if (handleAction(room, offer.toId, { type: "respondHelp", offerId: offer.id, accept }).error === null) return true;
  }

  const view = buildView(room, attacker.id).combat!;
  const warrior = hasClass(attacker, "Warrior") || (c.helperId !== null && hasClass(room.players.find(p => p.id === c.helperId)!, "Warrior"));
  const winning = warrior ? view.playerTotal >= view.monsterTotal : view.playerTotal > view.monsterTotal;

  // 2. Opponents: sabotage a winning leader (or randomly), otherwise pass.
  for (const id of requiredPasses(room)) {
    if (c.passes[id]) continue;
    const p = room.players.find(x => x.id === id)!;
    const threatening = attacker.level >= leader(room).level || attacker.level >= room.settings.winLevel - 3;
    if (winning && (threatening || rnd() < 0.2) && once(mem.doneThisCombat, `meddle:${id}`)) {
      const boosts = p.hand.filter(x => (x.type === "enhancer" || x.type === "oneshot") && x.bonus > 0
        && x.cardId !== "o-friendship" && x.cardId !== "o-flask-glue");
      const card = boosts.sort((a, b) => ("bonus" in b ? b.bonus : 0) - ("bonus" in a ? a.bonus : 0))[0];
      if (card && handleAction(room, id, { type: "playInCombat", cardId: card.id, side: "monster" }).error === null) return true;
      const wander = p.hand.find(x => x.type === "wandering-monster");
      const extra = p.hand.find(x => x.type === "monster");
      if (wander && extra && handleAction(room, id, { type: "playInCombat", cardId: wander.id, extraCardId: extra.id }).error === null) return true;
    }
    if (handleAction(room, id, { type: "pass" }).error === null) return true;
  }

  // 3. Attacker: try to turn a losing fight around, then resolve.
  if (!winning) {
    const gap = view.monsterTotal - view.playerTotal + (warrior ? 0 : 1);
    const own = attacker.hand.filter(x => (x.type === "oneshot" || x.type === "enhancer") && x.bonus > 0
      && x.cardId !== "o-friendship" && x.cardId !== "o-flask-glue");
    const ownTotal = own.reduce((s, x) => s + ("bonus" in x ? x.bonus : 0), 0);
    if (own.length > 0 && ownTotal >= gap) {
      const card = own.sort((a, b) => ("bonus" in b ? b.bonus : 0) - ("bonus" in a ? a.bonus : 0))[0];
      if (handleAction(room, attacker.id, { type: "playInCombat", cardId: card.id, side: "attacker" }).error === null) return true;
    }
    if (hasClass(attacker, "Warrior") && once(mem.doneThisCombat, "berserk")) {
      const junk = [...attacker.hand].sort(byGoldAsc).slice(0, Math.min(3, gap)).map(x => x.id);
      if (junk.length && handleAction(room, attacker.id, { type: "useClassAbility", ability: "berserk", cardIds: junk }).error === null) return true;
    }
    if (hasClass(attacker, "Wizard") && once(mem.doneThisCombat, "charm")) {
      const target = [...c.monsters].sort((a, b) => b.level - a.level)[0];
      if (target && handleAction(room, attacker.id, { type: "useClassAbility", ability: "charm", cardIds: [], monsterId: target.id }).error === null) return true;
    }
    if (!c.helperId && once(mem.doneThisCombat, "askHelp")) {
      const totalTreasures = c.monsters.reduce((s, m) => s + m.treasures, 0);
      const helper = room.players
        .filter(p => p.id !== attacker.id && !p.isDead)
        .sort((a, b) => b.combatPower - a.combatPower)[0];
      if (helper) {
        const offer = Math.min(totalTreasures, 1 + Math.floor(rnd() * 2));
        if (handleAction(room, attacker.id, { type: "askForHelp", helperId: helper.id, treasures: offer }).error === null) return true;
      }
    }
  }

  const allPassed = requiredPasses(room).every(id => c.passes[id]);
  if (allPassed && room.negotiations.every(o => o.status !== "pending")) {
    return handleAction(room, attacker.id, { type: "resolveCombat" }).error === null;
  }
  return false;
};

const turnStep = (room: Room, mem: BotMemory, rnd: Rng): boolean => {
  const me = activePlayer(room);
  const done = mem.doneThisTurn;

  // Opponents may curse the leader once per turn.
  for (const p of room.players) {
    if (p.id === me.id || p.isDead) continue;
    const curse = p.hand.find(c => c.type === "curse");
    if (curse && once(done, `curse:${p.id}`) && rnd() < 0.5) {
      const target = room.players.filter(o => o.id !== p.id && !o.isDead).sort((a, b) => b.level - a.level)[0];
      if (target && handleAction(room, p.id, { type: "castCurse", cardId: curse.id, targetId: target.id }).error === null) return true;
    }
  }

  if (me.isDead) return handleAction(room, me.id, { type: "endTurn" }).error === null;

  // Housekeeping (each at most once per card per turn).
  for (const c of me.hand.filter(x => x.type === "class")) {
    if (!me.playerClass && once(done, `class:${c.id}`) && tryFirst(room, me.id, [{ type: "playCard", cardId: c.id }])) return true;
  }
  for (const c of [...me.hand, ...me.backpack].filter((x): x is EquipmentCard => x.type === "equipment")) {
    if (c.bonus > equippedInSlot(me, c) && once(done, `equip:${c.id}`)
      && tryFirst(room, me.id, [{ type: "equip", cardId: c.id, forceSwap: true }])) return true;
  }
  for (const c of me.hand.filter(x => x.type === "equipment")) {
    if (once(done, `pack:${c.id}`) && tryFirst(room, me.id, [{ type: "toBackpack", cardId: c.id }])) return true;
  }
  for (const c of me.hand.filter(x => x.type === "go-up-a-level")) {
    if (once(done, `up:${c.id}`) && tryFirst(room, me.id, [{ type: "playCard", cardId: c.id }])) return true;
  }
  if (once(done, "sell")) {
    const sellable = me.backpack.filter(x => gold(x) > 0).sort((a, b) => gold(b) - gold(a));
    if (sellable.reduce((s, x) => s + gold(x), 0) >= 1000
      && tryFirst(room, me.id, [{ type: "sell", cardIds: sellable.map(x => x.id) }])) return true;
  }

  if (room.currentPhase === 1) {
    if (hasClass(me, "Thief") && once(done, "steal") && rnd() < 0.3) {
      const victim = room.players.filter(p => p.id !== me.id && !p.isDead).sort((a, b) => b.level - a.level)[0];
      const item = victim && [victim.equipment.head, victim.equipment.armor, victim.equipment.feet, ...victim.equipment.hands]
        .find((e): e is EquipmentCard => !!e && !e.isBig);
      const pay = [...me.hand].sort(byGoldAsc)[0];
      if (item && pay && handleAction(room, me.id, { type: "useClassAbility", ability: "steal", cardIds: [pay.id], targetId: victim.id, targetCardId: item.id }).error === null) return true;
    }
    const portal = me.hand.find(x => x.type === "portal");
    if (portal && once(done, `portal:${portal.id}`) && rnd() < 0.5
      && tryFirst(room, me.id, [{ type: "playCard", cardId: portal.id }])) return true;
    if (handleAction(room, me.id, { type: "kickDoor" }).error === null) return true;
    return handleAction(room, me.id, { type: "endTurn" }).error === null;
  }

  if ((room.currentPhase === 2 || room.currentPhase === 3) && !room.combatFought) {
    if (room.currentPhase === 2) {
      const beatable = me.hand
        .filter((x): x is MonsterCard => x.type === "monster")
        .filter(m => me.combatPower > m.level + 1)
        .sort((a, b) => b.levelsAwarded - a.levelsAwarded)[0];
      if (beatable && handleAction(room, me.id, { type: "lookForTrouble", cardId: beatable.id }).error === null) return true;
    }
    if (handleAction(room, me.id, { type: "lootRoom" }).error === null) return true;
  }
  return handleAction(room, me.id, { type: "endTurn" }).error === null;
};
