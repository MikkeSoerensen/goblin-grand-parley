// @vitest-environment node
// End-to-end over real sockets: join, hidden hands, reconnect, restart from disk, rate limit.
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";

import type { ClientToServer, ClientView, ServerToClient } from "../shared/types.js";
import { startGameServer, type GameServer } from "./app.js";

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const f of cleanup.splice(0).reverse()) await f(); });

const tempFile = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "munchkin-app-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, "rooms.json");
};

const start = async (dataFile: string | null): Promise<GameServer> => {
  const s = await startGameServer({ port: 0, host: "127.0.0.1", dataFile, distDir: path.join(tmpdir(), "no-dist") });
  cleanup.push(() => s.close());
  return s;
};

interface Client {
  socket: Socket;
  send(msg: ClientToServer): void;
  next<T extends ServerToClient["type"]>(type: T, pred?: (m: Extract<ServerToClient, { type: T }>) => boolean): Promise<Extract<ServerToClient, { type: T }>>;
  lastView(): ClientView | null;
}

const client = (port: number): Promise<Client> => new Promise((resolve, reject) => {
  const socket = connect(`http://127.0.0.1:${port}`, { transports: ["websocket"], forceNew: true, reconnection: false });
  const inbox: ServerToClient[] = [];
  const waiters: { test: (m: ServerToClient) => boolean; done: (m: ServerToClient) => void }[] = [];
  let view: ClientView | null = null;
  socket.on("msg", (m: ServerToClient) => {
    if (m.type === "state") view = m.view;
    const w = waiters.findIndex(x => x.test(m));
    if (w >= 0) waiters.splice(w, 1)[0].done(m);
    else inbox.push(m);
  });
  cleanup.push(() => { socket.disconnect(); });
  socket.once("connect_error", reject);
  socket.once("connect", () => resolve({
    socket,
    send: msg => socket.emit("msg", msg),
    lastView: () => view,
    next: (type, pred) => new Promise((res, rej) => {
      const test = (m: ServerToClient) => m.type === type && (!pred || pred(m as never));
      const i = inbox.findIndex(test);
      if (i >= 0) { res(inbox.splice(i, 1)[0] as never); return; }
      const timer = setTimeout(() => rej(new Error(`timed out waiting for ${type}`)), 3000);
      waiters.push({ test, done: m => { clearTimeout(timer); res(m as never); } });
    }),
  }));
});

const join = async (c: Client, name: string, roomCode = "LAN", token?: string) => {
  c.send({ type: "join", name, roomCode, token });
  return c.next("joined");
};

describe("LAN server", () => {
  it("runs a two-player game start and keeps hands private", async () => {
    const s = await start(null);
    const a = await client(s.port);
    const b = await client(s.port);
    const ja = await join(a, "Ann");
    const jb = await join(b, "Bo");

    a.send({ type: "startGame" });
    const va = (await a.next("state", m => m.view.status === "normalTurn")).view;
    const vb = (await b.next("state", m => m.view.status === "normalTurn")).view;

    expect(va.self?.id).toBe(ja.playerId);
    expect(vb.self?.id).toBe(jb.playerId);
    expect(va.self?.hand).toHaveLength(4);
    const bHandIds = vb.self!.hand.map(c => c.id);
    expect(JSON.stringify(va)).not.toContain(`"${bHandIds[0]}"`);
    expect(JSON.stringify(va)).not.toContain(jb.token);
  });

  it("blocks seat hijacking by name and restores the seat by token", async () => {
    const s = await start(null);
    const a = await client(s.port);
    const ja = await join(a, "Ann");

    const thief = await client(s.port);
    thief.send({ type: "join", name: "ann", roomCode: "LAN" });
    expect((await thief.next("error")).message).toMatch(/still connected/);

    a.socket.disconnect();
    const back = await client(s.port);
    const jr = await join(back, "Whatever", "LAN", ja.token);
    expect(jr.playerId).toBe(ja.playerId);
  });

  it("gives the seat to the newest tab and deactivates the old one", async () => {
    const s = await start(null);
    const tab1 = await client(s.port);
    const j = await join(tab1, "Ann");
    const tab2 = await client(s.port);
    await join(tab2, "Ann", "LAN", j.token);
    expect((await tab1.next("error")).message).toMatch(/another tab/);
    tab1.send({ type: "startGame" });
    expect((await tab1.next("error")).message).toMatch(/Join a room first/);
  });

  it("survives a server restart: same room, same hand, same seat", async () => {
    const file = tempFile();
    const s1 = await start(file);
    const a = await client(s1.port);
    const b = await client(s1.port);
    const ja = await join(a, "Ann");
    await join(b, "Bo");
    a.send({ type: "startGame" });
    const before = (await a.next("state", m => m.view.status === "normalTurn")).view;
    await s1.close();

    const s2 = await start(file);
    const a2 = await client(s2.port);
    const jr = await join(a2, "Ann", "LAN", ja.token);
    expect(jr.playerId).toBe(ja.playerId);
    const after = (await a2.next("state")).view;
    expect(after.status).toBe("normalTurn");
    expect(after.self?.hand.map(c => c.id)).toEqual(before.self?.hand.map(c => c.id));
    expect(after.players.find(p => p.name === "Bo")?.connected).toBe(false);
  });

  it("rejects malformed input and rate-limits floods", async () => {
    const s = await start(null);
    const c = await client(s.port);
    c.socket.emit("msg", { type: "join", name: "Ann", roomCode: "../../etc" });
    expect((await c.next("error")).message).toMatch(/Invalid message/);

    await join(c, "Ann");
    for (let i = 0; i < 60; i++) c.send({ type: "pass" });
    await c.next("error", m => /Slow down/.test(m.message));
  });

  it("the server's countdown auto-passes a silent opponent and tells everyone", async () => {
    const s = await start(null);
    const a = await client(s.port);
    const b = await client(s.port);
    await join(a, "Ann");
    await join(b, "Bo");
    a.send({ type: "startGame" });
    await a.next("state", m => m.view.status === "normalTurn");

    // Put Ann in a fight and shorten the countdown so the test doesn't wait 15 s.
    const room = s.rooms.get("LAN")!;
    room.players[0].hand.push({
      id: "t-mon", cardId: "m-test", name: "Test Monster", type: "monster", deck: "door",
      level: 1, treasures: 1, levelsAwarded: 1, badStuff: { kind: "loseLevel", amount: 1 }, badStuffText: "", tags: [],
    });
    room.currentPhase = 2;
    a.send({ type: "lookForTrouble", cardId: "t-mon" });
    const started = await b.next("state", m => m.view.status === "waitingForInterrupts");
    expect(started.view.combat?.interruptMsLeft).toBeGreaterThan(14_000);

    room.combat!.interruptDeadline = Date.now() + 150;
    b.send({ type: "kickDoor" }); // any message re-arms the server timer (this one is just rejected)
    const after = await b.next("state", m => m.view.status === "inCombat");
    expect(after.view.combat?.passes[after.view.self!.id]).toBe(true);
    expect(after.view.log.some(l => l.includes("Time's up"))).toBe(true);
  });

  it("TV mode: a watcher sees the public table, no hands, no vote, no actions", async () => {
    const s = await start(null);
    const tv = await client(s.port);
    tv.send({ type: "watch", roomCode: "lan" });
    expect((await tv.next("watching")).roomCode).toBe("LAN"); // the TV can open the room first
    expect((await tv.next("state")).view.self).toBeNull();

    const a = await client(s.port);
    const b = await client(s.port);
    await join(a, "Ann");
    await join(b, "Bo");
    a.send({ type: "startGame" });
    const tvView = (await tv.next("state", m => m.view.status === "normalTurn")).view;
    expect(tvView.self).toBeNull();
    expect(tvView.trades).toEqual([]);
    const annHand = (await a.next("state", m => m.view.status === "normalTurn")).view.self!.hand;
    expect(JSON.stringify(tvView)).not.toContain(`"${annHand[0].id}"`);
    expect(tvView.players).toHaveLength(2); // the TV is not a player

    tv.send({ type: "kickDoor" });
    expect((await tv.next("error")).message).toMatch(/Join a room first/);
  });

  it("offers free seats when joining a running game, and lets a player leave for good", async () => {
    const s = await start(null);
    const a = await client(s.port);
    const b = await client(s.port);
    const c = await client(s.port);
    await join(a, "Ann");
    await join(b, "Bo");
    await join(c, "Cy");
    a.send({ type: "startGame" });
    await a.next("state", m => m.view.status === "normalTurn");

    c.socket.disconnect(); // Cy's phone closes
    const late = await client(s.port);
    late.send({ type: "join", name: "Typo", roomCode: "LAN" });
    expect((await late.next("seats")).names).toEqual(["Cy"]);
    expect((await join(late, "Cy")).roomCode).toBe("LAN");

    b.send({ type: "leaveGame" });
    await b.next("left");
    const view = (await a.next("state", m => m.view.status !== "lobby" && !m.view.players.some(p => p.name === "Bo"))).view;
    expect(view.players.map(p => p.name)).toEqual(["Ann", "Cy"]);
  });

  it("serves health and LAN address endpoints", async () => {
    const s = await start(null);
    const health = await fetch(`http://127.0.0.1:${s.port}/health`).then(r => r.json() as Promise<{ ok: boolean }>);
    expect(health.ok).toBe(true);
    const lan = await fetch(`http://127.0.0.1:${s.port}/api/lan`).then(r => r.json() as Promise<{ addresses: unknown }>);
    expect(Array.isArray(lan.addresses)).toBe(true);
    const proxied = await fetch(`http://127.0.0.1:${s.port}/api/lan`, { headers: { "x-forwarded-for": "203.0.113.9" } })
      .then(r => r.json() as Promise<{ addresses: unknown[] }>);
    expect(proxied.addresses).toEqual([]);
  });
});
