import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/store";
import { hasClass, treasuresText } from "../../../shared/rules";
import { JoinInfo } from "./JoinInfo";
import { Scoreboard } from "./Scoreboard";
import { TableArea } from "./TableArea";
import { GameCard } from "./GameCard";
import { EventStrip } from "./EventStrip";
import { CardDetails } from "./CardDetails";

const THREAT_LABEL = { calm: "rolig", normal: "normal", brutal: "brutal" } as const;

// Counts down locally from the server's "ms left" so the TV clock never matters.
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

/** The fight, read-only and big enough to follow from the sofa. */
function TvCombat() {
  const view = useGame(s => s.view);
  const countdown = useCountdown(view?.combat?.interruptMsLeft ?? null);
  const c = view?.combat;
  if (!view || !c) return null;
  const name = (id: string | null | undefined) => view.players.find(p => p.id === id)?.name ?? "";
  const attacker = view.players.find(p => p.id === c.attackerId);
  const helper = view.players.find(p => p.id === c.helperId);
  const warrior = (attacker && hasClass(attacker, "Warrior")) || (helper && hasClass(helper, "Warrior"));
  const winning = warrior ? c.playerTotal >= c.monsterTotal : c.playerTotal > c.monsterTotal;
  const passed = c.requiredPasses.filter(id => c.passes[id]).length;

  return (
    <section aria-label="Kamp" className="felt-table p-5 space-y-4 border-2 border-primary/60">
      <div className="grid grid-cols-2 gap-4">
        <div className={`rounded-xl p-4 border-2 ${winning ? "border-primary bg-primary/10" : "border-border bg-muted/30"}`}>
          <div className="text-lg opacity-70 font-ui">{name(c.attackerId)}{helper ? ` + ${helper.name}` : ""}</div>
          <div className="font-display text-7xl brass-text">{c.playerTotal}</div>
        </div>
        <div className={`rounded-xl p-4 border-2 ${!winning ? "border-destructive bg-destructive/10" : "border-border bg-muted/30"}`}>
          <div className="text-lg opacity-70 font-ui truncate">{c.monsters.map(m => m.name).join(" + ")}</div>
          <div className="font-display text-7xl text-destructive">{c.monsterTotal}</div>
        </div>
      </div>
      {c.modifiers.length > 0 && (
        <ul className="text-lg font-ui space-y-0.5">{c.modifiers.map(m => <li key={m}>⚠️ {m}</li>)}</ul>
      )}
      <div className="flex gap-3 justify-center flex-wrap">{c.monsters.map(m => <GameCard key={m.id} card={m} size="lg" />)}</div>
      {c.turncoatId && <div className="text-xl text-destructive font-ui">🎶 {name(c.turncoatId)} kæmper for monsteret!</div>}
      {view.negotiations.filter(n => n.status === "pending").map(n => (
        <div key={n.id} className="text-lg font-ui">
          🤝 {name(n.fromId)} beder {name(n.toId)} om hjælp: {treasuresText(n.treasures)}{n.items.length ? ` + ${n.items.map(i => i.name).join(", ")}` : ""}
        </div>
      ))}
      <div className="flex items-center gap-4 text-lg font-ui">
        <span>{view.status === "runAwayRoll" ? "🏃 Flygter…" : `Meldt pas: ${passed}/${c.requiredPasses.length}`}</span>
        {countdown !== null && view.status === "waitingForInterrupts" && view.settings.interruptSeconds > 0 && (
          <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden" role="timer" aria-label={`${Math.ceil(countdown / 1000)} sekunder tilbage til at blande sig`}>
            <div className="h-full bg-primary transition-[width] duration-200 ease-linear"
              style={{ width: `${(100 * countdown) / (view.settings.interruptSeconds * 1000)}%` }} />
          </div>
        )}
      </div>
    </section>
  );
}

/** TV mode: a shared screen for the whole table — QR code to join, the board, the fight, the scores. */
export function TvView() {
  const view = useGame(s => s.view);
  const roomCode = useGame(s => s.roomCode);
  const connected = useGame(s => s.connected);
  const leave = useGame(s => s.leave);
  if (!view) return null;

  const offline = !connected && (
    <div role="status" className="fixed top-0 inset-x-0 z-[60] bg-destructive text-destructive-foreground text-center font-ui py-2">
      Forbindelsen er tabt — forbinder igen…
    </div>
  );

  if (view.status === "lobby") {
    return (
      <main className="min-h-dvh flex items-center justify-center p-8">
        {offline}
        <div className="felt-table p-10 max-w-4xl w-full grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-4 text-center">
            <h1 className="font-display text-6xl brass-text">Goblin Grand Parley</h1>
            <p className="text-2xl">Rum <b className="font-mono tracking-widest">{roomCode}</b></p>
            <JoinInfo qrSize={280} stacked />
          </div>
          <div className="space-y-3">
            <h2 className="font-display text-3xl">Ved bordet</h2>
            {view.players.length === 0 && <p className="text-xl opacity-70 italic">Scan koden for at være med…</p>}
            <ul className="space-y-2">
              {view.players.map(p => (
                <li key={p.id} className="text-2xl font-display bg-muted/40 rounded px-4 py-2 flex justify-between">
                  {p.name}<span aria-label={p.connected ? "online" : "offline"}>{p.connected ? "🟢" : "⚪"}</span>
                </li>
              ))}
            </ul>
            <p className="text-lg font-ui opacity-70">
              Spil til niveau {view.settings.winLevel} · trussel {THREAT_LABEL[view.settings.threat]} · pas-nedtælling {view.settings.interruptSeconds ? `${view.settings.interruptSeconds} sek.` : "fra"}
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (view.status === "gameOver") {
    const winner = view.players.find(p => p.id === view.winnerId);
    return (
      <main className="min-h-dvh flex items-center justify-center p-8">
        <div className="felt-table p-16 text-center space-y-6">
          <h1 className="font-display text-8xl brass-text">🏆 {winner?.name}</h1>
          <p className="text-4xl font-display">nåede niveau {view.settings.winLevel}!</p>
          <Button variant="ghost" onClick={leave}>Stop med at vise dette rum</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh p-4 grid gap-4 grid-cols-1 lg:grid-cols-[1fr_24rem]">
      {offline}
      <div className="flex flex-col gap-4 min-w-0">
        {view.combat ? <TvCombat /> : <TableArea />}
        {view.combat && (
          <div className="opacity-80"><TableArea /></div>
        )}
      </div>
      <aside className="flex flex-col gap-4">
        <div className="felt-table p-3 flex items-center gap-3">
          <JoinInfo qrSize={96} />
        </div>
        <Scoreboard />
        <section aria-label="Hvad der skete" className="felt-table p-3 text-base font-ui space-y-1 max-h-72 overflow-y-auto scroll-thin">
          {view.log.slice(-10).map((l, i) => <div key={i} className="opacity-90">{l}</div>)}
        </section>
        <Button variant="ghost" size="sm" onClick={leave}>Stop med at vise dette rum</Button>
      </aside>
      <EventStrip />
      <CardDetails />
    </main>
  );
}
