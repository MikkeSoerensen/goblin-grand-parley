// @vitest-environment node
import { describe, expect, it } from "vitest";

import { parseClientMessage } from "./protocol.js";

describe("parseClientMessage", () => {
  it("accepts well-formed messages", () => {
    expect(parseClientMessage({ type: "join", name: " Ann ", roomCode: "abc12" })).toEqual({
      ok: true, msg: { type: "join", name: "Ann", roomCode: "abc12" },
    });
    expect(parseClientMessage({ type: "sell", cardIds: ["c1", "c2"] }).ok).toBe(true);
    expect(parseClientMessage({ type: "equip", cardId: "c1", forceSwap: true }).ok).toBe(true);
    expect(parseClientMessage({ type: "watch", roomCode: "TV1" }).ok).toBe(true);
  });

  it.each([
    ["not an object", "hello"],
    ["null", null],
    ["unknown type", { type: "giveMeLevels" }],
    ["missing field", { type: "discard" }],
    ["wrong field type", { type: "discard", cardId: 42 }],
    ["empty name", { type: "join", name: "   ", roomCode: "ABC" }],
    ["name too long", { type: "join", name: "x".repeat(21), roomCode: "ABC" }],
    ["room code with symbols", { type: "join", name: "Ann", roomCode: "../etc" }],
    ["negative treasures", { type: "askForHelp", helperId: "p1", treasures: -3 }],
    ["fractional treasures", { type: "askForHelp", helperId: "p1", treasures: 1.5 }],
    ["huge id list", { type: "sell", cardIds: Array.from({ length: 1000 }, (_, i) => `c${i}`) }],
    ["empty sell", { type: "sell", cardIds: [] }],
    ["oversized id", { type: "discard", cardId: "x".repeat(65) }],
    ["unknown ability", { type: "useClassAbility", ability: "nuke", cardIds: [] }],
  ])("rejects %s", (_label, raw) => {
    const r = parseClientMessage(raw);
    expect(r.ok).toBe(false);
  });
});
