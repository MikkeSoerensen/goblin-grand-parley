import { useGame, send } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { GameCard } from "./GameCard";
import { useState } from "react";
import { Swords, HandHelping, Dice5, AlertTriangle, Zap } from "lucide-react";

export function CombatPanel() {
  const view = useGame(s => s.view);
  const [helpTreasures, setHelpTreasures] = useState<Record<string, number>>({});

  if (!view?.combat || !view.self) return null;
  const c = view.combat;
  const self = view.self;
  const isAttacker = c.attackerId === self.id;
  const isHelper = c.helperId === self.id;
  const isFighter = isAttacker || isHelper;
  const attacker = view.players.find(p => p.id === c.attackerId)!;
  const helper = c.helperId ? view.players.find(p => p.id === c.helperId) : null;
  const monsterTotal = c.monsters.reduce((s, m) => s + m.level, 0) + c.monsterBonuses;
  const playerTotal = (attacker.combatPower + (helper?.combatPower ?? 0)) + c.attackerBonuses;
  // Frontend tjekker nu også om angriberen eller hjælperen er Warrior!
  const hasWarrior = attacker.playerClass?.name === "Warrior" || helper?.playerClass?.name === "Warrior";
  const winning = hasWarrior ? playerTotal >= monsterTotal : playerTotal > monsterTotal;
  const totalTreasures = c.monsters.reduce((s, m) => s + m.treasures, 0);

  const myPass = !!c.passes[self.id];
  const canPass = !myPass && !isFighter; 
  
  const alivePlayers = view.players.filter(p => !p.isDead).length;
  const expectedPasses = alivePlayers - (c.helperId ? 2 : 1); 
  const passCount = Object.values(c.passes).filter(Boolean).length;
  const allPassed = passCount >= expectedPasses;

  const handleResolveClick = () => {
    if (!allPassed) {
      alert("Vent lige lidt! ✋\n\nDine modstandere skal trykke 'Pass', før du kan afslutte kampen eller flygte. De har stadig deres tid til at kaste en sidste forbandelse!");
      return;
    }

    if (!winning) {
      const confirmRun = window.confirm("Advarsel: Monsteret er stærkere end dig!\n\nEr du sikker på, at du ikke vil bede om hjælp eller bruge flere items? Trykker du OK, accepterer du nederlaget og går direkte til at slå om at flygte (Run Away).");
      if (confirmRun) {
        send({ type: "flee" });
      }
    } else {
      send({ type: "resolveCombat" });
    }
  };

  return (
    <div className="bg-popover/95 backdrop-blur border-2 border-primary/60 shadow-glow-brass rounded-xl p-4 max-w-2xl">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-xl brass-text flex items-center gap-2">
          <Swords className="w-5 h-5"/> Combat
        </h2>
        <div className="text-sm font-ui opacity-80">
          {view.status === "waitingForInterrupts" && "Waiting for opponents to pass…"}
          {view.status === "inCombat" && !winning && (isAttacker ? "You are losing! Ask for help or run." : `${attacker.name} is losing!`)}
          {view.status === "inCombat" && winning && "Ready to declare victory!"}
          {view.status === "runAwayRoll" && "Run away phase"}
        </div>
      </div>

      {/* Score */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className={`rounded-lg p-3 border-2 ${winning ? "border-primary bg-primary/10" : "border-border bg-muted/30"}`}>
          <div className="text-xs opacity-70 font-ui">Players</div>
          <div className="font-display text-3xl brass-text">{playerTotal}</div>
          <div className="text-xs opacity-70 font-ui truncate">{attacker.name}{helper && ` + ${helper.name}`}</div>
        </div>
        <div className={`rounded-lg p-3 border-2 ${!winning ? "border-destructive bg-destructive/10" : "border-border bg-muted/30"}`}>
          <div className="text-xs opacity-70 font-ui">Monsters</div>
          <div className="font-display text-3xl text-destructive">{monsterTotal}</div>
          <div className="text-xs opacity-70 font-ui truncate">{c.monsters.map(m => m.name).join(", ")}</div>
        </div>
      </div>

      {/* Monster cards */}
      <div className="flex gap-2 justify-center mb-3 flex-wrap">
        {c.monsters.map(m => <GameCard key={m.id} card={m} size="md"/>)}
      </div>

      {/* Combat log */}
      <div className="bg-muted/40 rounded-lg p-2 mb-3 max-h-24 overflow-y-auto scroll-thin text-xs font-ui">
        {c.log.slice(-6).map((l, i) => <div key={i} className="opacity-80">{l}</div>)}
      </div>

      {/* Negotiation */}
      {isAttacker && !c.helperId && view.status !== "runAwayRoll" && (
        <div className="border-t border-border pt-3 mb-3">
          <div className="font-display text-sm mb-2 flex items-center gap-1"><HandHelping className="w-4 h-4"/> Ask for help</div>
          <div className="grid gap-1.5">
            {view.players.filter(p => p.id !== self.id && !p.isDead).map(p => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">{p.name} (Pwr {p.combatPower})</span>
                <input 
                  type="number" 
                  min={0} 
                  max={totalTreasures} 
                  value={helpTreasures[p.id] ?? Math.min(1, totalTreasures)} 
                  onChange={e => setHelpTreasures(s => ({ ...s, [p.id]: Math.min(totalTreasures, Math.max(0, +e.target.value)) }))} 
                  className="w-14 bg-input rounded px-2 py-1 text-sm border border-border" 
                />
                <Button 
                  size="sm" 
                  onClick={() => send({ type: "askForHelp", helperId: p.id, treasures: helpTreasures[p.id] ?? Math.min(1, totalTreasures) })}
                >
                  Offer
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
      {c.contract && (
        <div className="text-xs font-ui mb-2 px-2 py-1 rounded bg-accent/20 border border-accent/40">
          🩸 Blood Oath: helper gets {c.contract.treasures} treasure(s) — locked.
        </div>
      )}

      {view.negotiations.filter((n: any) => n.toId === self.id && n.status === "pending").map((n: any) => (
        <div key={n.id} className="border-t border-border pt-2 mb-2 flex items-center gap-2 text-sm">
          <span className="flex-1">{view.players.find(p => p.id === n.fromId)?.name} offers <b>{n.treasures}</b> treasure(s) for help.</span>
          <Button size="sm" onClick={() => send({ type: "respondHelp", offerId: n.id, accept: true })}>Accept (Blood Oath)</Button>
          <Button size="sm" variant="ghost" onClick={() => send({ type: "respondHelp", offerId: n.id, accept: false })}>Decline</Button>
        </div>
      ))}

      {/* --- NY SEKTION: CLASS ABILITIES --- */}
      {self.playerClass && view.status !== "runAwayRoll" && (
        <div className="border-t border-border pt-3 mb-3">
          <div className="font-display text-sm mb-2 flex items-center gap-1 text-indigo-400">
            <Zap className="w-4 h-4"/> {self.playerClass.name} Abilities
          </div>
          <div className="flex gap-2 flex-wrap">
            
            {/* Wizard: Charm Monster (Knap direkte i panelet) */}
            {self.playerClass.name === "Wizard" && isFighter && self.handCount >= 3 && c.monsters.map(m => (
              <Button 
                key={m.id} 
                size="sm" 
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => {
                  if(window.confirm(`Er du sikker på du vil kassere HELE din hånd for at Charm'e ${m.name}?`)) {
                    send({ type: "useClassAbility", ability: "charm", cardIds: [], monsterId: m.id });
                  }
                }}
              >
                🪄 Charm {m.name} (Discard Hand)
              </Button>
            ))}
            {self.playerClass.name === "Wizard" && isFighter && self.handCount < 3 && (
               <div className="text-xs font-ui text-muted-foreground italic">You need at least 3 cards in hand to use Charm.</div>
            )}

            {/* Warrior: Berserk (Guide-tekst) */}
            {self.playerClass.name === "Warrior" && isFighter && (
              <div className="text-xs font-ui px-3 py-2 bg-indigo-900/30 rounded border border-indigo-500/30">
                💡 <b>Berserk:</b> Click on cards in your hand to discard them for +1 combat power (max 3 per combat).
              </div>
            )}

            {/* Thief: Backstab (Guide-tekst) */}
            {self.playerClass.name === "Thief" && (
              <div className="text-xs font-ui px-3 py-2 bg-indigo-900/30 rounded border border-indigo-500/30">
                💡 <b>Backstab:</b> Click on a card in your hand to discard it and give {attacker.name} -2 in combat.
              </div>
            )}

          </div>
        </div>
      )}

      {/* Pass + resolve */}
      <div className="flex gap-2 flex-wrap pt-2 border-t border-border">
        {canPass && view.status !== "runAwayRoll" && (
          <Button size="sm" variant={myPass ? "secondary" : "default"} onClick={() => send({ type: "pass" })} className={!myPass ? "pulse-glow" : ""}>
            {myPass ? "✓ Passed" : "Pass"}
          </Button>
        )}
        
        {isAttacker && (view.status === "inCombat" || view.status === "waitingForInterrupts") && (
          <Button size="sm" variant={winning ? "default" : "destructive"} onClick={handleResolveClick}>
            {winning 
              ? (allPassed ? "🎉 Finish & Win!" : "Attempt to Win") 
              : <><AlertTriangle className="w-4 h-4 mr-1"/> {allPassed ? "Accept Defeat" : "Attempt to Flee"}</>}
          </Button>
        )}

        {view.status === "runAwayRoll" && isFighter && (
          <Button size="sm" variant="destructive" onClick={() => send({ type: "runAway" })}><Dice5 className="w-4 h-4 mr-1"/> Roll to Run Away</Button>
        )}
        
        <div className="flex-1 text-right text-xs opacity-70 font-ui self-center">
          Pass votes: {passCount}/{expectedPasses > 0 ? expectedPasses : 0}
        </div>
      </div>
    </div>
  );
}