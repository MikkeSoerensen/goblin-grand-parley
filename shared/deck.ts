import type {
  Card, MonsterCard, EquipmentCard, CurseCard, OneShotCard, EnhancerCard,
  GoUpLevelCard, BadStuffKind, Slot, ClassCard, WanderingMonsterCard, MateCard,
  PortalCard, DungeonCard, MonsterTag, RaceCard, RaceName, DualCard, ForgedPapersCard,
  RemedyCard, CompanionCard, PlayerEffect, ClassName,
} from "./types";
import { CLASS_LABEL, RACE_LABEL } from "./rules";

let _id = 0;
const uid = () => `c${++_id}`;

// Rule tags per monster (catalog id). Untagged monsters simply have no tags.
export const MONSTER_TAGS: Readonly<Record<string, MonsterTag[]>> = {
  "m-baby": ["goblin"], "m-gob-grunt": ["goblin"], "m-gob-archer": ["goblin"],
  "m-gob-cripple": ["goblin"], "m-gob-king": ["goblin"],
  "m-undead": ["undead"], "m-wraith": ["undead"], "m-mummy": ["undead"], "m-vamp": ["undead"],
  "m-anti-wizard": ["magical"], "m-floating": ["magical"], "m-laser": ["magical"],
  "m-pit": ["beast"], "m-flying": ["beast"], "m-large": ["beast"], "m-snails": ["beast"], "m-flat": ["beast"],
  "m-wolfpack": ["beast"], "m-hydra": ["beast"], "m-siren": ["magical"], "m-gob-warlord": ["goblin"],
  "m-gob-raiders": ["goblin"], "m-skeletons": ["undead"], "m-elf-eater": ["beast"], "m-hound": ["beast"],
};

// Big monsters that don't bother with weak players: at or below this level you escape automatically.
export const MONSTER_IGNORES: Readonly<Record<string, number>> = {
  "m-rat": 5,    // Glødeormen den Umættelige
  "m-bull": 4,   // Essetyren
  "m-dragon": 4, // Mosekrakenen
};

// ---------- helpers ----------
const monster = (
  cardId: string, name: string, level: number, treasures: number, levelsAwarded: number,
  badStuff: BadStuffKind, badStuffText: string, copies = 1, flavor?: string,
  antiClass?: { className: string; bonus: number }, // NY
  immuneToCharm?: boolean                           // NY
): MonsterCard[] => Array.from({ length: copies }, () => ({
  id: uid(), cardId, name, type: "monster", deck: "door",
  level, treasures, levelsAwarded, badStuff, badStuffText, flavor,
  antiClass, immuneToCharm, tags: [...(MONSTER_TAGS[cardId] ?? [])],
  ...(MONSTER_IGNORES[cardId] !== undefined ? { ignoresLevelAtOrBelow: MONSTER_IGNORES[cardId] } : {}),
}));

const equipment = (
  cardId: string, name: string, bonus: number, goldValue: number, slot: Slot, isBig = false, copies = 1, flavor?: string,
  classReq?: ClassName // <--- NY
): EquipmentCard[] => Array.from({ length: copies }, () => ({
  id: uid(), cardId, name, type: "equipment", deck: "treasure",
  bonus, goldValue, slot, isBig, flavor, classReq // <--- NY
}));

const wanderingMonster = (copies = 1): WanderingMonsterCard[] =>
  Array.from({ length: copies }, () => ({
    id: uid(), cardId: "c-wandering", name: "Ubuden Gæst", type: "wandering-monster", deck: "door", flavor: "Spil kortet sammen med et monster fra din hånd for at sende det ind i en hvilken som helst kamp."
  }));

const mate = (copies = 1): MateCard[] =>
  Array.from({ length: copies }, () => ({
    id: uid(), cardId: "c-mate", name: "Ond Tvilling", type: "mate", deck: "door", flavor: "Kopierer et monster i kampen!"
  }));

const portal = (cardId: string, name: string, effectText: string, copies = 1): PortalCard[] =>
  Array.from({ length: copies }, () => ({
    id: uid(), cardId, name, type: "portal", deck: "door", effectText
  }));

const dungeon = (cardId: string, name: string, effectText: string, copies = 1): DungeonCard[] =>
  Array.from({ length: copies }, () => ({
    id: uid(), cardId, name, type: "dungeon", deck: "dungeon", effectText
  }));

const curse = (cardId: string, name: string, effect: BadStuffKind, effectText: string, copies = 1): CurseCard[] =>
  Array.from({ length: copies }, () => ({
    id: uid(), cardId, name, type: "curse", deck: "door", effect, effectText,
  }));

const oneShot = (cardId: string, name: string, bonus: number, goldValue: number, target: OneShotCard["target"], copies = 1, flavor?: string): OneShotCard[] =>
  Array.from({ length: copies }, () => ({
    id: uid(), cardId, name, type: "oneshot", deck: "treasure", bonus, goldValue, target, flavor,
  }));

const classCard = (cardId: string, className: ClassName, effectText: string, copies = 1): ClassCard[] =>
  Array.from({ length: copies }, () => ({
    id: uid(), cardId, name: CLASS_LABEL[className], type: "class", deck: "door", className, effectText,
  }));

const race = (cardId: string, raceName: RaceName, effectText: string, copies = 2): RaceCard[] =>
  Array.from({ length: copies }, () => ({
    id: uid(), cardId, name: RACE_LABEL[raceName], type: "race", deck: "door", raceName, effectText,
  }));

const dual = (cardId: string, name: string, dualKind: DualCard["dualKind"], effectText: string): DualCard[] =>
  [{ id: uid(), cardId, name, type: "dual", deck: "door", dualKind, effectText }];

const forgedPapers = (copies: number): ForgedPapersCard[] =>
  Array.from({ length: copies }, () => ({
    id: uid(), cardId: "t-forged-papers", name: "Forfalskede Laugspapirer", type: "forged-papers", deck: "treasure", goldValue: 0,
    effectText: "Spil kortet, når du tager en genstand på: Se bort fra dens klassekrav (og andre 'kun'/'kan ikke bruges af'-regler). Papirerne bliver hos genstanden.",
  }));

// A curse that sticks: it puts a lasting effect on the victim.
export const CURSE_PREFIX = "Forbandelse! ";
const lingeringCurse = (cardId: string, name: string, effect: Omit<PlayerEffect, "id" | "sourceCardId" | "name">, effectText: string, copies: number): CurseCard[] =>
  curse(cardId, name, { kind: "addEffect", effect: { ...effect, name: name.replace(CURSE_PREFIX, ""), sourceCardId: cardId } }, effectText, copies);

const remedy = (copies: number): RemedyCard[] =>
  Array.from({ length: copies }, () => ({
    id: uid(), cardId: "t-ring", name: "Andenchancens Ring", type: "remedy", deck: "treasure", goldValue: 300,
    effectText: "Spil når som helst: Fjern én vedvarende effekt (en forbandelse, der hænger ved) fra en VILKÅRLIG spiller.",
  }));

const companion = (cardId: string, name: string, stats: Pick<CompanionCard, "bonus" | "runBonus" | "sacrificable" | "upkeep" | "goldValue">, effectText: string, copies: number): CompanionCard[] =>
  Array.from({ length: copies }, () => ({ id: uid(), cardId, name, type: "companion", deck: "treasure", ...stats, effectText }));

const enhancer = (cardId: string, name: string, bonus: number, goldValue: number, copies = 1): EnhancerCard[] =>
  Array.from({ length: copies }, () => ({
    id: uid(), cardId, name, type: "enhancer", deck: "treasure", bonus, goldValue, target: "monster",
  }));

const goUp = (copies: number): GoUpLevelCard[] =>
  Array.from({ length: copies }, () => ({
    id: uid(), cardId: "go-up", name: "Op i Niveau!", type: "go-up-a-level", deck: "treasure", goldValue: 0,
  }));

// ---------- DOOR DECK (~70) ----------
export const buildDoorDeck = (): Card[] => {
  const cards: Card[] = [];

  // Monsters (~50)
  cards.push(...monster("m-rat", "Glødeormen den Umættelige", 20, 5, 2, { kind: "death" }, "Du dør. Grusomt.", 1));
  cards.push(...monster("m-king", "Skatteopkræver-Lichen",   16, 4, 2, { kind: "loseAllItems" }, "Mist alle dine genstande.", 1));
  cards.push(...monster("m-bull", "Essetyren",               18, 4, 2, { kind: "death" }, "Du bliver mast. Død.", 1));
  cards.push(...monster("m-undead", "Knoglehingsten",        14, 3, 2, { kind: "loseLevel", amount: 2 }, "Mist 2 niveauer.", 1));
  cards.push(...monster("m-wraith", "Gravtvillingerne",      14, 3, 2, { kind: "loseLevel", amount: 2 }, "Mist 2 niveauer.", 1));
  cards.push(...monster("m-shrieker", "Den Hylende Skriver", 12, 3, 2, { kind: "loseItem", slot: "head" }, "Mist din hovedbeklædning.", 1));
  cards.push(...monster("m-dragon", "Mosekrakenen",          18, 4, 2, { kind: "death" }, "Trukket ned i en våd grav.", 1));
  cards.push(...monster("m-troll", "Stengolem",              14, 2, 2, { kind: "loseItem", slot: "armor" }, "Din rustning smuldrer.", 2));
  cards.push(...monster("m-vamp",  "Vampyr",                 12, 2, 2, { kind: "loseLevel", amount: 1 }, "Suget tør. Mist 1 niveau.", 2));
  cards.push(...monster("m-mummy", "Mumie",                  12, 2, 1, { kind: "loseItem", slot: "biggest" }, "Mist din største genstand.", 2));
  cards.push(...monster("m-troll2","Sladderdæmonen",         12, 2, 1, { kind: "loseLevel", amount: 1 }, "Mist 1 niveau.", 2));
  cards.push(...monster("m-flying","Springende Mosetudser",  10, 2, 1, { kind: "loseItem", slot: "feet" }, "Mist dit fodtøj.", 2));
  cards.push(...monster("m-orc",   "Lommetyvsnisser",        10, 2, 1, { kind: "loseItem", slot: "any" }, "Mist én genstand.", 2));
  cards.push(...monster("m-floating","Det Svævende Heksøje", 10, 2, 1, { kind: "loseLevel", amount: 1 }, "Mist 1 niveau.", 2));
  cards.push(...monster("m-pit",   "Fangehulsmastiffen",      8, 1, 1, { kind: "loseItem", slot: "feet" }, "Den bider dine støvler af.", 3));
  cards.push(...monster("m-large", "Rasende Hulehane",        2, 1, 1, { kind: "loseLevel", amount: 1 }, "Hakket. Mist 1 niveau.", 3));
  cards.push(...monster("m-net",   "Bomtrolden",              8, 2, 1, { kind: "loseLevel", amount: 1 }, "Mist 1 niveau.", 2));
  cards.push(...monster("m-amazon","Plyndrende Skjoldmø",     8, 2, 1, { kind: "loseHandItems" }, "Mist alt, hvad du har i hænderne.", 1));
  cards.push(...monster("m-leper", "Møntnissen",              4, 1, 1, { kind: "loseItem", slot: "any" }, "Stjæler én genstand.", 2));
  cards.push(...monster("m-snails","Gal Rotte",               1, 1, 1, { kind: "loseLevel", amount: 1 }, "Bidt. Mist 1 niveau.", 3));
  cards.push(...monster("m-flat",  "Flyvende Egern",          2, 1, 1, { kind: "loseItem", slot: "head" }, "Slår din hat af.", 2));
  cards.push(...monster("m-gaze",  "Det Hjemsøgte Lokum",     8, 2, 1, { kind: "loseLevel", amount: 1 }, "Arkitektonisk traume.", 2));
  cards.push(...monster("m-bigfoot","Huleyetien",            12, 2, 1, { kind: "loseItem", slot: "head" }, "Mist din hovedbeklædning.", 1));
  cards.push(...monster("m-laser","Laseredderkop",            6, 1, 1, { kind: "loseLevel", amount: 1 }, "Piu piu. Mist 1 niveau.", 2));
  cards.push(...monster("m-clown","Klovneprinsen",           14, 3, 2, { kind: "loseAllItems" }, "Dyttet helt nøgen.", 1));
  cards.push(...monster("m-baby", "Goblinunger",              4, 1, 1, { kind: "loseLevel", amount: 1 }, "Overraskende vilde.", 3));

// --- ANTI-CLASS BOSSES ---
  cards.push(...monster(
    "m-anti-warrior", "Jernkolossen", 14, 3, 1,  //Monster level, treasures og level den giver
    { kind: "loseClassAndLevels", amount: 2 },  //Mister levels
    "Den knuser din krigerstolthed og dit kranie! Mist dit klassekort OG 2 niveauer!",
    2, undefined, { className: "Warrior", bonus: 5 } // Bonus imod warrior
  ));

  cards.push(...monster(
    "m-anti-thief", "Den Altseende Sfinks", 12, 3, 1,
    { kind: "loseClassAndHand" },
    "Den ser igennem alle skygger og tricks. Mist dit klassekort OG smid ALLE kort på din hånd.",
    2, undefined, { className: "Thief", bonus: 5 }
  ));

  cards.push(...monster(
    "m-anti-cleric", "Kætternes Ærkedæmon", 16, 4, 2,
    { kind: "loseLevelsOrDie", amount: 2, threshold: 2 },
    "Lever af retfærdig vrede. Mist 2 niveauer (eller dø med det samme, hvis du er niveau 2 eller lavere).",
    2, undefined, { className: "Cleric", bonus: 5 }
  ));

  cards.push(...monster(
    "m-anti-wizard", "Den Magiske Fortærer", 14, 3, 1,
    { kind: "loseHandEquipAndLevel", amount: 1 },
    "Lever af ren magi. Smid hele din hånd og alle dine påtagne genstande, OG mist 1 niveau!",
    2, undefined, { className: "Wizard", bonus: 5 }, true // <--- true = IMMUNE TO CHARM!
  ));

  // --- ELITE MONSTERS: built to make the table work together (or against each other) ---
  cards.push(...monster("m-wolfpack", "Alfa-ulveflokken", 10, 3, 1, { kind: "loseLevel", amount: 2 },
    "Flænset. Mist 2 niveauer.", 2, "Flokjæger: +6 når du kæmper alene. Find en ven.")
    .map(c => ({ ...c, packHunter: 6 })));
  cards.push(...monster("m-bounty", "Dusørjægeren", 12, 3, 2, { kind: "loseItem", slot: "biggest" },
    "Tager din bedste genstand som betaling.", 2, "Jager føreren: +6 hvis angriberen har det højeste niveau.")
    .map(c => ({ ...c, huntsLeader: 6 })));
  cards.push(...monster("m-hydra", "Nagets Hydra", 18, 5, 2, { kind: "everyoneLosesLevel", amount: 1 },
    "Slipper du ikke væk, mister ALLE spillere et niveau.", 1, "Alle har noget på spil i denne kamp."));
  cards.push(...monster("m-siren", "Sirenen over Brudte Eder", 14, 3, 2, { kind: "loseLevel", amount: 2 },
    "Mist 2 niveauer.", 1, "Sirenens kald: Den, der melder sig som hjælper, slår med en terning — på 1-3 skifter de side og kæmper for monsteret.")
    .map(c => ({ ...c, sirenCall: true })));
  cards.push(...monster("m-gob-warlord", "Goblin-krigsherren", 14, 4, 2, { kind: "death" },
    "Henrettet af horden. Du dør.", 1, "Leder sværmen: +2 for hver anden goblin i kampen.")
    .map(c => ({ ...c, swarmBonus: 2 })));

  // Goblin Swarm!
  cards.push(...monster("m-gob-grunt", "Goblinsoldat", 1, 1, 1, { kind: "loseLevel", amount: 1 }, "Tævet med en pind. Mist 1 niveau.", 6));
  cards.push(...monster("m-gob-archer", "Goblin-bueskytte", 2, 1, 1, { kind: "loseItem", slot: "armor" }, "En pil i knæet. Mist din rustning.", 3));
  cards.push(...monster("m-gob-cripple", "Tåbider-goblin", 1, 1, 1, { kind: "loseItem", slot: "feet" }, "Den bider dig i tæerne. Mist dit fodtøj.", 2));
  cards.push(...monster("m-gob-king", "Goblinkongen", 8, 2, 1, { kind: "death" }, "Kongen kræver dit hoved. Du dør.", 2));

  // Curses (~14)
  cards.push(...curse("c-loseItem", "Forbandelse! Mist din rustning", { kind: "loseItem", slot: "armor" }, "Smid din rustning.", 2));
  cards.push(...curse("c-loseHead", "Forbandelse! Mist din hovedbeklædning", { kind: "loseItem", slot: "head" }, "Smid din hovedbeklædning.", 2));
  cards.push(...curse("c-loseFeet", "Forbandelse! Mist dit fodtøj", { kind: "loseItem", slot: "feet" }, "Smid dit fodtøj.", 1));
  cards.push(...curse("c-loseHand", "Forbandelse! Mist en lille genstand", { kind: "loseItem", slot: "hand" }, "Smid én genstand, du holder i hånden.", 2));
  cards.push(...curse("c-loseBig",  "Forbandelse! Mist din store genstand", { kind: "loseItem", slot: "bigItem" }, "Smid din store genstand.", 1));
  cards.push(...curse("c-level1",   "Forbandelse! Mist et niveau", { kind: "loseLevel", amount: 1 }, "Degraderet. Mist 1 niveau.", 3));
  cards.push(...curse("c-level2",   "Forbandelse! Goblin-skatterevision", { kind: "loseLevel", amount: 1 }, "Skattefar banker på. Mist 1 niveau.", 2));
  cards.push(...curse("c-loseAny",  "Forbandelse! Det Grådige Spejl", { kind: "loseItem", slot: "any" }, "Mist én genstand.", 1));

  // --- Modbydelige Curses ---
  cards.push(...curse("c-amnesia", "Forbandelse! Hukommelsestab", { kind: "loseClass" }, "Du glemmer, hvem du er. Mist din klasse.", 2));
  cards.push(...curse("c-robin-hood", "Forbandelse! Robin Hoods Hævn", { kind: "robinHood" }, "Giv din dyreste påtagne genstand til spilleren med det laveste niveau.", 2));

  // Classes
  cards.push(...classCard("c-warrior", "Warrior", "Du vinder ved uafgjort i kamp. Du må smide op til 3 kort for +1 hver i kamp.", 3));
  cards.push(...classCard("c-cleric", "Cleric", "Genopstandelse: I starten af din tur kan du, i stedet for at sparke døren ind, smide et kort og tage det øverste kort fra dørenes kassebunke.", 3));
  cards.push(...classCard("c-thief", "Thief", "+1 på flugt. Du må dolke en anden spiller i ryggen i kamp (smid et kort, så får de −2). Du må forsøge at stjæle små genstande (lykkes på 3+).", 3));
  cards.push(...classCard("c-wizard", "Wizard", "Fortryllelse: Smid din hånd (mindst 3 kort) for at besejre et monster med det samme.", 3));

  // Races
  cards.push(...race("r-goblin", "Goblin", "Sværmkalder: Én gang pr. kamp må du spille et goblin-monster fra din hånd ind i ENHVER kamp. Hjemmebane: +3 i Goblinland."));
  cards.push(...race("r-elf", "Elf", "+1 på flugt. Gå et niveau op, når du hjælper en spiller med HØJERE niveau med at vinde en kamp (aldrig til vindertrinnet)."));
  cards.push(...race("r-dwarf", "Dwarf", "Bær så mange store genstande, du vil, og få +1 i kamp pr. stor genstand, du har på (højst +3). Du må beholde 6 kort ved velgørenhed i stedet for 5."));
  cards.push(...race("r-halfling", "Halfling", "Én gang pr. tur tæller den mest værdifulde genstand i et salg dobbelt."));
  cards.push(...curse("c-identity", "Forbandelse! Identitetskrise", { kind: "loseRace" }, "Mist dit folk (dit andet folk først, hvis du har to).", 1));

  // --- Curses that stick (until removed by a Ring of Second Chances or a Cleric) ---
  cards.push(...lingeringCurse("c-goblin-head", "Forbandelse! Goblin på hovedet", { kind: "dicePenalty", amount: 1, expires: "afterCombatWin" },
    "En goblin flytter ind på dit hoved: −1 på alle terningslag, indtil du vinder en kamp.", 2));
  cards.push(...lingeringCurse("c-butterfingers", "Forbandelse! Smørfingre", { kind: "combatPenalty", amount: 2, expires: "afterNextCombat" },
    "−2 i din næste kamp.", 2));
  cards.push(...lingeringCurse("c-pariah", "Forbandelse! Udstødt", { kind: "noHelp", amount: 1, expires: "afterNextCombat" },
    "Ingen kan hjælpe dig i din næste kamp.", 1));
  cards.push(...lingeringCurse("c-coin-purse", "Forbandelse! Den Forheksede Pung", { kind: "halfSellValue", amount: 1, expires: "permanent" },
    "Dine genstande sælges for halv pris, indtil forbandelsen fjernes.", 1));

  // Two of a kind
  cards.push(...dual("d-guild-hopper", "Laugshopperen", "class", "Behold kortet i spil: Du må have to klasser på én gang. Mister du en klasse, går den nyeste først."));
  cards.push(...dual("d-mixed-heritage", "Blandet Blod", "race", "Behold kortet i spil: Du må tilhøre to folk på én gang. Mister du et folk, går det nyeste først."));

  // --- COUNTERWEIGHT MONSTERS: more player power means meaner fights ---
  cards.push(...monster("m-gob-raiders", "Goblin-plyndringstogtet", 6, 2, 1, { kind: "loseItem", slot: "any" },
    "De stikker af med en af dine genstande.", 2, "Baghold: Når den sparkes ind, slutter det næste dørkort sig til kampen, hvis det er et monster.")
    .map(c => ({ ...c, ambush: true })));
  cards.push(...monster("m-bandits", "Landevejsrøverne", 8, 2, 1, { kind: "loseItem", slot: "biggest" },
    "De tager den genstand, der ser mest værdifuld ud.", 1, "Baghold: Når den sparkes ind, slutter det næste dørkort sig til kampen, hvis det er et monster.")
    .map(c => ({ ...c, ambush: true })));
  cards.push(...monster("m-skeletons", "Skeletlegionen", 6, 2, 1, { kind: "loseLevel", amount: 1 },
    "Mist 1 niveau.", 2, "Horde: +3 for hvert andet monster i kampen.")
    .map(c => ({ ...c, hordeBonus: 3 })));
  cards.push(...monster("m-elf-eater", "Elverslugeren", 12, 3, 1, { kind: "loseLevel", amount: 2 },
    "Mist 2 niveauer.", 1, "Hader elvere: +5 hvis en Elver kæmper mod den.")
    .map(c => ({ ...c, antiRace: { raceName: "Elf" as const, bonus: 5 } })));
  cards.push(...monster("m-mithril-wyrm", "Mithril-lindormen", 14, 3, 2, { kind: "loseItem", slot: "bigItem" },
    "Den lægger din store genstand i sin skattebunke.", 1, "Hader dværge: +5 hvis en Dværg kæmper mod den.")
    .map(c => ({ ...c, antiRace: { raceName: "Dwarf" as const, bonus: 5 } })));
  cards.push(...monster("m-hound", "Halvlingehunden", 8, 2, 1, { kind: "loseItem", slot: "feet" },
    "Den løber med dit fodtøj.", 1, "Hader halvlinger: +5 hvis en Halvling kæmper mod den.")
    .map(c => ({ ...c, antiRace: { raceName: "Halfling" as const, bonus: 5 } })));
  cards.push(...monster("m-gob-slayer", "Goblindræberen", 12, 3, 2, { kind: "loseLevel", amount: 2 },
    "Mist 2 niveauer.", 1, "Hader gobliner: +6 hvis en Goblin kæmper mod den.")
    .map(c => ({ ...c, antiRace: { raceName: "Goblin" as const, bonus: 6 } })));

  // Special Cards
  cards.push(...wanderingMonster(4));
  cards.push(...mate(2));

  // Portaler
  cards.push(...portal("p-open", "Åbn en Portal", "Træk et fangehulskort og læg det til de aktive fangehuller. Spark derefter en ny dør ind.", 6));
  cards.push(...portal("p-close", "Luk en Portal", "Smid det nyeste aktive fangehul. Spark derefter en ny dør ind.", 3));
  cards.push(...portal("p-swap", "Dimensionsskift", "Smid alle aktive fangehuller og træk et nyt. Spark derefter en ny dør ind.", 3));
  return cards;
};

// ---------- TREASURE DECK (~55) ----------
export const buildTreasureDeck = (): Card[] => {
  const cards: Card[] = [];

  // Equipment — head
  cards.push(...equipment("e-helm", "Mangehornshjelmen",     1, 600, "head", false, 2));
  cards.push(...equipment("e-pointy", "Den Høje Heksehat",   3, 400, "head", false, 1));
  cards.push(...equipment("e-bandana", "Overmodets Pandebånd", 1, 300, "head", false, 2));
  cards.push(...equipment("e-spiky", "Den Piggede Kalot",    1, 200, "head", false, 1));

  // Equipment — armor
  cards.push(...equipment("e-leather", "Læderrustning",      2, 400, "armor", false, 2));
  cards.push(...equipment("e-chain",   "Ringbrynje",         2, 600, "armor", false, 1));
  cards.push(...equipment("e-platemail","Pladerustning",     4, 1100, "armor", true, 1));
  cards.push(...equipment("e-flaming", "Glødebrynjen",       3, 800, "armor", false, 1));

  // Equipment — feet
  cards.push(...equipment("e-boots",   "Dørsparkerstøvler",  2, 400, "feet", false, 2));
  cards.push(...equipment("e-stomping","Jernbeslåede Trampere", 3, 700, "feet", true, 1));

  // Equipment — hands (single)
  cards.push(...equipment("e-sword",   "Sladdersværdet",     2, 400, "hand", false, 2));
  cards.push(...equipment("e-dagger",  "Snigdolken",         1, 300, "hand", false, 3));
  cards.push(...equipment("e-mace",    "Den Mildt Truende Stridskølle", 3, 600, "hand", false, 1));
  cards.push(...equipment("e-shield",  "Pose med Vrede Bier", 2, 0, "hand", false, 1));
  cards.push(...equipment("e-wand",    "Fuserstaven",        2, 300, "hand", false, 1));

  // Equipment — two-handed
  cards.push(...equipment("e-bow",     "Buen med Onde Hensigter", 4, 800, "twoHands", false, 1));
  cards.push(...equipment("e-staff",   "Løbeildsstaven",     5, 800, "twoHands", true, 1));
  cards.push(...equipment("e-broad",   "Goblin-kløveren",    3, 400, "twoHands", false, 1));

  // Equipment — big
  cards.push(...equipment("e-anvil",   "Kampesten i Reb",    3, 0, "bigItem", true, 1));
  cards.push(...equipment("e-ladder",  "Overtalelsens Sækkepibe", 3, 300, "bigItem", true, 1));

  // --- Skøre Våben & Snyde-Items ---
  cards.push(...equipment("e-two-hand-sword", "Tohåndssværdet... til Én Hånd", 4, 400, "hand", false, 1, "Det er stort, men underligt let. Fylder kun 1 hånd!"));
  cards.push(...equipment("e-boots-run", "Støvler til Hastig Retræte", 0, 400, "feet", false, 1, "Giver +2 på alle dine flugtslag."));
  cards.push(...equipment("e-kneepads", "Smigrende Tøfler", 0, 600, "feet", false, 1, "Kan ikke bruges af krigere. Tving en vilkårlig spiller til at hjælpe dig i kamp!"));

  // --- CLASS UNIQUE EQUIPMENT ---
  // Warrior
  cards.push(...equipment("e-bloodaxe", "Berserkerens Blodøkse", 3, 800, "twoHands", false, 2, "Din Berserk-evne giver +2 pr. kort i stedet for +1!", "Warrior"));
  cards.push(...equipment("e-blood-plate", "Blodplettet Pladerustning", 3, 600, "armor", false, 2, "Giver +3 ekstra, når du kæmper mod mere end 1 monster.", "Warrior"));

  // Thief
  cards.push(...equipment("e-shadow-cloak", "Skyggekappen", 3, 600, "armor", false, 2, "Giver +1 på alle flugtslag.", "Thief"));
  cards.push(...equipment("e-lockpicks", "Mestertyvens Dirke", 2, 500, "hand", false, 2, "Dit tyveri lykkes på et slag på 2-6.", "Thief"));

  // Cleric
  cards.push(...equipment("e-martyr-mace", "Martyrens Stridskølle", 4, 700, "hand", false, 2, "Giver +3 ekstra, når du hjælper en anden spiller.", "Cleric"));
  cards.push(...equipment("e-halo", "Retfærdighedens Glorie", 3, 600, "head", false, 2, "Skulle du dø, smider du i stedet denne. Du overlever med alt andet.", "Cleric"));

  // Wizard
  cards.push(...equipment("e-spell-amulet", "Besværgelsesspejlets Amulet", 2, 500, "none", false, 2, "Immun over for forbandelser, der trækkes med billedsiden op fra dørbunken.", "Wizard"));
  cards.push(...equipment("e-archmage-staff", "Ærkemagerens Stav", 4, 800, "twoHands", false, 2, "Din Fortryllelse koster kun 2 kort i stedet for 3.", "Wizard"));

  // One-shots
  cards.push(...oneShot("o-potion-h", "Goblinånde-eliksir",  2, 100, "monster", 2));
  cards.push(...oneShot("o-potion-i", "Pop-op-barrikade",    3, 300, "either", 1));
  cards.push(...oneShot("o-flaming",  "Brandbombeflaske",    3, 100, "monster", 2));
  cards.push(...oneShot("o-shouting", "Kampråb på Flaske",   3, 100, "monster", 1));
  cards.push(...oneShot("o-yuppie",   "Overpriset Kurbadsvand", 2, 200, "monster", 1));
  cards.push(...oneShot("o-magic",    "Gnistlyn-skriftrulle", 5, 300, "monster", 1));
  cards.push(...oneShot("o-loaded",   "Lykkeknoglen",        1, 100, "ally", 2));

  // Tag-weapons: much stronger against the right kind of monster
  cards.push(...oneShot("o-holy-water", "Helligvand", 2, 200, "ally", 2, "+5 i stedet for +2, når du kæmper mod et udødt monster.")
    .map(c => ({ ...c, tagBonus: { tag: "undead" as const, bonus: 5 } })));
  cards.push(...oneShot("o-goblin-repellent", "Goblinskræmmer", 1, 100, "ally", 2, "+4 i stedet for +1, når du kæmper mod en goblin.")
    .map(c => ({ ...c, tagBonus: { tag: "goblin" as const, bonus: 4 } })));

  // --- Trolling Potions ---
  cards.push(...oneShot("o-friendship", "Våbenhvile-te", 0, 300, "ally", 1, "Spil under en hvilken som helst kamp. Kampen slutter med det samme. Ingen niveauer eller skatte uddeles."));
  cards.push(...oneShot("o-flask-glue", "Krukke med Klistret Harpiks", 0, 100, "ally", 1, "Spil, når nogen prøver at flygte. Deres slag mislykkes automatisk!"));

  // Enhancers (added to monster level — typically negative for player to weaken,
  //   but stored as positive bonus — opponents play to strengthen monster)
  cards.push(...enhancer("h-ancient",  "Ældgammel", +5, 200, 2));
  cards.push(...enhancer("h-enraged",  "Rasende",   +5, 100, 2));
  cards.push(...enhancer("h-humongous","Kolossal",  +10, 300, 1));
  cards.push(...enhancer("h-baby",     "Pjevset",   -5, 100, 1));   // weakens monster (good for attacker)
  cards.push(...enhancer("h-intelligent","Snedig",  +5, 200, 1));

  // Cheat!
  cards.push(...forgedPapers(2));

  // Second chances and loyal (or not so loyal) companions
  cards.push(...remedy(2));
  cards.push(...companion("t-lackey", "Goblin-lakajen", { bonus: 1, runBonus: 0, sacrificable: true, upkeep: false, goldValue: 200 },
    "+1 i kamp. Under en flugt kan du ofre lakajen for automatisk at slippe væk.", 2));
  cards.push(...companion("t-boar", "Kampgalten", { bonus: 2, runBonus: 1, sacrificable: false, upkeep: false, goldValue: 400 },
    "+2 i kamp og +1 på flugt.", 1));
  cards.push(...companion("t-mercenary", "Den Grådige Lejesoldat", { bonus: 4, runBonus: 0, sacrificable: false, upkeep: true, goldValue: 0 },
    "+4 i kamp. Ved slutningen af hver af dine ture tager han dit billigste kort som løn — er din hånd tom, går han.", 1));

  // Go up a level
  cards.push(...goUp(5));

  return cards;
};

// ---------- DUNGEON DECK ---------- // Note: Default er at der 1 kopi af hver, men det kan ændres ved skrive ", 2" eller lignende efter beskrivelsen.
export const buildDungeonDeck = (): Card[] => {
  const cards: Card[] = [];
  cards.push(...dungeon("d-elven", "Fangehullet med Elvisk Overflod", "Alle spillere får +1 på deres flugtslag."));
  cards.push(...dungeon("d-curses", "Fangehullet med Grundige Forbandelser", "Forbandelser, der trækkes med billedsiden op, rammer ALLE spillere."));
  cards.push(...dungeon("d-martial", "Kampsportens Fangehul", "Alle monstre får +2 niveau.",));
  cards.push(...dungeon("d-wealth", "Fangehullet med Uventet Rigdom", "Når du besejrer et monster, får du 1 ekstra skat.",));
  cards.push(...dungeon("d-feeble", "Fangehullet med Svage Fjender", "Alle monstre får −5 niveau (mindst niveau 1)."));
  cards.push(...dungeon("d-misanthropy", "Menneskehadets Fangehul", "Ingen kan bede om hjælp i kamp! Alle kæmper alene."));
  cards.push(...dungeon("d-bribery", "Fangehullet med Åbenlys Bestikkelse", "Du skal tilbyde mindst 2 skatte, når du beder om hjælp i kamp."));
  cards.push(...dungeon("d-poultry", "Fangehullet med Fjerkræ i Massevis", "Alle har en høne på hovedet! −1 på alle flugtslag."));
  cards.push(...dungeon("d-lavish", "Fangehullet med Ødsel Plyndring", "Genstande sælges for det dobbelte af deres trykte guldværdi!"));
  cards.push(...dungeon("d-chaos", "Kaoskampens Fangehul", "Kæmpere må smide et kort for at slå flugtterningen om én gang pr. kamp."));
  cards.push(...dungeon("d-generous", "De Gavmilde Gobliners Fangehul", "Når du ransager rummet (billedsiden nedad), trækker du 2 dørkort i stedet for 1."));
  cards.push(...dungeon("d-charity", "Den Tvungne Velgørenheds Fangehul", "Ved slutningen af din tur skal du give til velgørenhed, hvis du har 4 kort eller flere (i stedet for 5)."));
  cards.push(...dungeon("d-cowards", "Kujonernes Fangehul", "Spillere må vælge at opgive kampen med det samme og flygte uden at bede om hjælp."));
  cards.push(...dungeon("d-undead", "Det Ustoppelige Fangehul", "Enhver spiller må spille et monsterkort ind i enhver kamp UDEN et Ubuden Gæst-kort."));
  cards.push(...dungeon("d-thieves", "Tyvebandernes Fangehul", "Tyve får +2 på deres tyveri-slag (slag på 2-6 lykkes)."));
  cards.push(...dungeon("d-clipping", "Rabatklippernes Fangehul", "Alle genstande er 100g mindre værd ved salg (en genstand til 400g tæller som 300g)."));
  cards.push(...dungeon("d-swapping", "De Pludselige Byttes Fangehul", "Før kampen afgøres, må angriberen stjæle 1 tilfældigt kort fra sin hjælpers hånd."));
  cards.push(...dungeon("d-healing", "Den Himmelske Helbredelses Fangehul", "Når du genopliver et kort (Præst), trækker du et ekstra dørkort med billedsiden nedad som bonus."));
  cards.push(...dungeon("d-doom", "Den Truende Undergangs Fangehul", "Dør du i dette fangehul, mister du 2 niveauer i stedet for at beholde dit niveau."));
  cards.push(...dungeon("d-poverty", "Den Ynkelige Fattigdoms Fangehul", "Du kan ikke sælge genstande for niveauer, mens dette fangehul er aktivt."));
  cards.push(...dungeon("d-goblin", "Fangehul: Goblinland", "Alle monstre med mærket 'Goblin' får +3 til deres kampstyrke!"));
  cards.push(...dungeon("d-infinite", "Fangehul: Hamstringens Dimension", "Der er ingen grænse for, hvor mange kort du må have på hånden! Velgørenhedsfasen springes helt over."));
  return cards;
};

// Players per set of Door/Treasure cards: bigger tables get more copies (the Dungeon deck stays single).
export const PLAYERS_PER_DECK = 6;
export const deckCopiesFor = (players: number) => Math.max(1, Math.ceil(players / PLAYERS_PER_DECK));

// Card ids are unique within one build, also across extra copies.
export const buildAllDecks = (copies = 1) => {
  _id = 0;
  const times = <T,>(build: () => T[]) => Array.from({ length: copies }, build).flat();
  return {
    door: times(buildDoorDeck),
    treasure: times(buildTreasureDeck),
    dungeon: buildDungeonDeck(),
  };
};
