import { create } from "zustand";
import type { ClientView, ServerToClient } from "../../shared/types";
import { onMsg, send } from "./socket";

interface GameStore {
  view: ClientView | null;
  error: string | null;
  lastRoll: { playerId: string; result: number; reason: string } | null;
  init: () => void;
  clearError: () => void;
}

export const useGame = create<GameStore>((set) => ({
  view: null,
  error: null,
  lastRoll: null,
  init: () => {
    onMsg((m: ServerToClient) => {
      if (m.type === "state") set({ view: m.view });
      else if (m.type === "error") set({ error: m.message });
      else if (m.type === "rolled") set({ lastRoll: m });
    });
  },
  clearError: () => set({ error: null }),
}));

export { send };
