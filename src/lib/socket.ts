import { io, Socket } from "socket.io-client";
import type { ClientToServer, ServerToClient } from "../../shared/types";

// Default: connect to the same origin the page was loaded from.
// In dev, Vite proxies /socket.io → server; in prod, the server hosts both.
// Set VITE_SERVER_URL at build time only if the client is hosted separately from the server.
const SERVER_URL: string | undefined = import.meta.env.VITE_SERVER_URL || undefined;

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(SERVER_URL, { transports: ["websocket", "polling"] });
  }
  return socket;
};

export const send = (msg: ClientToServer) => {
  getSocket().emit("msg", msg);
};

export const onMsg = (handler: (m: ServerToClient) => void) => {
  const s = getSocket();
  const wrapped = (m: ServerToClient) => handler(m);
  s.on("msg", wrapped);
  return () => s.off("msg", wrapped);
};
