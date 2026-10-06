import { useGame, send } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { GameCard } from "./GameCard";
import { useEffect, useState } from "react";
import { CLASS_LABEL, hasClass, isTradable, tollPrice, tradeValue, treasuresText } from "../../../shared/rules";
import type { Card } from "../../../shared/types";
import { Swords, HandHelping, Dice5, AlertTriangle, Zap } from "lucide-react";

// Counts down locally from the server's "ms left" (so device clocks never matter).
function useCountdown(msLeft: number | null): number | null {
  const [left, setLeft] = useState(msLeft);
  useEffect(() => {
    if (msLeft === null) { setLeft(null); return; }
    const until = Date.now() + msLeft;
    setLeft(msLeft);
    const t = setInterval(() => setLeft(Math.max(0, until - Date.now())), 200);
    return () => clearInterval(t);
  }, [msLeft]);
  return left;
}

export function CombatPanel() {
  const view = useGame(s => s.view);
  const countdown = useCountdown(view?.combat?.interruptMsLeft ?? null);
  const [helpTreasures, setHelpTreasures] = useState<Record<string, number>>({});
  const [bribes, setBribes] = useState<Record<string, string[]>>({});
  const [tollPick, setTollPick] = useState<string[]>([]);

  if (!view?.combat || !view.self) return null;
  const c = view.combat;
  const self = view.self;
  const isAttacker = c.attackerId === self.id;
  const isHelper = c.helperId === self.id;
  const isFighter = isAttacker || isHelper;
  const hasCowards = view.activeDungeons.some(d => d.cardId === "d-cowards");
  const hasChaos = view.activeDungeons.some(d => d.cardId === "d-chaos");
  const hasSwapping = view.activeDungeons.some(d => d.cardId === "d-swapping");
  const hasSlippers = self.equipment.feet?.cardId === "e-kneepads";
  const attacker = view.players.find(p => p.id === c.attackerId)!;
  const helper = c.helperId ? view.players.find(p => p.id === c.helperId) : null;

  // Totals come from the server, so every dungeon, anti-class boss and item bonus is always included.
  const { monsterTotal, playerTotal } = c;
  
  // Frontend tjekker nu også om angriberen eller hjælperen er Warrior!
  const hasWarrior = hasClass(attacker, "Warrior") || (!!helper && hasClass(helper, "Warrior"));
  // Valuables you could bribe or pay a toll with: treasure in hand, backpack and what you wear.
  const e = self.equipment;
  const myValuables: Card[] = [
    ...self.hand.filter(x => x.deck === "treasure"),
    ...self.backpack,
    ...[e.head, e.armor, e.feet, e.bigItem, ...e.hands, ...e.none].filter((x): x is NonNullable<typeof x> => !!x),
  ].filter(isTradable);
  const toll = tollPrice(monsterTotal);
  const tollBlocked = c.monsters.some(m => m.antiClass) ? "Bosser kan ikke købes fri."
    : toll === null ? `En kamp på ${monsterTotal} er for stor til at købe sig ud af (højst 16).` : null;
  const tollPaid = myValuables.filter(x => tollPick.includes(x.id)).reduce((s, x) => s + tradeValue(x), 0);

  // Every class you have that has a combat ability (two with Guild Hopper).
  const combatClasses = (["Warrior", "Thief", "Wizard"] as const).filter(name => hasClass(self, name));
  const winning = hasWarrior ? playerTotal >= monsterTotal : playerTotal > monsterTotal;
  
  let totalTreasures = c.monsters.reduce((s, m) => s + m.treasures, 0);
  if (view.activeDungeons.some(d => d.cardId === "d-wealth")) {
    totalTreasures += 1;
  }

  const myPass = !!c.passes[self.id];
  const canPass = !myPass && !isFighter; 
  
  // Only connected, living non-fighters have to pass (offline players never block a fight).
  const expectedPasses = c.requiredPasses.length;
  const passCount = c.requiredPasses.filter(id => c.passes[id]).length;
  const allPassed = passCount >= expectedPasses;

  const handleResolveClick = () => {
    if (!allPassed) {
      alert("Vent lige lidt! ✋\n\nDine modstandere skal trykke 'Pas', før du kan afslutte kampen eller flygte. De har stadig tid til at kaste en sidste forbandelse!");
      return;
    }

    if (!winning) {
      const confirmRun = window.confirm("Advarsel: Monsteret er stærkere end dig!\n\nEr du sikker på, at du ikke vil bede om hjælp eller bruge flere items? Trykker du OK, accepterer du nederlaget og går direkte til at slå for at flygte.");
      if (confirmRun) {
        send({ type: "flee" });
      }
    } else {
      send({ type: "resolveCombat" });
    }
  };

  return (
    <div className="relative z-50 mx-auto bg-popover/95 backdrop-blur border-2 border-primary/60 shadow-glow-brass rounded-xl p-4 max-w-2xl">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-xl brass-text flex items-center gap-2">
          <Swords className="w-5 h-5"/> Kamp
        </h2>
        <div className="text-sm font-ui opacity-80">
          {view.status === "waitingForInterrupts" && "Venter på, at modstanderne melder pas…"}
          {view.status === "inCombat" && !winning && (isAttacker ? "Du taber! Bed om hjælp eller flygt." : `${attacker.name} taber!`)}
          {view.status === "inCombat" && winning && "Klar til at erklære sejr!"}
          {view.status === "runAwayRoll" && "Flugtfase"}
        </div>
      </div>

      {/* Score */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className={`rounded-lg p-3 border-2 ${winning ? "border-primary bg-primary/10" : "border-border bg-muted/30"}`}>
          <div className="text-xs opacity-70 font-ui">Spillere</div>
          <div className="font-display text-3xl brass-text">{playerTotal}</div>
          <div className="text-xs opacity-70 font-ui truncate">{attacker.name}{helper && ` + ${helper.name}`}</div>
        </div>
        <div className={`rounded-lg p-3 border-2 ${!winning ? "border-destructive bg-destructive/10" : "border-border bg-muted/30"}`}>
          <div className="text-xs opacity-70 font-ui">Monstre</div>
          <div className="font-display text-3xl text-destructive">{monsterTotal}</div>
          <div className="text-xs opacity-70 font-ui truncate">{c.monsters.map(m => m.name).join(", ")}</div>
        </div>
      </div>

      {/* Why the monster side is as strong as it is (threat, pack hunters, turncoats …) */}
      {c.modifiers.length > 0 && (
        <ul className="mb-3 space-y-0.5 text-xs font-ui rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2" aria-label="Monsterets tillæg">
          {c.modifiers.map(m => <li key={m}>⚠️ {m}</li>)}
        </ul>
      )}

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
          <div className="font-display text-sm mb-2 flex items-center gap-1"><HandHelping className="w-4 h-4"/> Bed om hjælp</div>
          <div className="grid gap-1.5">
            {view.players.filter(p => p.id !== self.id && !p.isDead).map(p => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="flex-1 truncate">{p.name} (styrke {p.combatPower})</span>
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
                  onClick={() => {
                    send({ type: "askForHelp", helperId: p.id, treasures: helpTreasures[p.id] ?? Math.min(1, totalTreasures), itemIds: bribes[p.id] ?? [] });
                    setBribes(s => { const next = { ...s }; delete next[p.id]; return next; });
                  }}
                >
                  Tilbyd
                </Button>
                
                <Button size="sm" variant="ghost" className="px-2" aria-expanded={bribes[p.id] !== undefined}
                  onClick={() => setBribes(s => {
                    const next = { ...s };
                    if (next[p.id] === undefined) next[p.id] = []; else delete next[p.id];
                    return next;
                  })}>
                  + genstande
                </Button>

                {/* NY KNAP: Slippers of Sweet-Talking */}
                {hasSlippers && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="border-pink-500 text-pink-500 hover:bg-pink-900/40"
                    onClick={() => send({ type: "forceHelp", targetId: p.id })}
                  >
                    💖 Tving
                  </Button>
                )}
                {bribes[p.id] !== undefined && (
                  <div className="basis-full flex flex-wrap gap-1 pl-2 pb-1">
                    <span className="text-xs opacity-70 w-full">Bestik {p.name} — betales i det øjeblik de siger ja, og gives aldrig tilbage:</span>
                    {myValuables.length === 0 && <span className="text-xs italic opacity-60">Du har intet af værdi.</span>}
                    {myValuables.map(card => {
                      const on = bribes[p.id].includes(card.id);
                      return (
                        <button key={card.id} type="button" aria-pressed={on}
                          onClick={() => setBribes(s => ({ ...s, [p.id]: on ? s[p.id].filter(x => x !== card.id) : [...s[p.id], card.id] }))}
                          className={`text-xs font-ui rounded border px-2 py-0.5 ${on ? "border-primary bg-primary/20" : "border-border bg-muted/40"}`}>
                          {card.name} <span className="opacity-60">{tradeValue(card)}g</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {c.contract && (
        <div className="text-xs font-ui mb-2 px-2 py-1 rounded bg-accent/20 border border-accent/40">
          🩸 Blodsed: hjælperen får {treasuresText(c.contract.treasures)} — låst.
        </div>
      )}

      {/* Others at the table see who is bribing whom */}
      {view.negotiations.filter(n => n.toId !== self.id && n.fromId !== self.id && n.status === "pending" && n.items.length > 0).map(n => (
        <div key={n.id} className="text-xs font-ui mb-2 px-2 py-1 rounded bg-muted/40 border border-border">
          💰 {view.players.find(p => p.id === n.fromId)?.name} bestikker {view.players.find(p => p.id === n.toId)?.name} med {n.items.map(i => i.name).join(", ")}.
        </div>
      ))}

      {isAttacker && (view.status === "waitingForInterrupts" || view.status === "inCombat") && (
        <div className="border-t border-border pt-3 mb-3">
          <div className="font-display text-sm mb-1">🪙 Betal told</div>
          {tollBlocked ? (
            <p className="text-xs opacity-70 font-ui">{tollBlocked}</p>
          ) : (
            <>
              <p className="text-xs opacity-70 font-ui mb-1.5">
                Told for en kamp på {monsterTotal}: <b>{toll}g</b>. Du går din vej — ingen niveauer, ingen skatte, ingen straf. Kortene smides.
              </p>
              <div className="flex flex-wrap gap-1 mb-2">
                {myValuables.length === 0 && <span className="text-xs italic opacity-60">Du har intet af værdi.</span>}
                {myValuables.map(card => {
                  const on = tollPick.includes(card.id);
                  return (
                    <button key={card.id} type="button" aria-pressed={on}
                      onClick={() => setTollPick(s => on ? s.filter(x => x !== card.id) : [...s, card.id])}
                      className={`text-xs font-ui rounded border px-2 py-0.5 ${on ? "border-primary bg-primary/20" : "border-border bg-muted/40"}`}>
                      {card.name} <span className="opacity-60">{tradeValue(card)}g</span>
                    </button>
                  );
                })}
              </div>
              <Button size="sm" variant="outline" disabled={tollPaid < (toll ?? Infinity)}
                onClick={() => { send({ type: "payToll", cardIds: tollPick }); setTollPick([]); }}>
                Betal {tollPaid}g / {toll}g
              </Button>
            </>
          )}
        </div>
      )}

      {view.negotiations.filter(n => n.toId === self.id && n.status === "pending").map(n => (
        <div key={n.id} className="border-t border-border pt-2 mb-2 flex items-center gap-2 text-sm">
          <span className="flex-1">
            {view.players.find(p => p.id === n.fromId)?.name} tilbyder <b>{treasuresText(n.treasures)}</b>
            {n.items.length > 0 && <> + <b>{n.items.map(i => i.name).join(", ")}</b> på forhånd</>} for hjælp.
          </span>
          <Button size="sm" onClick={() => send({ type: "respondHelp", offerId: n.id, accept: true })}>Sig ja (blodsed)</Button>
          <Button size="sm" variant="ghost" onClick={() => send({ type: "respondHelp", offerId: n.id, accept: false })}>Afslå</Button>
        </div>
      ))}

      {/* --- NY SEKTION: CLASS ABILITIES --- */}
      {combatClasses.length > 0 && view.status !== "runAwayRoll" && (
        <div className="border-t border-border pt-3 mb-3">
          <div className="font-display text-sm mb-2 flex items-center gap-1 text-indigo-400">
            <Zap className="w-4 h-4"/> Evner: {combatClasses.map(cl => CLASS_LABEL[cl]).join(" & ")}
          </div>
          <div className="flex gap-2 flex-wrap">
            
            {/* Wizard: Charm Monster (Knap direkte i panelet) */}
            {hasClass(self, "Wizard") && isFighter && (() => {
              const charmCost = self.equipment.hands.some(h => h.cardId === "e-archmage-staff") ? 2 : 3;
              
              if (self.handCount >= charmCost) {
                return c.monsters.map(m => (
                  <Button 
                    key={m.id} size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    onClick={() => {
                      if(window.confirm(`Er du sikker på, at du vil smide HELE din hånd for at fortrylle ${m.name}?`)) {
                        send({ type: "useClassAbility", ability: "charm", cardIds: [], monsterId: m.id });
                      }
                    }}
                  >
                    🪄 Fortryl {m.name} (smid hånden)
                  </Button>
                ));
              } else {
                return (
                  <div className="text-xs font-ui text-muted-foreground italic">
                    Du skal have mindst {charmCost} kort på hånden for at fortrylle.
                  </div>
                );
              }
            })()}

            {/* Warrior: Berserk (Guide-tekst) */}
            {hasClass(self, "Warrior") && isFighter && (() => {
              const hasAxe = self.equipment.hands.some(h => h.cardId === "e-bloodaxe");
              return (
                <div className="text-xs font-ui px-3 py-2 bg-orange-900/30 rounded border border-orange-500/30 text-orange-200">
                  💡 <b>Berserk:</b> Tryk på kort på din hånd for at smide dem for {hasAxe ? <b>+2</b> : <b>+1</b>} kampstyrke hver (højst 3 pr. kamp). {hasAxe && "🪓 Øksen er aktiv!"}
                </div>
              );
            })()}

            {/* Thief: Backstab (Guide-tekst) */}
            {hasClass(self, "Thief") && (
              <div className="text-xs font-ui px-3 py-2 bg-indigo-900/30 rounded border border-indigo-500/30">
                💡 <b>Dolk i ryggen:</b> Tryk på et kort på din hånd for at smide det og give {attacker.name} −2 i kampen.
              </div>
            )}

          </div>
        </div>
      )}

{/* Pass + resolve */}
      <div className="flex gap-2 flex-wrap pt-2 border-t border-border items-center">
        
        {/* Pass Knap */}
        {canPass && view.status !== "runAwayRoll" && (
          <Button size="sm" variant={myPass ? "secondary" : "default"} onClick={() => send({ type: "pass" })} className={!myPass ? "pulse-glow" : ""}>
            {myPass ? "✓ Meldt pas" : "Pas"}
          </Button>
        )}

        {/* NY KNAP: d-swapping (Steal from helper) */}
        {hasSwapping && isAttacker && c.helperId && !c.swapUsed && (
          <Button size="sm" variant="outline" className="border-blue-500 text-blue-400 hover:bg-blue-900/40" onClick={() => send({ type: "suddenSwap" })}>
            🔄 Stjæl kort fra hjælperen
          </Button>
        )}
        
        {/* Løs Kamp Knap */}
        {isAttacker && (view.status === "inCombat" || view.status === "waitingForInterrupts") && (
          <Button size="sm" variant={winning ? "default" : "destructive"} onClick={handleResolveClick}>
            {winning 
              ? (allPassed ? "🎉 Afslut og vind!" : "Prøv at vinde") 
              : <><AlertTriangle className="w-4 h-4 mr-1"/> {allPassed ? "Accepter nederlaget" : "Prøv at flygte"}</>}
          </Button>
        )}

        {/* NY KNAP: d-cowards (Insta-Flee) */}
        {hasCowards && isAttacker && (view.status === "inCombat" || view.status === "waitingForInterrupts") && (
          <Button size="sm" variant="outline" className="border-purple-500 text-purple-400 hover:bg-purple-900/40" onClick={() => send({ type: "cowardlyFlee" })}>
            🐔 Flygt som en kujon (straks)
          </Button>
        )}

        {/* Flugt-Fase Knapper */}
        {view.status === "runAwayRoll" && isFighter && (
          <div className="flex flex-col gap-2 w-full mt-2">
            
            {/* A loyal companion can cover your escape */}
            {self.companion?.sacrificable && !c.ranAway?.includes(self.id) && (
              <Button size="sm" variant="outline" className="w-fit border-lime-400 text-lime-300" onClick={() => send({ type: "sacrificeCompanion" })}>
                🫡 Ofr {self.companion.name} for at slippe væk
              </Button>
            )}

            {/* Standard Run Away */}
            <Button size="sm" variant="destructive" className="w-fit" onClick={() => send({ type: "runAway" })}>
              <Dice5 className="w-4 h-4 mr-1"/> Slå for at flygte
            </Button>
            
            {/* NY MENU: d-chaos (Advantage Reroll) */}
            {hasChaos && self.hand.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 bg-purple-900/20 p-2 rounded border border-purple-500/30">
                <span className="text-xs text-purple-300 font-bold px-1 w-full sm:w-auto">🌪️ Kaos-omslag (smid et kort og slå to gange):</span>
                {self.hand.map(c => (
                  <Button 
                    key={c.id} 
                    size="sm" 
                    variant="outline" 
                    className="h-6 text-[10px] px-2 border-purple-500/50 hover:bg-purple-500/20" 
                    onClick={() => send({ type: "runAway", discardId: c.id })}
                  >
                    Smid {c.name}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
        
        <div className="flex-1 text-right text-xs opacity-70 font-ui self-center mt-2 w-full">
          Meldt pas: {passCount}/{expectedPasses}
        </div>
        {countdown !== null && view.status === "waitingForInterrupts" && view.settings.interruptSeconds > 0 && (
          <div className="w-full mt-1" role="timer" aria-label={`${Math.ceil(countdown / 1000)} sekunder til alle melder pas`}>
            <div className="flex justify-between text-[11px] font-ui opacity-70 mb-0.5">
              <span>Automatisk pas om</span>
              <span>{Math.ceil(countdown / 1000)} sek.</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-[width] duration-200 ease-linear"
                style={{ width: `${(100 * countdown) / (view.settings.interruptSeconds * 1000)}%` }}
              />
            </div>
          </div>
        )}
      </div>

    </div>
  );
}