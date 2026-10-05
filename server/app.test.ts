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
    expect((await thief.next("error")).message).toMatch(/taken/);

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
