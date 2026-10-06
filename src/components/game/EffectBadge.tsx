import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { describeEffect } from "../../../shared/rules";
import type { PlayerEffect } from "../../../shared/types";
import { cn } from "@/lib/utils";

/** A lasting curse on a player. Hover or tap it to be reminded what it does and when it wears off. */
export function EffectBadge({ effect, size = "sm" }: { effect: PlayerEffect; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          // Hover only for a real mouse: a tap fires a fake hover first, which would make the tap toggle it shut.
          onPointerEnter={e => { if (e.pointerType === "mouse") setOpen(true); }}
          onPointerLeave={e => { if (e.pointerType === "mouse") setOpen(false); }}
          // A tap or click always opens it; tapping outside closes it.
          onClick={e => { e.preventDefault(); setOpen(true); }}
          aria-label={`${effect.name} — hvad gør den?`}
          className={cn(
            "font-ui font-semibold rounded bg-destructive/20 text-destructive border border-destructive/40 cursor-help hover:bg-destructive/30",
            size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1",
          )}
        >
          🌀 {effect.name}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-64 text-sm font-ui space-y-1">
        <div className="font-display font-bold text-destructive">🌀 {effect.name}</div>
        <p>{describeEffect(effect)}</p>
      </PopoverContent>
    </Popover>
  );
}
