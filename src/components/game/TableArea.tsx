import { useGame, send } from "@/lib/store";
import { GameCard } from "./GameCard";
import { Button } from "@/components/ui/button";
import { DoorOpen, Eye, PackageOpen, ChevronRight } from "lucide-react";

const phaseNames = ["", "1. Spark døren ind", "2. Opsøg ballade", "3. Ransag rummet", "4. Velgørenhed"];

export function TableArea() {
  const view = useGame(s => s.view);
  if (!view) return null;
  const active = view.players[view.activePlayerIndex];
  const isMyTurn = active?.id === view.self?.id;
  const inCombat = view.status === "inCombat" || view.status === "waitingForInterrupts" || view.status === "runAwayRoll";
  const handHasMonster = view.self?.hand.some(c => c.type === "monster") ?? false;

  return (
    <section className="felt-table p-4 md:p-6 flex-1 flex flex-col items-center justify-start gap-4 overflow-y-auto relative min-h-[60vh]">
      {/* Phase / turn banner */}
      <header className="w-full flex items-center justify-between gap-4 shrink-0">
        <div>
          <div className="text-xs opacity-70 font-ui uppercase tracking-wider">Tur</div>
          <div className="font-display text-2xl brass-text">{active?.name}{isMyTurn && " (dig)"}</div>
        </div>
        <div className="text-center">
          <div className="text-xs opacity-70 font-ui uppercase tracking-wider">Fase</div>
          <div className="font-display text-xl">{phaseNames[view.currentPhase]}</div>
        </div>
        <div className="text-right text-xs font-ui opacity-70">
          <div>Døre: {view.doorDeckCount} (+{view.doorDiscardCount} kasseret)</div>
          <div>Skatte: {view.treasureDeckCount} (+{view.treasureDiscardCount} kasseret)</div>
          {/* NYT: Dungeon counter tilføjet */}
          <div className="text-purple-300">Fangehuller: {view.dungeonDeckCount} (+{view.dungeonDiscardCount} kasseret)</div>
        </div>
      </header>

      {/* --- NYT: ACTIVE DUNGEONS ZONE --- */}
      {view.activeDungeons && view.activeDungeons.length > 0 && (
        <div className="mt-4 flex flex-col items-center w-full">
          <div className="text-xs font-bold text-purple-300 uppercase tracking-widest mb-2 drop-shadow-md">
            Aktive fangehuller
          </div>
          <div className="flex flex-wrap gap-4 justify-center">
            {view.activeDungeons.map(d => (
              <GameCard key={d.id} card={d} size="lg" className="border-purple-400/50 shadow-[0_0_15px_rgba(168,85,247,0.4)]" />
            ))}
          </div>
        </div>
      )}

            {/* Turn controls */}
      {isMyTurn && view.status === "normalTurn" && !inCombat && (
        <div className="flex flex-wrap gap-2 justify-center">
          {view.currentPhase === 1 && (
            <Button size="lg" onClick={() => send({ type: "kickDoor" })} className="pulse-glow">
              <DoorOpen className="w-5 h-5 mr-2"/> Spark døren ind
            </Button>
          )}
          {view.currentPhase === 2 && (
            <>
              {handHasMonster && (
                <span className="self-center text-sm opacity-70 italic">Vælg et monster fra hånden at kæmpe mod, eller:</span>
              )}
              <Button size="lg" variant="secondary" onClick={() => send({ type: "lootRoom" })}>
                <PackageOpen className="w-5 h-5 mr-2"/> Ransag rummet (spring over)
              </Button>
            </>
          )}
          {view.currentPhase === 3 && (
            <Button size="lg" variant="secondary" onClick={() => send({ type: "lootRoom" })}>
              <PackageOpen className="w-5 h-5 mr-2"/> Ransag rummet
            </Button>
          )}
          {view.currentPhase >= 2 && (
            <Button size="lg" variant="default" onClick={() => send({ type: "endTurn" })}>
              Afslut tur <ChevronRight className="w-5 h-5 ml-1"/>
            </Button>
          )}
        </div>
      )}

      {/* Center: decks + table cards */}
      <div className="flex items-center gap-3 md:gap-8 my-6 flex-wrap justify-center relative z-0 pb-16 md:pb-0 w-full px-2">
        
        {/* Door deck */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <div className="card-base w-24 h-36 md:w-32 md:h-44 bg-gradient-to-br from-door to-door/60 flex flex-col items-center justify-center gap-1 font-display text-base md:text-lg text-door-foreground border-2 border-door-foreground/30">
            <span className="text-2xl">🚪</span> Døre
          </div>
          <span className="text-[10px] md:text-xs opacity-70 font-ui">{view.doorDeckCount} kort</span>
        </div>
        
        {/* Table */}
        <div className="flex gap-2 min-w-[5rem] min-h-[12rem] items-center justify-center shrink-0">
          {view.table.length === 0 && <div className="opacity-40 italic font-ui text-sm">— bordet er tomt —</div>}
          {view.table.map(c => <GameCard key={c.id} card={c} size="md"/>)}
        </div>
        
        {/* Treasure deck */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <div className="card-base w-24 h-36 md:w-32 md:h-44 bg-gradient-treasure flex flex-col items-center justify-center gap-1 font-display text-base md:text-lg text-treasure-foreground border-2 border-treasure-foreground/30">
            <span className="text-2xl">💰</span> Skatte
          </div>
          <span className="text-[10px] md:text-xs opacity-70 font-ui">{view.treasureDeckCount} kort</span>
        </div>

        {/* DUNGEON DECK */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <div className="card-base w-24 h-36 md:w-32 md:h-44 bg-gradient-to-br from-indigo-900 to-purple-950 flex flex-col items-center justify-center gap-1 font-display text-sm md:text-lg text-white border-2 border-purple-500/30">
            <span className="text-2xl">🏰</span> Fangehuller
          </div>
          <span className="text-[10px] md:text-xs opacity-70 font-ui">{view.dungeonDeckCount} kort</span>
        </div>
      </div>

    </section>
  );
}