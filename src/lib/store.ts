import { create } from "zustand";
import type { ClientView, ServerToClient } from "../../shared/types";
import { leaveSession, loadSession, saveSession } from "./session";
import { getSocket, onMsg, send } from "./socket";

interface GameStore {
  view: ClientView | null;
  playerId: string | null;
  roomCode: string | null;
  connected: boolean;
  error: string | null;
  lastRoll: { playerId: string; result: number; reason: string } | null;
  init: () => void;
  join: (name: string, roomCode: string) => void;
  leave: () => void;
  clearError: () => void;
}

let initialized = false;

export const useGame = create<GameStore>((set) => ({
  view: null,
  playerId: null,
  roomCode: null,
  connected: false,
  error: null,
  lastRoll: null,
  init: () => {
    if (initialized) return;
    initialized = true;
    const socket = getSocket();

    // Every (re)connect — first load, reload, phone waking up, server restart —
    // silently re-claims the seat we hold a token for.
    const rejoin = () => {
      set({ connected: true });
      const s = loadSession();
      if (s?.token) send({ type: "join", name: s.name, roomCode: s.roomCode, token: s.token });
    };
    socket.on("connect", rejoin);
    socket.on("disconnect", () => set({ connected: false }));
    if (socket.connected) rejoin();

    onMsg((m: ServerToClient) => {
      if (m.type === "joined") {
        const s = loadSession();
        saveSession({ name: s?.name ?? "", roomCode: m.roomCode, token: m.token });
        set({ playerId: m.playerId, roomCode: m.roomCode });
      } else if (m.type === "state") set({ view: m.view });
      else if (m.type === "error") set({ error: m.message });
      else if (m.type === "rolled") set({ lastRoll: m });
    });
  },
  join: (name, roomCode) => {
    const prev = loadSession();
    // Reuse our token if we are going back to the same room under the same name.
    const token = prev && prev.roomCode === roomCode && prev.name.toLowerCase() === name.toLowerCase() ? prev.token : undefined;
    saveSession({ name, roomCode, token });
    send({ type: "join", name, roomCode, token });
  },
  leave: () => {
    leaveSession();
    // A fresh page load is the simplest way to drop every bit of room state.
    location.reload();
  },
  clearError: () => set({ error: null }),
}));

export { send };
