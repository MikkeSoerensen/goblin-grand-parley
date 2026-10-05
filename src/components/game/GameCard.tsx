import { Card, EquipmentCard, MonsterCard, ClassCard, ClassName } from "../../../shared/types";
import { hasClass, hasTag } from "../../../shared/rules";
import { cn } from "@/lib/utils";
import { useGame } from "@/lib/store";

const typeStyles: Record<string, string> = {
  monster: "bg-gradient-monster text-monster-foreground",
  equipment: "bg-gradient-to-br from-equip to-equip/70 text-equip-foreground",
  curse: "bg-gradient-curse text-curse-foreground",
  oneshot: "bg-gradient-to-br from-oneshot to-oneshot/70 text-oneshot-foreground",
  enhancer: "bg-gradient-to-br from-enhancer to-enhancer/70 text-enhancer-foreground",
  "go-up-a-level": "bg-gradient-treasure text-treasure-foreground",
  class: "bg-gradient-to-br from-indigo-900 to-purple-900 text-white border-purple-500/50",
  "wandering-monster": "bg-gradient-to-br from-orange-600 to-red-800 text-white border-orange-500/50",
  mate: "bg-gradient-to-br from-pink-500 to-rose-700 text-white border-pink-400/50",
  // NYE FARVER TIL PORTAL OG DUNGEON:
  portal: "bg-gradient-to-br from-teal-500 to-emerald-800 text-white border-teal-400/50",
  dungeon: "bg-gradient-to-br from-purple-800 to-indigo-950 text-white border-purple-500/50",
};

const slotIcon: Record<string, string> = {
  head: "🪖", armor: "🛡️", feet: "🥾", hand: "🗡️", twoHands: "⚔️", bigItem: "📦",
};

interface Props {
  card: Card;
  size?: "sm" | "md" | "lg";
  faceDown?: boolean;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export function GameCard({ card, size = "md", faceDown, selected, onClick, className }: Props) {
  const sizes = {
    sm: "w-16 h-24 md:w-20 md:h-28 text-[9px] md:text-[10px]",
    md: "w-24 h-32 md:w-32 md:h-44 text-[10px] md:text-xs",
    lg: "w-32 h-44 md:w-44 md:h-60 text-xs md:text-sm shrink-0", 
  };

  // Nedenstående henter aktive dungeons fra game state, så vi kan vise deres effekter på kortene i hånden (f.eks. Goblin Land og Dimension of Hoarding)
  const view = useGame(s => s.view);
  const activeDungeons = view?.activeDungeons || [];

  if (faceDown) {
    return (
      <div className={cn("card-base bg-gradient-wood border-2 border-wood-light flex items-center justify-center", sizes[size], className)}>
        <span className="brass-text font-display font-bold text-lg">M</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "card-base flex flex-col items-stretch text-left p-2 border-2 border-card/40",
        typeStyles[card.type] ?? "bg-card text-card-foreground",
        sizes[size],
        selected && "ring-4 ring-primary ring-offset-2 ring-offset-background",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <div className="flex justify-between items-start gap-1">
        <span className="font-display font-bold leading-tight line-clamp-2">{card.name}</span>
      </div>
      <div className="flex-1 flex items-center justify-center text-3xl opacity-80">
        {card.type === "monster" && "👹"}
        {card.type === "curse" && "💀"}
        {card.type === "equipment" && slotIcon[(card as EquipmentCard).slot]}
        {card.type === "oneshot" && "🧪"}
        {card.type === "enhancer" && "✨"}
        {card.type === "go-up-a-level" && "⬆️"}
        {card.type === "class" && "🎭"}
        {/* NYE IKONER: */}
        {card.type === "wandering-monster" && "🐉"}
        {card.type === "mate" && "💞"}
        {/* NYE IKONER TIL PORTAL OG DUNGEON: */}
        {card.type === "portal" && "🌀"}
        {card.type === "dungeon" && "🏰"}
      </div>
      <div className="text-[10px] font-ui opacity-90 space-y-0.5">
      </div>
      <div className="text-[10px] font-ui opacity-90 space-y-0.5">

        {card.type === "monster" && (() => {
          const m = card as MonsterCard;
          let diff = 0; 
          let treasureDiff = 0; 
          
          // 1. Tjekker Dungeon Bonusser
          if (activeDungeons && activeDungeons.length > 0) {
            let modifiedLevel = m.level;
            if (activeDungeons.some(d => d.cardId === "d-martial")) modifiedLevel += 2;
            if (activeDungeons.some(d => d.cardId === "d-feeble")) modifiedLevel = Math.max(1, modifiedLevel - 5);
            if (activeDungeons.some(d => d.cardId === "d-goblin") && hasTag(m, "goblin")) {
              modifiedLevel += 3;
            }
            diff += (modifiedLevel - m.level); 

            if (activeDungeons.some(d => d.cardId === "d-wealth")) {
              treasureDiff = 1;
            }
          }

          // 2. NYT: Tjekker Anti-Class Bonus (Kun når monsteret er i kamp!)
          if (m.antiClass && view?.combat && view.combat.monsters.some(c => c.id === m.id)) {
            const atk = view.players.find(p => p.id === view.combat!.attackerId);
            const hlp = view.combat.helperId ? view.players.find(p => p.id === view.combat!.helperId) : null;
            
            // Hvis angriberen eller hjælperen er den hadede class, får den sin bonus!
            const hated = m.antiClass.className as ClassName;
            if ((atk && hasClass(atk, hated)) || (hlp && hasClass(hlp, hated))) {
              diff += m.antiClass.bonus;
            }
          }
          
          const diffText = diff > 0 ? ` (+${diff})` : diff < 0 ? ` (${diff})` : "";
          const tDiffText = treasureDiff > 0 ? ` (+${treasureDiff})` : "";

          return (
            <>
              <div className="font-bold">Lvl {m.level}<span className={diff > 0 ? "text-green-400" : diff < 0 ? "text-red-400" : ""}>{diffText}</span></div>
              <div>+{m.levelsAwarded} lvl · {m.treasures}<span className="text-yellow-400">{tDiffText}</span> tr</div>
              <div className="opacity-75 line-clamp-2 italic">{m.badStuffText}</div>
            </>
          );
        })()}

        {card.type === "equipment" && (() => {
          const eq = card as EquipmentCard;
          let price = eq.goldValue;
          let priceColor = "";
          let label = `${price}g`;

          // Tjek dungeons for prisændringer
          if (activeDungeons?.some(d => d.cardId === "d-poverty")) {
            price = 0;
            priceColor = "text-red-500 font-bold";
            label = "CANNOT SELL";
          } else if (activeDungeons?.some(d => d.cardId === "d-lavish")) {
            price = eq.goldValue * 2;
            priceColor = "text-green-400 font-bold";
            label = `${price}g (x2)`;
          } else if (activeDungeons?.some(d => d.cardId === "d-clipping")) {
            price = Math.max(0, eq.goldValue - 100);
            priceColor = "text-orange-400";
            label = `${price}g (-100)`;
          }

          return (
            <>
              <div className="font-bold">
                {eq.bonus > 0 ? "+" : ""}{eq.bonus} {eq.slot !== "none" ? eq.slot : ""}{eq.isBig ? " · BIG" : ""}
              </div>
              <div className={priceColor}>{label}</div>
              
              {/* NYT: Viser Class Requirement og effekten (flavor) */}
              {eq.classReq && (
                <div className="text-[10px] font-bold text-orange-300 mt-1">
                  Requires {eq.classReq}
                </div>
              )}
              {eq.flavor && (
                <div className="text-[10px] italic opacity-80 mt-1 leading-tight line-clamp-3">
                  {eq.flavor}
                </div>
              )}
            </>
          );
        })()}
        {card.type === "oneshot" && <div className="font-bold">+{card.bonus} · {card.goldValue}g</div>}
        {card.type === "enhancer" && <div className="font-bold">{card.bonus > 0 ? "+" : ""}{card.bonus} mon</div>}
        {card.type === "curse" && <div className="opacity-90 italic line-clamp-3">{card.effectText}</div>}
        
        {card.type === "class" && (
          <>
            <div className="font-bold">Class</div>
            <div className="opacity-90 italic line-clamp-4 text-[9px] leading-tight">{(card as ClassCard).effectText}</div>
          </>
        )}

        {/* NY TEKST TIL WANDERING MONSTER OG MATE */}
        {card.type === "wandering-monster" && (
           <div className="opacity-90 italic line-clamp-4 text-[9px] leading-tight">{card.flavor}</div>
        )}

        {card.type === "mate" && (
           <div className="opacity-90 italic line-clamp-4 text-[9px] leading-tight">{card.flavor}</div>
        )}
      </div>

      {/* NY TEKST TIL PORTAL OG DUNGEON */}
        {(card.type === "portal" || card.type === "dungeon") && (
           <div className="opacity-90 italic line-clamp-4 text-[10px] leading-tight">{card.effectText}</div>
        )}
        
    </button>
  );
}