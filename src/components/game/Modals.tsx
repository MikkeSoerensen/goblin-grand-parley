import { useGame, send } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { GameCard } from "./GameCard";
import { useState } from "react";

export function CharityModal() {
  const view = useGame(s => s.view);
  const [selected, setSelected] = useState<string[]>([]);
  const [recipient, setRecipient] = useState<string | null>(null);
  if (!view?.charity || !view.self) return null;
  if (view.charity.fromId !== view.self.id) {
    return (
      <div className="fixed inset-0 bg-background/80 backdrop-blur z-40 flex items-center justify-center p-4">
        <div className="bg-popover border border-border rounded-xl p-6 text-center max-w-sm">
          <h2 className="font-display text-xl brass-text mb-2">Charity</h2>
          <p>{view.players.find(p => p.id === view.charity!.fromId)?.name} is choosing {view.charity.cardCount} card(s) to give.</p>
        </div>
      </div>
    );
  }
  const self = view.self;
  const need = view.charity.cardCount;
  const candidates = view.players.filter(p => view.charity!.candidates.includes(p.id));
  const autoTo = candidates.length === 1 ? candidates[0].id : recipient;

  return (
    <div className="fixed inset-0 bg-background/85 backdrop-blur z-40 flex items-center justify-center p-4">
      <div className="bg-popover border-2 border-primary rounded-xl p-5 max-w-3xl w-full">
        <h2 className="font-display text-xl brass-text mb-1">Charity</h2>
        <p className="text-sm opacity-80 mb-3">You have more than 5 cards. Choose <b>{need}</b> to give to {candidates.length === 1 ? candidates[0].name : "the lowest-level opponent (pick recipient below)"}.</p>
        <div className="flex flex-wrap gap-2 mb-3 max-h-72 overflow-y-auto scroll-thin">
          {self.hand.map(c => (
            <GameCard key={c.id} card={c} size="md"
              selected={selected.includes(c.id)}
              onClick={() => setSelected(s => s.includes(c.id) ? s.filter(x => x !== c.id) : (s.length < need ? [...s, c.id] : s))}
            />
          ))}
        </div>
        {candidates.length > 1 && (
          <div className="flex gap-2 mb-3 flex-wrap">
            {candidates.map(p => (
              <Button key={p.id} size="sm" variant={recipient === p.id ? "default" : "secondary"} onClick={() => setRecipient(p.id)}>
                {p.name} (Lvl {p.level})
              </Button>
            ))}
          </div>
        )}
        <Button disabled={selected.length !== need || !autoTo} onClick={() => send({ type: "charityGive", cardIds: selected, toId: autoTo! })}>
          Give {selected.length}/{need}
        </Button>
      </div>
    </div>
  );
}

export function LootingModal() {
  const view = useGame(s => s.view);
  if (!view?.looting || !view.self) return null;
  const dead = view.players.find(p => p.id === view.looting!.deadId);
  const nextId = view.looting.orderQueue[0];
  const isMine = nextId === view.self.id;
  return (
    <div className="fixed inset-0 bg-background/85 backdrop-blur z-40 flex items-center justify-center p-4">
      <div className="bg-popover border-2 border-destructive rounded-xl p-5 max-w-3xl w-full">
        <h2 className="font-display text-xl text-destructive mb-1">💀 Looting the Body</h2>
        <p className="text-sm opacity-80 mb-3">{dead?.name} has died. {isMine ? "Pick one card to take." : `Waiting for ${view.players.find(p => p.id === nextId)?.name} to pick…`}</p>
        <div className="flex flex-wrap gap-2 max-h-72 overflow-y-auto scroll-thin">
          {view.looting.pile.map(c => (
            <GameCard key={c.id} card={c} size="md" onClick={isMine ? () => send({ type: "lootBody", cardId: c.id }) : undefined}/>
          ))}
        </div>
      </div>
    </div>
  );
}
