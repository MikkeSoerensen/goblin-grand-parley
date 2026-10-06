# Holdspil: hold-tillæg (balance)

Monstrene får en andel af holdkammeratens kampstyrke, når holdkammeraten kæmper med. Valgt: **⅓** (TEAM_TUNING.share i server/engine.ts).

## Reference: solospil (300 spil)

| Spillere | Hold | Mål | Threat | Spil | Afsluttet | Låst fast | Runder (median) | Runder (90%) | Kampe/spil | Kampe vundet | Med hjælper | Dødsfald/spil |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4 | nej | 10 | normal | 300 | 100.0% | 0 | 9.5 | 23.8 | 33.2 | 47.9% | 61.1% | 1.06 |
| 6 | nej | 10 | normal | 300 | 100.0% | 0 | 8.2 | 18.0 | 40.3 | 48.5% | 65.8% | 1.58 |

## Holdspil — balance-simulering (300 spil pr. antal spillere, seed 1)

| Spillere | Hold | Mål | Threat | Spil | Afsluttet | Låst fast | Runder (median) | Runder (90%) | Kampe/spil | Kampe vundet | Med hjælper | Dødsfald/spil |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4 | ja (tillæg 0%) | 10 | normal | 300 | 100.0% | 0 | 9.8 | 21.0 | 33.7 | 44.9% | 83.3% | 1.12 |
| 6 | ja (tillæg 0%) | 10 | normal | 300 | 100.0% | 0 | 9.3 | 20.8 | 50.0 | 38.4% | 82.0% | 2.00 |
| 8 | ja (tillæg 0%) | 10 | normal | 300 | 100.0% | 0 | 9.8 | 18.9 | 61.4 | 35.5% | 84.7% | 2.74 |
| 4 | ja (tillæg 25%) | 10 | normal | 300 | 100.0% | 0 | 12.3 | 31.0 | 43.3 | 34.5% | 78.4% | 1.63 |
| 6 | ja (tillæg 25%) | 10 | normal | 300 | 100.0% | 0 | 13.3 | 29.2 | 65.3 | 29.2% | 76.0% | 3.07 |
| 8 | ja (tillæg 25%) | 10 | normal | 300 | 100.0% | 0 | 14.0 | 28.6 | 85.5 | 25.3% | 78.3% | 4.19 |
| 4 | ja (tillæg 33%) | 10 | normal | 300 | 100.0% | 0 | 12.8 | 32.0 | 44.9 | 33.9% | 78.1% | 1.72 |
| 6 | ja (tillæg 33%) | 10 | normal | 300 | 100.0% | 0 | 14.0 | 31.7 | 70.3 | 27.5% | 75.2% | 3.25 |
| 8 | ja (tillæg 33%) | 10 | normal | 300 | 100.0% | 0 | 15.3 | 34.0 | 100.2 | 23.0% | 74.2% | 4.87 |
| 4 | ja (tillæg 50%) | 10 | normal | 300 | 100.0% | 0 | 15.8 | 38.8 | 55.8 | 29.0% | 73.2% | 2.28 |
| 6 | ja (tillæg 50%) | 10 | normal | 300 | 100.0% | 0 | 16.7 | 37.8 | 83.8 | 24.0% | 71.9% | 3.87 |
| 8 | ja (tillæg 50%) | 10 | normal | 300 | 100.0% | 0 | 16.1 | 41.0 | 108.3 | 22.0% | 73.5% | 5.20 |

## Holdspil

| Spillere | Tillæg | Mål | Første hold vinder | Fair | Vinderens holdkammerat, niveau (gns.) |
|---|---|---|---|---|---|
| 4 | 0% | 10 | 49.3% | 50.0% | 6.3 |
| 6 | 0% | 10 | 30.0% | 33.3% | 6.2 |
| 8 | 0% | 10 | 23.7% | 25.0% | 6.0 |
| 4 | 25% | 10 | 50.7% | 50.0% | 5.8 |
| 6 | 25% | 10 | 37.7% | 33.3% | 6.0 |
| 8 | 25% | 10 | 25.3% | 25.0% | 5.7 |
| 4 | 33% | 10 | 49.0% | 50.0% | 5.7 |
| 6 | 33% | 10 | 40.3% | 33.3% | 5.6 |
| 8 | 33% | 10 | 23.7% | 25.0% | 5.5 |
| 4 | 50% | 10 | 48.7% | 50.0% | 5.1 |
| 6 | 50% | 10 | 37.7% | 33.3% | 5.1 |
| 8 | 50% | 10 | 22.7% | 25.0% | 5.1 |

## Socialt kaos (pr. spil)

| Spillere | Mål | Threat | Føring skifter hænder | Sabotage-kort | Dusører udbetalt | Overløbere (Siren) | Hele bordet ramt | Bestikkelser | Toll betalt |
|---|---|---|---|---|---|---|---|---|---|
| 4 | 10 | normal | 2.1 | 5.2 | 0.42 | 0.17 | 0.38 | 0.00 | 0.54 |
| 6 | 10 | normal | 2.9 | 10.4 | 0.82 | 0.26 | 0.56 | 0.00 | 0.84 |
| 8 | 10 | normal | 3.5 | 14.7 | 1.08 | 0.38 | 0.69 | 0.00 | 1.08 |
| 4 | 10 | normal | 2.2 | 4.8 | 0.48 | 0.22 | 0.54 | 0.00 | 0.65 |
| 6 | 10 | normal | 3.2 | 10.4 | 1.12 | 0.31 | 0.71 | 0.00 | 1.11 |
| 8 | 10 | normal | 4.0 | 15.2 | 1.46 | 0.45 | 0.94 | 0.00 | 1.51 |
| 4 | 10 | normal | 2.2 | 5.0 | 0.58 | 0.20 | 0.56 | 0.00 | 0.60 |
| 6 | 10 | normal | 3.3 | 10.7 | 1.21 | 0.33 | 0.74 | 0.00 | 1.20 |
| 8 | 10 | normal | 4.5 | 16.2 | 1.68 | 0.47 | 1.12 | 0.00 | 1.70 |
| 4 | 10 | normal | 2.4 | 5.4 | 0.69 | 0.25 | 0.63 | 0.00 | 0.77 |
| 6 | 10 | normal | 3.7 | 11.3 | 1.35 | 0.36 | 0.94 | 0.00 | 1.33 |
| 8 | 10 | normal | 4.7 | 16.7 | 1.86 | 0.52 | 1.21 | 0.00 | 1.90 |

## Class ved spillets slutning — 4 spillere, mål 10

| Class | Spillere med den | Vandt | Vinderrate |
|---|---|---|---|
| Wizard | 191 | 54 | 28.3% (fair: 25.0%) |
| none | 411 | 104 | 25.3% (fair: 25.0%) |
| Cleric | 186 | 47 | 25.3% (fair: 25.0%) |
| Warrior | 219 | 55 | 25.1% (fair: 25.0%) |
| Thief | 193 | 40 | 20.7% (fair: 25.0%) |

## Class ved spillets slutning — 6 spillere, mål 10

| Class | Spillere med den | Vandt | Vinderrate |
|---|---|---|---|
| Wizard | 266 | 57 | 21.4% (fair: 16.7%) |
| Warrior | 273 | 55 | 20.1% (fair: 16.7%) |
| Thief | 300 | 47 | 15.7% (fair: 16.7%) |
| none | 675 | 101 | 15.0% (fair: 16.7%) |
| Cleric | 286 | 40 | 14.0% (fair: 16.7%) |

## Class ved spillets slutning — 8 spillere, mål 10

| Class | Spillere med den | Vandt | Vinderrate |
|---|---|---|---|
| Warrior | 382 | 63 | 16.5% (fair: 12.5%) |
| Wizard | 389 | 55 | 14.1% (fair: 12.5%) |
| Thief | 380 | 46 | 12.1% (fair: 12.5%) |
| none | 864 | 100 | 11.6% (fair: 12.5%) |
| Cleric | 385 | 36 | 9.4% (fair: 12.5%) |

## Class ved spillets slutning — 4 spillere, mål 10

| Class | Spillere med den | Vandt | Vinderrate |
|---|---|---|---|
| Wizard | 210 | 63 | 30.0% (fair: 25.0%) |
| Warrior | 235 | 68 | 28.9% (fair: 25.0%) |
| Thief | 208 | 53 | 25.5% (fair: 25.0%) |
| Cleric | 192 | 44 | 22.9% (fair: 25.0%) |
| none | 355 | 72 | 20.3% (fair: 25.0%) |

## Class ved spillets slutning — 6 spillere, mål 10

| Class | Spillere med den | Vandt | Vinderrate |
|---|---|---|---|
| Wizard | 312 | 74 | 23.7% (fair: 16.7%) |
| Warrior | 292 | 59 | 20.2% (fair: 16.7%) |
| Cleric | 286 | 48 | 16.8% (fair: 16.7%) |
| Thief | 311 | 49 | 15.8% (fair: 16.7%) |
| none | 599 | 70 | 11.7% (fair: 16.7%) |

## Class ved spillets slutning — 8 spillere, mål 10

| Class | Spillere med den | Vandt | Vinderrate |
|---|---|---|---|
| Warrior | 458 | 87 | 19.0% (fair: 12.5%) |
| Wizard | 424 | 75 | 17.7% (fair: 12.5%) |
| none | 758 | 76 | 10.0% (fair: 12.5%) |
| Thief | 363 | 33 | 9.1% (fair: 12.5%) |
| Cleric | 397 | 29 | 7.3% (fair: 12.5%) |

## Class ved spillets slutning — 4 spillere, mål 10

| Class | Spillere med den | Vandt | Vinderrate |
|---|---|---|---|
| Wizard | 210 | 63 | 30.0% (fair: 25.0%) |
| Warrior | 235 | 69 | 29.4% (fair: 25.0%) |
| Thief | 209 | 50 | 23.9% (fair: 25.0%) |
| Cleric | 200 | 45 | 22.5% (fair: 25.0%) |
| none | 346 | 73 | 21.1% (fair: 25.0%) |

## Class ved spillets slutning — 6 spillere, mål 10

| Class | Spillere med den | Vandt | Vinderrate |
|---|---|---|---|
| Wizard | 300 | 73 | 24.3% (fair: 16.7%) |
| Warrior | 298 | 63 | 21.1% (fair: 16.7%) |
| Thief | 312 | 47 | 15.1% (fair: 16.7%) |
| Cleric | 284 | 41 | 14.4% (fair: 16.7%) |
| none | 606 | 76 | 12.5% (fair: 16.7%) |

## Class ved spillets slutning — 8 spillere, mål 10

| Class | Spillere med den | Vandt | Vinderrate |
|---|---|---|---|
| Wizard | 439 | 78 | 17.8% (fair: 12.5%) |
| Warrior | 476 | 73 | 15.3% (fair: 12.5%) |
| Thief | 373 | 40 | 10.7% (fair: 12.5%) |
| none | 730 | 73 | 10.0% (fair: 12.5%) |
| Cleric | 382 | 36 | 9.4% (fair: 12.5%) |

## Class ved spillets slutning — 4 spillere, mål 10

| Class | Spillere med den | Vandt | Vinderrate |
|---|---|---|---|
| Wizard | 224 | 78 | 34.8% (fair: 25.0%) |
| Warrior | 244 | 73 | 29.9% (fair: 25.0%) |
| Thief | 213 | 51 | 23.9% (fair: 25.0%) |
| Cleric | 202 | 39 | 19.3% (fair: 25.0%) |
| none | 317 | 59 | 18.6% (fair: 25.0%) |

## Class ved spillets slutning — 6 spillere, mål 10

| Class | Spillere med den | Vandt | Vinderrate |
|---|---|---|---|
| Wizard | 306 | 69 | 22.5% (fair: 16.7%) |
| Warrior | 308 | 63 | 20.5% (fair: 16.7%) |
| Thief | 312 | 54 | 17.3% (fair: 16.7%) |
| Cleric | 283 | 48 | 17.0% (fair: 16.7%) |
| none | 591 | 66 | 11.2% (fair: 16.7%) |

## Class ved spillets slutning — 8 spillere, mål 10

| Class | Spillere med den | Vandt | Vinderrate |
|---|---|---|---|
| Wizard | 430 | 75 | 17.4% (fair: 12.5%) |
| Warrior | 446 | 71 | 15.9% (fair: 12.5%) |
| Thief | 387 | 52 | 13.4% (fair: 12.5%) |
| none | 759 | 69 | 9.1% (fair: 12.5%) |
| Cleric | 378 | 33 | 8.7% (fair: 12.5%) |

## Race ved spillets slutning — 4 spillere, mål 10, threat normal

| Race | Spillere med den | Vandt | Vinderrate |
|---|---|---|---|
| Elf | 161 | 55 | 34.2% (fair: 25.0%) |
| Dwarf | 160 | 50 | 31.3% (fair: 25.0%) |
| Goblin | 155 | 37 | 23.9% (fair: 25.0%) |
| Halfling | 188 | 42 | 22.3% (fair: 25.0%) |
| none | 488 | 106 | 21.7% (fair: 25.0%) |

## Race ved spillets slutning — 6 spillere, mål 10, threat normal

| Race | Spillere med den | Vandt | Vinderrate |
|---|---|---|---|
| Dwarf | 253 | 48 | 19.0% (fair: 16.7%) |
| Elf | 268 | 49 | 18.3% (fair: 16.7%) |
| none | 726 | 124 | 17.1% (fair: 16.7%) |
| Goblin | 247 | 38 | 15.4% (fair: 16.7%) |
| Halfling | 257 | 37 | 14.4% (fair: 16.7%) |

## Race ved spillets slutning — 8 spillere, mål 10, threat normal

| Race | Spillere med den | Vandt | Vinderrate |
|---|---|---|---|
| Elf | 354 | 58 | 16.4% (fair: 12.5%) |
| Dwarf | 315 | 44 | 14.0% (fair: 12.5%) |
| none | 976 | 114 | 11.7% (fair: 12.5%) |
| Goblin | 337 | 39 | 11.6% (fair: 12.5%) |
| Halfling | 337 | 39 | 11.6% (fair: 12.5%) |

## Race ved spillets slutning — 4 spillere, mål 10, threat normal

| Race | Spillere med den | Vandt | Vinderrate |
|---|---|---|---|
| Dwarf | 162 | 53 | 32.7% (fair: 25.0%) |
| Elf | 181 | 55 | 30.4% (fair: 25.0%) |
| Goblin | 180 | 45 | 25.0% (fair: 25.0%) |
| none | 404 | 96 | 23.8% (fair: 25.0%) |
| Halfling | 195 | 35 | 17.9% (fair: 25.0%) |

## Race ved spillets slutning — 6 spillere, mål 10, threat normal

| Race | Spillere med den | Vandt | Vinderrate |
|---|---|---|---|
| Halfling | 278 | 54 | 19.4% (fair: 16.7%) |
| Elf | 282 | 53 | 18.8% (fair: 16.7%) |
| Goblin | 277 | 51 | 18.4% (fair: 16.7%) |
| none | 618 | 96 | 15.5% (fair: 16.7%) |
| Dwarf | 264 | 36 | 13.6% (fair: 16.7%) |

## Race ved spillets slutning — 8 spillere, mål 10, threat normal

| Race | Spillere med den | Vandt | Vinderrate |
|---|---|---|---|
| Elf | 375 | 58 | 15.5% (fair: 12.5%) |
| Goblin | 370 | 55 | 14.9% (fair: 12.5%) |
| Dwarf | 362 | 52 | 14.4% (fair: 12.5%) |
| Halfling | 346 | 40 | 11.6% (fair: 12.5%) |
| none | 804 | 82 | 10.2% (fair: 12.5%) |

## Race ved spillets slutning — 4 spillere, mål 10, threat normal

| Race | Spillere med den | Vandt | Vinderrate |
|---|---|---|---|
| Dwarf | 168 | 47 | 28.0% (fair: 25.0%) |
| Elf | 181 | 49 | 27.1% (fair: 25.0%) |
| Goblin | 180 | 47 | 26.1% (fair: 25.0%) |
| none | 395 | 98 | 24.8% (fair: 25.0%) |
| Halfling | 192 | 42 | 21.9% (fair: 25.0%) |

## Race ved spillets slutning — 6 spillere, mål 10, threat normal

| Race | Spillere med den | Vandt | Vinderrate |
|---|---|---|---|
| Elf | 275 | 55 | 20.0% (fair: 16.7%) |
| Halfling | 284 | 50 | 17.6% (fair: 16.7%) |
| none | 608 | 100 | 16.4% (fair: 16.7%) |
| Goblin | 287 | 45 | 15.7% (fair: 16.7%) |
| Dwarf | 270 | 41 | 15.2% (fair: 16.7%) |

## Race ved spillets slutning — 8 spillere, mål 10, threat normal

| Race | Spillere med den | Vandt | Vinderrate |
|---|---|---|---|
| Goblin | 347 | 54 | 15.6% (fair: 12.5%) |
| Elf | 379 | 57 | 15.0% (fair: 12.5%) |
| Dwarf | 365 | 53 | 14.5% (fair: 12.5%) |
| Goblin+Dwarf | 21 | 3 | 14.3% (fair: 12.5%) |
| Halfling | 365 | 43 | 11.8% (fair: 12.5%) |
| none | 769 | 74 | 9.6% (fair: 12.5%) |

## Race ved spillets slutning — 4 spillere, mål 10, threat normal

| Race | Spillere med den | Vandt | Vinderrate |
|---|---|---|---|
| Elf | 182 | 60 | 33.0% (fair: 25.0%) |
| Halfling | 210 | 59 | 28.1% (fair: 25.0%) |
| Goblin | 175 | 49 | 28.0% (fair: 25.0%) |
| Dwarf | 184 | 45 | 24.5% (fair: 25.0%) |
| none | 340 | 67 | 19.7% (fair: 25.0%) |

## Race ved spillets slutning — 6 spillere, mål 10, threat normal

| Race | Spillere med den | Vandt | Vinderrate |
|---|---|---|---|
| Elf | 271 | 52 | 19.2% (fair: 16.7%) |
| Dwarf | 273 | 52 | 19.0% (fair: 16.7%) |
| none | 600 | 103 | 17.2% (fair: 16.7%) |
| Goblin | 278 | 45 | 16.2% (fair: 16.7%) |
| Halfling | 300 | 42 | 14.0% (fair: 16.7%) |

## Race ved spillets slutning — 8 spillere, mål 10, threat normal

| Race | Spillere med den | Vandt | Vinderrate |
|---|---|---|---|
| Dwarf | 379 | 59 | 15.6% (fair: 12.5%) |
| Elf | 385 | 50 | 13.0% (fair: 12.5%) |
| Goblin | 366 | 47 | 12.8% (fair: 12.5%) |
| none | 733 | 87 | 11.9% (fair: 12.5%) |
| Halfling | 374 | 42 | 11.2% (fair: 12.5%) |

## Monstre — sværest først (4 spillere)

| Monster | Kampe | Spillerne vandt |
|---|---|---|
| m-siren | 128 | 10.9% |
| m-king | 120 | 16.7% |
| m-dragon | 110 | 18.2% |
| m-hydra | 127 | 18.9% |
| m-rat | 113 | 19.5% |
| m-mithril-wyrm | 107 | 19.6% |
| m-anti-cleric | 226 | 20.8% |
| m-undead | 120 | 20.8% |
| m-gob-slayer | 118 | 21.2% |
| m-bigfoot | 117 | 21.4% |
| m-bounty | 232 | 23.3% |
| m-gob-warlord | 122 | 23.8% |
| m-anti-warrior | 227 | 24.7% |
| m-shrieker | 108 | 25.0% |
| m-bull | 113 | 25.7% |
| m-vamp | 247 | 26.7% |
| m-floating | 224 | 27.2% |
| m-wraith | 131 | 27.5% |
| m-clown | 109 | 27.5% |
| m-mummy | 230 | 29.6% |
| m-anti-wizard | 223 | 29.6% |
| m-troll | 232 | 30.6% |
| m-troll2 | 232 | 31.0% |
| m-anti-thief | 239 | 31.4% |
| m-orc | 237 | 31.6% |
| m-elf-eater | 117 | 33.3% |
| m-flying | 215 | 35.3% |
| m-wolfpack | 256 | 37.1% |
| m-gaze | 225 | 38.7% |
| m-bandits | 125 | 40.0% |
| m-gob-raiders | 227 | 40.1% |
| m-gob-king | 222 | 41.4% |
| m-hound | 123 | 41.5% |
| m-pit | 360 | 44.4% |
| m-laser | 242 | 47.5% |
| m-net | 265 | 49.4% |
| m-skeletons | 231 | 49.8% |
| m-amazon | 112 | 51.8% |
| m-baby | 362 | 58.0% |
| m-leper | 260 | 65.4% |
| m-gob-archer | 410 | 71.0% |
| m-large | 382 | 72.0% |
| m-flat | 288 | 73.6% |
| m-gob-cripple | 271 | 75.3% |
| m-gob-grunt | 821 | 76.1% |
| m-snails | 409 | 82.2% |
