import { Card, EquipmentCard, MonsterCard } from "../../../shared/types";
import { cn } from "@/lib/utils";

const typeStyles: Record<string, string> = {
  monster: "bg-gradient-monster text-monster-foreground",
  equipment: "bg-gradient-to-br from-equip to-equip/70 text-equip-foreground",
  curse: "bg-gradient-curse text-curse-foreground",
  oneshot: "bg-gradient-to-br from-oneshot to-oneshot/70 text-oneshot-foreground",
  enhancer: "bg-gradient-to-br from-enhancer to-enhancer/70 text-enhancer-foreground",
  "go-up-a-level": "bg-gradient-treasure text-treasure-foreground",
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
    sm: "w-20 h-28 text-[10px]",
    md: "w-32 h-44 text-xs",
    lg: "w-44 h-60 text-sm",
  };

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
      </div>
      <div className="text-[10px] font-ui opacity-90 space-y-0.5">
        {card.type === "monster" && (
          <>
            <div className="font-bold">Lvl {(card as MonsterCard).level}</div>
            <div>+{(card as MonsterCard).levelsAwarded} lvl · {(card as MonsterCard).treasures} tr</div>
            <div className="opacity-75 line-clamp-2 italic">{(card as MonsterCard).badStuffText}</div>
          </>
        )}
        {card.type === "equipment" && (
          <>
            <div className="font-bold">+{(card as EquipmentCard).bonus}</div>
            <div>{(card as EquipmentCard).slot}{(card as EquipmentCard).isBig ? " · BIG" : ""}</div>
            <div>{(card as EquipmentCard).goldValue}g</div>
          </>
        )}
        {card.type === "oneshot" && <div className="font-bold">+{(card as any).bonus} · {(card as any).goldValue}g</div>}
        {card.type === "enhancer" && <div className="font-bold">{(card as any).bonus > 0 ? "+" : ""}{(card as any).bonus} mon</div>}
        {card.type === "curse" && <div className="opacity-90 italic line-clamp-3">{(card as any).effectText}</div>}
      </div>
    </button>
  );
}
