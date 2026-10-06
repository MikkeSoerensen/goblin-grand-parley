import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useGame } from "@/lib/store";
import { useInspect } from "@/lib/inspect";
import { GameCard } from "./GameCard";
import { CLASS_LABEL, CLASS_PLURAL, RACE_PLURAL, describeEffect, hasClass, hasEffect, hasTag, levelsText, treasuresText } from "../../../shared/rules";
import type { Card, ClassName, ClientView, MonsterTag } from "../../../shared/types";

const TYPE_LABEL: Record<Card["type"], string> = {
  monster: "Monster", equipment: "Udstyr", curse: "Forbandelse", oneshot: "Engangskort", enhancer: "Monsterforstærker",
  class: "Klasse", "go-up-a-level": "Op i Niveau!", portal: "Portal", dungeon: "Fangehul",
  "wandering-monster": "Ubuden Gæst", mate: "Ond Tvilling",
  race: "Folk", dual: "To på én gang", "forged-papers": "Snyd!", remedy: "Kur", companion: "Følgesvend",
};
const DECK_LABEL: Record<Card["deck"], string> = { door: "dørkort", treasure: "skattekort", dungeon: "fangehulskort" };

const SLOT_LABEL: Record<string, string> = {
  head: "Hoved", armor: "Rustning", feet: "Fødder", hand: "Én hånd", twoHands: "To hænder", bigItem: "Stor genstand", none: "Ingen plads (bæres altid)",
};

const TAG_LABEL: Record<MonsterTag, string> = { goblin: "Goblin", undead: "Udød", magical: "Magisk", beast: "Bæst" };

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
    if (hasDungeon(view, "d-martial")) out.push("Kampsportens Fangehul: +2 niveau");
    if (hasDungeon(view, "d-feeble")) out.push("Fangehullet med Svage Fjender: −5 niveau (mindst 1)");
    if (hasDungeon(view, "d-goblin") && hasTag(card, "goblin")) out.push("Goblinland: +3 niveau");
    const c = view.combat;
    if (card.antiClass && c?.monsters.some(m => m.id === card.id)) {
      const fighters = [c.attackerId, c.helperId].map(id => view.players.find(p => p.id === id)).filter(p => !!p);
      if (fighters.some(f => hasClass(f, card.antiClass!.className as ClassName))) {
        out.push(`Kæmper mod en ${CLASS_LABEL[card.antiClass.className as ClassName]}: +${card.antiClass.bonus} niveau`);
      }
    }
  }
  if ("goldValue" in card && card.goldValue > 0) {
    if (hasDungeon(view, "d-poverty")) out.push("Den Ynkelige Fattigdoms Fangehul: kan ikke sælges");
    if (hasDungeon(view, "d-lavish")) out.push("Fangehullet med Ødsel Plyndring: sælges for det dobbelte");
    if (hasDungeon(view, "d-clipping")) out.push("Rabatklippernes Fangehul: sælges for 100g mindre");
    if (view.self && hasEffect(view.self, "halfSellValue")) out.push("Din Forheksede Pung: sælges for halv pris");
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
              <DialogDescription>{TYPE_LABEL[card.type]}{card.deck !== "dungeon" ? ` · ${DECK_LABEL[card.deck]}` : ""}</DialogDescription>
            </DialogHeader>
            <div className="flex justify-center">
              <GameCard card={card} size="lg" inspectable={false} />
            </div>
            <dl className="text-sm font-ui">
              {card.type === "monster" && (
                <>
                  <Row label="Niveau">{card.level}</Row>
                  <Row label="Belønning">{levelsText(card.levelsAwarded)}, {treasuresText(card.treasures)}</Row>
                  <Row label="Straf">{card.badStuffText}</Row>
                  {card.tags.length > 0 && <Row label="Mærker">{card.tags.map(t => TAG_LABEL[t]).join(", ")}</Row>}
                  {card.ignoresLevelAtOrBelow !== undefined && (
                    <Row label="Ignorerer de svage">Forfølger ikke spillere på niveau {card.ignoresLevelAtOrBelow} eller lavere</Row>
                  )}
                  {card.antiClass && <Row label="Hader">{CLASS_PLURAL[card.antiClass.className as ClassName]} (+{card.antiClass.bonus})</Row>}
                  {card.immuneToCharm && <Row label="Fortryllelse">Immun</Row>}
                  {card.packHunter !== undefined && <Row label="Flokjæger">+{card.packHunter} når du kæmper alene</Row>}
                  {card.huntsLeader !== undefined && <Row label="Jager føreren">+{card.huntsLeader} mod spilleren, der fører</Row>}
                  {card.sirenCall && <Row label="Sirenens kald">En hjælper slår, når de melder sig: 1-3 skifter de side</Row>}
                  {card.swarmBonus !== undefined && <Row label="Leder sværmen">+{card.swarmBonus} pr. anden goblin i kampen</Row>}
                  {card.hordeBonus !== undefined && <Row label="Horde">+{card.hordeBonus} pr. andet monster i kampen</Row>}
                  {card.ambush && <Row label="Baghold">Når den sparkes ind, slutter næste dørkort sig til, hvis det er et monster</Row>}
                  {card.antiRace && <Row label="Hader">{RACE_PLURAL[card.antiRace.raceName]} (+{card.antiRace.bonus})</Row>}
                </>
              )}
              {card.type === "equipment" && (
                <>
                  <Row label="Bonus">{card.bonus >= 0 ? "+" : ""}{card.bonus}</Row>
                  <Row label="Plads">{SLOT_LABEL[card.slot]}{card.isBig ? " · Stor" : ""}</Row>
                  <Row label="Værdi">{card.goldValue}g</Row>
                  {card.classReq && <Row label="Kræver">{CLASS_LABEL[card.classReq]}</Row>}
                  {card.forgedWith && <Row label="Forfalskede papirer">Kravene ignoreres</Row>}
                </>
              )}
              {(card.type === "oneshot" || card.type === "enhancer") && (
                <>
                  <Row label="Bonus">{card.bonus >= 0 ? "+" : ""}{card.bonus}</Row>
                  {card.type === "oneshot" && card.tagBonus && (
                    <Row label={`Mod ${TAG_LABEL[card.tagBonus.tag]}`}>+{card.tagBonus.bonus}</Row>
                  )}
                  <Row label="Værdi">{card.goldValue}g</Row>
                </>
              )}
              {card.type === "companion" && (
                <>
                  <Row label="Kampbonus">+{card.bonus}</Row>
                  {card.runBonus > 0 && <Row label="Flugt">+{card.runBonus}</Row>}
                  {card.sacrificable && <Row label="Offer">Kan ofres, så du slipper væk automatisk</Row>}
                  {card.upkeep && <Row label="Løn">Dit billigste kort ved slutningen af hver af dine ture</Row>}
                  <Row label="Værdi">{card.goldValue}g</Row>
                </>
              )}
              {card.type === "remedy" && <Row label="Værdi">{card.goldValue}g</Row>}
              {card.type === "curse" && card.effect.kind === "addEffect" && (
                <Row label="Hænger ved">{describeEffect(card.effect.effect)}</Row>
              )}
              {"effectText" in card && <Row label="Effekt">{card.effectText}</Row>}
            </dl>
            {card.flavor && <p className="text-sm italic opacity-80">{card.flavor}</p>}
            {(() => {
              const mods = activeModifiers(card, view);
              if (mods.length === 0) return null;
              return (
                <div className="rounded-md bg-accent/15 border border-accent/40 p-2 text-sm font-ui">
                  <div className="font-semibold mb-1">Lige nu</div>
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
