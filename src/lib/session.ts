// The player's seat in a room, remembered across reloads and phone sleep.
// localStorage can be unavailable (private mode, blocked storage) — never let that break the game.

export interface Session {
  name: string;
  roomCode: string;
  token?: string;
  watching?: boolean; // TV mode: this screen shows the table, it has no seat
}

const KEY = "munchkin:session";

export const loadSession = (): Session | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s: unknown = JSON.parse(raw);
    if (typeof s !== "object" || s === null) return null;
    const { name, roomCode, token, watching } = s as Record<string, unknown>;
    if (typeof name !== "string" || typeof roomCode !== "string") return null;
    return { name, roomCode, token: typeof token === "string" ? token : undefined, watching: watching === true };
  } catch {
    return null;
  }
};

export const saveSession = (s: Session) => {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
};

/** Forget the seat but keep the name and room code as form defaults. */
export const leaveSession = () => {
  const s = loadSession();
  if (s) saveSession({ name: s.name, roomCode: s.roomCode });
};
