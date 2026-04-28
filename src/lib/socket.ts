import { io, Socket } from "socket.io-client";
import type { ClientToServer, ServerToClient } from "../../shared/types";

// In dev, Vite proxies /socket.io → server. In prod, server hosts both.
const SERVER_URL = import.meta.env.VITE_SERVER_URL || (typeof window !== "undefined" ? `${window.location.protocol}//${window.location.hostname}:3001` : "");

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
