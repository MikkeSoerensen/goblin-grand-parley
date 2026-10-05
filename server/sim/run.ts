// npm run simulate -- [--games 500] [--players 4,6] [--seed 1] [--out docs/balance/baseline.md]
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

import { formatReport, runBatch } from "./simulate.js";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const games = Number(arg("games", "500"));
const playerCounts = arg("players", "4,6").split(",").map(Number);
const seed = Number(arg("seed", "1"));
const out = arg("out", "");

const started = Date.now();
const summaries = playerCounts.map(n => runBatch(n, games, seed));
const report = formatReport(summaries, `Balance-simulering (${games} spil pr. antal spillere, seed ${seed})`);
console.log(report);
console.log(`(${((Date.now() - started) / 1000).toFixed(1)} s)`);
if (out) {
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, report, "utf8");
  console.log(`Gemt i ${out}`);
}
if (summaries.some(s => s.stuck > 0)) process.exitCode = 1;
