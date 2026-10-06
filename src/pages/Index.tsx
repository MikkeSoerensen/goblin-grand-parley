import { useEffect, useRef, useState } from "react";
import { useGame } from "@/lib/store";
import { send } from "@/lib/socket";
import { Lobby } from "@/components/game/Lobby";
import { JoinInfo } from "@/components/game/JoinInfo";
import { Scoreboard } from "@/components/game/Scoreboard";
import { TableArea } from "@/components/game/TableArea";
import { PlayerHand } from "@/components/game/PlayerHand";
import { CombatPanel } from "@/components/game/CombatPanel";
import { CharityModal, LootingModal } from "@/components/game/Modals";
import { CardDetails } from "@/components/game/CardDetails";
import { ParleyPanel } from "@/components/game/ParleyPanel";
import { EventStrip } from "@/components/game/EventStrip";
import { TvView } from "@/components/game/TvView";
import { GameMenu } from "@/components/game/GameMenu";
import { INTERRUPT_CHOICES, THREAT_CHOICES, WIN_LEVELS } from "../../shared/types";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { Dices, Hand as HandIcon, Users, Swords } from "lucide-react";
import { cn } from "@/lib/utils";

type MobileTab = "table" | "hand" | "players" | "combat";

export default function Index() {
  const { view, playerId, roomCode, watching, connected, init, error, clearError, lastRoll, leaveGame, restartGame } = useGame();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<MobileTab>("table");
  const prevCombatRef = useRef<boolean>(false);

  useEffect(() => { init(); }, [init]);

  useEffect(() => {
    if (error) { toast.error(error); clearError(); }
  }, [error, clearError]);

  useEffect(() => {
    if (lastRoll) toast(`🎲 Slog ${lastRoll.result} (${lastRoll.reason})`);
  }, [lastRoll]);

  // Auto-switch to combat tab when combat begins (mobile only),
  // and back to table when combat resolves.
  useEffect(() => {
    const inCombat = !!view?.combat;
    if (isMobile && inCombat && !prevCombatRef.current) setTab("combat");
    if (isMobile && !inCombat && prevCombatRef.current) setTab("table");
    prevCombatRef.current = inCombat;
  }, [view?.combat, isMobile]);

  const inRoom = (playerId !== null || watching) && view !== null;

  if (!connected && !inRoom) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-4">
        <div className="felt-table p-6 sm:p-8 text-center max-w-md">
          <h1 className="font-display text-3xl brass-text mb-2">Forbinder…</h1>
          <p className="text-muted-foreground text-sm">
            Hænger det her, kører spilserveren ikke, eller også er enheden på et andet netværk. Kør dette på værtscomputeren:
          </p>
          <pre className="bg-black/40 rounded p-2 mt-3 text-xs font-mono text-left">npm start</pre>
          <p className="text-xs opacity-70 mt-3">Se <code>README.md</code> for opsætning på netværket.</p>
        </div>
      </main>
    );
  }

  if (!inRoom) return <Lobby />;
  if (watching) return <TvView />;

  // Shown over every screen while the socket is down; the store re-joins automatically.
  const reconnecting = !connected && (
    <div role="status" className="fixed top-0 inset-x-0 z-[60] bg-destructive text-destructive-foreground text-center text-sm font-ui py-1.5 shadow-lg">
      Forbindelsen er tabt — forbinder igen…
    </div>
  );

  if (view.status === "lobby") {
    return (
      <main className="min-h-dvh flex items-center justify-center p-4">
        {reconnecting}
        <div className="felt-table p-6 sm:p-8 max-w-lg w-full text-center space-y-4">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl brass-text">Venteværelset</h1>
            <p className="text-muted-foreground">Rum <b className="font-mono tracking-widest text-foreground">{roomCode}</b></p>
          </div>
          <JoinInfo />
          {/* House rules — anyone in the room can change them until the game starts */}
          <div className="space-y-2 text-left">
            <div>
              <div className="text-xs font-ui opacity-70 mb-1">Spil til niveau</div>
              <div className="flex gap-1.5" role="radiogroup" aria-label="Spil til niveau">
                {WIN_LEVELS.map(level => (
                  <Button key={level} size="sm" role="radio" aria-checked={view.settings.winLevel === level}
                    variant={view.settings.winLevel === level ? "default" : "secondary"}
                    onClick={() => send({ type: "updateSettings", settings: { winLevel: level } })}>
                    {level}{level === 10 ? " (normal)" : level === 20 ? " (episk)" : ""}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-ui opacity-70 mb-1">Monstertrussel (monstrene vokser med angriberens niveau)</div>
              <div className="flex gap-1.5" role="radiogroup" aria-label="Monstertrussel">
                {THREAT_CHOICES.map(t => (
                  <Button key={t} size="sm" role="radio" aria-checked={view.settings.threat === t}
                    variant={view.settings.threat === t ? "default" : "secondary"}
                    onClick={() => send({ type: "updateSettings", settings: { threat: t } })}>
                    {t === "calm" ? "Rolig" : t === "normal" ? "Normal" : "Brutal"}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-ui opacity-70 mb-1">Nedtælling til automatisk pas i kampe</div>
              <div className="flex gap-1.5" role="radiogroup" aria-label="Nedtælling til automatisk pas">
                {INTERRUPT_CHOICES.map(secs => (
                  <Button key={secs} size="sm" role="radio" aria-checked={view.settings.interruptSeconds === secs}
                    variant={view.settings.interruptSeconds === secs ? "default" : "secondary"}
                    onClick={() => send({ type: "updateSettings", settings: { interruptSeconds: secs } })}>
                    {secs === 0 ? "Fra" : `${secs} sek.`}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <ul className="space-y-2 text-left">
            {view.players.map(p => (
              <li key={p.id} className="bg-muted/40 rounded px-3 py-2 font-display flex justify-between">
                <span>{p.name} {view.self?.id === p.id && "(dig)"}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs opacity-60 font-ui" aria-label={p.connected ? "online" : "offline"}>{p.connected ? "🟢" : "⚪"}</span>
                  {!p.connected && (
                    <button type="button" className="text-xs font-ui opacity-70 hover:opacity-100 hover:text-destructive"
                      aria-label={`Fjern ${p.name} (offline)`} title="Fjern denne plads uden forbindelse"
                      onClick={() => send({ type: "removePlayer", playerId: p.id })}>✕</button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button size="lg" disabled={view.players.length < 2} onClick={() => send({ type: "startGame" })}>
              {view.players.length < 2 ? "Kræver mindst 2 spillere" : "Start spillet"}
            </Button>
            <Button size="lg" variant="ghost" onClick={leaveGame}>Forlad rummet</Button>
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
          <h1 className="font-display text-4xl sm:text-5xl brass-text mb-2">🏆 Sejr!</h1>
          <p className="text-xl sm:text-2xl font-display mb-6">{winner?.name} nåede niveau {view.settings.winLevel}!</p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button onClick={restartGame}>🔄 Spil igen (samme bord)</Button>
            <Button variant="ghost" onClick={leaveGame}>Forlad</Button>
          </div>
        </div>
      </main>
    );
  }

  // ================= DESKTOP / TABLET (md+) =================
  if (!isMobile) {
    return (
      <main className="min-h-screen p-4 flex flex-col gap-4">
        {reconnecting}
        <div className="flex flex-row gap-4 flex-1 min-h-0">
          <TableArea />
          <div className="flex flex-col gap-4 w-72 shrink-0">
            <GameMenu />
            <Scoreboard />
            <ParleyPanel />
          </div>
        </div>
        {view.combat && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-30 max-w-3xl w-full px-4 max-h-[85dvh] overflow-y-auto scroll-thin">
            <CombatPanel />
          </div>
        )}
        <PlayerHand />
        <CharityModal />
        <LootingModal />
        <CardDetails />
        <EventStrip />
      </main>
    );
  }

  // ================= MOBILE (<md): TAB SHELL =================
  const inCombat = !!view.combat;
  const isMyTurn = view.players[view.activePlayerIndex]?.id === view.self?.id;
  const handOverflow = (view.self?.hand.length ?? 0) > 5;
  const negotiationForMe = view.negotiations.some(n => n.toId === view.self?.id && n.status === "pending");

  const tabs: { id: MobileTab; label: string; icon: typeof Dices; badge?: boolean; disabled?: boolean }[] = [
    { id: "table", label: "Bord", icon: Dices, badge: isMyTurn && !inCombat },
    { id: "hand", label: "Hånd", icon: HandIcon, badge: handOverflow },
    { id: "players", label: "Spillere", icon: Users, badge: view.trades.some(t => t.toId === view.self?.id) },
    { id: "combat", label: "Kamp", icon: Swords, badge: inCombat || negotiationForMe, disabled: !inCombat },
  ];

  return (
    <main className="h-[100dvh] flex flex-col bg-background">
      {reconnecting}
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
          <div className="h-full overflow-y-auto p-2 space-y-2">
            <ParleyPanel />
            <Scoreboard />
            <GameMenu />
          </div>
        )}
        {tab === "combat" && (
          <div className="h-full overflow-y-auto p-2">
            {inCombat ? (
              <CombatPanel />
            ) : (
              <div className="felt-table p-6 text-center text-muted-foreground">
                <Swords className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="font-display">Ingen kamp i gang.</p>
                <p className="text-xs mt-1">Fanen åbner af sig selv, når en kamp starter.</p>
              </div>
            )}
          </div>
        )}
      </div>

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
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-col items-center justify-center py-2 gap-0.5 transition-colors min-h-[56px] min-w-[4.5rem]",
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
      <CardDetails />
      <EventStrip />
    </main>
  );
}
