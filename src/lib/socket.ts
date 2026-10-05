import { io, Socket } from "socket.io-client";
import type { ClientToServer, ServerToClient } from "../../shared/types";

// Same origin by default: `npm start` serves client and socket on one port, and in
// dev Vite proxies /socket.io to the server. VITE_SERVER_URL overrides both.
const SERVER_URL: string | undefined = import.meta.env.VITE_SERVER_URL || undefined;

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = SERVER_URL
      ? io(SERVER_URL, { transports: ["websocket", "polling"] })
      : io({ transports: ["websocket", "polling"] });
  }
  return socket;
};

export const send = (msg: ClientToServer) => {
  getSocket().emit("msg", msg);
};

export const onMsg = (handler: (m: ServerToClient) => void) => {
  const s = getSocket();
  s.on("msg", handler);
  return () => { s.off("msg", handler); };
};
