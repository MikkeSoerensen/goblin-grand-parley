// npm run simulate -- [--games 500] [--players 4,6] [--win 10,15,20] [--threat calm,normal,brutal] [--seed 1] [--out file.md]
//                    [--teams] [--share 0.33,0.5,0.66]   (team mode, and the monsters' share of the teammate's power)
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

import type { Threat, WinLevel } from "../../shared/types.js";
import { TEAM_TUNING } from "../engine.js";
import { formatReport, runBatch } from "./simulate.js";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const games = Number(arg("games", "500"));
const playerCounts = arg("players", "4,6").split(",").map(Number);
const winLevels = arg("win", "10").split(",").map(Number) as WinLevel[];
const threats = arg("threat", "normal").split(",") as Threat[];
const seed = Number(arg("seed", "1"));
const out = arg("out", "");
const teams = process.argv.includes("--teams");
const shares = arg("share", String(TEAM_TUNING.share)).split(",").map(Number);

const started = Date.now();
const summaries = (teams ? shares : [TEAM_TUNING.share]).flatMap(share => {
  TEAM_TUNING.share = share;
  return threats.flatMap(t => winLevels.flatMap(w => playerCounts.map(n => runBatch(n, games, seed, w, t, teams))));
});
const report = formatReport(summaries, `Balance-simulering (${games} spil pr. antal spillere, seed ${seed})`);
console.log(report);
console.log(`(${((Date.now() - started) / 1000).toFixed(1)} s)`);
if (out) {
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, report, "utf8");
  console.log(`Gemt i ${out}`);
}
if (summaries.some(s => s.stuck > 0)) process.exitCode = 1;
