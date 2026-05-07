import { useGame, send } from "@/lib/store";
import { GameCard } from "./GameCard";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import type { Card, EquipmentCard } from "../../../shared/types";
import { Backpack, Hand, Trash2, Coins, Shield, Zap } from "lucide-react";

export function PlayerHand() {
  const view = useGame(s => s.view);
  const [selected, setSelected] = useState<string | null>(null);
  const [showBackpack, setShowBackpack] = useState(false);
  const [sellMode, setSellMode] = useState<string[]>([]);
  const [isSelling, setIsSelling] = useState(false);

  // 1. Definer self én gang for alle. Vi sørger for, at komponenten stopper her, hvis der ikke er en spiller.
  if (!view?.self) return null;
  const self = view.self;

  // 2. Nu er 'self' defineret og garanteret at eksistere, så vi kan trygt lede efter kortet.
  const wanderingMonsterCard = self.hand.find(c => c.type === "wandering-monster");

  // 3. Definer resten af de variabler, du skal bruge til komponenten.
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
    
    // Sætter spillet direkte i "Sell Mode" og markerer kortet
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
    let val = c && (c as any).goldValue !== undefined ? (c as any).goldValue : 0;
    
    // Vi spørger lige dommeren (serveren) om de aktuelle guld-regler!
    if (view.activeDungeons?.some((d: any) => d.cardId === "d-clipping")) {
      val = Math.max(0, val - 100);
    }
    if (view.activeDungeons?.some((d: any) => d.cardId === "d-lavish")) {
      val *= 2;
    }
    
    return s + val;
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

      <div className="flex flex-wrap items-end hand-strip min-h-[12rem] py-2 px-1 overflow-x-auto scroll-thin">
        {(showBackpack ? self.backpack : self.hand).map(c => (
          <GameCard
            key={c.id}
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
        ))}
        {(showBackpack ? self.backpack : self.hand).length === 0 && (
          <div className="text-muted-foreground italic px-4 py-8">Empty.</div>
        )}
      </div>

      {/* Action menu for selected card */}
      {card && !isSelling && (
        <div className="mt-2 flex flex-wrap gap-2 border-t border-border pt-2 items-center">
          <span className="font-display text-sm opacity-80">{card.name}:</span>
          
          {/* Udstyr */}
          {card.type === "equipment" && isMyTurn && !inCombat && (
            <>
              <Button size="sm" onClick={() => handleAction("equip")}><Shield className="w-4 h-4 mr-1"/>Equip</Button>
              <Button size="sm" variant="secondary" onClick={() => handleAction("backpack")}>To Backpack</Button>
            </>
          )}

          {/* Alt med en guldværdi (Både udstyr og oneshots!) */}
          {(card as any).goldValue !== undefined && isMyTurn && !inCombat && (
            <Button size="sm" variant="outline" onClick={() => handleAction("sell")}>
              <Coins className="w-4 h-4 mr-1"/>Sell ({(card as any).goldValue}g)
            </Button>
          )}

          {/* Forbandelser (Curses) */}
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

          {/* Classes */}
          {card.type === "class" && isMyTurn && !inCombat && (
            <Button size="sm" variant="default" onClick={() => handleAction("playCard")}>
              <Zap className="w-4 h-4 mr-1"/> Become {card.name}
            </Button>
          )}

          {/* Level up / Oneshots / Portaler (uden for kamp) */}
          {(card.type === "oneshot" || card.type === "go-up-a-level" || card.type === "portal") && isMyTurn && !inCombat && card.cardId !== "o-friendship" && card.cardId !== "o-flask-glue" && (
            <Button size="sm" variant="default" onClick={() => handleAction("playCard")}><Zap className="w-4 h-4 mr-1"/>Play / Use</Button>
          )}

          {/* Knap til Goblin-Sværm */}
          {card.type === "monster" && card.name.toLowerCase().includes("goblin") && view.combat && view.combat.monsters.some(m => m.name.toLowerCase().includes("goblin")) && (
            <Button size="sm" variant="outline" className="border-green-500 text-green-500" onClick={() => {
              send({ type: "playInCombat", cardId: card.id });
              setSelected(null);
            }}>
              👺 Goblin Swarm!
            </Button>
          )}

          {/* Monstre */}
          {card.type === "monster" && isMyTurn && view.currentPhase === 2 && view.status === "normalTurn" && (
            <Button size="sm" variant="default" onClick={() => handleAction("lookForTrouble")}>👁️ Look for Trouble</Button>
          )}

          {/* Kamp-specifikke kort */}
          {inCombat && playableInCombat(card) && (
            <>
              <Button size="sm" onClick={() => handleAction("playAttacker")}>⚔️ Play for attacker</Button>
              <Button size="sm" variant="destructive" onClick={() => handleAction("playMonster")}>👹 Play for monster</Button>
            </>
          )}

          {/* CLASS ABILITIES (Vises under kamp når man vælger et kort) */}
          {view.combat && self.playerClass?.name === "Warrior" && (view.combat.attackerId === self.id || view.combat.helperId === self.id) && (
            <Button size="sm" variant="outline" className="border-orange-500 text-orange-500" onClick={() => {
              send({ type: "useClassAbility", ability: "berserk", cardIds: [card.id] });
              setSelected(null);
            }}>
              ⚔️ Berserk (+1)
            </Button>
          )}

          {view.combat && self.playerClass?.name === "Thief" && (
            <Button size="sm" variant="outline" className="border-purple-500 text-purple-500" onClick={() => {
              send({ type: "useClassAbility", ability: "backstab", cardIds: [card.id], targetId: view.combat!.attackerId });
              setSelected(null);
            }}>
              🗡️ Backstab Attacker (-2)
            </Button>
          )}

          {/* Thief: STEAL MENU (Uden for kamp) */}
          {self.playerClass?.name === "Thief" && !inCombat && (
            <div className="w-full mt-2 border-t border-purple-500/30 pt-2">
              <span className="text-sm font-bold text-purple-500 flex items-center mb-1">🗡️ Steal from: (Costs this card)</span>
              <div className="flex flex-col gap-2">
                {view.players.filter(p => p.id !== self.id && !p.isDead).map(p => {
                  // Saml alt modstanderens aktive udstyr
                  const eqs = [p.equipment.head, p.equipment.armor, p.equipment.feet, p.equipment.bigItem, ...p.equipment.hands].filter(Boolean) as EquipmentCard[];
                  // Tyve kan kun stjæle ting, der IKKE er "Big"
                  const stealable = eqs.filter(e => !e.isBig);
                  
                  if (stealable.length === 0) return null;
                  
                  return (
                    <div key={p.id} className="flex flex-wrap items-center gap-1 bg-purple-900/20 p-1.5 rounded">
                      <span className="text-xs text-muted-foreground w-16 truncate">{p.name}:</span>
                      {stealable.map(eq => (
                        <Button 
                          key={eq.id} 
                          size="sm" 
                          variant="outline" 
                          className="border-purple-500/50 h-6 text-[10px] px-2" 
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
          )}

          {/* Cleric: Resurrection (Må kun bruges i Phase 1, i stedet for Kick Open the Door) */}
          {self.playerClass?.name === "Cleric" && isMyTurn && view.currentPhase === 1 && view.status === "normalTurn" && (
            <Button size="sm" variant="outline" className="border-yellow-500 text-yellow-500" onClick={() => {
              send({ type: "useClassAbility", ability: "resurrect", cardIds: [card.id] });
              setSelected(null);
            }}>
              🙏 Resurrect Door Card
            </Button>
          )}

          {/* Generelle knapper */}
          {isMyTurn && !inCombat && (
            <Button size="sm" variant="ghost" onClick={() => handleAction("discard")}><Trash2 className="w-4 h-4 mr-1"/>Discard</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Close</Button>

          {/* Knap til Wandering Monster */}
          {card.type === "monster" && view.combat && wanderingMonsterCard && (
            <Button size="sm" variant="outline" className="border-red-500 text-red-500" onClick={() => {
              send({ type: "playInCombat", cardId: wanderingMonsterCard.id, extraCardId: card.id });
              setSelected(null);
            }}>
              🐉 Wander into combat
            </Button>
          )}

          {/* Knap til Mate */}
          {card.type === "mate" && view.combat && (
            <Button size="sm" variant="outline" className="border-pink-500 text-pink-500" onClick={() => {
              send({ type: "playInCombat", cardId: card.id });
              setSelected(null);
            }}>
              💞 Play Mate
            </Button>
          )}

          {/* SPECIAL: Friendship Potion */}
          {card.cardId === "o-friendship" && inCombat && (
            <Button size="sm" variant="outline" className="border-pink-500 text-pink-500 hover:bg-pink-900/40 w-full mt-2" onClick={() => {
              send({ type: "playInCombat", cardId: card.id });
              setSelected(null);
            }}>
              💖 Play Friendship Potion (End Combat)
            </Button>
          )}

          {/* SPECIAL: Flask of Glue */}
          {card.cardId === "o-flask-glue" && view.combat && (
            <div className="flex flex-col gap-2 border-l-2 border-yellow-500 pl-2 ml-1 mt-2 w-full">
              <span className="text-sm font-bold text-yellow-500">Throw glue at:</span>
              <div className="flex flex-wrap gap-2">
                {[view.combat?.attackerId, view.combat?.helperId].filter(Boolean).map(id => {
                  const p = view.players.find(player => player.id === id);
                  if (!p || p.isDead) return null;
                  return (
                    <Button 
                      key={p.id} 
                      size="sm" 
                      variant="outline" 
                      className="border-yellow-500 text-yellow-500 hover:bg-yellow-900/40"
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