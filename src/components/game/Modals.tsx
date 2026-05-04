import { useGame, send } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { GameCard } from "./GameCard";
import { useState } from "react";

export function CharityModal() {
  const view = useGame(s => s.view);
  // NYT: Vi gemmer nu kortets index (nummer i rækken) i stedet for dets ID
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
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
          {self.hand.map((c, i) => (
            // NYT: key er nu en kombination af ID og Index, og onCLick bruger 'i'
            <GameCard key={`${c.id}-${i}`} card={c} size="md"
              selected={selectedIndices.includes(i)}
              onClick={() => setSelectedIndices(s => s.includes(i) ? s.filter(x => x !== i) : (s.length < need ? [...s, i] : s))}
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
        {/* NYT: Når vi sender til serveren, slår vi indexet op i self.hand for at finde det rigtige ID at sende afsted */}
        <Button disabled={selectedIndices.length !== need || !autoTo} onClick={() => {
          const cardIds = selectedIndices.map(i => self.hand[i].id);
          send({ type: "charityGive", cardIds, toId: autoTo! });
        }}>
          Give {selectedIndices.length}/{need}
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
