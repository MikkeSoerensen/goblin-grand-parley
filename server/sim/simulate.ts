// Balance simulator: plays many complete bot games through the real engine and
// summarizes how the rules behave (game length, class win rates, monster difficulty).

import type { Threat, WinLevel } from "../../shared/types.js";
import { createRoom, handleAction, joinRoom, leaderOf, setRandomSource, TEAM_TUNING, type Room } from "../engine.js";
import { botStep, newMemory, type Rng } from "./bot.js";

export const mulberry32 = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export interface GameResult {
  finished: boolean;      // someone reached the winning level
  stuck: boolean;         // no bot could act — a rules/engine bug
  turns: number;
  winnerClass: string | null;
  classesAtEnd: string[]; // one entry per player
  winnerRace: string | null;
  racesAtEnd: string[];
  combats: number;
  combatWins: number;
  helpedCombats: number;
  deaths: number;
  monsterFights: Record<string, { fights: number; wins: number }>;
  leadChanges: number;    // how often a different player took the sole lead
  bounties: number;
  turncoats: number;
  tableHits: number;
  sabotages: number;
  bribes: number;
  tolls: number;
  winnerTeamSeat?: number;        // team mode: 0 = the team that moved first
  winnerMateLevel?: number | null; // team mode: the winner's teammate's level at the end
}

const MAX_TURNS = 1200;
const MAX_STEPS = 60_000;

export const playGame = (players: number, seed: number, winLevel: WinLevel = 10, threat: Threat = "normal", teams = false): GameResult => {
  setRandomSource(mulberry32(seed));
  const rnd = mulberry32(seed ^ 0x9e3779b9);
  const rooms = new Map<string, Room>();
  for (let i = 0; i < players; i++) {
    const r = joinRoom(rooms, { name: `Bot${i}`, roomCode: "SIM" });
    if (!r.ok) throw new Error(r.error);
  }
  const room = rooms.get("SIM") ?? createRoom("SIM");
  const settingsErr = handleAction(room, room.players[0].id, { type: "updateSettings", settings: { winLevel, threat, teamMode: teams } }).error;
  if (settingsErr) throw new Error(settingsErr);
  if (teams) handleAction(room, room.players[0].id, { type: "shuffleTeams" });
  const err = handleAction(room, room.players[0].id, { type: "startGame" }).error;
  if (err) throw new Error(err);
  const teamSeat = room.players.map(p => p.team); // first round of seats = team order

  const mem = newMemory();
  const res: GameResult = {
    finished: false, stuck: false, turns: 0, winnerClass: null, classesAtEnd: [], winnerRace: null, racesAtEnd: [],
    combats: 0, combatWins: 0, helpedCombats: 0, deaths: 0, monsterFights: {},
    leadChanges: 0, bounties: 0, turncoats: 0, tableHits: 0, sabotages: 0, bribes: 0, tolls: 0,
  };
  let lastLeader: string | null = null;

  let lastActive = room.activePlayerIndex;
  let combatStart: { attackerId: string; level: number; monster: string } | null = null;
  let idle = 0;
  const deadBefore = new Set<string>();

  for (let step = 0; step < MAX_STEPS && room.status !== "gameOver" && res.turns < MAX_TURNS; step++) {
    const helperBefore = room.combat?.helperId ?? null;
    const acted = botStep(room, mem, rnd, res.turns);
    idle = acted ? 0 : idle + 1;
    if (idle > 50) { res.stuck = true; break; }

    if (room.activePlayerIndex !== lastActive) {
      res.turns++;
      lastActive = room.activePlayerIndex;
      const lead = leaderOf(room)?.id ?? null;
      if (lead && lead !== lastLeader) { if (lastLeader) res.leadChanges++; lastLeader = lead; }
    }

    if (room.combat && !combatStart) {
      const attacker = room.players.find(p => p.id === room.combat!.attackerId)!;
      combatStart = { attackerId: attacker.id, level: attacker.level, monster: room.combat.monsters[0]?.cardId ?? "(none)" };
      res.combats++;
    }
    if (!room.combat && combatStart) {
      const attacker = room.players.find(p => p.id === combatStart!.attackerId)!;
      const won = attacker.level > combatStart.level;
      const m = (res.monsterFights[combatStart.monster] ??= { fights: 0, wins: 0 });
      m.fights++;
      if (won) { m.wins++; res.combatWins++; }
      if (helperBefore) res.helpedCombats++;
      combatStart = null;
    }
    for (const p of room.players) {
      if (p.isDead && !deadBefore.has(p.id)) { res.deaths++; deadBefore.add(p.id); }
      if (!p.isDead) deadBefore.delete(p.id);
    }
  }

  res.finished = room.status === "gameOver";
  const winner = room.players.find(p => p.id === room.winnerId);
  if (teams && winner) {
    res.winnerTeamSeat = teamSeat.indexOf(winner.team);
    const mate = room.players.find(p => p.id !== winner.id && p.team === winner.team);
    res.winnerMateLevel = mate?.level ?? null;
  }
  res.winnerClass = winner ? winner.playerClass?.className ?? "none" : null;
  res.classesAtEnd = room.players.map(p => p.playerClass?.className ?? "none");
  const raceLabel = (p: Room["players"][number]) => [p.race?.raceName, p.extraRace?.raceName].filter(Boolean).join("+") || "none";
  res.winnerRace = winner ? raceLabel(winner) : null;
  res.racesAtEnd = room.players.map(raceLabel);
  Object.assign(res, {
    bounties: room.stats.bounties, turncoats: room.stats.turncoats,
    tableHits: room.stats.tableHits, sabotages: room.stats.sabotages,
    bribes: room.stats.bribes, tolls: room.stats.tolls,
  });
  setRandomSource(Math.random);
  return res;
};

// ---------- aggregation ----------
const pct = (n: number, d: number) => (d === 0 ? "–" : `${((100 * n) / d).toFixed(1)}%`);
const quantile = (xs: number[], q: number) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

export interface Summary {
  players: number;
  teams: boolean;
  teamShare: number;
  firstTeamWinRate: number | null; // team mode: share of wins for the team that moves first
  mateLevelMean: number | null;    // team mode: average level of the winner's teammate
  winLevel: WinLevel;
  threat: Threat;
  leadChanges: number;
  bounties: number;
  turncoats: number;
  tableHits: number;
  sabotages: number;
  bribes: number;
  tolls: number;
  games: number;
  finished: number;
  stuck: number;
  roundsMedian: number;
  roundsP90: number;
  turnsMean: number;
  combatsPerGame: number;
  combatWinRate: number;
  helpedRate: number;
  deathsPerGame: number;
  classWinRate: Record<string, { held: number; wins: number }>;
  raceWinRate: Record<string, { held: number; wins: number }>;
  monsters: [string, { fights: number; wins: number }][];
}

export const runBatch = (players: number, games: number, seed: number, winLevel: WinLevel = 10, threat: Threat = "normal", teams = false): Summary => {
  const results = Array.from({ length: games }, (_, i) => playGame(players, seed + i * 7919, winLevel, threat, teams));
  const done = results.filter(r => r.finished);
  const classWinRate: Summary["classWinRate"] = {};
  for (const r of results) {
    for (const c of r.classesAtEnd) (classWinRate[c] ??= { held: 0, wins: 0 }).held++;
    if (r.winnerClass) (classWinRate[r.winnerClass] ??= { held: 0, wins: 0 }).wins++;
  }
  const raceWinRate: Summary["raceWinRate"] = {};
  for (const r of results) {
    for (const c of r.racesAtEnd) (raceWinRate[c] ??= { held: 0, wins: 0 }).held++;
    if (r.winnerRace) (raceWinRate[r.winnerRace] ??= { held: 0, wins: 0 }).wins++;
  }
  const monsters: Record<string, { fights: number; wins: number }> = {};
  for (const r of results) {
    for (const [id, m] of Object.entries(r.monsterFights)) {
      const agg = (monsters[id] ??= { fights: 0, wins: 0 });
      agg.fights += m.fights;
      agg.wins += m.wins;
    }
  }
  const rounds = done.map(r => r.turns / players);
  const sum = (f: (r: GameResult) => number) => results.reduce((s, r) => s + f(r), 0);
  const teamWins = results.filter(r => r.winnerTeamSeat !== undefined);
  const mates = teamWins.map(r => r.winnerMateLevel).filter((x): x is number => typeof x === "number");
  return {
    players, games, winLevel, threat, teams, teamShare: TEAM_TUNING.share,
    firstTeamWinRate: teams ? teamWins.filter(r => r.winnerTeamSeat === 0).length / Math.max(1, teamWins.length) : null,
    mateLevelMean: teams && mates.length ? mates.reduce((s, x) => s + x, 0) / mates.length : null,
    leadChanges: sum(r => r.leadChanges) / games,
    bounties: sum(r => r.bounties) / games,
    turncoats: sum(r => r.turncoats) / games,
    tableHits: sum(r => r.tableHits) / games,
    sabotages: sum(r => r.sabotages) / games,
    bribes: sum(r => r.bribes) / games,
    tolls: sum(r => r.tolls) / games,
    finished: done.length,
    stuck: results.filter(r => r.stuck).length,
    roundsMedian: quantile(rounds, 0.5),
    roundsP90: quantile(rounds, 0.9),
    turnsMean: sum(r => r.turns) / games,
    combatsPerGame: sum(r => r.combats) / games,
    combatWinRate: sum(r => r.combatWins) / Math.max(1, sum(r => r.combats)),
    helpedRate: sum(r => r.helpedCombats) / Math.max(1, sum(r => r.combats)),
    deathsPerGame: sum(r => r.deaths) / games,
    classWinRate,
    raceWinRate,
    monsters: Object.entries(monsters).sort((a, b) => a[1].wins / a[1].fights - b[1].wins / b[1].fights),
  };
};

export const formatReport = (summaries: Summary[], title: string): string => {
  const lines: string[] = [`# ${title}`, ""];
  lines.push("| Spillere | Hold | Mål | Threat | Spil | Afsluttet | Låst fast | Runder (median) | Runder (90%) | Kampe/spil | Kampe vundet | Med hjælper | Dødsfald/spil |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const s of summaries) {
    const mode = s.teams ? `ja (tillæg ${Math.round(s.teamShare * 100)}%)` : "nej";
    lines.push(`| ${s.players} | ${mode} | ${s.winLevel} | ${s.threat} | ${s.games} | ${pct(s.finished, s.games)} | ${s.stuck} | ${s.roundsMedian.toFixed(1)} | ${s.roundsP90.toFixed(1)} | ${s.combatsPerGame.toFixed(1)} | ${pct(s.combatWinRate, 1)} | ${pct(s.helpedRate, 1)} | ${s.deathsPerGame.toFixed(2)} |`);
  }
  if (summaries.some(s => s.teams)) {
    lines.push("", "## Holdspil", "", "| Spillere | Tillæg | Mål | Første hold vinder | Fair | Vinderens holdkammerat, niveau (gns.) |", "|---|---|---|---|---|---|");
    for (const s of summaries.filter(x => x.teams)) {
      lines.push(`| ${s.players} | ${Math.round(s.teamShare * 100)}% | ${s.winLevel} | ${pct(s.firstTeamWinRate ?? 0, 1)} | ${pct(2 / s.players, 1)} | ${s.mateLevelMean?.toFixed(1) ?? "–"} |`);
    }
  }
  lines.push("", "## Socialt kaos (pr. spil)", "", "| Spillere | Mål | Threat | Føring skifter hænder | Sabotage-kort | Dusører udbetalt | Overløbere (Siren) | Hele bordet ramt | Bestikkelser | Toll betalt |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const s of summaries) {
    lines.push(`| ${s.players} | ${s.winLevel} | ${s.threat} | ${s.leadChanges.toFixed(1)} | ${s.sabotages.toFixed(1)} | ${s.bounties.toFixed(2)} | ${s.turncoats.toFixed(2)} | ${s.tableHits.toFixed(2)} | ${s.bribes.toFixed(2)} | ${s.tolls.toFixed(2)} |`);
  }
  for (const s of summaries) {
    lines.push("", `## Class ved spillets slutning — ${s.players} spillere, mål ${s.winLevel}`, "", "| Class | Spillere med den | Vandt | Vinderrate |", "|---|---|---|---|");
    const fair = 1 / s.players;
    for (const [cls, v] of Object.entries(s.classWinRate).sort((a, b) => b[1].wins / b[1].held - a[1].wins / a[1].held)) {
      lines.push(`| ${cls} | ${v.held} | ${v.wins} | ${pct(v.wins, v.held)} (fair: ${pct(fair, 1)}) |`);
    }
  }
  for (const s of summaries) {
    lines.push("", `## Race ved spillets slutning — ${s.players} spillere, mål ${s.winLevel}, threat ${s.threat}`, "", "| Race | Spillere med den | Vandt | Vinderrate |", "|---|---|---|---|");
    const fair = 1 / s.players;
    for (const [r, v] of Object.entries(s.raceWinRate).filter(([, v]) => v.held >= 20).sort((a, b) => b[1].wins / b[1].held - a[1].wins / a[1].held)) {
      lines.push(`| ${r} | ${v.held} | ${v.wins} | ${pct(v.wins, v.held)} (fair: ${pct(fair, 1)}) |`);
    }
  }
  const s = summaries[0];
  lines.push("", `## Monstre — sværest først (${s.players} spillere)`, "", "| Monster | Kampe | Spillerne vandt |", "|---|---|---|");
  for (const [id, m] of s.monsters) lines.push(`| ${id} | ${m.fights} | ${pct(m.wins, m.fights)} |`);
  return lines.join("\n") + "\n";
};
