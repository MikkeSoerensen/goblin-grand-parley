import { useEffect, useRef, useState } from "react";
import { useGame } from "@/lib/store";
import { getSocket, send } from "@/lib/socket";
import { Lobby } from "@/components/game/Lobby";
import { Scoreboard } from "@/components/game/Scoreboard";
import { TableArea } from "@/components/game/TableArea";
import { PlayerHand } from "@/components/game/PlayerHand";
import { CombatPanel } from "@/components/game/CombatPanel";
import { CharityModal, LootingModal } from "@/components/game/Modals";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { Dices, Hand as HandIcon, Users, Swords } from "lucide-react";
import { cn } from "@/lib/utils";

type MobileTab = "table" | "hand" | "players" | "combat";

export default function Index() {
  const { view, init, error, clearError, lastRoll } = useGame();
  const [joined, setJoined] = useState(false);
  const [connected, setConnected] = useState(false);
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<MobileTab>("table");
  const prevCombatRef = useRef<boolean>(false);

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
    if (lastRoll) toast(`🎲 Rolled ${lastRoll.result} (${lastRoll.reason})`);
  }, [lastRoll]);

  // Auto-switch to combat tab when combat begins (mobile only),
  // and back to table when combat resolves.
  useEffect(() => {
    const inCombat = !!view?.combat;
    if (isMobile && inCombat && !prevCombatRef.current) setTab("combat");
    if (isMobile && !inCombat && prevCombatRef.current) setTab("table");
    prevCombatRef.current = inCombat;
  }, [view?.combat, isMobile]);

  if (!connected) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="felt-table p-6 sm:p-8 text-center max-w-md">
          <h1 className="font-display text-3xl brass-text mb-2">Connecting…</h1>
          <p className="text-muted-foreground text-sm">If this hangs, the multiplayer server isn't running. From your project folder run:</p>
          <pre className="bg-black/40 rounded p-2 mt-3 text-xs font-mono text-left">npm run dev</pre>
          <p className="text-xs opacity-70 mt-3">See <code>README.md</code> for LAN setup.</p>
        </div>
      </main>
    );
  }

  if (!joined || !view) return <Lobby onJoined={() => setJoined(true)} />;

  if (view.status === "lobby") {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="felt-table p-6 sm:p-8 max-w-lg w-full text-center">
          <h1 className="font-display text-3xl sm:text-4xl brass-text mb-2">Waiting Room</h1>
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
        <div className="felt-table p-8 sm:p-10 text-center max-w-lg">
          <h1 className="font-display text-4xl sm:text-5xl brass-text mb-2">🏆 Victory!</h1>
          <p className="text-xl sm:text-2xl font-display mb-6">{winner?.name} reached Level 10!</p>
          <Button onClick={() => location.reload()}>New Game</Button>
        </div>
      </main>
    );
  }

  // ================= DESKTOP / TABLET (md+) =================
  if (!isMobile) {
    return (
      <main className="min-h-screen p-4 flex flex-col gap-4">
        <div className="flex flex-row gap-4 flex-1 min-h-0">
          <TableArea />
          <Scoreboard />
        </div>
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

  // ================= MOBILE (<md): TAB SHELL =================
  const inCombat = !!view.combat;
  const isMyTurn = view.players[view.activePlayerIndex]?.id === view.self?.id;
  const handOverflow = (view.self?.hand.length ?? 0) > 5;
  const negotiationForMe = view.negotiations.some((n: any) => n.toId === view.self?.id && n.status === "pending");

  const tabs: { id: MobileTab; label: string; icon: typeof Dices; badge?: boolean | number; disabled?: boolean }[] = [
    { id: "table", label: "Table", icon: Dices, badge: isMyTurn && !inCombat },
    { id: "hand", label: "Hand", icon: HandIcon, badge: handOverflow ? "!" as any : false },
    { id: "players", label: "Players", icon: Users },
    { id: "combat", label: "Combat", icon: Swords, badge: inCombat || negotiationForMe, disabled: !inCombat },
  ];

  return (
    <main className="h-[100dvh] flex flex-col bg-background">
      {/* Active pane */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "table" && (
          <div className="h-full overflow-y-auto p-2 pb-4">
            <TableArea />
          </div>
        )}
        {tab === "hand" && (
          <div className="h-full overflow-y-auto">
            <PlayerHand />
          </div>
        )}
        {tab === "players" && (
          <div className="h-full overflow-y-auto p-2">
            <Scoreboard />
          </div>
        )}
        {tab === "combat" && (
          <div className="h-full overflow-y-auto p-2">
            {inCombat ? (
              <CombatPanel />
            ) : (
              <div className="felt-table p-6 text-center text-muted-foreground">
                <Swords className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="font-display">No active combat.</p>
                <p className="text-xs mt-1">This tab opens automatically when a fight starts.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom tab bar */}
{/* Bottom tab bar */}
      <nav
        className="shrink-0 flex flex-row justify-center items-center gap-4 bg-popover/95 backdrop-blur border-t border-border px-2"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={t.disabled}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative flex flex-col items-center justify-center py-2 gap-0.5 transition-colors min-h-[56px] min-w-[4.5rem]", /* Tilføjet min-w så de får en flot, ensartet bredde */
                active ? "text-primary" : "text-muted-foreground",
                t.disabled && "opacity-40",
                !t.disabled && !active && "hover:text-foreground active:bg-muted/40",
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px] font-ui font-medium">{t.label}</span>
              {t.badge && !active && (
                <span className="absolute top-1 right-1/2 translate-x-5 w-2.5 h-2.5 rounded-full bg-accent shadow-glow-brass animate-pulse" />
              )}
              {active && <span className="absolute top-0 left-2 right-2 h-0.5 bg-primary rounded-full" />}
            </button>
          );
        })}
      </nav>

      <CharityModal />
      <LootingModal />
    </main>
  );
}
