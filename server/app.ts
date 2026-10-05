// HTTP + Socket.io transport around the game engine.
// Owns socket ↔ player bindings, input validation, rate limiting and persistence hooks.

import express from "express";
import { createServer } from "http";
import type { AddressInfo } from "net";
import { networkInterfaces } from "os";
import path from "path";
import { Server, type Socket } from "socket.io";

import type { ServerToClient } from "../shared/types.js";
import { buildView, expireInterrupts, handleAction, joinRoom, setConnected, watchRoom, type Room } from "./engine.js";
import { createRoomStore } from "./persistence.js";
import { parseClientMessage } from "./protocol.js";

export interface GameServerOptions {
  port: number;
  host?: string;
  /** JSON snapshot file; null disables persistence (tests). */
  dataFile: string | null;
  /** Built client (vite build output). */
  distDir: string;
  /** Origins allowed to connect cross-origin. Empty/undefined = same origin only. */
  corsOrigins?: string[];
}

export interface GameServer {
  port: number;
  rooms: Map<string, Room>;
  close(): Promise<void>;
}

export const lanAddresses = (): string[] => {
  const ips: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list ?? []) if (i.family === "IPv4" && !i.internal) ips.push(i.address);
  }
  return ips;
};

interface Binding { roomCode: string; playerId: string }

// Token bucket per socket: generous for humans clicking, stops scripted floods.
const RATE_CAPACITY = 30;
const RATE_REFILL_PER_SEC = 15;

const createRateLimiter = () => {
  let tokens = RATE_CAPACITY;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(RATE_CAPACITY, tokens + ((now - last) / 1000) * RATE_REFILL_PER_SEC);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
};

export const startGameServer = (opts: GameServerOptions): Promise<GameServer> => {
  let rooms = new Map<string, Room>();
  const store = opts.dataFile ? createRoomStore(opts.dataFile, () => rooms) : null;
  if (store) rooms = store.load();
  const save = () => store?.scheduleSave();

  const bindings = new Map<string, Binding>(); // socketId -> binding
  const playerSocket = new Map<string, string>(); // playerId -> socketId (one live socket per player)
  const watchers = new Map<string, string>(); // socketId -> roomCode (TV mode: no seat, public view only)

  const app = express();
  app.disable("x-powered-by");
  app.use(express.static(opts.distDir));
  app.get("/health", (_req, res) => { res.json({ ok: true, rooms: rooms.size }); });
  // LAN addresses are only for the host's own QR code: never reveal them to remote
  // clients or through a reverse proxy when the game is hosted publicly.
  app.get("/api/lan", (req, res) => {
    const ip = req.socket.remoteAddress ?? "";
    const local = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
    const proxied = req.headers["x-forwarded-for"] !== undefined;
    res.json({ addresses: local && !proxied ? lanAddresses() : [] });
  });
  app.get(/^\/(?!socket\.io|api\/).*/, (_req, res) => {
    res.sendFile(path.join(opts.distDir, "index.html"), err => {
      if (err) res.status(404).send("Run `npm run build` first to serve the client from this server, or use `npm run dev` for hot reload.");
    });
  });

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    maxHttpBufferSize: 32 * 1024,
    ...(opts.corsOrigins?.length ? { cors: { origin: opts.corsOrigins } } : {}),
  });

  const emit = (socketId: string, msg: ServerToClient) => io.to(socketId).emit("msg", msg);

  // One timer per room for the interrupt countdown; re-armed after every state change.
  const countdowns = new Map<string, NodeJS.Timeout>();
  const scheduleCountdown = (room: Room) => {
    const existing = countdowns.get(room.code);
    if (existing) { clearTimeout(existing); countdowns.delete(room.code); }
    const deadline = room.combat?.interruptDeadline;
    if (!deadline || room.status !== "waitingForInterrupts") return;
    countdowns.set(room.code, setTimeout(() => {
      countdowns.delete(room.code);
      if (expireInterrupts(room)) { broadcast(room); save(); } else scheduleCountdown(room);
    }, Math.max(0, deadline - Date.now()) + 25));
  };

  const broadcast = (room: Room) => {
    for (const p of room.players) {
      const sid = playerSocket.get(p.id);
      if (sid) emit(sid, { type: "state", view: buildView(room, p.id) });
    }
    let publicView: ReturnType<typeof buildView> | null = null;
    for (const [sid, code] of watchers) {
      if (code !== room.code) continue;
      publicView ??= buildView(room, null);
      emit(sid, { type: "state", view: publicView });
    }
    scheduleCountdown(room);
  };

  // Detaches a socket from its player; marks the player offline if it was their live socket.
  const unbind = (socketId: string) => {
    const b = bindings.get(socketId);
    if (!b) return;
    bindings.delete(socketId);
    if (playerSocket.get(b.playerId) !== socketId) return;
    playerSocket.delete(b.playerId);
    const room = rooms.get(b.roomCode);
    if (!room) return;
    setConnected(room, b.playerId, false);
    broadcast(room);
    save();
  };

  io.on("connection", (socket: Socket) => {
    const allow = createRateLimiter();

    socket.on("msg", (raw: unknown) => {
      try {
        if (!allow()) { emit(socket.id, { type: "error", message: "Slow down — too many actions." }); return; }

        const parsed = parseClientMessage(raw);
        if (!parsed.ok) { emit(socket.id, { type: "error", message: parsed.error }); return; }
        const msg = parsed.msg;

        if (msg.type === "watch") {
          unbind(socket.id);
          const room = watchRoom(rooms, msg.roomCode);
          watchers.set(socket.id, room.code);
          emit(socket.id, { type: "watching", roomCode: room.code });
          emit(socket.id, { type: "state", view: buildView(room, null) });
          save();
          return;
        }

        if (msg.type === "join") {
          unbind(socket.id);
          watchers.delete(socket.id);
          const res = joinRoom(rooms, msg);
          if (!res.ok) { emit(socket.id, { type: "error", message: res.error }); return; }

          // Same player opened elsewhere (other tab/device): the newest connection wins.
          const previous = playerSocket.get(res.playerId);
          if (previous && previous !== socket.id) {
            bindings.delete(previous);
            emit(previous, { type: "error", message: "You joined from another tab or device; this one is now inactive." });
          }
          bindings.set(socket.id, { roomCode: res.room.code, playerId: res.playerId });
          playerSocket.set(res.playerId, socket.id);
          setConnected(res.room, res.playerId, true);

          emit(socket.id, { type: "joined", roomCode: res.room.code, playerId: res.playerId, token: res.token });
          broadcast(res.room);
          save();
          return;
        }

        const b = bindings.get(socket.id);
        if (!b) { emit(socket.id, { type: "error", message: "Join a room first." }); return; }
        const room = rooms.get(b.roomCode);
        if (!room) { emit(socket.id, { type: "error", message: "Room not found." }); return; }

        const { error, events } = handleAction(room, b.playerId, msg);
        if (error) emit(socket.id, { type: "error", message: error });
        for (const ev of events) {
          for (const p of room.players) {
            const sid = playerSocket.get(p.id);
            if (sid) emit(sid, ev);
          }
        }
        broadcast(room);
        save();
      } catch (e) {
        console.error(e);
        emit(socket.id, { type: "error", message: "Server error." });
      }
    });

    socket.on("disconnect", () => { watchers.delete(socket.id); unbind(socket.id); });
  });

  return new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(opts.port, opts.host ?? "0.0.0.0", () => {
      const port = (httpServer.address() as AddressInfo).port;
      for (const room of rooms.values()) scheduleCountdown(room);
      resolve({
        port,
        get rooms() { return rooms; },
        close: () => new Promise<void>(done => {
          for (const t of countdowns.values()) clearTimeout(t);
          countdowns.clear();
          try {
            store?.flush();
          } catch (err) {
            console.error("⚠️  Could not save game state on shutdown:", err);
          }
          io.close(() => done());
        }),
      });
    });
  });
};
