// Shared game types — used by both server and client.
// Single source of truth for card and state shapes.

export type Slot = "head" | "armor" | "feet" | "hand" | "twoHands" | "bigItem";
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
  | { kind: "loseItem"; slot: string }
  | { kind: "loseAllItems" }
  | { kind: "death" } 
  | { kind: "loseClass" }
  | { kind: "robinHood" }
  | { kind: "loseClassAndLevels"; amount: number }
  | { kind: "loseClassAndHand" }
  | { kind: "loseLevelsOrDie"; amount: number; threshold: number };

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
}

export interface EquipmentCard extends BaseCard {
  type: "equipment";
  deck: "treasure";
  bonus: number;
  goldValue: number;
  slot: Slot;
  isBig: boolean;
}

export interface CurseCard extends BaseCard {
  type: "curse";
  deck: "door";
  effect: BadStuffKind;
  effectText: string;
}

export interface ClassCard extends BaseCard {
  type: "class";
  className: "Warrior" | "Cleric" | "Thief" | "Wizard";
  effectText: string;
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
  combat: CombatState | null;
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
  hands: EquipmentCard[];        // up to 2 single-hand or 1 twoHands
  bigItem: EquipmentCard | null;
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
  playerClass: ClassCard | null; // <--- Lige her!The All-Seeing Sphinx
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
}

export interface NegotiationOffer {
  fromId: string;        // attacker requesting help
  toId: string;          // potential helper
  treasures: number;
  status: "pending" | "accepted" | "rejected";
}

export interface PublicGameState {
  status: AppStatus;
  players: PublicPlayer[];
  activePlayerIndex: number;
  currentPhase: Phase;
  doorDeckCount: number;
  treasureDeckCount: number;
  doorDiscardCount: number;
  treasureDiscardCount: number;
  table: Card[];                       // cards face-up in play (current door draw etc.)
  combat: CombatState | null;
  negotiations: NegotiationOffer[];
  charity: { fromId: string; cardCount: number; candidates: string[] } | null;
  looting: { deadId: string; pile: Card[]; orderQueue: string[] } | null;
  log: string[];
  winnerId: string | null;
}

// Client view: same as PublicGameState but with self's private hand attached.
export interface ClientView extends PublicGameState {
  self: PrivatePlayer | null;
}

// ===== Wire protocol =====
export type ClientToServer =
  | { type: "join"; name: string; roomCode: string }
  | { type: "startGame" }
  | { type: "kickDoor" }
  | { type: "lookForTrouble"; cardId: string }
  | { type: "lootRoom" }
  | { type: "endTurn" }
  | { type: "equip"; cardId: string }
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
  | { type: "rollDie" }
  | { type: "lootBody"; cardId: string }
  | { type: "charityGive"; cardIds: string[]; toId: string }
  | { type: "rename"; name: string }
  | { type: "flee" }
  | { type: "playCard"; cardId: string }
  | { type: "equip"; cardId: string; forceSwap?: boolean }
  | { type: "castCurse"; cardId: string; targetId: string }
  | { type: "useClassAbility"; ability: "berserk" | "backstab" | "steal" | "charm" | "resurrect"; cardIds: string[]; targetId?: string; monsterId?: string; targetCardId?: string; }
  | { type: "forceHelp"; targetId: string } // Bruges til de snyde støvler der tvinger til at hjælpe
  | { type: "suddenSwap" } // Bruges til d-swapping dungeon-kortet

  
export type ServerToClient =
  | { type: "state"; view: ClientView }
  | { type: "error"; message: string }
  | { type: "rolled"; playerId: string; result: number; reason: string }
  | { type: "log"; message: string };
