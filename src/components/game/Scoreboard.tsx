import { useGame } from "@/lib/store";
import { useInspect } from "@/lib/inspect";
import type { EquipmentCard } from "../../../shared/types";
import { cn } from "@/lib/utils";
import { Crown, Heart, Swords, Wifi, WifiOff } from "lucide-react";
import { EffectBadge } from "./EffectBadge";

export function Scoreboard() {
  const view = useGame(s => s.view);
  const inspect = useInspect(s => s.open);
  if (!view) return null;
  const chip = (card: EquipmentCard, icon: string) => (
    <button key={card.id} type="button" title={card.name} onClick={() => inspect(card)} className="hover:text-primary underline-offset-2 hover:underline">
      {icon}{card.bonus}
    </button>
  );

  return (
    <aside className="bg-popover/95 backdrop-blur border border-border rounded-xl shadow-card p-3 w-full md:w-72 md:max-h-[80vh] overflow-y-auto scroll-thin shrink-0">
      <h2 className="font-display text-lg brass-text mb-2 flex items-center gap-2">
        <Crown className="w-5 h-5 text-primary" /> Stillingen
      </h2>
      <ul className="space-y-1.5">
        {view.players.map((p, i) => {
          const isActive = i === view.activePlayerIndex;
          const isSelf = view.self?.id === p.id;
          return (
            <li
              key={p.id}
              className={cn(
                "rounded-lg p-2 border transition-colors",
                isActive ? "bg-primary/15 border-primary" : "bg-muted/30 border-border",
                isSelf && "ring-1 ring-primary/60",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-bold truncate flex items-center gap-1.5">
                  {p.connected ? <Wifi className="w-3 h-3 text-primary"/> : <WifiOff className="w-3 h-3 text-destructive"/>}
                  {p.name}{isSelf && <span className="text-primary text-xs">(dig)</span>}
                  {p.isDead && " 💀"}
                </span>
                <span className="text-xs font-ui opacity-70">{p.handCount}🃏</span>
              </div>
              
              {/* Stats og Class Badge */}
              <div className="flex items-center flex-wrap gap-3 text-sm mt-1 font-ui">
                <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5 text-accent"/> {p.level}/{view.settings.winLevel}</span>
                <span className="flex items-center gap-1"><Swords className="w-3.5 h-3.5 text-primary"/> {p.combatPower}</span>
                
                {/* NYT: Viser spillerens klasse som et flot lille badge! */}
                {[p.playerClass, p.extraClass].filter(c => c !== null).map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => inspect(c)}
                    className="flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded bg-indigo-900/60 text-indigo-200 border border-indigo-500/40 cursor-help first-of-type:ml-auto"
                    title={c.effectText}
                  >
                    🎭 {c.name}
                  </button>
                ))}
                {[p.race, p.extraRace].filter(r => r !== null).map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => inspect(r)}
                    className="flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-200 border border-emerald-500/40 cursor-help"
                    title={r.effectText}
                  >
                    🧬 {r.name}
                  </button>
                ))}
                {p.companion && (
                  <button type="button" onClick={() => inspect(p.companion!)} title={p.companion.effectText}
                    className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-lime-900/60 text-lime-200 border border-lime-500/40 cursor-help">
                    🐾 {p.companion.name}
                  </button>
                )}
                {(p.dualClass || p.dualRace) && (
                  <span className="text-[11px]" title={[p.dualClass?.name, p.dualRace?.name].filter(Boolean).join(" + ")}>🌟</span>
                )}
              </div>
              
              {/* Lasting effects (persistent curses etc.) — hover or tap one to see what it does */}
              {p.effects.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {p.effects.map(e => <EffectBadge key={e.id} effect={e} />)}
                </div>
              )}

              {/* Public equipment */}
              {(p.equipment.head || p.equipment.armor || p.equipment.feet || p.equipment.bigItem || p.equipment.hands.length > 0 || p.equipment.none.length > 0) && (
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] font-ui opacity-80">
                  {p.equipment.head && chip(p.equipment.head, "🪖")}
                  {p.equipment.armor && chip(p.equipment.armor, "🛡️")}
                  {p.equipment.feet && chip(p.equipment.feet, "🥾")}
                  {p.equipment.hands.map(h => chip(h, "🗡️"))}
                  {p.equipment.bigItem && chip(p.equipment.bigItem, "📦")}
                  {p.equipment.none.map(n => chip(n, "💍"))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}