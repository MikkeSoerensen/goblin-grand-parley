// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import type { ClassCard, DungeonCard, GameAction, MateCard } from "../shared/types.js";
import { buildView, handleAction, joinRoom, requiredPasses, setConnected, setRandomSource, type Room } from "./engine.js";
import {
  ROLL_1, ROLL_6, allCardIds, curse, equipment, fixRandom, monster, oneShot, seeded, startedTable, type Table,
} from "./test-helpers.js";

afterEach(() => setRandomSource(Math.random));

const warrior = (): ClassCard => ({
  id: "cls-w", cardId: "cl-warrior", name: "Warrior", type: "class", deck: "door", className: "Warrior", effectText: "",
});
const mateCard = (): MateCard => ({ id: "mate-1", cardId: "c-mate", name: "Mate", type: "mate", deck: "door" });
const dungeon = (cardId: string): DungeonCard => ({ id: `dg-${cardId}`, cardId, name: cardId, type: "dungeon", deck: "dungeon", effectText: "" });

/** Player 0 looks for trouble with a monster of the given level. */
const fight = (t: Table, level: number, badStuff?: Parameters<typeof monster>[1]) => {
  const m = monster(level, badStuff);
  t.player(0).hand.push(m);
  t.room.currentPhase = 2;
  expect(t.act(0, { type: "lookForTrouble", cardId: m.id })).toBeNull();
  return m;
};

const passAll = (t: Table) => {
  for (const id of requiredPasses(t.room)) expect(handleAction(t.room, id, { type: "pass" }).error).toBeNull();
};

describe("sessions", () => {
  it("reconnects by token, even under a different name", () => {
    const t = startedTable(2);
    setConnected(t.room, t.ids[0], false);
    const r = joinRoom(t.rooms, { name: "Someone", roomCode: "test", token: t.tokens[0] });
    expect(r.ok && r.playerId).toBe(t.ids[0]);
    expect(t.player(0).connected).toBe(true);
  });

  it("refuses to hand a connected player's seat to someone using their name", () => {
    const t = startedTable(2);
    const r = joinRoom(t.rooms, { name: "ANN", roomCode: "TEST" });
    expect(r.ok).toBe(false);
  });

  it("lets an offline player reclaim their seat by name and rotates the token", () => {
    const t = startedTable(2);
    setConnected(t.room, t.ids[0], false);
    const r = joinRoom(t.rooms, { name: "ann", roomCode: "TEST" });
    if (!r.ok) throw new Error(r.error);
    expect(r.playerId).toBe(t.ids[0]);
    expect(r.token).not.toBe(t.tokens[0]);

    setConnected(t.room, t.ids[0], false);
    const stale = joinRoom(t.rooms, { name: "Zed", roomCode: "TEST", token: t.tokens[0] });
    expect(stale.ok).toBe(false);
  });

  it("does not let new players join a running game", () => {
    const t = startedTable(2);
    expect(joinRoom(t.rooms, { name: "Late", roomCode: "TEST" }).ok).toBe(false);
  });

  it("never exposes session tokens or other players' hands in a view", () => {
    const t = startedTable(2);
    t.player(1).hand.push(oneShot(3));
    const json = JSON.stringify(buildView(t.room, t.ids[0]));
    for (const tok of t.tokens) expect(json).not.toContain(tok);
    expect(json).not.toContain(t.player(1).hand[0].id);
  });
});

describe("exploits", () => {
  it("does not count a duplicated card twice when selling", () => {
    const t = startedTable(2);
    const gear = equipment(1, 600);
    t.player(0).hand.push(gear);
    expect(t.act(0, { type: "sell", cardIds: [gear.id, gear.id] })).toMatch(/1000/);
    expect(t.player(0).level).toBe(1);
    expect(t.player(0).hand).toContain(gear);
  });

  it("refuses to sell cards the player does not own", () => {
    const t = startedTable(2);
    const theirs = equipment(1, 1000);
    t.player(1).hand.push(theirs);
    expect(t.act(0, { type: "sell", cardIds: [theirs.id] })).not.toBeNull();
    expect(t.player(1).hand).toContain(theirs);
  });

  it("sells owned items for levels and discards them", () => {
    const t = startedTable(2);
    const a = equipment(1, 500), b = equipment(1, 500, "feet");
    t.player(0).hand.push(a);
    t.player(0).backpack.push(b);
    expect(t.act(0, { type: "sell", cardIds: [a.id, b.id] })).toBeNull();
    expect(t.player(0).level).toBe(2);
    expect(t.room.discards.treasure).toEqual(expect.arrayContaining([a, b]));
  });

  it("rejects duplicated cards in charity", () => {
    const t = startedTable(2);
    const cards = Array.from({ length: 7 }, () => oneShot(1));
    t.player(0).hand.push(...cards);
    expect(t.act(0, { type: "endTurn" })).toBeNull();
    expect(t.room.status).toBe("charitySelection");
    expect(t.act(0, { type: "charityGive", cardIds: [cards[0].id, cards[0].id], toId: t.ids[1] })).not.toBeNull();
    expect(t.act(0, { type: "charityGive", cardIds: [cards[0].id, cards[1].id], toId: t.ids[1] })).toBeNull();
    expect(t.player(1).hand).toHaveLength(2);
    expect(t.room.activePlayerIndex).toBe(1);
  });

  it("rejects asking yourself or a non-existent player for help", () => {
    const t = startedTable(2);
    fight(t, 3);
    expect(t.act(0, { type: "askForHelp", helperId: t.ids[0], treasures: 1 })).toMatch(/Invalid helper/);
    expect(t.act(0, { type: "askForHelp", helperId: "nobody", treasures: 1 })).toMatch(/Invalid helper/);
  });

  it("does not put a Mate clone into the discard pile", () => {
    const t = startedTable(2);
    const m = fight(t, 1);
    t.player(1).hand.push(mateCard());
    expect(t.act(1, { type: "playInCombat", cardId: "mate-1" })).toBeNull();
    t.player(0).level = 9;
    passAll(t);
    expect(t.act(0, { type: "resolveCombat" })).toBeNull();
    expect(t.room.discards.door.filter(c => c.id.includes("-mate-"))).toHaveLength(0);
    expect(t.room.discards.door.filter(c => c.id === m.id)).toHaveLength(1);
  });

  it("does not duplicate a monster played in via the Undead dungeon", () => {
    const t = startedTable(2);
    t.room.activeDungeons.push(dungeon("d-undead"));
    fight(t, 1);
    const extra = monster(1);
    t.player(1).hand.push(extra);
    expect(t.act(1, { type: "playInCombat", cardId: extra.id })).toBeNull();
    expect(t.room.discards.door.filter(c => c.id === extra.id)).toHaveLength(0);
    t.player(0).level = 9;
    passAll(t);
    t.act(0, { type: "resolveCombat" });
    expect(t.room.discards.door.filter(c => c.id === extra.id)).toHaveLength(1);
  });

  it("rolls back a forced equipment swap that fails", () => {
    const t = startedTable(2);
    const p = t.player(0);
    p.playerClass = warrior();
    const boots = equipment(2, 400, "feet");
    p.equipment.feet = boots;
    const kneepads = equipment(0, 0, "feet", { cardId: "e-kneepads" });
    p.hand.push(kneepads);
    expect(t.act(0, { type: "equip", cardId: kneepads.id, forceSwap: true })).toMatch(/Warriors/);
    expect(p.equipment.feet).toBe(boots);
    expect(p.backpack).toHaveLength(0);
  });
});

describe("combat flow", () => {
  it("does not deadlock when a non-fighter disconnects", () => {
    const t = startedTable(3);
    t.player(0).level = 5;
    fight(t, 1);
    expect(t.act(1, { type: "pass" })).toBeNull();
    expect(t.room.status).toBe("waitingForInterrupts");
    setConnected(t.room, t.ids[2], false);
    expect(t.room.status).toBe("inCombat");
    expect(t.act(0, { type: "resolveCombat" })).toBeNull();
    expect(t.room.combat).toBeNull();
    expect(t.player(0).level).toBe(6);
  });

  it("re-opens the interrupt window when a non-fighter reconnects", () => {
    const t = startedTable(3);
    fight(t, 1);
    t.act(1, { type: "pass" });
    setConnected(t.room, t.ids[2], false);
    expect(t.room.status).toBe("inCombat");
    setConnected(t.room, t.ids[2], true);
    expect(t.room.status).toBe("waitingForInterrupts");
  });

  it("locks the combat once it is lost", () => {
    const t = startedTable(2);
    fight(t, 20);
    passAll(t);
    expect(t.act(0, { type: "resolveCombat" })).toBeNull();
    expect(t.room.status).toBe("runAwayRoll");
    const potion = oneShot(30);
    t.player(0).hand.push(potion);
    expect(t.act(0, { type: "playInCombat", cardId: potion.id, side: "attacker" })).toMatch(/decided/);
    expect(t.act(0, { type: "resolveCombat" })).toMatch(/decided/);
    expect(t.act(0, { type: "endTurn" })).not.toBeNull();
    expect(t.act(0, { type: "askForHelp", helperId: t.ids[1], treasures: 1 })).toMatch(/decided/);
  });

  it("allows each fighter exactly one run-away roll", () => {
    const t = startedTable(2);
    fight(t, 20);
    t.act(0, { type: "askForHelp", helperId: t.ids[1], treasures: 0 });
    const offer = t.room.negotiations[0];
    expect(t.act(1, { type: "respondHelp", offerId: offer.id, accept: true })).toBeNull();
    t.act(0, { type: "resolveCombat" });
    expect(t.room.status).toBe("runAwayRoll");
    fixRandom(ROLL_6);
    expect(t.act(0, { type: "runAway" })).toBeNull();
    expect(t.act(0, { type: "runAway" })).toMatch(/already/);
    expect(t.act(1, { type: "runAway" })).toBeNull();
    expect(t.room.combat).toBeNull();
    expect(t.room.status).toBe("normalTurn");
    expect(t.room.currentPhase).toBe(3);
  });

  it("resumes the run-away after a dying helper's body is looted", () => {
    const t = startedTable(3);
    t.player(0).level = 3;
    fight(t, 20, { kind: "death" });
    t.act(0, { type: "askForHelp", helperId: t.ids[1], treasures: 0 });
    t.act(1, { type: "respondHelp", offerId: t.room.negotiations[0].id, accept: true });
    passAll(t);
    t.act(0, { type: "resolveCombat" });
    t.player(1).hand.push(oneShot(1), oneShot(2));

    fixRandom(ROLL_1);
    expect(t.act(1, { type: "runAway" })).toBeNull();
    expect(t.player(1).isDead).toBe(true);
    expect(t.room.status).toBe("looting");
    expect(t.room.looting?.orderQueue).toEqual([t.ids[0], t.ids[2]]);

    for (const idx of [0, 2]) {
      const card = t.room.looting!.pile[0];
      expect(t.act(idx, { type: "lootBody", cardId: card.id })).toBeNull();
    }
    expect(t.room.looting).toBeNull();
    expect(t.room.status).toBe("runAwayRoll");

    fixRandom(ROLL_6);
    expect(t.act(0, { type: "runAway" })).toBeNull();
    expect(t.room.combat).toBeNull();
    expect(t.room.status).toBe("normalTurn");
  });

  it("advances the turn for the player who actually died, not the first dead player", () => {
    const t = startedTable(3);
    t.room.activePlayerIndex = 2;
    t.player(0).isDead = true;
    t.player(2).hand.push(oneShot(1));
    const death = curse({ kind: "death" });
    t.player(1).hand.push(death);
    expect(t.act(1, { type: "castCurse", cardId: death.id, targetId: t.ids[2] })).toBeNull();
    expect(t.room.looting?.orderQueue).toEqual([t.ids[1]]);
    expect(t.act(1, { type: "lootBody", cardId: t.room.looting!.pile[0].id })).toBeNull();
    expect(t.room.activePlayerIndex).toBe(1);
    expect(t.room.status).toBe("normalTurn");
    expect(t.player(2).isDead).toBe(false);
  });

  it("keeps a curse in the backpack when the target does not exist", () => {
    const t = startedTable(2);
    const c = curse({ kind: "loseLevel", amount: 1 });
    t.player(0).backpack.push(c);
    expect(t.act(0, { type: "castCurse", cardId: c.id, targetId: "ghost" })).not.toBeNull();
    expect(t.player(0).backpack).toContain(c);
    expect(t.player(0).hand).not.toContain(c);
  });

  it("only reaches level 10 through combat", () => {
    const t = startedTable(2);
    t.player(0).level = 9;
    t.player(0).hand.push({ id: "up", cardId: "go-up", name: "Go Up a Level", type: "go-up-a-level", deck: "treasure", goldValue: 0 });
    expect(t.act(0, { type: "playCard", cardId: "up" })).not.toBeNull();
    fight(t, 1);
    passAll(t);
    t.act(0, { type: "resolveCombat" });
    expect(t.room.status).toBe("gameOver");
    expect(t.room.winnerId).toBe(t.ids[0]);
    expect(t.act(1, { type: "kickDoor" })).toMatch(/over/);
  });
});

// ---------- property-based fuzzing ----------
// Interleaves random (mostly illegal) actions from every player with the canonical
// "move the game forward" action. Invariants checked after every step:
//   • conservation: the exact multiset of cards never changes
//   • consistency: status, combat, looting and charity always agree
//   • liveness: the canonical progress action is always accepted

const progressAction = (room: Room, rnd: () => number): { playerId: string; msg: GameAction } | null => {
  const active = room.players[room.activePlayerIndex];
  switch (room.status) {
    case "waitingForInterrupts":
    case "inCombat": {
      const c = room.combat!;
      const waiting = requiredPasses(room).find(id => !c.passes[id]);
      return waiting ? { playerId: waiting, msg: { type: "pass" } } : { playerId: c.attackerId, msg: { type: "resolveCombat" } };
    }
    case "runAwayRoll": {
      const c = room.combat!;
      const fighter = [c.attackerId, c.helperId].find(id => id && !c.ranAway?.includes(id)
        && !room.players.find(p => p.id === id)?.isDead);
      return fighter ? { playerId: fighter, msg: { type: "runAway" } } : null;
    }
    case "looting": {
      const l = room.looting!;
      return { playerId: l.orderQueue[0], msg: { type: "lootBody", cardId: l.pile[0].id } };
    }
    case "charitySelection": {
      const ch = room.charity!;
      const giver = room.players.find(p => p.id === ch.fromId)!;
      const toId = ch.candidates[Math.floor(rnd() * ch.candidates.length)];
      return { playerId: giver.id, msg: { type: "charityGive", cardIds: giver.hand.slice(0, ch.cardCount).map(c => c.id), toId } };
    }
    case "normalTurn":
      if (room.currentPhase === 1 && room.decks.door.length + room.discards.door.length > 0) return { playerId: active.id, msg: { type: "kickDoor" } };
      if ((room.currentPhase === 2 || room.currentPhase === 3) && !room.combatFought) return { playerId: active.id, msg: { type: "lootRoom" } };
      return { playerId: active.id, msg: { type: "endTurn" } };
    default:
      return null;
  }
};

const chaosAction = (room: Room, rnd: () => number): { playerId: string; msg: GameAction } => {
  const pick = <T,>(xs: T[]): T | undefined => xs[Math.floor(rnd() * xs.length)];
  const p = pick(room.players)!;
  const other = pick(room.players)!;
  const mine = [...p.hand, ...p.backpack];
  const card = pick(mine)?.id ?? "none";
  const card2 = pick(mine)?.id ?? "none";
  const theirGear = pick([other.equipment.head, other.equipment.feet, ...other.equipment.hands].filter(Boolean))?.id;
  const actions: GameAction[] = [
    { type: "playInCombat", cardId: card, side: rnd() < 0.5 ? "attacker" : "monster", extraCardId: card2 },
    { type: "equip", cardId: card, forceSwap: rnd() < 0.5 },
    { type: "equip", cardId: card, forceSwap: rnd() < 0.5, forgedPapersId: pick(p.hand.filter(c => c.type === "forged-papers"))?.id ?? card2 },
    { type: "unequip", cardId: pick(p.equipment.hands)?.id ?? card },
    { type: "toBackpack", cardId: card },
    { type: "sell", cardIds: [card, card2, card] },
    { type: "discard", cardId: card },
    { type: "playCard", cardId: card },
    { type: "castCurse", cardId: card, targetId: other.id },
    { type: "askForHelp", helperId: other.id, treasures: Math.floor(rnd() * 3) },
    { type: "respondHelp", offerId: pick(room.negotiations)?.id ?? "none", accept: rnd() < 0.7 },
    { type: "flee" },
    { type: "forceHelp", targetId: other.id },
    { type: "lookForTrouble", cardId: card },
    { type: "useClassAbility", ability: pick(["berserk", "backstab", "steal", "charm", "resurrect"] as const)!, cardIds: [card, card2], targetId: other.id, monsterId: room.combat?.monsters[0]?.id, targetCardId: theirGear },
    { type: "pass" },
    { type: "runAway", discardId: card },
    { type: "endTurn" },
    { type: "removeEffect", cardId: card, targetId: other.id, effectId: pick(other.effects)?.id ?? "none" },
    { type: "sacrificeCompanion" },
    { type: "askForHelp", helperId: other.id, treasures: 1, itemIds: [card, card2].filter(x => x !== "none") },
    { type: "proposeTrade", toId: other.id, give: rnd() < 0.5 ? [card] : [card, card2], take: theirGear ? [theirGear] : [] },
    { type: "respondTrade", tradeId: pick(room.trades)?.id ?? "none", accept: rnd() < 0.7 },
    { type: "cancelTrade", tradeId: pick(room.trades)?.id ?? "none" },
    { type: "payToll", cardIds: [card, card2] },
    { type: "useClassAbility", ability: "cleanse", cardIds: [card, card2], targetId: other.id, effectId: pick(other.effects)?.id },
  ];
  return { playerId: p.id, msg: pick(actions)! };
};

const assertInvariants = (room: Room, universe: string[], step: string) => {
  const now = allCardIds(room);
  expect(new Set(now).size, `duplicate card after ${step}`).toBe(now.length);
  expect([...now].sort(), `card conservation after ${step}`).toEqual(universe);

  const s = room.status;
  if (s === "waitingForInterrupts" || s === "inCombat" || s === "runAwayRoll") expect(room.combat, `${s} without combat after ${step}`).not.toBeNull();
  expect(s === "looting", `looting mismatch after ${step}`).toBe(room.looting !== null);
  expect(s === "charitySelection", `charity mismatch after ${step}`).toBe(room.charity !== null);
  if (room.combat) expect(["waitingForInterrupts", "inCombat", "runAwayRoll", "looting", "gameOver"], `combat during ${s} after ${step}`).toContain(s);
  for (const p of room.players) {
    expect(p.level).toBeGreaterThanOrEqual(1);
    expect(p.level).toBeLessThanOrEqual(10);
    expect(p.handCount).toBe(p.hand.length);
  }
};

// FUZZ_SEEDS=500 npm test  → deeper search before a release.
const FUZZ_SEEDS = Number(process.env.FUZZ_SEEDS ?? 25);

describe("fuzz: conservation, consistency and liveness", () => {
  for (let seed = 1; seed <= FUZZ_SEEDS; seed++) {
    it(`seed ${seed}`, () => {
      const rnd = seeded(seed);
      setRandomSource(seeded(seed * 7919));
      const rooms = new Map<string, Room>();
      const ids: string[] = [];
      const n = 2 + (seed % 9); // 2-10 players: covers doubled decks too
      for (let i = 0; i < n; i++) {
        const r = joinRoom(rooms, { name: `P${i}`, roomCode: "FUZZ" });
        if (!r.ok) throw new Error(r.error);
        ids.push(r.playerId);
      }
      const room = rooms.get("FUZZ")!;
      expect(handleAction(room, ids[0], { type: "startGame" }).error).toBeNull();
      const universe = [...allCardIds(room)].sort();

      let turns = 0;
      for (let step = 0; step < 1500 && room.status !== "gameOver"; step++) {
        if (rnd() < 0.05) {
          const p = room.players[Math.floor(rnd() * room.players.length)];
          setConnected(room, p.id, !p.connected);
        }
        if (rnd() < 0.5) {
          const { playerId, msg } = chaosAction(room, rnd);
          handleAction(room, playerId, msg);
          assertInvariants(room, universe, `chaos ${msg.type} (step ${step})`);
        }
        const prog = progressAction(room, rnd);
        if (!prog) continue;
        const before = room.activePlayerIndex;
        const err = handleAction(room, prog.playerId, prog.msg).error;
        expect(err, `progress ${prog.msg.type} rejected in ${room.status} (step ${step})`).toBeNull();
        if (room.activePlayerIndex !== before) turns++;
        assertInvariants(room, universe, `progress ${prog.msg.type} (step ${step})`);
      }
      expect(turns).toBeGreaterThan(5);
    });
  }
});
