import type {
  Card, MonsterCard, EquipmentCard, CurseCard, OneShotCard, EnhancerCard,
  GoUpLevelCard, BadStuffKind, Slot, ClassCard, WanderingMonsterCard, MateCard,
  PortalCard, DungeonCard // <--- NYE
} from "./types";

let _id = 0;
const uid = () => `c${++_id}`;

// ---------- helpers ----------
const monster = (
  cardId: string, name: string, level: number, treasures: number, levelsAwarded: number,
  badStuff: BadStuffKind, badStuffText: string, copies = 1, flavor?: string,
): MonsterCard[] => Array.from({ length: copies }, () => ({
  id: uid(), cardId, name, type: "monster", deck: "door",
  level, treasures, levelsAwarded, badStuff, badStuffText, flavor,
}));

const equipment = (
  cardId: string, name: string, bonus: number, goldValue: number, slot: Slot, isBig = false, copies = 1, flavor?: string,
): EquipmentCard[] => Array.from({ length: copies }, () => ({
  id: uid(), cardId, name, type: "equipment", deck: "treasure",
  bonus, goldValue, slot, isBig, flavor,
}));

const wanderingMonster = (copies = 1): WanderingMonsterCard[] =>
  Array.from({ length: copies }, () => ({
    id: uid(), cardId: "c-wandering", name: "Wandering Monster", type: "wandering-monster", deck: "door", flavor: "Play this card along with a Monster from your hand to add it to any combat."
  }));

const mate = (copies = 1): MateCard[] =>
  Array.from({ length: copies }, () => ({
    id: uid(), cardId: "c-mate", name: "Mate", type: "mate", deck: "door", flavor: "Duplicates a monster in combat!"
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

  const classCard = (cardId: string, name: "Warrior" | "Cleric" | "Thief" | "Wizard", effectText: string, copies = 1): ClassCard[] =>
  Array.from({ length: copies }, () => ({
    id: uid(), cardId, name, type: "class", deck: "door", className: name, effectText,
  }));

const enhancer = (cardId: string, name: string, bonus: number, goldValue: number, copies = 1): EnhancerCard[] =>
  Array.from({ length: copies }, () => ({
    id: uid(), cardId, name, type: "enhancer", deck: "treasure", bonus, goldValue, target: "monster",
  }));

const goUp = (copies: number): GoUpLevelCard[] =>
  Array.from({ length: copies }, () => ({
    id: uid(), cardId: "go-up", name: "Go Up a Level", type: "go-up-a-level", deck: "treasure", goldValue: 0,
  }));

// ---------- DOOR DECK (~70) ----------
export const buildDoorDeck = (): Card[] => {
  _id = 0; // reset between full builds (server calls one)
  const cards: Card[] = [];

  // Monsters (~50)
  cards.push(...monster("m-rat", "Plutonium Dragon",  20, 5, 2, { kind: "death" }, "You die. Horribly.", 1));
  cards.push(...monster("m-king", "King Tut",          16, 4, 2, { kind: "loseAllItems" }, "Lose all items.", 1));
  cards.push(...monster("m-bull", "The Bullrog",       18, 4, 2, { kind: "death" }, "You are squished. Dead.", 1));
  cards.push(...monster("m-undead", "Undead Horse",    14, 3, 2, { kind: "loseLevel", amount: 2 }, "Lose 2 levels.", 1));
  cards.push(...monster("m-wraith", "Wight Brothers",  14, 3, 2, { kind: "loseLevel", amount: 2 }, "Lose 2 levels.", 1));
  cards.push(...monster("m-shrieker", "Shrieking Geek",12, 3, 2, { kind: "loseItem", slot: "head" }, "Lose your head item.", 1));
  cards.push(...monster("m-dragon", "Squidzilla",      18, 4, 2, { kind: "death" }, "Dragged to a watery grave.", 1));
  cards.push(...monster("m-troll", "Stone Golem",      14, 2, 2, { kind: "loseItem", slot: "armor" }, "Your armor crumbles.", 2));
  cards.push(...monster("m-vamp",  "Vampire",          12, 2, 2, { kind: "loseLevel", amount: 1 }, "Drained. Lose 1 level.", 2));
  cards.push(...monster("m-mummy", "Mummy",            12, 2, 1, { kind: "loseItem", slot: "biggest" }, "Lose biggest item.", 2));
  cards.push(...monster("m-troll2","Tongue Demon",     12, 2, 1, { kind: "loseLevel", amount: 1 }, "Lose 1 level.", 2));
  cards.push(...monster("m-flying","Flying Frogs",     10, 2, 1, { kind: "loseItem", slot: "feet" }, "Lose your footgear.", 2));
  cards.push(...monster("m-orc",   "Hobbits",          10, 2, 1, { kind: "loseItem", slot: "any" }, "Lose any one item.", 2));
  cards.push(...monster("m-floating","Floating Nose",   10, 2, 1, { kind: "loseLevel", amount: 1 }, "Lose 1 level.", 2));
  cards.push(...monster("m-pit",   "Pit Bull",          8, 1, 1, { kind: "loseItem", slot: "feet" }, "It bites your boots off.", 3));
  cards.push(...monster("m-large", "Large Angry Chicken", 2, 1, 1, { kind: "loseLevel", amount: 1 }, "Pecked. Lose 1 level.", 3));
  cards.push(...monster("m-net",   "Net Troll",         8, 2, 1, { kind: "loseLevel", amount: 1 }, "Lose 1 level.", 2));
  cards.push(...monster("m-amazon","Amazon",           8, 2, 1, { kind: "loseAllItems" }, "Lose all hand items.", 1));
  cards.push(...monster("m-leper", "Leperchaun",        4, 1, 1, { kind: "loseItem", slot: "any" }, "Steals one item.", 2));
  cards.push(...monster("m-snails","Maul Rat",          1, 1, 1, { kind: "loseLevel", amount: 1 }, "Bitten. Lose 1 level.", 3));
  cards.push(...monster("m-flat",  "Flying Squirrel",   2, 1, 1, { kind: "loseItem", slot: "head" }, "Knocks your hat off.", 2));
  cards.push(...monster("m-gaze",  "Gazebo",           8, 2, 1, { kind: "loseLevel", amount: 1 }, "Architectural trauma.", 2));
  cards.push(...monster("m-bigfoot","Bigfoot",         12, 2, 1, { kind: "loseItem", slot: "head" }, "Lose your head item.", 1));
  cards.push(...monster("m-laser","Laser Spider",       6, 1, 1, { kind: "loseLevel", amount: 1 }, "Pew pew. Lose a level.", 2));
  cards.push(...monster("m-clown","Clown Prince",      14, 3, 2, { kind: "loseAllItems" }, "Honked to nakedness.", 1));
  cards.push(...monster("m-baby", "Baby Goblins",      4, 1, 1, { kind: "loseLevel", amount: 1 }, "Surprisingly fierce.", 3));

  // Goblin Swarm!
  cards.push(...monster("m-gob-grunt", "Goblin Grunt", 1, 1, 1, { kind: "loseLevel", amount: 1 }, "Whacked with a stick. Lose 1 level.", 3)); 
  cards.push(...monster("m-gob-archer", "Goblin Archer", 2, 1, 1, { kind: "loseItem", slot: "armor" }, "An arrow to the knee. Lose your armor.", 3));
  cards.push(...monster("m-gob-cripple", "Crippled Goblin", 1, 1, 1, { kind: "loseItem", slot: "feet" }, "It bites your toes. Lose your footgear.", 2));
  cards.push(...monster("m-gob-king", "Goblin King", 8, 2, 1, { kind: "death" }, "The king demands your head. You die.", 2));

  // Curses (~14)
  cards.push(...curse("c-loseItem", "Curse! Lose Your Armor", { kind: "loseItem", slot: "armor" }, "Discard your armor.", 2));
  cards.push(...curse("c-loseHead", "Curse! Lose Your Headgear", { kind: "loseItem", slot: "head" }, "Discard your head item.", 2));
  cards.push(...curse("c-loseFeet", "Curse! Lose Your Footgear", { kind: "loseItem", slot: "feet" }, "Discard your foot item.", 1));
  cards.push(...curse("c-loseHand", "Curse! Lose a Small Item", { kind: "loseItem", slot: "hand" }, "Discard one hand item.", 2));
  cards.push(...curse("c-loseBig",  "Curse! Lose Your Big Item", { kind: "loseItem", slot: "bigItem" }, "Discard your Big item.", 1));
  cards.push(...curse("c-level1",   "Curse! Lose a Level", { kind: "loseLevel", amount: 1 }, "Demoted.", 3));
  cards.push(...curse("c-level2",   "Curse! Income Tax", { kind: "loseLevel", amount: 1 }, "The taxman cometh.", 2));
  cards.push(...curse("c-loseAny",  "Curse! Malign Mirror", { kind: "loseItem", slot: "any" }, "Lose any one item.", 1));

  // --- Modbydelige Curses ---
  cards.push(...curse("c-amnesia", "Curse! Amnesia", { kind: "loseClass" }, "You forget who you are. Lose your Class.", 2));
  cards.push(...curse("c-robin-hood", "Curse! Robin Hood's Revenge", { kind: "robinHood" }, "Give your most expensive equipped item to the player with the lowest level.", 2));

  // Classes
  cards.push(...classCard("c-warrior", "Warrior", "You win ties in combat. You may discard up to 3 cards for +1 bonus each in combat.", 3));
  cards.push(...classCard("c-cleric", "Cleric", "When drawing face-up, you may draw the top discard instead by discarding one card.", 3));
  cards.push(...classCard("c-thief", "Thief", "You may backstab another player in combat (discard a card for them to get -2). You may try to steal small items.", 3));
  cards.push(...classCard("c-wizard", "Wizard", "Charm Spell: Discard your hand (min 3 cards) to defeat a monster instantly.", 3));

  // Special Cards
  cards.push(...wanderingMonster(2));
  cards.push(...mate(1));

  // Portaler
  cards.push(...portal("p-open", "Open a Portal", "Draw a Dungeon card and add it to the active Dungeons. Then kick open another door.", 6));
  cards.push(...portal("p-close", "Close a Portal", "Discard one active Dungeon card of your choice. Then kick open another door.", 3));
  cards.push(...portal("p-swap", "Dimensional Shift", "Discard all active Dungeon cards and draw a new one. Then kick open another door.", 3));
  return cards;
};

// ---------- TREASURE DECK (~55) ----------
export const buildTreasureDeck = (): Card[] => {
  const cards: Card[] = [];

  // Equipment — head
  cards.push(...equipment("e-helm", "Horny Helmet",        1, 600, "head", false, 2));
  cards.push(...equipment("e-pointy", "Pointy Hat of Power", 3, 400, "head", false, 1));
  cards.push(...equipment("e-bandana", "Bandana of Bravery", 1, 300, "head", false, 2));
  cards.push(...equipment("e-spiky", "Spiky Knees",         1, 200, "head", false, 1));

  // Equipment — armor
  cards.push(...equipment("e-leather", "Leather Armor",     2, 400, "armor", false, 2));
  cards.push(...equipment("e-chain",   "Chainmail",         2, 600, "armor", false, 1));
  cards.push(...equipment("e-platemail","Plate Armor",      4, 1100, "armor", true, 1));
  cards.push(...equipment("e-flaming", "Flaming Armor",     3, 800, "armor", false, 1));

  // Equipment — feet
  cards.push(...equipment("e-boots",   "Boots of Butt-Kicking", 2, 400, "feet", false, 2));
  cards.push(...equipment("e-running", "Boots of Running Really Fast", 0, 400, "feet", false, 1));
  cards.push(...equipment("e-stomping","Stomping Boots",    3, 700, "feet", true, 1));

  // Equipment — hands (single)
  cards.push(...equipment("e-sword",   "Singing & Dancing Sword", 2, 400, "hand", false, 2));
  cards.push(...equipment("e-dagger",  "Sneaky Dagger",     1, 300, "hand", false, 3));
  cards.push(...equipment("e-mace",    "Mace of Sharpness", 3, 600, "hand", false, 1));
  cards.push(...equipment("e-shield",  "Pretty Balloons",   2, 0, "hand", false, 1));
  cards.push(...equipment("e-wand",    "Wand of Dowsing",   2, 300, "hand", false, 1));

  // Equipment — two-handed
  cards.push(...equipment("e-bow",     "Bow With Ribbons",  4, 800, "twoHands", false, 1));
  cards.push(...equipment("e-staff",   "Staff of Napalm",   5, 800, "twoHands", true, 1));
  cards.push(...equipment("e-broad",   "Broad Sword",       3, 400, "twoHands", false, 1));

  // Equipment — big
  cards.push(...equipment("e-anvil",   "Huge Rock",         3, 0, "bigItem", true, 1));
  cards.push(...equipment("e-ladder",  "Tuba of Charm",     3, 300, "bigItem", true, 1));

  // --- Skøre Våben & Snyde-Items ---
  cards.push(...equipment("e-two-hand-sword", "Two-Handed Sword... of One-Handedness", 4, 400, "hand", false, 1, "It's big, but strangely light. Only takes 1 hand!"));
  cards.push(...equipment("e-boots-run", "Boots of Running Really Fast", 0, 400, "feet", false, 1, "Gives +2 to all your Run Away rolls."));
  cards.push(...equipment("e-kneepads", "Kneepads of Allure", 0, 600, "feet", false, 1, "Not usable by Warriors. Force any player to help you in combat!"));

  // One-shots
  cards.push(...oneShot("o-potion-h", "Potion of Halitosis", 2, 100, "monster", 2));
  cards.push(...oneShot("o-potion-i", "Instant Wall",        3, 300, "either", 1));
  cards.push(...oneShot("o-flaming",  "Flaming Poison Potion",3, 100, "monster", 2));
  cards.push(...oneShot("o-shouting", "Potion of Shouting",  3, 100, "monster", 1));
  cards.push(...oneShot("o-yuppie",   "Yuppie Water",        2, 200, "monster", 1));
  cards.push(...oneShot("o-magic",    "Magic Missile",       5, 300, "monster", 1));
  cards.push(...oneShot("o-loaded",   "Loaded Die",          1, 100, "ally", 2));

  // --- Trolling Potions ---
  cards.push(...oneShot("o-friendship", "Friendship Potion", 0, 300, "ally", 1, "Play during any combat. The combat ends immediately. No levels or treasure are awarded."));
  cards.push(...oneShot("o-flask-glue", "Flask of Glue", 0, 100, "ally", 1, "Play when someone is trying to run away. They automatically fail their roll!"));
  
  // Enhancers (added to monster level — typically negative for player to weaken,
  //   but stored as positive bonus — opponents play to strengthen monster)
  cards.push(...enhancer("h-ancient",  "Ancient",  +5, 200, 1));
  cards.push(...enhancer("h-enraged",  "Enraged",  +5, 100, 1));
  cards.push(...enhancer("h-humongous","Humongous",+10, 300, 1));
  cards.push(...enhancer("h-baby",     "Baby",     -5, 100, 1));   // weakens monster (good for attacker)
  cards.push(...enhancer("h-intelligent","Intelligent", +5, 200, 1));

  // Go up a level
  cards.push(...goUp(5));

  return cards;
};

// ---------- DUNGEON DECK ---------- // Note: Default er at der 1 kopi af hver, men det kan ændres ved skrive ", 2" eller lignende efter beskrivelsen.
export const buildDungeonDeck = (): Card[] => {
  const cards: Card[] = [];
  cards.push(...dungeon("d-elven", "Dungeon of Elvish Excess", "All players get +1 to their Run Away rolls."));
  cards.push(...dungeon("d-curses", "Dungeon of Comprehensive Curses", "Curses drawn face-up affect ALL players."));
  cards.push(...dungeon("d-martial", "Dungeon of Martial Arts", "All monsters have +2 Level.",));
  cards.push(...dungeon("d-wealth", "Dungeon of Unexpected Wealth", "Defeating a monster grants +1 extra Treasure.",));
  cards.push(...dungeon("d-feeble", "Dungeon of Feeble Foes", "All monsters are -5 Level (minimum Level 1)."));
  cards.push(...dungeon("d-misanthropy", "Dungeon of Misanthropic Misery", "No one can ask for help in combat! Everyone fights alone."));
  cards.push(...dungeon("d-bribery", "Dungeon of Blatant Bribery", "You must offer at least 2 treasures when asking for help in combat."));
  cards.push(...dungeon("d-poultry", "Dungeon of Profuse Poultry", "Everyone has a chicken on their head! -1 to all Run Away rolls."));
  cards.push(...dungeon("d-lavish", "Dungeon of Lavish Loot", "Items sell for double their printed gold value!"));
  cards.push(...dungeon("d-chaos", "Dungeon of Chaotic Combat", "Fighters may discard a card to re-roll the Run Away die once per combat."));
  cards.push(...dungeon("d-generous", "Dungeon of Generous Goblins", "When Looting the Room (face-down), draw 2 Door cards instead of 1."));
  cards.push(...dungeon("d-charity", "Dungeon of Compulsory Charity", "At the end of your turn, you must give to Charity if you have 4 or more cards (instead of 5)."));
  cards.push(...dungeon("d-cowards", "Dungeon of Cowardly Combat", "Players may choose to automatically fail their combat and Run Away without asking for help."));
  cards.push(...dungeon("d-undead", "Dungeon of the Unrelenting Undead", "Any player may play a Monster card into any combat WITHOUT needing a Wandering Monster card."));
  cards.push(...dungeon("d-thieves", "Dungeon of Thieving Thugs", "Thieves get +2 to their steal rolls (rolls of 2-6 succeed)."));
  cards.push(...dungeon("d-clipping", "Dungeon of Coupon Clipping", "All items are worth 100g less when selling (a 400g item counts as 300g)."));
  cards.push(...dungeon("d-swapping", "Dungeon of Sudden Swaps", "Before resolving combat, the attacker may randomly steal 1 card from their helper's hand."));
  cards.push(...dungeon("d-healing", "Dungeon of Heavenly Healing", "When you resurrect a card (Cleric), draw an extra face-down Door card as a bonus."));
  cards.push(...dungeon("d-doom", "Dungeon of Impending Doom", "If you die in this dungeon, you lose 2 Levels instead of keeping your level."));
  cards.push(...dungeon("d-poverty", "Dungeon of Pathetic Poverty", "You cannot sell items for levels while this Dungeon is active."));
  cards.push(...dungeon("d-goblin", "Dungeon: Goblin Land", "All monsters with the 'Goblin' tag get +3 to their combat strength!"));
  cards.push(...dungeon("d-infinite", "Dungeon: Dimension of Hoarding", "There is no hand size limit! The Charity phase is completely skipped."));
  return cards;
};

export const buildAllDecks = () => ({
  door: buildDoorDeck(),
  treasure: buildTreasureDeck(),
  dungeon: buildDungeonDeck(), // <--- Tilføjet
});
