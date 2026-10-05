// @vitest-environment node
// Whole bot games through the real engine: every game must end with a winner, never get stuck.
import { describe, expect, it } from "vitest";

import { playGame } from "./simulate.js";

describe("bot games", () => {
  for (const players of [2, 4, 6, 8]) {
    it(`${players} players: 15 complete games, none stuck`, () => {
      for (let i = 0; i < 15; i++) {
        const r = playGame(players, 1000 + players * 100 + i);
        expect(r.stuck, `game ${i} got stuck`).toBe(false);
        expect(r.finished, `game ${i} hit the turn cap`).toBe(true);
        expect(r.winnerClass).not.toBeNull();
      }
    }, 60_000);
  }
});
