import { useEffect } from "react";
import { useGame } from "@/lib/store";
import { send } from "@/lib/socket";
import { Lobby } from "@/components/game/Lobby";
import { JoinInfo } from "@/components/game/JoinInfo";
import { Scoreboard } from "@/components/game/Scoreboard";
import { TableArea } from "@/components/game/TableArea";
import { PlayerHand } from "@/components/game/PlayerHand";
import { CombatPanel } from "@/components/game/CombatPanel";
import { CharityModal, LootingModal } from "@/components/game/Modals";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function Index() {
  const { view, playerId, roomCode, connected, init, error, clearError, lastRoll, leave } = useGame();

  useEffect(() => { init(); }, [init]);

  useEffect(() => {
    if (error) { toast.error(error); clearError(); }
  }, [error, clearError]);

  useEffect(() => {
    if (lastRoll) {
      toast(`🎲 Rolled ${lastRoll.result} (${lastRoll.reason})`);
    }
  }, [lastRoll]);

  const inRoom = playerId !== null && view !== null;

  if (!connected && !inRoom) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-4">
        <div className="felt-table p-8 text-center max-w-md">
          <h1 className="font-display text-3xl brass-text mb-2">Connecting…</h1>
          <p className="text-muted-foreground text-sm">
            If this hangs, the game server isn't running or this device is on a different network. On the host computer run:
          </p>
          <pre className="bg-black/40 rounded p-2 mt-3 text-xs font-mono text-left">npm start</pre>
          <p className="text-xs opacity-70 mt-3">See <code>README.md</code> for LAN setup.</p>
        </div>
      </main>
    );
  }

  if (!inRoom) return <Lobby/>;

  const reconnecting = !connected && (
    <div role="status" className="fixed top-0 inset-x-0 z-50 bg-destructive text-destructive-foreground text-center text-sm font-ui py-1.5 shadow-lg">
      Connection lost — reconnecting…
    </div>
  );

  // Lobby-state UI (game not yet started)
  if (view.status === "lobby") {
    return (
      <main className="min-h-dvh flex items-center justify-center p-4">
        {reconnecting}
        <div className="felt-table p-6 sm:p-8 max-w-lg w-full text-center space-y-4">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl brass-text">Waiting Room</h1>
            <p className="text-muted-foreground">Room <b className="font-mono tracking-widest text-foreground">{roomCode}</b></p>
          </div>
          <JoinInfo/>
          <ul className="space-y-2 text-left">
            {view.players.map(p => (
              <li key={p.id} className="bg-muted/40 rounded px-3 py-2 font-display flex justify-between">
                <span>{p.name} {view.self?.id === p.id && "(you)"}</span>
                <span className="text-xs opacity-60 font-ui" aria-label={p.connected ? "online" : "offline"}>{p.connected ? "🟢" : "⚪"}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button size="lg" disabled={view.players.length < 2} onClick={() => send({ type: "startGame" })}>
              {view.players.length < 2 ? "Need ≥ 2 players" : "Start Game"}
            </Button>
            <Button size="lg" variant="ghost" onClick={leave}>Leave room</Button>
          </div>
        </div>
      </main>
    );
  }

  if (view.status === "gameOver") {
    const winner = view.players.find(p => p.id === view.winnerId);
    return (
      <main className="min-h-dvh flex items-center justify-center p-4">
        <div className="felt-table p-8 sm:p-10 text-center max-w-lg">
          <h1 className="font-display text-4xl sm:text-5xl brass-text mb-2">🏆 Victory!</h1>
          <p className="text-2xl font-display mb-6">{winner?.name} reached Level 10!</p>
          <Button onClick={leave}>New Game</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh p-2 sm:p-4 flex flex-col gap-3 md:gap-4">
      {reconnecting}
      {/* Combat: inline on phones (so the hand stays reachable), floating on larger screens */}
      {view.combat && (
        <div className="md:fixed md:top-4 md:left-1/2 md:-translate-x-1/2 md:z-30 md:w-full md:max-w-3xl md:px-4 md:max-h-[70dvh] md:overflow-y-auto scroll-thin">
          <CombatPanel />
        </div>
      )}
      <div className="flex flex-col md:flex-row gap-3 md:gap-4 flex-1">
        <Scoreboard />
        <TableArea />
      </div>

      <div className="sticky bottom-0 z-20">
        <PlayerHand />
      </div>
      <CharityModal />
      <LootingModal />
    </main>
  );
}
