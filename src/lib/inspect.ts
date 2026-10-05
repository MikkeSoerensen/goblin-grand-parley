import { create } from "zustand";
import type { Card } from "../../shared/types";

// Which card (if any) is open in the card-details dialog. Any component can open it.
interface InspectStore {
  card: Card | null;
  open: (card: Card) => void;
  close: () => void;
}

export const useInspect = create<InspectStore>(set => ({
  card: null,
  open: card => set({ card }),
  close: () => set({ card: null }),
}));
