// Shared game types — used by both server and client.
// Single source of truth for card and state shapes.

export type Slot = "head" | "armor" | "feet" | "hand" | "twoHands" | "bigItem" | "none"; // None bruges til amuleter 
export type CardType = "monster" | "equipment" | "curse" | "oneshot" | "enhancer" | "race" | "class" | "go-up-a-level" | "portal" | "dungeon" | "dual" | "forged-papers" | "remedy" | "companion";
export type DeckType = "door" | "treasure" | "dungeon";


export type Phase = 1 | 2 | 3 | 4;
export type AppStatus =
  | "lobby"
  | "normalTurn"
  | "inCombat"
  | "waitingForInterrupts"
  | "negotiating"
  | "runAwayRoll"
  | "badStuff"
  | "looting"
  | "charitySelection"
  | "gameOver";

export interface BaseCard {
  id: string;          // unique instance id
  cardId: string;      // catalog id (multiple instances of same definition share this)
  name: string;
  type: CardType;
  deck: DeckType;
  flavor?: string;
}

export interface WanderingMonsterCard {
  id: string;
  cardId: string;
  name: string;
  type: "wandering-monster";
  deck: "door";
  flavor?: string;
}

export interface MateCard {
  id: string;
  cardId: string;
  name: string;
  type: "mate";
  deck: "door";
  flavor?: string;
}

export type BadStuffKind =
  | { kind: "loseLevel"; amount: number }
  | { kind: "loseItem"; slot: Slot | "any" | "biggest" }
  | { kind: "loseAllItems" }
  | { kind: "loseHandItems" }
  | { kind: "everyoneLosesLevel"; amount: number } // the whole table pays
  | { kind: "loseRace" }
  | { kind: "addEffect"; effect: Omit<PlayerEffect, "id"> } // a curse that lingers
  | { kind: "death" } 
  | { kind: "loseClass" }
  | { kind: "robinHood" }
  | { kind: "loseClassAndLevels"; amount: number }
  | { kind: "loseClassAndHand" }
  | { kind: "loseLevelsOrDie"; amount: number; threshold: number }
  | { kind: "loseHandEquipAndLevel"; amount: number };

// Rule tags on monsters; dungeons, races and items key off these (never off the name).
export type MonsterTag = "goblin" | "undead" | "magical" | "beast";

export interface MonsterCard extends BaseCard {
  type: "monster";
  deck: "door";
  level: number;            
  treasures: number;        
  levelsAwarded: number;    
  badStuff: BadStuffKind;
  badStuffText: string;
  // NYE: Usynlige særregler til boss-monstre!
  antiClass?: { className: string; bonus: number };
  immuneToCharm?: boolean;
  tags: MonsterTag[];
  ignoresLevelAtOrBelow?: number; // won't pursue weak players: they escape automatically
  // Elite keywords (social chaos)
  packHunter?: number;  // +N while the attacker fights alone
  huntsLeader?: number; // +N when the attacker is the leader
  sirenCall?: boolean;  // anyone who joins as helper rolls: 1-3 they switch sides
  swarmBonus?: number;  // +N for every OTHER goblin in the same fight
  hordeBonus?: number;  // +N for every OTHER monster in the same fight
  ambush?: boolean;     // kicked open face-up: the next Door card joins if it is a monster
  antiRace?: { raceName: RaceName; bonus: number };
}

export interface EquipmentCard extends BaseCard {
  type: "equipment";
  forgedWith?: ForgedPapersCard; // equipped with Forged Guild Papers: requirements ignored
  deck: "treasure";
  bonus: number;
  goldValue: number;
  slot: Slot;
  isBig: boolean;
  classReq?: "Warrior" | "Cleric" | "Thief" | "Wizard"; // NY: Klassebegrænsning på udstyr
}

export interface CurseCard extends BaseCard {
  type: "curse";
  deck: "door";
  effect: BadStuffKind;
  effectText: string;
}

export type ClassName = "Warrior" | "Cleric" | "Thief" | "Wizard";
export type RaceName = "Goblin" | "Elf" | "Dwarf" | "Halfling";

export interface RaceCard extends BaseCard {
  type: "race";
  deck: "door";
  raceName: RaceName;
  effectText: string;
}

// Guild Hopper (two classes) / Mixed Heritage (two races). Stays in front of you while active.
export interface DualCard extends BaseCard {
  type: "dual";
  deck: "door";
  dualKind: "class" | "race";
  effectText: string;
}

// Ring of Second Chances: removes one lasting effect from any player.
export interface RemedyCard extends BaseCard {
  type: "remedy";
  deck: "treasure";
  goldValue: number;
  effectText: string;
}

// One companion per player: a combat bonus that can sometimes be sacrificed.
export interface CompanionCard extends BaseCard {
  type: "companion";
  deck: "treasure";
  goldValue: number;
  bonus: number;        // added to combat power
  runBonus: number;     // added to Run Away rolls
  sacrificable: boolean; // may be given up during Run Away to escape automatically
  upkeep: boolean;      // costs a card at the end of each of your turns, or leaves
  effectText: string;
}

// Play together with an item as you equip it: its requirements are ignored.
export interface ForgedPapersCard extends BaseCard {
  type: "forged-papers";
  deck: "treasure";
  goldValue: 0;
  effectText: string;
}

export interface ClassCard extends BaseCard {
  type: "class";
  className: ClassName;
  effectText: string;
}

// Lasting status effects on a player (persistent curses etc.). Visible to everyone.
export type EffectKind =
  | "dicePenalty"     // −amount on every die roll (Run Away, Steal)
  | "combatPenalty"   // −amount to your side in combat
  | "noHelp"          // nobody can help you in combat
  | "halfSellValue";  // your items sell for half
export type EffectExpiry =
  | "permanent"       // until removed by a card
  | "afterNextCombat" // removed when a combat you fought in ends
  | "afterCombatWin"; // removed when you win a combat

export interface PlayerEffect {
  id: string;
  kind: EffectKind;
  amount: number;
  name: string;         // shown to players, e.g. "Goblin on Your Head"
  sourceCardId: string; // catalog id of the card that caused it
  expires: EffectExpiry;
}

export interface PortalCard extends BaseCard {
  type: "portal";
  deck: "door"; // Portaler ligger gemt i Door-decket!
  effectText: string;
}

export interface DungeonCard extends BaseCard {
  type: "dungeon";
  deck: "dungeon"; // Dungeons har deres helt egen bunke
  effectText: string;
}

export interface OneShotCard extends BaseCard {
  type: "oneshot";
  deck: "treasure";
  bonus: number;            // can be negative when used vs. monster
  goldValue: number;
  target: "ally" | "monster" | "either";
  // Stronger for the fighters when a monster in the fight has this tag (Holy Water, Goblin Repellent).
  tagBonus?: { tag: MonsterTag; bonus: number };
}

export interface EnhancerCard extends BaseCard {
  type: "enhancer";
  deck: "treasure";
  bonus: number;            // +/- monster level
  target: "monster";
  goldValue: number;
}

export interface GoUpLevelCard extends BaseCard {
  type: "go-up-a-level";
  deck: "treasure";
  goldValue: 0;
}

export type Card =
  | MonsterCard
  | EquipmentCard
  | CurseCard
  | OneShotCard
  | EnhancerCard
  | GoUpLevelCard
  | ClassCard
  | WanderingMonsterCard
  | MateCard
  | PortalCard
  | DungeonCard
  | RaceCard
  | DualCard
  | ForgedPapersCard
  | RemedyCard
  | CompanionCard;

export const WIN_LEVELS = [10, 15, 20] as const;
export type WinLevel = (typeof WIN_LEVELS)[number];
export const INTERRUPT_CHOICES = [0, 10, 15, 30] as const;
export type InterruptSeconds = (typeof INTERRUPT_CHOICES)[number];
// How hard monsters push back as the attacker levels up.
export const THREAT_CHOICES = ["calm", "normal", "brutal"] as const;
export type Threat = (typeof THREAT_CHOICES)[number];

// Chosen in the waiting room; fixed once the game starts.
export interface RoomSettings {
  winLevel: WinLevel;
  interruptSeconds: InterruptSeconds; // 0 = no countdown; otherwise opponents auto-pass after this long
  threat: Threat;
}

export const DEFAULT_SETTINGS: RoomSettings = { winLevel: 10, interruptSeconds: 15, threat: "normal" };

// A moment worth telling the whole table about (bounty, trade, toll, death …).
export interface Highlight {
  id: number; // increasing, so clients know which ones they haven't shown yet
  text: string;
}

export interface PublicGameState {
  status: AppStatus;
  settings: RoomSettings;
  players: PublicPlayer[];
  activePlayerIndex: number;
  currentPhase: Phase;
  doorDeckCount: number;
  treasureDeckCount: number;
  dungeonDeckCount: number;      // NY: Antal kort i Dungeon-bunken
  doorDiscardCount: number;
  treasureDiscardCount: number;
  dungeonDiscardCount: number;   // NY: Antal kort i Dungeon-skraldespanden
  table: Card[];                 
  activeDungeons: DungeonCard[]; // NY: De aktive fangehuller, der gælder for ALLE spillere
  combat: CombatView | null;
  negotiations: NegotiationView[];
  charity: { fromId: string; cardCount: number; candidates: string[] } | null;
  looting: { deadId: string; pile: Card[]; orderQueue: string[] } | null;
  log: string[];
  highlights: Highlight[];
  winnerId: string | null;
}

export interface PlayerEquipment {
  head: EquipmentCard | null;
  armor: EquipmentCard | null;
  feet: EquipmentCard | null;
  hands: EquipmentCard[];        
  bigItem: EquipmentCard | null;
  none: EquipmentCard[];         // <--- NY: Plads til slotless items!
}

export interface PublicPlayer {
  id: string;
  name: string;
  level: number;
  equipment: PlayerEquipment;
  handCount: number;
  backpackCount: number;
  combatPower: number;
  isDead: boolean;
  connected: boolean;
  playerClass: ClassCard | null;
  extraClass: ClassCard | null;      // second class (needs Guild Hopper)
  race: RaceCard | null;
  extraRace: RaceCard | null;        // second race (needs Mixed Heritage)
  dualClass: DualCard | null;        // the Guild Hopper card in play
  dualRace: DualCard | null;         // the Mixed Heritage card in play
  companion: CompanionCard | null;
  effects: PlayerEffect[];
}

export interface PrivatePlayer extends PublicPlayer {
  hand: Card[];
  backpack: Card[];
  playerClass: ClassCard | null;
}

export interface CombatContract {
  helperId: string;
  treasures: number;     // # treasure cards reserved for helper from monster's payout
  accepted: true;        // blood oath = locked once accepted
}

export interface CombatState {
  monsters: MonsterCard[];          // can stack via enhancers/extra monsters
  monsterBonuses: number;           // sum of enhancers
  attackerId: string;
  helperId: string | null;
  contract: CombatContract | null;
  playedCards: { byPlayer: string; card: Card }[];   // one-shots/enhancers played
  attackerBonuses: number;          // one-shots in player's favor
  passes: Record<string, boolean>;  // playerId -> has passed this round
  log: string[];
  charmedTreasures?: number;
  backstabbedBy?: Record<string, string[]>;
  warriorDiscardCount?: Record<string, number>;
  ranAway?: string[];               // fighters who have already rolled to run away
  gluedPlayers?: string[];          // Flask of Glue: these fighters automatically fail Run Away
  swapUsed?: boolean;               // Dungeon of Sudden Swaps: attacker already stole from the helper
  interruptDeadline?: number | null; // epoch ms when everyone still to pass is passed automatically
  turncoatId?: string | null;        // Siren: a helper who switched sides; their power counts for the monster
  saboteurs?: string[];              // non-fighters who strengthened the monster side (bounty)
  bountyPaid?: boolean;
  swarmCalled?: string[];            // Goblin race: players who used Swarm Caller this fight
}

// Combat as sent to clients: server-computed totals so the UI never re-implements dungeon modifiers.
export interface CombatView extends CombatState {
  monsterTotal: number;
  playerTotal: number;
  requiredPasses: string[];         // connected, living non-fighters who must pass before resolution
  interruptMsLeft: number | null;   // countdown for the UI (relative, so device clocks don't matter)
  modifiers: string[];              // human-readable breakdown of everything changing the totals
}

export interface NegotiationOffer {
  id: string;
  fromId: string;        // attacker requesting help
  toId: string;          // potential helper
  treasures: number;
  itemIds: string[];     // bribe: handed over the moment the helper accepts, never returned
  status: "pending" | "accepted" | "rejected";
}

// A help offer as clients see it: the bribe cards resolved so the table can see what's on offer.
export interface NegotiationView extends NegotiationOffer {
  items: Card[];
}

// The Grand Parley: a proposed swap of valuable cards between two players (outside combat).
export interface TradeOffer {
  id: string;
  fromId: string;
  toId: string;
  give: string[];        // card ids the proposer hands over
  take: string[];        // card ids the proposer wants (from the other player's visible equipment)
}

// Trades are private to the two players involved; cards are resolved for them.
export interface TradeView extends TradeOffer {
  giveCards: Card[];
  takeCards: Card[];
}

// Client view: same as PublicGameState but with self's private hand attached.
export interface ClientView extends PublicGameState {
  self: PrivatePlayer | null;
  trades: TradeView[];   // only the ones you are part of
}

// ===== Wire protocol =====
export type ClientToServer =
  | { type: "join"; name: string; roomCode: string; token?: string }
  | { type: "watch"; roomCode: string } // TV mode: a shared screen without a seat
  | { type: "startGame" }
  | { type: "kickDoor" }
  | { type: "lookForTrouble"; cardId: string }
  | { type: "lootRoom" }
  | { type: "endTurn" }
  | { type: "unequip"; cardId: string }
  | { type: "toBackpack"; cardId: string }
  | { type: "sell"; cardIds: string[] }
  | { type: "discard"; cardId: string }
  | { type: "playInCombat"; cardId: string; side?: "attacker" | "monster"; extraCardId?: string }
  | { type: "askForHelp"; helperId: string; treasures: number; itemIds?: string[] }
  | { type: "proposeTrade"; toId: string; give: string[]; take: string[] }
  | { type: "respondTrade"; tradeId: string; accept: boolean }
  | { type: "cancelTrade"; tradeId: string }
  | { type: "payToll"; cardIds: string[] }
  | { type: "respondHelp"; offerId: string; accept: boolean }
  | { type: "pass" }
  | { type: "resolveCombat" }
  | { type: "runAway"; discardId?: string }
  | { type: "cowardlyFlee" }
  | { type: "lootBody"; cardId: string }
  | { type: "charityGive"; cardIds: string[]; toId: string }
  | { type: "rename"; name: string }
  | { type: "flee" }
  | { type: "playCard"; cardId: string; targetId?: string } // targetId: Flask of Glue
  | { type: "equip"; cardId: string; forceSwap?: boolean; forgedPapersId?: string }
  | { type: "castCurse"; cardId: string; targetId: string }
  | { type: "useClassAbility"; ability: "berserk" | "backstab" | "steal" | "charm" | "resurrect" | "cleanse"; cardIds: string[]; targetId?: string; monsterId?: string; targetCardId?: string; effectId?: string }
  | { type: "removeEffect"; cardId: string; targetId: string; effectId: string } // Ring of Second Chances
  | { type: "sacrificeCompanion" }
  | { type: "forceHelp"; targetId: string } // Bruges til de snyde støvler der tvinger til at hjælpe
  | { type: "suddenSwap" } // Bruges til d-swapping dungeon-kortet
  | { type: "updateSettings"; settings: Partial<RoomSettings> } // waiting room only
  | { type: "leaveGame" }                                         // give up your seat for good
  | { type: "restartGame" }                                       // everyone back to the waiting room
  | { type: "removePlayer"; playerId: string };                   // waiting room: drop an offline seat

export type GameAction = Exclude<ClientToServer, { type: "join" } | { type: "watch" }>;

export type ServerToClient =
  | { type: "joined"; roomCode: string; playerId: string; token: string }
  | { type: "watching"; roomCode: string }
  | { type: "seats"; roomCode: string; names: string[] } // a game in progress: seats that are free to take over
  | { type: "left" }                                     // your seat is gone; back to the lobby
  | { type: "state"; view: ClientView }
  | { type: "error"; message: string }
  | { type: "rolled"; playerId: string; result: number; reason: string }
  | { type: "log"; message: string };
