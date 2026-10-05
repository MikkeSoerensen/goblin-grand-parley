import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useGame, send } from "@/lib/store";
import { useInspect } from "@/lib/inspect";
import { isTradable, tradeValue } from "../../../shared/rules";
import type { Card, EquipmentCard, PublicPlayer } from "../../../shared/types";
import { cn } from "@/lib/utils";

const worn = (p: PublicPlayer): EquipmentCard[] => {
  const e = p.equipment;
  return [e.head, e.armor, e.feet, e.bigItem, ...e.hands, ...e.none].filter((x): x is EquipmentCard => !!x);
};

const total = (cards: Card[]) => cards.reduce((s, c) => s + tradeValue(c), 0);

/** A tappable card chip: tap to select, the ⓘ opens the full card. */
function Chip({ card, selected, onToggle }: { card: Card; selected?: boolean; onToggle?: () => void }) {
  const inspect = useInspect(s => s.open);
  return (
    <span className={cn(
      "inline-flex items-center rounded-md border text-xs font-ui overflow-hidden",
      selected ? "border-primary bg-primary/20" : "border-border bg-muted/40",
    )}>
      <button type="button" disabled={!onToggle} onClick={onToggle} aria-pressed={onToggle ? !!selected : undefined}
        className="px-2 py-1 text-left disabled:cursor-default">
        {card.name} <span className="opacity-60">{tradeValue(card)}g</span>
      </button>
      <button type="button" onClick={() => inspect(card)} className="px-1.5 py-1 border-l border-border/60 opacity-70 hover:opacity-100" aria-label={`Details for ${card.name}`}>ⓘ</button>
    </span>
  );
}

const CardList = ({ cards }: { cards: Card[] }) =>
  cards.length === 0
    ? <span className="text-xs italic opacity-60">nothing</span>
    : <span className="inline-flex flex-wrap gap-1">{cards.map(c => <Chip key={c.id} card={c} />)}</span>;

/** The Grand Parley: swap valuables with other players outside of fights. */
export function ParleyPanel() {
  const view = useGame(s => s.view);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [give, setGive] = useState<string[]>([]);
  const [take, setTake] = useState<string[]>([]);
  if (!view?.self) return null;
  const self = view.self;

  const nameOf = (id: string) => view.players.find(p => p.id === id)?.name ?? "?";
  const incoming = view.trades.filter(t => t.toId === self.id);
  const outgoing = view.trades.filter(t => t.fromId === self.id);
  const canTrade = view.status === "normalTurn" && !view.combat && !self.isDead;

  const mine: Card[] = [
    ...self.hand.filter(c => c.deck === "treasure"),
    ...self.backpack,
    ...worn(self),
  ].filter(isTradable);
  const partner = view.players.find(p => p.id === partnerId) ?? null;
  const theirs = partner ? worn(partner).filter(isTradable) : [];
  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  const reset = () => { setPartnerId(null); setGive([]); setTake([]); };

  return (
    <section className="bg-popover/95 backdrop-blur border border-border rounded-xl shadow-card p-3 space-y-3" aria-label="The Grand Parley">
      <h2 className="font-display text-lg brass-text flex items-center gap-2">🤝 The Grand Parley</h2>

      {incoming.map(t => (
        <div key={t.id} className="rounded-lg border-2 border-primary/60 bg-primary/10 p-2 space-y-1.5 text-sm">
          <div className="font-semibold">{nameOf(t.fromId)} offers a trade</div>
          <div><span className="opacity-70">You get:</span> <CardList cards={t.giveCards} /> <span className="text-xs opacity-60">({total(t.giveCards)}g)</span></div>
          <div><span className="opacity-70">You give:</span> <CardList cards={t.takeCards} /> <span className="text-xs opacity-60">({total(t.takeCards)}g)</span></div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" disabled={!canTrade} onClick={() => send({ type: "respondTrade", tradeId: t.id, accept: true })}>Accept</Button>
            <Button size="sm" variant="ghost" onClick={() => send({ type: "respondTrade", tradeId: t.id, accept: false })}>Decline</Button>
          </div>
        </div>
      ))}

      {outgoing.map(t => (
        <div key={t.id} className="rounded-lg border border-border bg-muted/30 p-2 text-sm flex flex-wrap items-center gap-2">
          <span className="flex-1">Waiting for <b>{nameOf(t.toId)}</b>: {total(t.giveCards)}g ⇄ {total(t.takeCards)}g</span>
          <Button size="sm" variant="ghost" onClick={() => send({ type: "cancelTrade", tradeId: t.id })}>Withdraw</Button>
        </div>
      ))}

      {!canTrade ? (
        <p className="text-xs opacity-60 font-ui">Trading happens outside of fights.</p>
      ) : !partner ? (
        <div className="space-y-1.5">
          <div className="text-xs font-ui opacity-70">Propose a trade with:</div>
          <div className="flex flex-wrap gap-1.5">
            {view.players.filter(p => p.id !== self.id && !p.isDead).map(p => (
              <Button key={p.id} size="sm" variant="secondary" onClick={() => setPartnerId(p.id)}>{p.name}</Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="font-semibold">Trade with {partner.name}</div>
          <div>
            <div className="text-xs font-ui opacity-70 mb-1">You give ({total(mine.filter(c => give.includes(c.id)))}g)</div>
            <div className="flex flex-wrap gap-1">
              {mine.length === 0 && <span className="text-xs italic opacity-60">You have nothing of value.</span>}
              {mine.map(c => <Chip key={c.id} card={c} selected={give.includes(c.id)} onToggle={() => toggle(give, setGive, c.id)} />)}
            </div>
          </div>
          <div>
            <div className="text-xs font-ui opacity-70 mb-1">You want from what they wear ({total(theirs.filter(c => take.includes(c.id)))}g)</div>
            <div className="flex flex-wrap gap-1">
              {theirs.length === 0 && <span className="text-xs italic opacity-60">{partner.name} wears nothing of value.</span>}
              {theirs.map(c => <Chip key={c.id} card={c} selected={take.includes(c.id)} onToggle={() => toggle(take, setTake, c.id)} />)}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={give.length + take.length === 0}
              onClick={() => { send({ type: "proposeTrade", toId: partner.id, give, take }); reset(); }}>
              Send offer
            </Button>
            <Button size="sm" variant="ghost" onClick={reset}>Cancel</Button>
          </div>
        </div>
      )}
    </section>
  );
}
