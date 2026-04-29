import { useGame, send } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { GameCard } from "./GameCard";
import { useState } from "react";
import { Swords, Shield, HandHelping, Dice5, AlertTriangle } from "lucide-react";

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
  const winning = playerTotal > monsterTotal;

  const myPass = !!c.passes[self.id];
  const canPass = !myPass && !isFighter; // Kun modstandere må trykke pass
  
  const alivePlayers = view.players.filter(p => !p.isDead).length;
  const expectedPasses = alivePlayers - (c.helperId ? 2 : 1); 
  const passCount = Object.values(c.passes).filter(Boolean).length;
  const allPassed = passCount >= expectedPasses;

  // NY LOGIK: Håndterer når spilleren prøver at afslutte kampen
  const handleResolveClick = () => {
    if (!winning) {
      // Spilleren er bagud
      const confirmRun = window.confirm("Advarsel: Monsteret er stærkere end dig!\n\nEr du sikker på, at du ikke vil bede om hjælp eller bruge flere items? Trykker du OK, accepterer du nederlaget og går direkte til at slå om at flygte (Run Away).");
      if (confirmRun) {
        send({ type: "runAway" }); // Gå direkte til flugt-fasen
      }
    } else {
      // Spilleren fører og beder de andre om at acceptere
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
          {view.status === "inCombat" && winning && "Ready to declare victory!"}
          {view.status === "inCombat" && !winning && "You are losing! Ask for help or run."}
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
                <input type="number" min={0} max={5} value={helpTreasures[p.id] ?? 1} onChange={e => setHelpTreasures(s => ({ ...s, [p.id]: Math.max(0, +e.target.value) }))} className="w-14 bg-input rounded px-2 py-1 text-sm border border-border" />
                <Button size="sm" onClick={() => send({ type: "askForHelp", helperId: p.id, treasures: helpTreasures[p.id] ?? 1 })}>Offer</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pass + resolve */}
      <div className="flex gap-2 flex-wrap pt-2 border-t border-border">
        {/* Modstandere får kun Pass-knappen, hvis angriberen rent faktisk vinder! */}
        {canPass && view.status !== "runAwayRoll" && (
          <Button size="sm" variant={myPass ? "secondary" : "default"} onClick={() => send({ type: "pass" })} className={!myPass ? "pulse-glow" : ""}>
            {myPass ? "✓ Passed" : "Pass"}
          </Button>
        )}
        
        {/* Angriberen ser altid knappen. Den skifter tekst alt efter situationen. */}
        {isAttacker && (view.status === "inCombat" || view.status === "waitingForInterrupts") && (
          <Button size="sm" variant={winning ? "default" : "destructive"} onClick={handleResolveClick}>
            {winning ? (allPassed ? "🎉 Finish & Win!" : "Attempt to Win") : <><AlertTriangle className="w-4 h-4 mr-1"/> Accept Defeat</>}
          </Button>
        )}

        {view.status === "runAwayRoll" && isFighter && (
          <Button size="sm" variant="destructive" onClick={() => send({ type: "runAway" })}><Dice5 className="w-4 h-4 mr-1"/> Roll to Run Away</Button>
        )}
        
        {winning && (
          <div className="flex-1 text-right text-xs opacity-70 font-ui self-center">
            Pass votes: {passCount}/{expectedPasses > 0 ? expectedPasses : 0}
          </div>
        )}
      </div>
    </div>
  );
}