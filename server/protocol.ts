// Runtime validation of every client → server message.
// Anything that does not match is rejected before it reaches the engine.

import { z } from "zod";
import type { ClientToServer } from "../shared/types.js";

const id = z.string().min(1).max(64);
const ids = z.array(id).max(60);
const name = z.string().trim().min(1).max(20);

const schema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("join"),
    name,
    roomCode: z.string().trim().regex(/^[A-Za-z0-9]{1,12}$/, "Room code must be 1-12 letters or digits."),
    token: z.string().min(1).max(128).optional(),
  }),
  z.object({ type: z.literal("startGame") }),
  z.object({ type: z.literal("kickDoor") }),
  z.object({ type: z.literal("lookForTrouble"), cardId: id }),
  z.object({ type: z.literal("lootRoom") }),
  z.object({ type: z.literal("endTurn") }),
  z.object({ type: z.literal("unequip"), cardId: id }),
  z.object({ type: z.literal("toBackpack"), cardId: id }),
  z.object({ type: z.literal("sell"), cardIds: ids.min(1) }),
  z.object({ type: z.literal("discard"), cardId: id }),
  z.object({
    type: z.literal("playInCombat"),
    cardId: id,
    side: z.enum(["attacker", "monster"]).optional(),
    extraCardId: id.optional(),
  }),
  z.object({ type: z.literal("askForHelp"), helperId: id, treasures: z.number().int().min(0).max(50) }),
  z.object({ type: z.literal("respondHelp"), offerId: id, accept: z.boolean() }),
  z.object({ type: z.literal("pass") }),
  z.object({ type: z.literal("resolveCombat") }),
  z.object({ type: z.literal("runAway"), discardId: id.optional() }),
  z.object({ type: z.literal("cowardlyFlee") }),
  z.object({ type: z.literal("lootBody"), cardId: id }),
  z.object({ type: z.literal("charityGive"), cardIds: ids, toId: id }),
  z.object({ type: z.literal("rename"), name }),
  z.object({ type: z.literal("flee") }),
  z.object({ type: z.literal("playCard"), cardId: id, targetId: id.optional() }),
  z.object({ type: z.literal("equip"), cardId: id, forceSwap: z.boolean().optional() }),
  z.object({ type: z.literal("castCurse"), cardId: id, targetId: id }),
  z.object({
    type: z.literal("useClassAbility"),
    ability: z.enum(["berserk", "backstab", "steal", "charm", "resurrect"]),
    cardIds: ids,
    targetId: id.optional(),
    monsterId: id.optional(),
    targetCardId: id.optional(),
  }),
  z.object({ type: z.literal("forceHelp"), targetId: id }),
  z.object({ type: z.literal("suddenSwap") }),
  z.object({
    type: z.literal("updateSettings"),
    settings: z.object({
      winLevel: z.union([z.literal(10), z.literal(15), z.literal(20)]).optional(),
      interruptSeconds: z.union([z.literal(0), z.literal(10), z.literal(15), z.literal(30)]).optional(),
    }).strict(),
  }),
]);

// Compile-time guarantee that the schema and the wire type never drift apart.
type Parsed = z.infer<typeof schema>;
type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _schemaMatchesProtocol: AssertEqual<Parsed, ClientToServer> = true;
void _schemaMatchesProtocol;

export type ParseResult = { ok: true; msg: ClientToServer } | { ok: false; error: string };

export const parseClientMessage = (raw: unknown): ParseResult => {
  const r = schema.safeParse(raw);
  if (r.success) return { ok: true, msg: r.data };
  const issue = r.error.issues[0];
  return { ok: false, error: issue ? `Invalid message: ${issue.message}` : "Invalid message." };
};
