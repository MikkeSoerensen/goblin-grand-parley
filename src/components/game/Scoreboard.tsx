import { useGame } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Crown, Heart, Swords, Wifi, WifiOff } from "lucide-react";

export function Scoreboard() {
  const view = useGame(s => s.view);
  if (!view) return null;

  return (
    <aside className="bg-popover/95 backdrop-blur border border-border rounded-xl shadow-card p-3 w-full md:w-72 max-h-[40vh] md:max-h-[80vh] overflow-y-auto scroll-thin shrink-0">
      <h2 className="font-display text-lg brass-text mb-2 flex items-center gap-2">
        <Crown className="w-5 h-5 text-primary" /> Scoreboard
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
                  {p.name}{isSelf && <span className="text-primary text-xs">(you)</span>}
                  {p.isDead && " 💀"}
                </span>
                <span className="text-xs font-ui opacity-70">{p.handCount}🃏</span>
              </div>
              
              {/* Stats og Class Badge */}
              <div className="flex items-center flex-wrap gap-3 text-sm mt-1 font-ui">
                <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5 text-accent"/> {p.level}/10</span>
                <span className="flex items-center gap-1"><Swords className="w-3.5 h-3.5 text-primary"/> {p.combatPower}</span>
                
                {/* NYT: Viser spillerens klasse som et flot lille badge! */}
                {p.playerClass && (
                  <span 
                    className="flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded bg-indigo-900/60 text-indigo-200 border border-indigo-500/40 ml-auto cursor-help"
                    title={p.playerClass.effectText}
                  >
                    🎭 {p.playerClass.name}
                  </span>
                )}
              </div>
              
              {/* Public equipment */}
              {(p.equipment.head || p.equipment.armor || p.equipment.feet || p.equipment.bigItem || p.equipment.hands.length > 0) && (
                <div className="mt-1.5 flex flex-wrap gap-1 text-[10px] font-ui opacity-80">
                  {p.equipment.head && <span title={p.equipment.head.name}>🪖{p.equipment.head.bonus}</span>}
                  {p.equipment.armor && <span title={p.equipment.armor.name}>🛡️{p.equipment.armor.bonus}</span>}
                  {p.equipment.feet && <span title={p.equipment.feet.name}>🥾{p.equipment.feet.bonus}</span>}
                  {p.equipment.hands.map(h => <span key={h.id} title={h.name}>🗡️{h.bonus}</span>)}
                  {p.equipment.bigItem && <span title={p.equipment.bigItem.name}>📦{p.equipment.bigItem.bonus}</span>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}