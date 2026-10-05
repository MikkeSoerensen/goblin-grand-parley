// Shared game types — used by both server and client.
// Single source of truth for card and state shapes.

export type Slot = "head" | "armor" | "feet" | "hand" | "twoHands" | "bigItem" | "none"; // None bruges til amuleter 
export type CardType = "monster" | "equipment" | "curse" | "oneshot" | "enhancer" | "race" | "class" | "go-up-a-level" | "portal" | "dungeon";
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
}

export interface EquipmentCard extends BaseCard {
  type: "equipment";
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
  | DungeonCard;

export interface PublicGameState {
  status: AppStatus;
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
  negotiations: NegotiationOffer[];
  charity: { fromId: string; cardCount: number; candidates: string[] } | null;
  looting: { deadId: string; pile: Card[]; orderQueue: string[] } | null;
  log: string[];
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
}

// Combat as sent to clients: server-computed totals so the UI never re-implements dungeon modifiers.
export interface CombatView extends CombatState {
  monsterTotal: number;
  playerTotal: number;
  requiredPasses: string[];         // connected, living non-fighters who must pass before resolution
}

export interface NegotiationOffer {
  id: string;
  fromId: string;        // attacker requesting help
  toId: string;          // potential helper
  treasures: number;
  status: "pending" | "accepted" | "rejected";
}

// Client view: same as PublicGameState but with self's private hand attached.
export interface ClientView extends PublicGameState {
  self: PrivatePlayer | null;
}

// ===== Wire protocol =====
export type ClientToServer =
  | { type: "join"; name: string; roomCode: string; token?: string }
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
  | { type: "askForHelp"; helperId: string; treasures: number }
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
  | { type: "equip"; cardId: string; forceSwap?: boolean }
  | { type: "castCurse"; cardId: string; targetId: string }
  | { type: "useClassAbility"; ability: "berserk" | "backstab" | "steal" | "charm" | "resurrect"; cardIds: string[]; targetId?: string; monsterId?: string; targetCardId?: string; }
  | { type: "forceHelp"; targetId: string } // Bruges til de snyde støvler der tvinger til at hjælpe
  | { type: "suddenSwap" }; // Bruges til d-swapping dungeon-kortet

export type GameAction = Exclude<ClientToServer, { type: "join" }>;

export type ServerToClient =
  | { type: "joined"; roomCode: string; playerId: string; token: string }
  | { type: "state"; view: ClientView }
  | { type: "error"; message: string }
  | { type: "rolled"; playerId: string; result: number; reason: string }
  | { type: "log"; message: string };
