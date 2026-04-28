import { useGame, send } from "@/lib/store";
import { GameCard } from "./GameCard";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import type { Card, EquipmentCard, MonsterCard } from "../../../shared/types";
import { Backpack, Hand, Trash2, Coins, Shield } from "lucide-react";

export function PlayerHand() {
  const view = useGame(s => s.view);
  const [selected, setSelected] = useState<string | null>(null);
  const [showBackpack, setShowBackpack] = useState(false);
  const [sellMode, setSellMode] = useState<string[]>([]);

  if (!view?.self) return null;
  const self = view.self;
  const isMyTurn = view.players[view.activePlayerIndex]?.id === self.id;
  const inCombat = view.status === "inCombat" || view.status === "waitingForInterrupts";
  const card = self.hand.find(c => c.id === selected) ?? null;

  const playableInCombat = (c: Card) => c.type === "oneshot" || c.type === "enhancer";

  const handleAction = (action: string) => {
    if (!card) return;
    if (action === "equip") send({ type: "equip", cardId: card.id });
    if (action === "backpack") send({ type: "toBackpack", cardId: card.id });
    if (action === "discard") send({ type: "discard", cardId: card.id });
    if (action === "lookForTrouble") send({ type: "lookForTrouble", cardId: card.id });
    if (action === "playAttacker") send({ type: "playInCombat", cardId: card.id, side: "attacker" });
    if (action === "playMonster") send({ type: "playInCombat", cardId: card.id, side: "monster" });
    setSelected(null);
  };

  const sellTotal = sellMode.reduce((s, id) => {
    const c = self.hand.find(x => x.id === id) ?? self.backpack.find(x => x.id === id);
    return s + (c && c.type === "equipment" ? (c as EquipmentCard).goldValue : 0);
  }, 0);

  return (
    <div className="bg-popover/95 backdrop-blur border-t-4 border-wood rounded-t-2xl p-3 shadow-card">
      <div className="flex items-center justify-between mb-2 gap-2">
        <h3 className="font-display text-lg brass-text flex items-center gap-2">
          <Hand className="w-5 h-5"/> {showBackpack ? "Backpack" : "Hand"} ({showBackpack ? self.backpack.length : self.hand.length})
        </h3>
        <div className="flex gap-1.5">
          <Button size="sm" variant={showBackpack ? "default" : "secondary"} onClick={() => setShowBackpack(s => !s)}>
            <Backpack className="w-4 h-4 mr-1"/> Backpack ({self.backpack.length})
          </Button>
          {sellMode.length > 0 ? (
            <>
              <Button size="sm" variant="default" disabled={sellTotal < 1000} onClick={() => { send({ type: "sell", cardIds: sellMode }); setSellMode([]); }}>
                <Coins className="w-4 h-4 mr-1"/> Sell ({sellTotal}g → {Math.floor(sellTotal/1000)} lvl)
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSellMode([])}>Cancel</Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setSellMode([])}><Coins className="w-4 h-4"/></Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end hand-strip min-h-[12rem] py-2 px-1 overflow-x-auto scroll-thin">
        {(showBackpack ? self.backpack : self.hand).map(c => (
          <GameCard
            key={c.id}
            card={c}
            size="md"
            selected={selected === c.id || sellMode.includes(c.id)}
            onClick={() => {
              if (sellMode.length > 0 || (c.type === "equipment")) {
                // toggle sell mode for equipment
                if (c.type === "equipment") {
                  setSellMode(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id]);
                  return;
                }
              }
              setSelected(s => s === c.id ? null : c.id);
            }}
          />
        ))}
        {(showBackpack ? self.backpack : self.hand).length === 0 && (
          <div className="text-muted-foreground italic px-4 py-8">Empty.</div>
        )}
      </div>

      {/* Action menu for selected card */}
      {card && (
        <div className="mt-2 flex flex-wrap gap-2 border-t border-border pt-2 items-center">
          <span className="font-display text-sm opacity-80">{card.name}:</span>
          {card.type === "equipment" && isMyTurn && !inCombat && (
            <>
              <Button size="sm" onClick={() => handleAction("equip")}><Shield className="w-4 h-4 mr-1"/>Equip</Button>
              <Button size="sm" variant="secondary" onClick={() => handleAction("backpack")}>To Backpack</Button>
            </>
          )}
          {card.type === "monster" && isMyTurn && view.currentPhase === 2 && view.status === "normalTurn" && (
            <Button size="sm" variant="default" onClick={() => handleAction("lookForTrouble")}>👁️ Look for Trouble</Button>
          )}
          {inCombat && playableInCombat(card) && (
            <>
              <Button size="sm" onClick={() => handleAction("playAttacker")}>⚔️ Play for attacker</Button>
              <Button size="sm" variant="destructive" onClick={() => handleAction("playMonster")}>👹 Play for monster</Button>
            </>
          )}
          {isMyTurn && !inCombat && (
            <Button size="sm" variant="ghost" onClick={() => handleAction("discard")}><Trash2 className="w-4 h-4 mr-1"/>Discard</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Close</Button>
        </div>
      )}
    </div>
  );
}
