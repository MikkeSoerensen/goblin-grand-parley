import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useGame } from "@/lib/store";
import { useInspect } from "@/lib/inspect";
import { GameCard } from "./GameCard";
import { hasClass, hasEffect, hasTag } from "../../../shared/rules";
import type { Card, ClassName, ClientView, MonsterTag } from "../../../shared/types";

const TYPE_LABEL: Record<Card["type"], string> = {
  monster: "Monster", equipment: "Equipment", curse: "Curse", oneshot: "One-shot", enhancer: "Monster enhancer",
  class: "Class", "go-up-a-level": "Go Up a Level", portal: "Portal", dungeon: "Dungeon",
  "wandering-monster": "Wandering Monster", mate: "Mate",
  race: "Race", dual: "Two of a kind", "forged-papers": "Cheat!",
};

const SLOT_LABEL: Record<string, string> = {
  head: "Head", armor: "Armor", feet: "Feet", hand: "One hand", twoHands: "Two hands", bigItem: "Big item", none: "No slot (always worn)",
};

const TAG_LABEL: Record<MonsterTag, string> = { goblin: "Goblin", undead: "Undead", magical: "Magical", beast: "Beast" };

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex justify-between gap-4 py-1 border-b border-border/50 last:border-0">
    <dt className="opacity-70">{label}</dt>
    <dd className="text-right font-semibold">{children}</dd>
  </div>
);

const hasDungeon = (view: ClientView | null, id: string) => !!view?.activeDungeons.some(d => d.cardId === id);

/** What is changing this card right now (dungeons, the current fight, your effects). */
const activeModifiers = (card: Card, view: ClientView | null): string[] => {
  const out: string[] = [];
  if (!view) return out;
  if (card.type === "monster") {
    if (hasDungeon(view, "d-martial")) out.push("Dungeon of Martial Arts: +2 level");
    if (hasDungeon(view, "d-feeble")) out.push("Dungeon of Feeble Foes: −5 level (min 1)");
    if (hasDungeon(view, "d-goblin") && hasTag(card, "goblin")) out.push("Goblin Land: +3 level");
    const c = view.combat;
    if (card.antiClass && c?.monsters.some(m => m.id === card.id)) {
      const fighters = [c.attackerId, c.helperId].map(id => view.players.find(p => p.id === id)).filter(p => !!p);
      if (fighters.some(f => hasClass(f, card.antiClass!.className as ClassName))) {
        out.push(`Fighting a ${card.antiClass.className}: +${card.antiClass.bonus} level`);
      }
    }
  }
  if ("goldValue" in card && card.goldValue > 0) {
    if (hasDungeon(view, "d-poverty")) out.push("Dungeon of Pathetic Poverty: cannot be sold");
    if (hasDungeon(view, "d-lavish")) out.push("Dungeon of Lavish Loot: sells for double");
    if (hasDungeon(view, "d-clipping")) out.push("Dungeon of Coupon Clipping: sells for 100g less");
    if (view.self && hasEffect(view.self, "halfSellValue")) out.push("Your Cursed Coin Purse: sells for half");
  }
  return out;
};

export function CardDetails() {
  const card = useInspect(s => s.card);
  const close = useInspect(s => s.close);
  const view = useGame(s => s.view);

  return (
    <Dialog open={card !== null} onOpenChange={open => { if (!open) close(); }}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        {card && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display brass-text text-2xl">{card.name}</DialogTitle>
              <DialogDescription>{TYPE_LABEL[card.type]}{card.deck !== "dungeon" ? ` · ${card.deck} card` : ""}</DialogDescription>
            </DialogHeader>
            <div className="flex justify-center">
              <GameCard card={card} size="lg" inspectable={false} />
            </div>
            <dl className="text-sm font-ui">
              {card.type === "monster" && (
                <>
                  <Row label="Level">{card.level}</Row>
                  <Row label="Reward">{card.levelsAwarded} level(s), {card.treasures} treasure(s)</Row>
                  <Row label="Bad Stuff">{card.badStuffText}</Row>
                  {card.tags.length > 0 && <Row label="Tags">{card.tags.map(t => TAG_LABEL[t]).join(", ")}</Row>}
                  {card.ignoresLevelAtOrBelow !== undefined && (
                    <Row label="Ignores the weak">Won't pursue players at level {card.ignoresLevelAtOrBelow} or below</Row>
                  )}
                  {card.antiClass && <Row label="Hates">{card.antiClass.className}s (+{card.antiClass.bonus})</Row>}
                  {card.immuneToCharm && <Row label="Charm">Immune</Row>}
                  {card.packHunter !== undefined && <Row label="Pack hunter">+{card.packHunter} while you fight alone</Row>}
                  {card.huntsLeader !== undefined && <Row label="Hunts the leader">+{card.huntsLeader} against the player in the lead</Row>}
                  {card.sirenCall && <Row label="Siren's call">A helper rolls on joining: 1-3 they switch sides</Row>}
                  {card.swarmBonus !== undefined && <Row label="Commands the swarm">+{card.swarmBonus} per other goblin in the fight</Row>}
                  {card.hordeBonus !== undefined && <Row label="Horde">+{card.hordeBonus} per other monster in the fight</Row>}
                  {card.ambush && <Row label="Ambush">When kicked open, the next Door card joins if it's a monster</Row>}
                  {card.antiRace && <Row label="Hates">{card.antiRace.raceName}s (+{card.antiRace.bonus})</Row>}
                </>
              )}
              {card.type === "equipment" && (
                <>
                  <Row label="Bonus">{card.bonus >= 0 ? "+" : ""}{card.bonus}</Row>
                  <Row label="Slot">{SLOT_LABEL[card.slot]}{card.isBig ? " · Big" : ""}</Row>
                  <Row label="Value">{card.goldValue}g</Row>
                  {card.classReq && <Row label="Requires">{card.classReq}</Row>}
                  {card.forgedWith && <Row label="Forged papers">Requirements ignored</Row>}
                </>
              )}
              {(card.type === "oneshot" || card.type === "enhancer") && (
                <>
                  <Row label="Bonus">{card.bonus >= 0 ? "+" : ""}{card.bonus}</Row>
                  {card.type === "oneshot" && card.tagBonus && (
                    <Row label={`Against ${TAG_LABEL[card.tagBonus.tag]}`}>+{card.tagBonus.bonus}</Row>
                  )}
                  <Row label="Value">{card.goldValue}g</Row>
                </>
              )}
              {"effectText" in card && <Row label="Effect">{card.effectText}</Row>}
            </dl>
            {card.flavor && <p className="text-sm italic opacity-80">{card.flavor}</p>}
            {(() => {
              const mods = activeModifiers(card, view);
              if (mods.length === 0) return null;
              return (
                <div className="rounded-md bg-accent/15 border border-accent/40 p-2 text-sm font-ui">
                  <div className="font-semibold mb-1">Right now</div>
                  <ul className="list-disc pl-5 space-y-0.5">{mods.map(m => <li key={m}>{m}</li>)}</ul>
                </div>
              );
            })()}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
