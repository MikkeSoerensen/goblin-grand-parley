// @vitest-environment node
// Phase 4: The Grand Parley — trades, item bribes and the toll.
import { afterEach, describe, expect, it } from "vitest";

import { tollPrice } from "../shared/rules.js";
import type { ForgedPapersCard, MonsterCard } from "../shared/types.js";
import { buildView, handleAction, requiredPasses, setRandomSource } from "./engine.js";
import { ROLL_6, allCardIds, equipment, fixRandom, monster, oneShot, startedTable, type Table } from "./test-helpers.js";

afterEach(() => setRandomSource(Math.random));

const valuable = (gold: number) => { const o = oneShot(1); o.goldValue = gold; return o; };
const fight = (t: Table, level: number, extra: Partial<MonsterCard> = {}, badStuff?: Parameters<typeof monster>[1]) => {
  t.room.settings.threat = "calm";
  const m = monster(level, badStuff, extra);
  t.player(0).hand.push(m);
  t.room.currentPhase = 2;
  expect(t.act(0, { type: "lookForTrouble", cardId: m.id })).toBeNull();
  return m;
};
const passAll = (t: Table) => {
  for (const id of requiredPasses(t.room)) handleAction(t.room, id, { type: "pass" });
};
const sortedIds = (t: Table) => [...allCardIds(t.room)].sort();

describe("trades", () => {
  it("swaps valuable cards atomically: equipment to the backpack, the rest to the hand", () => {
    const t = startedTable(2);
    const potion = valuable(300), spare = equipment(2, 400, "head");
    t.player(0).hand.push(potion);
    t.player(0).backpack.push(spare);
    const sword = equipment(3, 600, "hand");
    t.player(1).equipment.hands.push(sword);
    const before = sortedIds(t);

    expect(t.act(0, { type: "proposeTrade", toId: t.ids[1], give: [potion.id, spare.id], take: [sword.id] })).toBeNull();
    const trade = t.room.trades[0];
    expect(t.act(1, { type: "respondTrade", tradeId: trade.id, accept: true })).toBeNull();

    expect(t.player(0).backpack).toContain(sword);
    expect(t.player(1).hand).toContain(potion);
    expect(t.player(1).backpack).toContain(spare);
    expect(t.player(1).equipment.hands).toHaveLength(0);
    expect(t.room.trades).toHaveLength(0);
    expect(t.room.stats.trades).toBe(1);
    expect(sortedIds(t)).toEqual(before); // nothing created or lost
  });

  it("is private to the two players, who see the actual cards", () => {
    const t = startedTable(3);
    const potion = valuable(300);
    t.player(0).hand.push(potion);
    t.act(0, { type: "proposeTrade", toId: t.ids[1], give: [potion.id], take: [] });
    expect(buildView(t.room, t.ids[2]).trades).toHaveLength(0);
    expect(buildView(t.room, t.ids[1]).trades[0].giveCards.map(c => c.id)).toEqual([potion.id]);
    expect(JSON.stringify(buildView(t.room, t.ids[2]))).not.toContain(potion.id);
  });

  it.each([
    ["a worthless card", (t: Table) => { const z = equipment(1, 0, "head"); t.player(0).hand.push(z); return { give: [z.id], take: [] as string[] }; }, /ingen guldværdi/],
    ["the other player's hidden cards", (t: Table) => { const h = valuable(300); t.player(1).hand.push(h); return { give: [] as string[], take: [h.id] }; }, /har ikke den genstand på/],
    ["nothing at all", () => ({ give: [] as string[], take: [] as string[] }), /mindst ét/],
    ["the same card twice", (t: Table) => { const p = valuable(300); t.player(0).hand.push(p); return { give: [p.id, p.id], take: [] as string[] }; }, /to gange/],
  ])("refuses offering %s", (_label, setup, error) => {
    const t = startedTable(2);
    const { give, take } = setup(t);
    expect(t.act(0, { type: "proposeTrade", toId: t.ids[1], give, take })).toMatch(error);
  });

  it("only happens outside fights", () => {
    const t = startedTable(2);
    fight(t, 1);
    const potion = valuable(300);
    t.player(0).hand.push(potion);
    expect(t.act(0, { type: "proposeTrade", toId: t.ids[1], give: [potion.id], take: [] })).toMatch(/uden for kampe/);
  });

  it("falls through if a card moved in the meantime", () => {
    const t = startedTable(2);
    const potion = valuable(300);
    t.player(0).hand.push(potion);
    t.act(0, { type: "proposeTrade", toId: t.ids[1], give: [potion.id], take: [] });
    t.act(0, { type: "discard", cardId: potion.id });
    expect(t.act(1, { type: "respondTrade", tradeId: t.room.trades[0].id, accept: true })).toMatch(/faldt til jorden/);
    expect(t.room.trades).toHaveLength(0);
  });

  it("can be declined or cancelled, and is capped at 3 open offers", () => {
    const t = startedTable(2);
    const cards = Array.from({ length: 4 }, () => valuable(100));
    t.player(0).hand.push(...cards);
    for (const c of cards.slice(0, 3)) expect(t.act(0, { type: "proposeTrade", toId: t.ids[1], give: [c.id], take: [] })).toBeNull();
    expect(t.act(0, { type: "proposeTrade", toId: t.ids[1], give: [cards[3].id], take: [] })).toMatch(/3 åbne/);
    expect(t.act(1, { type: "cancelTrade", tradeId: t.room.trades[0].id })).toMatch(/intet sådant handelstilbud/);
    expect(t.act(0, { type: "cancelTrade", tradeId: t.room.trades[0].id })).toBeNull();
    expect(t.act(1, { type: "respondTrade", tradeId: t.room.trades[0].id, accept: false })).toBeNull();
    expect(t.room.trades).toHaveLength(1);
    expect(t.player(0).hand).toHaveLength(4);
  });

  it("forged papers travel with the traded item", () => {
    const t = startedTable(2);
    const papers: ForgedPapersCard = { id: "fp", cardId: "t-forged-papers", name: "Forged Guild Papers", type: "forged-papers", deck: "treasure", goldValue: 0, effectText: "" };
    const axe = equipment(3, 800, "twoHands", { classReq: "Warrior", forgedWith: papers });
    t.player(1).equipment.hands.push(axe);
    const potion = valuable(300);
    t.player(0).hand.push(potion);
    t.act(0, { type: "proposeTrade", toId: t.ids[1], give: [potion.id], take: [axe.id] });
    t.act(1, { type: "respondTrade", tradeId: t.room.trades[0].id, accept: true });
    const received = t.player(0).backpack[0];
    expect(received.type === "equipment" ? received.forgedWith?.id : undefined).toBe("fp");
  });
});

describe("bribes for help", () => {
  it("items change hands on accepting and stay with the helper even if the fight is lost", () => {
    const t = startedTable(3);
    fight(t, 20);
    const bribe = equipment(2, 500, "feet");
    t.player(0).backpack.push(bribe);
    expect(t.act(0, { type: "askForHelp", helperId: t.ids[1], treasures: 0, itemIds: [bribe.id] })).toBeNull();
    const view = buildView(t.room, t.ids[2]);
    expect(view.negotiations[0].items.map(c => c.id)).toEqual([bribe.id]); // the whole table sees the bribe
    expect(t.act(1, { type: "respondHelp", offerId: t.room.negotiations[0].id, accept: true })).toBeNull();
    expect(t.player(1).backpack).toContain(bribe);
    expect(t.room.stats.bribes).toBe(1);
    passAll(t);
    t.act(0, { type: "resolveCombat" });
    fixRandom(ROLL_6);
    t.act(0, { type: "runAway" });
    t.act(1, { type: "runAway" });
    expect(t.player(1).backpack).toContain(bribe);
  });

  it("refuses bribing with cards you don't own, and voids the deal if they're gone", () => {
    const t = startedTable(2);
    fight(t, 20);
    const theirs = valuable(300);
    t.player(1).hand.push(theirs);
    expect(t.act(0, { type: "askForHelp", helperId: t.ids[1], treasures: 0, itemIds: [theirs.id] })).toMatch(/har ikke det kort/);

    const mine = valuable(300);
    t.player(0).hand.push(mine);
    t.act(0, { type: "askForHelp", helperId: t.ids[1], treasures: 0, itemIds: [mine.id] });
    t.player(0).hand = t.player(0).hand.filter(c => c.id !== mine.id);
    t.room.discards.treasure.push(mine);
    expect(t.act(1, { type: "respondHelp", offerId: t.room.negotiations[0].id, accept: true })).toMatch(/ikke længere/);
    expect(t.room.combat!.helperId).toBeNull();
  });
});

describe("toll", () => {
  it("follows the agreed staircase", () => {
    expect([1, 6, 7, 8, 10, 12, 14, 16, 17].map(tollPrice)).toEqual([500, 500, 800, 1100, 1700, 2900, 4100, 5300, null]);
  });

  it("buys your way past a fight: no level, no Bad Stuff, payment discarded, counts as a fight", () => {
    const t = startedTable(2);
    fight(t, 8, {}, { kind: "death" });
    const a = equipment(1, 600, "head"), b = valuable(500);
    t.player(0).backpack.push(a);
    t.player(0).hand.push(b);
    const before = sortedIds(t);
    expect(t.act(0, { type: "payToll", cardIds: [a.id, b.id] })).toBeNull();
    expect(t.room.combat).toBeNull();
    expect(t.room.status).toBe("normalTurn");
    expect(t.room.currentPhase).toBe(3);
    expect(t.player(0).level).toBe(1);
    expect(t.player(0).isDead).toBe(false);
    expect(t.room.discards.treasure).toEqual(expect.arrayContaining([a, b]));
    expect(sortedIds(t)).toEqual(before);
    expect(t.act(0, { type: "lootRoom" })).toMatch(/allerede kæmpet/);
  });

  it("prices the fight's total, so enhancers make escaping dearer", () => {
    const t = startedTable(2);
    fight(t, 6);
    const ancient = { ...oneShot(5), type: "enhancer" as const, target: "monster" as const };
    t.player(1).hand.push(ancient);
    t.act(1, { type: "playInCombat", cardId: ancient.id, side: "monster" }); // 6 → 11: price 2300g
    const coin = valuable(1700);
    t.player(0).hand.push(coin);
    expect(t.act(0, { type: "payToll", cardIds: [coin.id] })).toMatch(/2300g/);
  });

  it("refuses bosses, fights over 16 and decided fights", () => {
    const boss = startedTable(2);
    fight(boss, 10, { antiClass: { className: "Warrior", bonus: 5 } });
    const c1 = valuable(5000);
    boss.player(0).hand.push(c1);
    expect(boss.act(0, { type: "payToll", cardIds: [c1.id] })).toMatch(/boss/);

    const big = startedTable(2);
    fight(big, 17);
    const c2 = valuable(9000);
    big.player(0).hand.push(c2);
    expect(big.act(0, { type: "payToll", cardIds: [c2.id] })).toMatch(/for stor/);

    const late = startedTable(2);
    fight(late, 12);
    passAll(late);
    late.act(0, { type: "resolveCombat" });
    const c3 = valuable(9000);
    late.player(0).hand.push(c3);
    expect(late.act(0, { type: "payToll", cardIds: [c3.id] })).toMatch(/For sent/);
  });
});

describe("highlights (the table's event strip)", () => {
  it("shouts the social moments to everyone, with increasing ids", () => {
    const t = startedTable(3);
    const potion = valuable(300);
    t.player(0).hand.push(potion);
    t.act(0, { type: "proposeTrade", toId: t.ids[1], give: [potion.id], take: [] });
    t.act(1, { type: "respondTrade", tradeId: t.room.trades[0].id, accept: true });
    const seenByBystander = buildView(t.room, t.ids[2]).highlights;
    expect(seenByBystander.at(-1)?.text).toMatch(/handler:/);
    const ids = seenByBystander.map(h => h.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });

  it("does not shout routine bookkeeping, and keeps only the latest", () => {
    const t = startedTable(2);
    const before = t.room.highlights.length;
    const gear = equipment(1, 300, "head");
    t.player(0).hand.push(gear);
    t.act(0, { type: "equip", cardId: gear.id });
    expect(t.room.highlights.length).toBe(before);

    for (let i = 0; i < 30; i++) {
      const p = valuable(100);
      t.player(0).hand.push(p);
      t.act(0, { type: "proposeTrade", toId: t.ids[1], give: [p.id], take: [] });
      t.act(1, { type: "respondTrade", tradeId: t.room.trades[0].id, accept: true });
    }
    expect(t.room.highlights.length).toBe(20);
    expect(buildView(t.room, t.ids[0]).highlights).toHaveLength(10);
  });
});
