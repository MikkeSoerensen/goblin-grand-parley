import { useGame, send } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { GameCard } from "./GameCard";
import { DoorOpen, Eye, PackageOpen, ChevronRight } from "lucide-react";

const phaseNames = ["", "1. Kick Door", "2. Look for Trouble", "3. Loot the Room", "4. Charity"];

export function TableArea() {
  const view = useGame(s => s.view);
  if (!view) return null;
  const active = view.players[view.activePlayerIndex];
  const isMyTurn = active?.id === view.self?.id;
  const inCombat = view.status === "inCombat" || view.status === "waitingForInterrupts" || view.status === "runAwayRoll";
  const handHasMonster = view.self?.hand.some(c => c.type === "monster") ?? false;

  return (
    <section className="felt-table p-6 flex-1 flex flex-col items-center justify-between min-h-[60vh] relative">
      {/* Phase / turn banner */}
      <header className="w-full flex items-center justify-between gap-4">
        <div>
          <div className="text-xs opacity-70 font-ui uppercase tracking-wider">Active</div>
          <div className="font-display text-2xl brass-text">{active?.name}{isMyTurn && " (you)"}</div>
        </div>
        <div className="text-center">
          <div className="text-xs opacity-70 font-ui uppercase tracking-wider">Phase</div>
          <div className="font-display text-xl">{phaseNames[view.currentPhase]}</div>
        </div>
        <div className="text-right text-xs font-ui opacity-70">
          <div>Door: {view.doorDeckCount} (+{view.doorDiscardCount} dis)</div>
          <div>Treasure: {view.treasureDeckCount} (+{view.treasureDiscardCount} dis)</div>
        </div>
      </header>

      {/* Center: decks + table cards */}
      <div className="flex items-center gap-8 my-6 flex-wrap justify-center">
        {/* Door deck */}
        <div className="flex flex-col items-center gap-1">
          <div className="card-base w-32 h-44 bg-gradient-to-br from-door to-door/60 flex items-center justify-center font-display text-xl text-door-foreground border-2 border-door-foreground/30">
            🚪 Door
          </div>
          <span className="text-xs opacity-70 font-ui">{view.doorDeckCount} cards</span>
        </div>
        {/* Table */}
        <div className="flex gap-2 min-w-[10rem] min-h-[12rem] items-center">
          {view.table.length === 0 && <div className="opacity-40 italic font-ui">— table empty —</div>}
          {view.table.map(c => <GameCard key={c.id} card={c} size="md"/>)}
        </div>
        {/* Treasure deck */}
        <div className="flex flex-col items-center gap-1">
          <div className="card-base w-32 h-44 bg-gradient-treasure flex items-center justify-center font-display text-xl text-treasure-foreground border-2 border-treasure-foreground/30">
            💰 Treasure
          </div>
          <span className="text-xs opacity-70 font-ui">{view.treasureDeckCount} cards</span>
        </div>
      </div>

      {/* Turn controls */}
      {isMyTurn && view.status === "normalTurn" && !inCombat && (
        <div className="flex flex-wrap gap-2 justify-center">
          {view.currentPhase === 1 && (
            <Button size="lg" onClick={() => send({ type: "kickDoor" })} className="pulse-glow">
              <DoorOpen className="w-5 h-5 mr-2"/> Kick Open the Door
            </Button>
          )}
          {view.currentPhase === 2 && (
            <>
              {handHasMonster && (
                <span className="self-center text-sm opacity-70 italic">Pick a monster from hand to fight, or:</span>
              )}
              <Button size="lg" variant="secondary" onClick={() => send({ type: "lootRoom" })}>
                <PackageOpen className="w-5 h-5 mr-2"/> Loot the Room (skip)
              </Button>
            </>
          )}
          {view.currentPhase === 3 && (
            <Button size="lg" variant="secondary" onClick={() => send({ type: "lootRoom" })}>
              <PackageOpen className="w-5 h-5 mr-2"/> Loot the Room
            </Button>
          )}
          {view.currentPhase >= 2 && (
            <Button size="lg" variant="default" onClick={() => send({ type: "endTurn" })}>
              End Turn <ChevronRight className="w-5 h-5 ml-1"/>
            </Button>
          )}
        </div>
      )}

      {/* Game log */}
      <div className="w-full bg-black/30 rounded-lg p-2 mt-4 max-h-24 overflow-y-auto scroll-thin text-xs font-ui">
        {view.log.slice(-8).map((l, i) => <div key={i} className="opacity-80">{l}</div>)}
      </div>
    </section>
  );
}
