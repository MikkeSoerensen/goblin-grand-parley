// Authoritative Munchkin server.
// All game state lives here; clients send intents via Socket.io and receive
// per-player ClientView snapshots after every state mutation.

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { networkInterfaces } from "os";
import { fileURLToPath } from "url";
import path from "path";

import { buildAllDecks } from "../shared/deck.js";
import type {
  Card, MonsterCard, EquipmentCard, CurseCard, OneShotCard, EnhancerCard,
  PrivatePlayer, PublicPlayer, PublicGameState, ClientView, Phase, AppStatus,
  CombatState, NegotiationOffer, BadStuffKind, Slot, ClientToServer,
} from "../shared/types.js";

// ---------- utils ----------
const shuffle = <T,>(a: T[]): T[] => {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};
const rid = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const newOfferId = () => Math.random().toString(36).slice(2, 10);

// ---------- Room ----------
interface Room {
  code: string;
  players: PrivatePlayer[];
  socketIdToPlayerId: Map<string, string>;
  decks: { door: Card[]; treasure: Card[] };
  discards: { door: Card[]; treasure: Card[] };
  table: Card[];
  status: AppStatus;
  activePlayerIndex: number;
  currentPhase: Phase;
  combat: CombatState | null;
  negotiations: (NegotiationOffer & { id: string })[];
  charity: PublicGameState["charity"];
  looting: PublicGameState["looting"];
  log: string[];
  winnerId: string | null;
  combatFought: boolean; // tracks if current turn already had combat
}

const rooms = new Map<string, Room>();

const computePower = (p: PrivatePlayer): number => {
  let bonus = 0;
  if (p.equipment.head) bonus += p.equipment.head.bonus;
  if (p.equipment.armor) bonus += p.equipment.armor.bonus;
  if (p.equipment.feet) bonus += p.equipment.feet.bonus;
  if (p.equipment.bigItem) bonus += p.equipment.bigItem.bonus;
  for (const h of p.equipment.hands) bonus += h.bonus;
  return p.level + bonus;
};

const refreshDerived = (p: PrivatePlayer) => {
  p.combatPower = computePower(p);
  p.handCount = p.hand.length;
  p.backpackCount = p.backpack.length;
};

const drawFromDeck = (room: Room, deck: "door" | "treasure"): Card | null => {
  if (room.decks[deck].length === 0) {
    if (room.discards[deck].length === 0) return null;
    room.decks[deck] = shuffle(room.discards[deck]);
    room.discards[deck] = [];
    log(room, `(Reshuffled ${deck} discard pile)`);
  }
  return room.decks[deck].pop() ?? null;
};

const log = (room: Room, msg: string) => {
  room.log.push(msg);
  if (room.log.length > 200) room.log.shift();
};

const toPublic = (p: PrivatePlayer): PublicPlayer => ({
  id: p.id, name: p.name, level: p.level, equipment: p.equipment,
  handCount: p.hand.length, backpackCount: p.backpack.length,
  combatPower: computePower(p), isDead: p.isDead, connected: p.connected,
  playerClass: p.playerClass, // <--- Tilføjet her!
});

const buildView = (room: Room, selfId: string | null): ClientView => {
  const self = room.players.find(p => p.id === selfId) ?? null;
  return {
    status: room.status,
    players: room.players.map(toPublic),
    activePlayerIndex: room.activePlayerIndex,
    currentPhase: room.currentPhase,
    doorDeckCount: room.decks.door.length,
    treasureDeckCount: room.decks.treasure.length,
    doorDiscardCount: room.discards.door.length,
    treasureDiscardCount: room.discards.treasure.length,
    table: room.table,
    combat: room.combat,
    negotiations: room.negotiations.map(({ id, ...rest }) => ({ ...rest, ...(({} as any)) , id } as any)),
    charity: room.charity,
    looting: room.looting,
    log: room.log.slice(-30),
    winnerId: room.winnerId,
    self,
  };
};

let io: Server;

const broadcast = (room: Room) => {
  for (const [socketId, playerId] of room.socketIdToPlayerId.entries()) {
    io.to(socketId).emit("msg", { type: "state", view: buildView(room, playerId) });
  }
};

// ---------- room creation ----------
const createRoom = (code: string): Room => {
  const decks = buildAllDecks();
  const room: Room = {
    code,
    players: [],
    socketIdToPlayerId: new Map(),
    decks: { door: shuffle(decks.door), treasure: shuffle(decks.treasure) },
    discards: { door: [], treasure: [] },
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
  };
  rooms.set(code, room);
  return room;
};

const getRoomByCode = (code: string): Room | undefined => rooms.get(code.toUpperCase());

// ---------- equipment helpers ----------
const handsUsed = (p: PrivatePlayer): number =>
  p.equipment.hands.reduce((n, h) => n + (h.slot === "twoHands" ? 2 : 1), 0);

const tryEquip = (p: PrivatePlayer, card: EquipmentCard): string | null => {
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
  }
  return null;
};

const removeEquipped = (p: PrivatePlayer, cardId: string): EquipmentCard | null => {
  const slots: (keyof typeof p.equipment)[] = ["head", "armor", "feet", "bigItem"];
  for (const s of slots) {
    const eq = p.equipment[s] as EquipmentCard | null;
    if (eq && eq.id === cardId) { p.equipment[s] = null as any; return eq; }
  }
  const idx = p.equipment.hands.findIndex(h => h.id === cardId);
  if (idx >= 0) {
    const [h] = p.equipment.hands.splice(idx, 1);
    return h;
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
  return arr;
};

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
        if (equipped.length === 0) { log(room, `${p.name} has no items to lose.`); break; }
        target = slot === "biggest"
          ? equipped.slice().sort((a, b) => b.bonus - a.bonus)[0]
          : equipped[0];
      } else {
        if (slot === "hand") target = p.equipment.hands[0] ?? null;
        else if (slot === "twoHands") target = p.equipment.hands.find(h => h.slot === "twoHands") ?? null;
        else target = (p.equipment as any)[slot] ?? null;
      }
      // also check backpack if no equipped match
      if (!target && (slot === "any" || slot === "biggest") && p.backpack.length > 0) {
        const eqInBackpack = p.backpack.filter(c => c.type === "equipment") as EquipmentCard[];
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
    case "loseAllItems": {
      const all = [...allEquipped(p), ...p.backpack.filter(c => c.type === "equipment")] as EquipmentCard[];
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
    case "death": {
      log(room, `💀 ${p.name} has DIED.`);
      // body becomes loot pile
      const pile: Card[] = [
        ...allEquipped(p), ...p.backpack, ...p.hand,
      ];
      p.equipment = { head: null, armor: null, feet: null, hands: [], bigItem: null };
      p.backpack = []; p.hand = [];
      p.isDead = true;
      // Looting order: highest level opponents first, excluding dead one.
      const order = room.players
        .filter(o => o.id !== p.id && !o.isDead)
        .sort((a, b) => b.level - a.level)
        .map(o => o.id);
      if (pile.length > 0 && order.length > 0) {
        room.looting = { deadId: p.id, pile, orderQueue: order };
        room.status = "looting";
      } else {
        // discard everything
        for (const c of pile) {
          if (c.deck === "door") room.discards.door.push(c);
          else room.discards.treasure.push(c);
        }
      }
      break;
    }
  }
  refreshDerived(p);
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
  };
  room.status = "waitingForInterrupts";
  room.combatFought = true;
};

const monsterTotal = (c: CombatState): number =>
  c.monsters.reduce((s, m) => s + m.level, 0) + c.monsterBonuses;

const playerSideTotal = (room: Room, c: CombatState): number => {
  const a = room.players.find(p => p.id === c.attackerId)!;
  let total = a.combatPower + c.attackerBonuses;
  if (c.helperId) {
    const h = room.players.find(p => p.id === c.helperId);
    if (h) total += h.combatPower;
  }
  return total;
};

const resetPasses = (room: Room) => {
  if (!room.combat) return;
  for (const k of Object.keys(room.combat.passes)) {
    if (k !== room.combat.attackerId && k !== room.combat.helperId) {
      room.combat.passes[k] = false;
    }
  }
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

// ---------- handlers ----------
const handle = (room: Room, playerId: string, msg: ClientToServer): string | null => {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return "Unknown player.";

  switch (msg.type) {
    case "rename":
      player.name = msg.name.slice(0, 20) || player.name;
      return null;

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
      // Find kortet i afsenderens hånd eller rygsæk
      const cIdx = player.hand.findIndex(c => c.id === msg.cardId);
      const bIdx = player.backpack.findIndex(c => c.id === msg.cardId);
      
      let cardToPlay: Card | null = null;
      
      if (cIdx >= 0) {
        cardToPlay = player.hand.splice(cIdx, 1)[0];
      } else if (bIdx >= 0) {
        cardToPlay = player.backpack.splice(bIdx, 1)[0];
      }
      
      if (!cardToPlay || cardToPlay.type !== "curse") return "Card not found or not a curse.";

      // Find offeret
      const targetPlayer = room.players.find(p => p.id === msg.targetId);
      if (!targetPlayer) {
        // Hvis offeret ikke findes (f.eks. forlod spillet), så læg kortet tilbage og afbryd
        player.hand.push(cardToPlay);
        return "Target player not found.";
      }

      // Kast forbandelsen!
      log(room, `💀 ${player.name} casts ${cardToPlay.name} on ${targetPlayer.name}!`);
      applyBadStuff(room, targetPlayer, (cardToPlay as CurseCard).effect);
      room.discards.door.push(cardToPlay);
      
      refreshDerived(player);
      refreshDerived(targetPlayer);
      return null;
    }

    case "kickDoor": {
      if (room.status !== "normalTurn" || room.currentPhase !== 1) return "Not Kick Door phase.";
      if (room.players[room.activePlayerIndex].id !== playerId) return "Not your turn.";
      const card = drawFromDeck(room, "door");
      if (!card) return "No cards in door deck.";
      log(room, `🚪 ${player.name} kicks the door: ${card.name}.`);
      if (card.type === "monster") {
        room.table.push(card);
        startCombat(room, player, card);
      } else if (card.type === "curse") {
        applyBadStuff(room, player, (card as CurseCard).effect);
        room.discards.door.push(card);
        room.currentPhase = 2;
      } else {
        player.hand.push(card);
        refreshDerived(player);
        room.currentPhase = 2;
      }
      return null;
    }

    case "lookForTrouble": {
      if (room.currentPhase !== 2 || room.status !== "normalTurn") return "Not Look-for-Trouble phase.";
      if (room.players[room.activePlayerIndex].id !== playerId) return "Not your turn.";
      const idx = player.hand.findIndex(c => c.id === msg.cardId && c.type === "monster");
      if (idx < 0) return "Pick a monster from hand.";
      const [m] = player.hand.splice(idx, 1) as MonsterCard[];
      refreshDerived(player);
      room.table.push(m);
      log(room, `${player.name} looks for trouble: ${m.name}.`);
      startCombat(room, player, m);
      return null;
    }

    case "lootRoom": {
      if (room.currentPhase !== 2 && room.currentPhase !== 3) return "Wrong phase.";
      if (room.combatFought) return "Already fought this turn.";
      if (room.players[room.activePlayerIndex].id !== playerId) return "Not your turn.";
      const card = drawFromDeck(room, "door");
      if (card) { player.hand.push(card); log(room, `${player.name} loots the room (face-down).`); }
      refreshDerived(player);
      room.currentPhase = 4;
      return null;
    }

    case "endTurn": {
      if (room.players[room.activePlayerIndex].id !== playerId) return "Not your turn.";
      if (room.status === "inCombat" || room.status === "waitingForInterrupts") return "Combat in progress.";
      // Charity check
      if (player.hand.length > 5) {
        const minLevel = Math.min(...room.players.filter(p => p.id !== playerId).map(p => p.level));
        const candidates = room.players.filter(p => p.id !== playerId && p.level === minLevel).map(p => p.id);
        room.charity = { fromId: playerId, cardCount: player.hand.length - 5, candidates };
        room.status = "charitySelection";
        log(room, `${player.name} must give ${player.hand.length - 5} card(s) to charity.`);
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

      // NYT: Hvis spilleren har valgt "Auto-Swap", pakker vi det blokerende udstyr ned i rygsækken først!
      if ('forceSwap' in msg && msg.forceSwap) {
        if (card.isBig && player.equipment.bigItem) {
          player.backpack.push(player.equipment.bigItem);
          player.equipment.bigItem = null as any;
        }
        if (card.slot === "head" && player.equipment.head) {
          player.backpack.push(player.equipment.head);
          player.equipment.head = null as any;
        }
        if (card.slot === "armor" && player.equipment.armor) {
          player.backpack.push(player.equipment.armor);
          player.equipment.armor = null as any;
        }
        if (card.slot === "feet" && player.equipment.feet) {
          player.backpack.push(player.equipment.feet);
          player.equipment.feet = null as any;
        }
        if (card.slot === "hand" || card.slot === "twoHands") {
          // Hvis vi skal bruge hænder, og der ikke er plads, tømmer vi de hænder der er nødvendige
          const needed = card.slot === "twoHands" ? 2 : 1;
          let currentHandsUsed = player.equipment.hands.reduce((n, h) => n + (h.slot === "twoHands" ? 2 : 1), 0);
          while (currentHandsUsed > (2 - needed) && player.equipment.hands.length > 0) {
            const removed = player.equipment.hands.pop()!;
            player.backpack.push(removed);
            currentHandsUsed -= (removed.slot === "twoHands" ? 2 : 1);
          }
        }
      }

      // Nu hvor der er gjort plads (hvis forceSwap var true), prøver vi at tage det på
      const err = tryEquip(player, card as EquipmentCard);
      if (err) return err;

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
      const [c] = player.hand.splice(idx, 1);
      if (c.type !== "equipment") { player.hand.splice(idx, 0, c); return "Only equipment goes to backpack."; }
      player.backpack.push(c);
      refreshDerived(player);
      return null;
    }

    case "sell": {
      let totalGold = 0;
      
      // 1. Tjek om vi har 1000g overhovedet, UDEN at slette noget endnu!
      for (const id of msg.cardIds) {
        const eq = allEquipped(player).find(e => e.id === id);
        if (eq) { totalGold += eq.goldValue; continue; }
        
        const bCard = player.backpack.find(c => c.id === id);
        if (bCard && 'goldValue' in bCard) { totalGold += (bCard as any).goldValue; continue; }
        
        const hCard = player.hand.find(c => c.id === id);
        if (hCard && 'goldValue' in hCard) { totalGold += (hCard as any).goldValue; continue; }
      }

      // Hvis vi er under 1000g, stopper vi koden og afviser købet (og spilleren beholder sine ting!)
      if (totalGold < 1000) return "Du skal vælge for mindst 1000g for at sælge!";

      // 2. Hvis der er 1000g+, SÅ sletter vi dem fra spillerens krop/rygsæk/hånd
      const sold: Card[] = [];
      for (const id of msg.cardIds) {
        const eqIdx = (() => {
          const all = allEquipped(player);
          return all.find(e => e.id === id);
        })();
        if (eqIdx) { removeEquipped(player, id); sold.push(eqIdx); continue; }
        
        const bIdx = player.backpack.findIndex(c => c.id === id);
        if (bIdx >= 0) { const c = player.backpack[bIdx]; player.backpack.splice(bIdx, 1); sold.push(c); continue; }

        const hIdx = player.hand.findIndex(c => c.id === id);
        if (hIdx >= 0) { const c = player.hand[hIdx]; player.hand.splice(hIdx, 1); sold.push(c); continue; }
      }

      // 3. Giv belønningen!
      const levelsGained = Math.floor(totalGold / 1000);
      for (const c of sold) room.discards.treasure.push(c);
      
      const newLevel = Math.min(9, player.level + levelsGained); // Man KAN IKKE vinde på et salg
      log(room, `💰 ${player.name} sells items for ${totalGold}g → +${newLevel - player.level} level(s).`);
      
      player.level = newLevel;
      refreshDerived(player);
      return null;
    }

    case "playCard": {
      if (!msg.cardId) return "No card specified.";
      
      // Find kortet i spillerens hånd
      const idx = player.hand.findIndex(c => c.id === msg.cardId);
      if (idx < 0) return "Card not in hand.";
      const card = player.hand[idx];

      // Håndter "Go Up a Level" kort
      if (card.type === "go-up-a-level") {
        if (player.level >= 9) {
          return "Du kan ikke bruge dette kort til at vinde spillet (Level 10)!";
        }
        player.level += 1;
        player.hand.splice(idx, 1);
        room.discards.treasure.push(card);
        log(room, `⬆️ ${player.name} plays ${card.name} and goes up a level!`);
        refreshDerived(player);
        return null;
      }

      // NYT: Håndter "Class" kort
      if (card.type === "class") {
        let oldClass = null;
        
        // Hvis man allerede har en klasse, gemmer vi navnet og smider den i skraldespanden
        if (player.playerClass) {
          oldClass = player.playerClass;
          room.discards.door.push(oldClass);
        }
        
        // Sæt den nye klasse, fjern kortet fra hånden
        player.playerClass = card as any;
        player.hand.splice(idx, 1);
        
        // Skriv en tydelig besked i loggen!
        if (oldClass) {
          log(room, `✨ ${player.name} discards ${oldClass.name} and becomes a ${card.name}!`);
        } else {
          log(room, `✨ ${player.name} is now a ${card.name}!`);
        }
        
        refreshDerived(player);
        return null;
      }

      return "Dette kort kan ikke spilles på denne måde lige nu.";
    }

    case "discard": {
      const idx = player.hand.findIndex(c => c.id === msg.cardId);
      if (idx < 0) return "Not in hand.";
      const [c] = player.hand.splice(idx, 1);
      if (c.deck === "door") room.discards.door.push(c);
      else room.discards.treasure.push(c);
      refreshDerived(player);
      return null;
    }

    // ===== combat actions =====
    case "playInCombat": {
      if (!room.combat) return "No combat.";
      const idx = player.hand.findIndex(c => c.id === msg.cardId);
      if (idx < 0) return "Not in hand.";
      const card = player.hand[idx];
      if (card.type === "oneshot") {
        const o = card as OneShotCard;
        if (msg.side === "attacker") {
          if (player.id !== room.combat.attackerId && player.id !== room.combat.helperId) return "Only fighters can buff their side.";
          room.combat.attackerBonuses += o.bonus;
        } else {
          // playing against attacker (subtract from their side or boost monster — we simply subtract)
          room.combat.monsterBonuses += o.bonus;
        }
      } else if (card.type === "enhancer") {
        const e = card as EnhancerCard;
        room.combat.monsterBonuses += e.bonus;
      } else return "Card cannot be played in combat.";
      player.hand.splice(idx, 1);
      room.combat.playedCards.push({ byPlayer: player.id, card });
      room.combat.log.push(`${player.name} plays ${card.name}.`);
      // played card goes to discard immediately
      if (card.deck === "treasure") room.discards.treasure.push(card);
      else room.discards.door.push(card);
      resetPasses(room);
      room.status = "waitingForInterrupts"; // <--- NY LINJE TILFØJET HER
      refreshDerived(player);
      return null;
    }

    case "useClassAbility": {
      if (!room.combat) return "No combat active.";
      const c = room.combat;
      
      if (msg.ability === "berserk") {
         if (player.playerClass?.name !== "Warrior") return "Not a Warrior.";
         if (c.attackerId !== playerId && c.helperId !== playerId) return "You must be in combat to go berserk.";
         
         c.warriorDiscardCount = c.warriorDiscardCount || {};
         const currentUsed = c.warriorDiscardCount[playerId] || 0;
         if (currentUsed + msg.cardIds.length > 3) return `You can only discard up to 3 cards (used ${currentUsed}).`;
         
         let discarded = 0;
         for (const cid of msg.cardIds) {
           const idx = player.hand.findIndex(x => x.id === cid);
           if (idx >= 0) {
             const [card] = player.hand.splice(idx, 1);
             if (card.deck === "door") room.discards.door.push(card); else room.discards.treasure.push(card);
             discarded++;
           }
         }
         if (discarded === 0) return "No valid cards discarded.";
         
         c.warriorDiscardCount[playerId] = currentUsed + discarded;
         c.attackerBonuses += discarded;
         log(room, `⚔️ ${player.name} goes BERSERK! Discards ${discarded} card(s) for +${discarded} bonus.`);
         refreshDerived(player);
         return null;
      }
      
      if (msg.ability === "backstab") {
         if (player.playerClass?.name !== "Thief") return "Not a Thief.";
         if (!msg.targetId) return "No target specified.";
         const target = room.players.find(p => p.id === msg.targetId);
         if (!target) return "Target not found.";
         
         c.backstabbedBy = c.backstabbedBy || {};
         c.backstabbedBy[target.id] = c.backstabbedBy[target.id] || [];
         if (c.backstabbedBy[target.id].includes(playerId)) return "You already backstabbed this player in this combat.";
         
         if (msg.cardIds.length !== 1) return "Must discard exactly 1 card to backstab.";
         const idx = player.hand.findIndex(x => x.id === msg.cardIds[0]);
         if (idx < 0) return "Card not in hand.";
         
         const [card] = player.hand.splice(idx, 1);
         if (card.deck === "door") room.discards.door.push(card); else room.discards.treasure.push(card);
         
         c.backstabbedBy[target.id].push(playerId);
         if (target.id === c.attackerId || target.id === c.helperId) {
           c.attackerBonuses -= 2;
           log(room, `🗡️ ${player.name} BACKSTABS ${target.name}! (-2 to their combat score)`);
         } else {
           return "Can only backstab players currently in combat.";
         }
         refreshDerived(player);
         return null;
      }
      
      if (msg.ability === "charm") {
         if (player.playerClass?.name !== "Wizard") return "Not a Wizard.";
         if (c.attackerId !== playerId && c.helperId !== playerId) return "You must be in combat to charm.";
         if (!msg.monsterId) return "No monster selected.";
         if (player.hand.length < 3) return "Need at least 3 cards in hand to Charm.";
         
         const mIdx = c.monsters.findIndex(m => m.id === msg.monsterId);
         if (mIdx < 0) return "Monster not in combat.";
         const monster = c.monsters[mIdx];
         
         // Troldmanden kaster hele hånden!
         const handSize = player.hand.length;
         for (const card of player.hand) {
            if (card.deck === "door") room.discards.door.push(card); else room.discards.treasure.push(card);
         }
         player.hand = [];
         
         // Fjern monsteret
         c.monsters.splice(mIdx, 1);
         room.discards.door.push(monster);
         
         // Ryd monsteret fra bordet
         room.table = room.table.filter(t => t.id !== monster.id);
         
         c.charmedTreasures = (c.charmedTreasures || 0) + monster.treasures;
         
         log(room, `🪄 ${player.name} CHARMS the ${monster.name} by discarding their hand (${handSize} cards)!`);
         refreshDerived(player);
         return null;
      }
      
      return "Invalid ability.";
    }

    case "askForHelp": {
      if (!room.combat || room.combat.attackerId !== playerId) return "Only attacker may request help.";
      if (room.combat.helperId) return "Already have a helper.";
      const offer: NegotiationOffer & { id: string } = {
        id: newOfferId(),
        fromId: playerId, toId: msg.helperId,
        treasures: Math.max(0, msg.treasures),
        status: "pending",
      };
      room.negotiations.push(offer);
      log(room, `${player.name} offers ${msg.treasures} treasure(s) for help.`);
      return null;
    }

    case "respondHelp": {
      const offer = room.negotiations.find(o => o.id === msg.offerId);
      if (!offer || offer.toId !== playerId) return "Not your offer.";
      if (offer.status !== "pending") return "Already responded.";
      offer.status = msg.accept ? "accepted" : "rejected";
      if (msg.accept && room.combat && !room.combat.helperId) {
        room.combat.helperId = playerId;
        room.combat.contract = { helperId: playerId, treasures: offer.treasures, accepted: true };
        // helper joins; passes for them removed
        delete room.combat.passes[playerId];
        resetPasses(room);
        log(room, `🩸 BLOOD OATH: ${player.name} joins for ${offer.treasures} treasure(s). Cannot withdraw.`);
      }
      // clean up resolved offers
      room.negotiations = room.negotiations.filter(o => o.status === "pending");
      return null;
    }

    case "pass": {
      if (!room.combat) return "No combat.";
      
      // Fighters (angriber og hjælper) må ikke trykke pass! 
      if (room.combat.attackerId === playerId || room.combat.helperId === playerId) {
        return "Fighters cannot pass.";
      }
      
      // Registrer spillerens stemme
      room.combat.passes[playerId] = true;

      // Vores nye logik: Tæl hvor mange der REELT kan afgive pass
      const alivePlayers = room.players.filter(p => !p.isDead).length;
      const expectedPasses = alivePlayers - (room.combat.helperId ? 2 : 1);
      const passCount = Object.values(room.combat.passes).filter(Boolean).length;

      // Hvis vi har modtaget de forventede stemmer, er kampen klar til at slutte
      if (passCount >= expectedPasses) {
        room.status = "inCombat";
      }
      return null;
    }

    case "resolveCombat": {
      if (!room.combat) return "No combat.";
      if (room.combat.attackerId !== playerId) return "Only attacker may resolve.";
      
      const c = room.combat;

      // Vores nye logik igen: Mangler der overhovedet nogen stemmer for at vi kan gå videre?
      const alivePlayers = room.players.filter(p => !p.isDead).length;
      const expectedPasses = alivePlayers - (c.helperId ? 2 : 1);
      const passCount = Object.values(c.passes).filter(Boolean).length;

      if (passCount < expectedPasses) {
        room.status = "waitingForInterrupts";
        log(room, `⏳ ${player.name} forsøger at vinde! Modstanderne skal smide kort nu eller trykke Pass.`);
        return null; // Stop koden her og vent
      }

      // Hvis vi er nået hertil, er kravet opfyldt (f.eks. 0 mangler = 0 stemmer). Tving kampen igennem!
      room.status = "inCombat";

      const attacker = room.players.find(p => p.id === c.attackerId)!;
      const helper = c.helperId ? room.players.find(p => p.id === c.helperId) : null;
      const ms = monsterTotal(c);
      const ps = playerSideTotal(room, c);
      
      // NYT: Tjek om en af dem i kampen er Warrior
      const hasWarrior = attacker.playerClass?.name === "Warrior" || helper?.playerClass?.name === "Warrior";
      
      log(room, `Resolution: Players ${ps} vs Monsters ${ms}.${hasWarrior ? " (Warrior tie-breaker active!)" : ""}`);
      
      // NYT: Krigere vinder på uafgjort (>=), alle andre skal have mere (>)
      if (hasWarrior ? ps >= ms : ps > ms) {
        // Victory!
        const totalTreasures = c.monsters.reduce((s, m) => s + m.treasures, 0) + (c.charmedTreasures || 0);
        const totalLevels = c.monsters.reduce((s, m) => s + m.levelsAwarded, 0);
        const helperShare = c.contract ? Math.min(c.contract.treasures, totalTreasures) : 0;
        const attackerShare = totalTreasures - helperShare;
        for (let i = 0; i < attackerShare; i++) {
          const t = drawFromDeck(room, "treasure"); if (t) attacker.hand.push(t);
        }
        if (helper) for (let i = 0; i < helperShare; i++) {
          const t = drawFromDeck(room, "treasure"); if (t) helper.hand.push(t);
        }
        attacker.level += totalLevels;
        log(room, `🏆 Victory! +${totalLevels} level(s), +${attackerShare} treasure(s) to ${attacker.name}${helper ? `, +${helperShare} to ${helper.name}` : ""}.`);
        for (const m of c.monsters) room.discards.door.push(m);
        room.table = room.table.filter(t => !c.monsters.some(m => m.id === t.id));
        refreshDerived(attacker);
        if (helper) refreshDerived(helper);
        checkVictory(room, attacker, true);
        room.combat = null;
        if ((room.status as string) !== "gameOver") {
          room.status = "normalTurn";
          room.currentPhase = 3;
        }
      } else {
        // Defeat — must run away
        room.status = "runAwayRoll";
        log(room, `Defeat! ${attacker.name}${helper ? ` and ${helper.name}` : ""} must Run Away.`);
      }
      return null;
    }

case "runAway": {
      if (!room.combat) return "No combat.";
      if ((room.status as string) !== "runAwayRoll") return "Not run-away phase.";
      if (playerId !== room.combat.attackerId && playerId !== room.combat.helperId) return "Not in this combat.";
      
      const roll = 1 + Math.floor(Math.random() * 6);
      io.to(roomSocketIds(room)).emit("msg", { type: "rolled", playerId, result: roll, reason: "Run Away" });
      log(room, `🎲 ${player.name} rolls ${roll} to run away.`);
      
      if (roll >= 5) {
        log(room, `${player.name} escapes!`);
      } else {
        log(room, `${player.name} fails to escape — Bad Stuff!`);
        for (const m of room.combat.monsters) {
          applyBadStuff(room, player, m.badStuff);
          // RETTELSE HER: Stop KUN funktionen, hvis spilleren er død (looting) eller spillet er slut.
          if ((room.status as string) === "looting" || (room.status as string) === "gameOver") return null; 
        }
      }
      
      // mark this player's run resolved by removing from combat passes (we reuse passes for ran flag)
      (room.combat as any)._ran = (room.combat as any)._ran ?? new Set<string>();
      ((room.combat as any)._ran as Set<string>).add(playerId);
      
      const attackerDone = ((room.combat as any)._ran as Set<string>).has(room.combat.attackerId);
      const helperDone = !room.combat.helperId || ((room.combat as any)._ran as Set<string>).has(room.combat.helperId);
      
      if (attackerDone && helperDone) {
        // discard monsters
        for (const m of room.combat.monsters) room.discards.door.push(m);
        room.table = room.table.filter(t => !room.combat!.monsters.some(m => m.id === t.id));
        room.combat = null;
        
        if ((room.status as string) !== "looting" && (room.status as string) !== "gameOver") {
          room.status = "normalTurn";
          room.currentPhase = 3;
        }
      }
      return null;
    }

      case "flee": {
      if (!room.combat) return "No combat.";
      if (room.combat.attackerId !== playerId) return "Kun angriberen kan overgive sig.";
      room.status = "runAwayRoll";
      room.combat.log.push(`💨 ${player.name} giver op og gør klar til at flygte!`);
      return null;
    }

    case "lootBody": {
      if (!room.looting) return "No looting.";
      const nextId = room.looting.orderQueue[0];
      if (nextId !== playerId) return "Not your turn to loot.";
      const idx = room.looting.pile.findIndex(c => c.id === msg.cardId);
      if (idx < 0) return "Card not in pile.";
      const [c] = room.looting.pile.splice(idx, 1);
      player.hand.push(c);
      refreshDerived(player);
      log(room, `${player.name} loots ${c.name} from the body.`);
      room.looting.orderQueue.shift();
      if (room.looting.pile.length === 0 || room.looting.orderQueue.length === 0) {
        // discard remainder
        for (const c of room.looting.pile) {
          if (c.deck === "door") room.discards.door.push(c); else room.discards.treasure.push(c);
        }
        room.looting = null;
        // resume — if combat was active during a death, end turn for dead player path
        room.status = "normalTurn";
        // if dead player was the active player, advance turn
        const dead = room.players.find(p => p.isDead);
        if (dead && dead.id === room.players[room.activePlayerIndex].id) advanceTurn(room);
      }
      return null;
    }

    case "charityGive": {
      if (!room.charity || room.charity.fromId !== playerId) return "No charity.";
      if (!room.charity.candidates.includes(msg.toId)) return "Invalid recipient.";
      if (msg.cardIds.length !== room.charity.cardCount) return `Must give exactly ${room.charity.cardCount} card(s).`;
      const recipient = room.players.find(p => p.id === msg.toId)!;
      for (const id of msg.cardIds) {
        const idx = player.hand.findIndex(c => c.id === id);
        if (idx >= 0) {
          const [c] = player.hand.splice(idx, 1);
          recipient.hand.push(c);
        }
      }
      refreshDerived(player); refreshDerived(recipient);
      log(room, `${player.name} gives ${msg.cardIds.length} card(s) to ${recipient.name}.`);
      room.charity = null;
      advanceTurn(room);
      return null;
    }
  }
  return "Unhandled.";
};

const advanceTurn = (room: Room) => {
  // If active player is dead and pile is empty, give them a fresh hand (5 cards: 4 mix)
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
  log(room, `▶ ${room.players[next].name}'s turn.`);
};

const roomSocketIds = (room: Room): string[] => Array.from(room.socketIdToPlayerId.keys());

// ---------- HTTP + Socket.io ----------
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Optional: serve built client
const distDir = path.resolve(__dirname, "../dist");
app.use(express.static(distDir));
app.get("/health", (_req, res) => res.json({ ok: true, rooms: rooms.size }));
app.get(/^\/(?!socket\.io).*/, (_req, res) => res.sendFile(path.join(distDir, "index.html"), err => { if (err) res.status(404).send("Run `npm run build` first to serve the client from this server, or use `npm run dev` for hot reload."); }));

const httpServer = createServer(app);
io = new Server(httpServer, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  socket.on("msg", (raw: ClientToServer) => {
    try {
      if (raw.type === "join") {
        const code = raw.roomCode.toUpperCase();
        const room = rooms.get(code) ?? createRoom(code);
        // re-join existing player by name?
        let player = room.players.find(p => p.name.toLowerCase() === raw.name.toLowerCase());
        if (!player) {
          if (room.status !== "lobby") {
            socket.emit("msg", { type: "error", message: "Game already in progress; pick an existing player name to reconnect." });
            return;
          }
          player = {
            id: rid(), name: raw.name.slice(0, 20) || "Player",
            level: 1,
            equipment: { head: null, armor: null, feet: null, hands: [], bigItem: null },
            hand: [], backpack: [], handCount: 0, backpackCount: 0,
            combatPower: 1, isDead: false, connected: true,
            playerClass: null, // <--- Starter uden en Class
          };
          room.players.push(player);
          log(room, `${player.name} joined ${code}.`);
        } else {
          player.connected = true;
          log(room, `${player.name} reconnected.`);
        }
        room.socketIdToPlayerId.set(socket.id, player.id);
        socket.join(code);
        (socket.data as any).roomCode = code;
        broadcast(room);
        return;
      }

      const code = (socket.data as any).roomCode as string | undefined;
      if (!code) { socket.emit("msg", { type: "error", message: "Join a room first." }); return; }
      const room = rooms.get(code);
      if (!room) { socket.emit("msg", { type: "error", message: "Room not found." }); return; }
      const playerId = room.socketIdToPlayerId.get(socket.id);
      if (!playerId) { socket.emit("msg", { type: "error", message: "Not in room." }); return; }
      const err = handle(room, playerId, raw);
      if (err) socket.emit("msg", { type: "error", message: err });
      broadcast(room);
    } catch (e) {
      console.error(e);
      socket.emit("msg", { type: "error", message: "Server error." });
    }
  });

  socket.on("disconnect", () => {
    const code = (socket.data as any).roomCode as string | undefined;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    const pid = room.socketIdToPlayerId.get(socket.id);
    if (pid) {
      const p = room.players.find(p => p.id === pid);
      if (p) p.connected = false;
    }
    room.socketIdToPlayerId.delete(socket.id);
    broadcast(room);
  });
});

const PORT = Number(process.env.PORT ?? 3001);
httpServer.listen(PORT, "0.0.0.0", () => {
  const ifs = networkInterfaces();
  const ips: string[] = [];
  for (const list of Object.values(ifs)) {
    for (const i of list ?? []) if (i.family === "IPv4" && !i.internal) ips.push(i.address);
  }
  console.log(`\n🎲  Munchkin server listening on port ${PORT}`);
  console.log(`    Local:  http://localhost:${PORT}`);
  for (const ip of ips) console.log(`    LAN:    http://${ip}:${PORT}   ← share with friends on same Wi-Fi`);
  console.log("");
});
