import { useEffect, useState } from "react";
import { useGame } from "@/lib/store";
import { getSocket, send } from "@/lib/socket";
import { Lobby } from "@/components/game/Lobby";
import { Scoreboard } from "@/components/game/Scoreboard";
import { TableArea } from "@/components/game/TableArea";
import { PlayerHand } from "@/components/game/PlayerHand";
import { CombatPanel } from "@/components/game/CombatPanel";
import { CharityModal, LootingModal } from "@/components/game/Modals";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function Index() {
  const { view, init, error, clearError, lastRoll } = useGame();
  const [joined, setJoined] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    init();
    const s = getSocket();
    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));
    if (s.connected) setConnected(true);
  }, [init]);

  useEffect(() => {
    if (error) { toast.error(error); clearError(); }
  }, [error, clearError]);

  useEffect(() => {
    if (lastRoll) {
      toast(`🎲 Rolled ${lastRoll.result} (${lastRoll.reason})`);
    }
  }, [lastRoll]);

  if (!connected) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="felt-table p-8 text-center max-w-md">
          <h1 className="font-display text-3xl brass-text mb-2">Connecting…</h1>
          <p className="text-muted-foreground text-sm">
            If this hangs, the multiplayer server isn't running. From your project folder run:
          </p>
          <pre className="bg-black/40 rounded p-2 mt-3 text-xs font-mono text-left">npm run dev</pre>
          <p className="text-xs opacity-70 mt-3">This starts both the React client and the Socket.io server. See <code>README.md</code> for LAN setup.</p>
        </div>
      </main>
    );
  }

  if (!joined || !view) {
    return <Lobby onJoined={() => setJoined(true)}/>;
  }

  // Lobby-state UI (game not yet started)
  if (view.status === "lobby") {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="felt-table p-8 max-w-lg w-full text-center">
          <h1 className="font-display text-4xl brass-text mb-2">Waiting Room</h1>
          <p className="text-muted-foreground mb-4">Share the room code with friends. Game starts when host clicks Start.</p>
          <ul className="space-y-2 mb-6">
            {view.players.map(p => (
              <li key={p.id} className="bg-muted/40 rounded px-3 py-2 font-display flex justify-between">
                <span>{p.name} {view.self?.id === p.id && "(you)"}</span>
                <span className="text-xs opacity-60 font-ui">{p.connected ? "🟢" : "⚪"}</span>
              </li>
            ))}
          </ul>
          <Button size="lg" disabled={view.players.length < 2} onClick={() => send({ type: "startGame" })}>
            {view.players.length < 2 ? "Need ≥ 2 players" : "Start Game"}
          </Button>
        </div>
      </main>
    );
  }

  if (view.status === "gameOver") {
    const winner = view.players.find(p => p.id === view.winnerId);
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="felt-table p-10 text-center max-w-lg">
          <h1 className="font-display text-5xl brass-text mb-2">🏆 Victory!</h1>
          <p className="text-2xl font-display mb-6">{winner?.name} reached Level 10!</p>
          <Button onClick={() => location.reload()}>New Game</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 flex flex-col gap-4">
      <div className="flex gap-4 flex-1 min-h-0">
        <TableArea />
        <Scoreboard />
      </div>

      {/* Floating combat panel */}
      {view.combat && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-30 max-w-3xl w-full px-4">
          <CombatPanel />
        </div>
      )}

      <PlayerHand />
      <CharityModal />
      <LootingModal />
    </main>
  );
}
