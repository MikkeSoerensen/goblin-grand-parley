import { useEffect, useRef, useState } from "react";
import { useGame } from "@/lib/store";
import type { Highlight } from "../../../shared/types";

const SHOW_MS = 6000;
const MAX_VISIBLE = 3;

/**
 * The table's big moments (bounties, trades, tolls, deaths …) shown briefly on every screen.
 * Only new ones appear: after joining or reloading, older moments are not replayed.
 */
export function EventStrip() {
  const highlights = useGame(s => s.view?.highlights);
  const seen = useRef<number | null>(null); // highest id already handled
  const [visible, setVisible] = useState<Highlight[]>([]);
  // Each batch hides itself after SHOW_MS, independent of newer batches arriving.
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (!highlights) return;
    const newest = highlights.reduce((max, h) => Math.max(max, h.id), 0);
    if (seen.current === null) { seen.current = newest; return; } // first view: don't replay history
    const fresh = highlights.filter(h => h.id > seen.current!);
    if (fresh.length === 0) return;
    seen.current = newest;
    setVisible(v => [...v, ...fresh].slice(-MAX_VISIBLE));
    const gone = new Set(fresh.map(h => h.id));
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setVisible(v => v.filter(h => !gone.has(h.id)));
    }, SHOW_MS);
    timers.current.add(timer);
  }, [highlights]);

  useEffect(() => {
    const pending = timers.current;
    return () => { for (const t of pending) clearTimeout(t); };
  }, []);

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Table events"
      className="pointer-events-none fixed z-[55] top-2 inset-x-2 md:inset-x-auto md:right-4 md:top-4 md:w-96 flex flex-col gap-1.5"
    >
      {visible.map(h => (
        <div
          key={h.id}
          className="animate-in fade-in slide-in-from-top-2 rounded-lg border border-primary/50 bg-popover/95 backdrop-blur shadow-glow-brass px-3 py-2 text-sm font-ui"
        >
          {h.text}
        </div>
      ))}
    </div>
  );
}
