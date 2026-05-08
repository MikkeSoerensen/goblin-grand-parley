import { useGame, send } from "@/lib/store";
import { GameCard } from "./GameCard";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import type { Card, EquipmentCard } from "../../../shared/types";
import { Backpack, Hand, Trash2, Coins, Shield, Zap } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

export function PlayerHand() {
  const view = useGame(s => s.view);
  const [selected, setSelected] = useState<string | null>(null);
  const [showBackpack, setShowBackpack] = useState(false);
  const [sellMode, setSellMode] = useState<string[]>([]);
  const [isSelling, setIsSelling] = useState(false);

  if (!view?.self) return null;
  const self = view.self;

  const wanderingMonsterCard = self.hand.find(c => c.type === "wandering-monster");

  const isMyTurn = view.players[view.activePlayerIndex]?.id === self.id;
  const inCombat = view.status === "inCombat" || view.status === "waitingForInterrupts";
  const card = self.hand.find(c => c.id === selected) ?? self.backpack.find(c => c.id === selected) ?? null;

  const playableInCombat = (c: Card) => (c.type === "oneshot" || c.type === "enhancer") && c.cardId !== "o-friendship" && c.cardId !== "o-flask-glue";

  const handleAction = (action: string) => {
    if (!card) return;

    if (action === "equip") {
      if (card.type !== "equipment") return;
      
      const eqCard = card as any;
      const eq = view!.self!.equipment;
      const currentHandsUsed = eq.hands.reduce((n: number, h: any) => n + (h.slot === "twoHands" ? 2 : 1), 0);
      
      let collision = false;
      if (eqCard.isBig && eq.bigItem) collision = true;
      if (eqCard.slot === "head" && eq.head) collision = true;
      if (eqCard.slot === "armor" && eq.armor) collision = true;
      if (eqCard.slot === "feet" && eq.feet) collision = true;
      if (eqCard.slot === "hand" && currentHandsUsed >= 2) collision = true;
      if (eqCard.slot === "twoHands" && currentHandsUsed > 0) collision = true;
      // Bemærk: "none" slot vil aldrig forårsage collision, hvilket er perfekt til Amuletten!

      if (collision) {
        if (window.confirm("Du har i forvejen udstyr på denne plads.\n\nVil du automatisk pakke det gamle udstyr ned i rygsækken og tage dette på i stedet?")) {
          send({ type: "equip", cardId: card.id, forceSwap: true } as any);
        }
      } else {
        send({ type: "equip", cardId: card.id });
      }
    }
    
    if (action === "backpack") send({ type: "toBackpack", cardId: card.id });
    if (action === "discard") send({ type: "discard", cardId: card.id });
    
    if (action === "sell") {
      setIsSelling(true);
      setSellMode([card.id]);
    }
    
    if (action === "lookForTrouble") send({ type: "lookForTrouble", cardId: card.id });
    if (action === "playAttacker") send({ type: "playInCombat", cardId: card.id, side: "attacker" });
    if (action === "playMonster") send({ type: "playInCombat", cardId: card.id, side: "monster" });
    if (action === "playCard") send({ type: "playCard", cardId: card.id });    
    
    setSelected(null);
  };

  const sellTotal = sellMode.reduce((s, id) => {
    const c = self.hand.find(x => x.id === id) ?? self.backpack.find(x => x.id === id);
    return s + (c && (c as any).goldValue !== undefined ? (c as any).goldValue : 0);
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
          
          {isSelling ? (
            <>
              <Button size="sm" variant="default" disabled={sellTotal < 1000} onClick={() => { send({ type: "sell", cardIds: sellMode }); setSellMode([]); setIsSelling(false); }}>
                <Coins className="w-4 h-4 mr-1"/> Confirm Sell ({sellTotal}g)
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setSellMode([]); setIsSelling(false); }}>Cancel</Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => { setIsSelling(true); setSelected(null); }}>
              <Coins className="w-4 h-4 mr-1"/> Sell Items
            </Button>
          )}
        </div>
      </div>

      {/* Ændret fra flex-wrap til flex-nowrap md:flex-wrap og tilføjet gap-2 */}
        <div className="flex flex-nowrap md:flex-wrap items-end gap-3 min-h-[14rem] py-4 px-2 overflow-x-auto scroll-thin pb-6 w-full">
        {(showBackpack ? self.backpack : self.hand).map(c => (
          
          <div key={c.id} className="shrink-0 transition-transform hover:-translate-y-2">
            <GameCard
              card={c}
              size="md"
              selected={selected === c.id || sellMode.includes(c.id)}
              onClick={() => {
                if (isSelling) {
                  if ((c as any).goldValue !== undefined) {
                    setSellMode(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id]);
                  }
                  return;
                }
                setSelected(s => s === c.id ? null : c.id);
              }}
            />
          </div>
        ))}
        {(showBackpack ? self.backpack : self.hand).length === 0 && (
          <div className="text-muted-foreground italic px-4 py-8 w-full text-center">Empty.</div>
        )}
      </div>

      {card && !isSelling && (
        <div className="mt-2 flex flex-wrap gap-2 border-t border-border pt-2 items-center">
          <span className="font-display text-sm opacity-80">{card.name}:</span>
          
          {/* Udstyr - NYT: Tjekker Class Requirements! */}
          {card.type === "equipment" && isMyTurn && !inCombat && (
            <>
              {(card as any).classReq && self.playerClass?.name !== (card as any).classReq ? (
                <Button size="sm" variant="secondary" disabled className="opacity-50">
                  <Shield className="w-4 h-4 mr-1"/>Requires {(card as any).classReq}
                </Button>
              ) : (
                <Button size="sm" onClick={() => handleAction("equip")}><Shield className="w-4 h-4 mr-1"/>Equip</Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => handleAction("backpack")}>To Backpack</Button>
            </>
          )}

          {(card as any).goldValue !== undefined && isMyTurn && !inCombat && (
            <Button size="sm" variant="outline" onClick={() => handleAction("sell")}>
              <Coins className="w-4 h-4 mr-1"/>Sell ({(card as any).goldValue}g)
            </Button>
          )}

          {card.type === "curse" && (
            <div className="flex items-center gap-2 border-l-2 border-destructive pl-2 ml-1">
              <span className="text-sm font-bold text-destructive">Cast on:</span>
              {view.players.map(p => (
                <Button 
                  key={p.id} 
                  size="sm" 
                  variant={p.id === self.id ? "outline" : "destructive"} 
                  onClick={() => {
                    send({ type: "castCurse", cardId: card.id, targetId: p.id });
                    setSelected(null);
                  }}
                >
                  {p.id === self.id ? "Yourself" : p.name}
                </Button>
              ))}
            </div>
          )}

          {card.type === "class" && isMyTurn && !inCombat && (
            <Button size="sm" variant="default" onClick={() => handleAction("playCard")}>
              <Zap className="w-4 h-4 mr-1"/> Become {card.name}
            </Button>
          )}

          {(card.type === "oneshot" || card.type === "go-up-a-level" || card.type === "portal") && isMyTurn && !inCombat && card.cardId !== "o-friendship" && card.cardId !== "o-flask-glue" && (
            <Button size="sm" variant="default" onClick={() => handleAction("playCard")}><Zap className="w-4 h-4 mr-1"/>Play / Use</Button>
          )}

          {card.type === "monster" && card.name.toLowerCase().includes("goblin") && view.combat && view.combat.monsters.some(m => m.name.toLowerCase().includes("goblin")) && (
            <Button size="sm" variant="outline" className="border-green-500 text-green-500" onClick={() => {
              send({ type: "playInCombat", cardId: card.id });
              setSelected(null);
            }}>
              👺 Goblin Swarm!
            </Button>
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

          {/* CLASS ABILITIES */}
          {view.combat && self.playerClass?.name === "Warrior" && (view.combat.attackerId === self.id || view.combat.helperId === self.id) && (() => {
            // NYT: Tjekker om de har The Berserker's Bloodaxe!
            const hasAxe = self.equipment.hands.some((h: any) => h.cardId === "e-bloodaxe");
            return (
              <Button size="sm" variant="outline" className="border-orange-500 text-orange-500" onClick={() => {
                send({ type: "useClassAbility", ability: "berserk", cardIds: [card.id] });
                setSelected(null);
              }}>
                ⚔️ Berserk ({hasAxe ? "+2" : "+1"})
              </Button>
            );
          })()}

          {view.combat && self.playerClass?.name === "Thief" && (
            <Button size="sm" variant="outline" className="border-purple-500 text-purple-500" onClick={() => {
              send({ type: "useClassAbility", ability: "backstab", cardIds: [card.id], targetId: view.combat!.attackerId });
              setSelected(null);
            }}>
              🗡️ Backstab Attacker (-2)
            </Button>
          )}

          {/* Thief: STEAL MENU */}
          {self.playerClass?.name === "Thief" && !inCombat && (() => {
             // NYT: Tjekker om de har Master Thief's Lockpicks
             const hasPicks = self.equipment.hands.some((h: any) => h.cardId === "e-lockpicks");
             return (
              <div className="w-full mt-2 border-t border-purple-500/30 pt-2">
                <span className="text-sm font-bold text-purple-500 flex items-center mb-1">
                  🗡️ Steal from: (Costs this card{hasPicks ? " - 3+ to succeed!" : ""})
                </span>
                <div className="flex flex-col gap-2">
                  {view.players.filter(p => p.id !== self.id && !p.isDead).map(p => {
                    const eqs = [p.equipment.head, p.equipment.armor, p.equipment.feet, p.equipment.bigItem, ...p.equipment.hands].filter(Boolean) as EquipmentCard[];
                    const stealable = eqs.filter(e => !e.isBig);
                    if (stealable.length === 0) return null;
                    return (
                      <div key={p.id} className="flex flex-wrap items-center gap-1 bg-purple-900/20 p-1.5 rounded">
                        <span className="text-xs text-muted-foreground w-16 truncate">{p.name}:</span>
                        {stealable.map(eq => (
                          <Button 
                            key={eq.id} size="sm" variant="outline" className="border-purple-500/50 h-6 text-[10px] px-2" 
                            onClick={() => {
                              send({ type: "useClassAbility", ability: "steal", cardIds: [card.id], targetId: p.id, targetCardId: eq.id } as any);
                              setSelected(null);
                            }}
                          >
                            {eq.name}
                          </Button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
             );
          })()}

          {self.playerClass?.name === "Cleric" && isMyTurn && view.currentPhase === 1 && view.status === "normalTurn" && (
            <Button size="sm" variant="outline" className="border-yellow-500 text-yellow-500" onClick={() => {
              send({ type: "useClassAbility", ability: "resurrect", cardIds: [card.id] });
              setSelected(null);
            }}>
              🙏 Resurrect Door Card
            </Button>
          )}

          {isMyTurn && !inCombat && (
            <Button size="sm" variant="ghost" onClick={() => handleAction("discard")}><Trash2 className="w-4 h-4 mr-1"/>Discard</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Close</Button>

          {card.type === "monster" && view.combat && wanderingMonsterCard && (
            <Button size="sm" variant="outline" className="border-red-500 text-red-500" onClick={() => {
              send({ type: "playInCombat", cardId: wanderingMonsterCard.id, extraCardId: card.id });
              setSelected(null);
            }}>
              🐉 Wander into combat
            </Button>
          )}

          {card.type === "mate" && view.combat && (
            <Button size="sm" variant="outline" className="border-pink-500 text-pink-500" onClick={() => {
              send({ type: "playInCombat", cardId: card.id });
              setSelected(null);
            }}>
              💞 Play Mate
            </Button>
          )}

          {card.cardId === "o-friendship" && inCombat && (
            <Button size="sm" variant="outline" className="border-pink-500 text-pink-500 hover:bg-pink-900/40 w-full mt-2" onClick={() => {
              send({ type: "playInCombat", cardId: card.id });
              setSelected(null);
            }}>
              💖 Play Friendship Potion (End Combat)
            </Button>
          )}

          {card.cardId === "o-flask-glue" && view.combat && (
            <div className="flex flex-col gap-2 border-l-2 border-yellow-500 pl-2 ml-1 mt-2 w-full">
              <span className="text-sm font-bold text-yellow-500">Throw glue at:</span>
              <div className="flex flex-wrap gap-2">
                {[view.combat?.attackerId, view.combat?.helperId].filter(Boolean).map(id => {
                  const p = view.players.find(player => player.id === id);
                  if (!p || p.isDead) return null;
                  return (
                    <Button 
                      key={p.id} size="sm" variant="outline" className="border-yellow-500 text-yellow-500 hover:bg-yellow-900/40"
                      onClick={() => {
                        send({ type: "playCard", cardId: card.id, targetId: p.id } as any);
                        setSelected(null);
                      }}
                    >
                      {p.name}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
          
        </div>
      )}
    </div>
  );
}