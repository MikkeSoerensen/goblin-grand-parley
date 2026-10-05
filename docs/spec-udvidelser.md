# Spec: Udvidelser til Goblin Grand Parley

**Status:** Spec godkendt. Der er ikke skrevet kode endnu. Beslutninger markeret ✅.
**Valgt:** Alt fra B og C (C1 med 15 sekunder) plus fejlrettelserne i D. Identitet (A) er droppet.
**Spilprofil:** Både strategi og kaos. 4 spillere er det typiske; 6+ skal fungere godt.

Kortnavne og regeltekst på kortene er på engelsk som resten af spillet. Alle tal er udspil og kan justeres med balance-simulatoren (afsnit 0.4).

Alle åbne spørgsmål er afklaret (oktober 2026).

---

## 0. Fundament: bygges først, fordi flere features står på det

### 0.1 Monster-tags
I dag afgøres "Goblin" ved at tjekke, om navnet indeholder ordet goblin. Det erstattes af rigtige tags på monsterkortet.

- Tags: `goblin`, `undead`, `magical`, `beast`.
- Eksisterende kort tagges (fx Goblin Grunt → `goblin`; Vampire, Mummy, Undead Horse, Wight Brothers → `undead`; Arcane Devourer, Floating Nose, Laser Spider → `magical`; Pit Bull, Flying Frogs, Large Angry Chicken → `beast`).
- Goblin-sværmen, Goblin Land og den nye Goblin-race (B1) bruger tagget i stedet for navnet.

### 0.2 Status-effekter på spillere
Ét fælles system til vedvarende forbandelser (B2) og følgesvende/race-bonusser, der skal vises.

- En spiller kan have en liste af aktive effekter, fx "−1 på alle terningeslag".
- Hver effekt har en kilde (kortet, der gav den), og hvornår den udløber: *permanent indtil fjernet*, *efter din næste kamp* eller *efter din næste vundne kamp*.
- Effekterne vises som små mærker på scoreboardet og på kortdetaljer (C4).

### 0.3 "Har class X"-tjek ét sted
Med Dual Class (B7) kan en spiller have to classes. Alle steder, der i dag spørger "er spilleren Warrior?", samles i ét tjek, der kigger på begge. Det samme gælder racer.

### 0.4 Balance-simulator (Christian)
Bots spiller rigtige spil med motoren, gerne tusindvis. De måler:
- spillets længde (antal ture) ved 4 og 6 spillere
- vinderprocent pr. class, race og kombination
- hvor tit hvert kort afgør en kamp eller et spil.

Den køres **før** udvidelserne (som baseline) og efter hver fase. Simulatoren rører ikke spillets kode.

---

## B1. Racer

Spilles fra hånden ligesom en class. Man har én race; spiller man en ny, kasseres den gamle.

| Race | Evne | Kopier |
|---|---|---|
| **Goblin** | *Swarm Caller:* Én gang pr. kamp må du spille et `goblin`-monster fra hånden ind i *en hvilken som helst* kamp, uden Wandering Monster og uden at der allerede er en goblin i kampen. *Home Turf:* I Goblin Land får du selv +3 i kamp (monstrene får stadig deres +3). | 2 |
| **Elf** | +1 på Run Away. Når du hjælper en spiller med **højere level end dig selv** med at vinde, går du op ét level (aldrig til vinderlevel). | 2 |
| **Dwarf** | Du må bære ubegrænset mange Big items. Din grænse for håndkort ved Charity er 6 i stedet for 5. | 2 |
| **Halfling** | Én gang pr. tur må du sælge ét item til dobbelt værdi. Salg kræver stadig 1000g pr. level. | 2 |

- Ny forbandelse: **Curse! Identity Crisis** (1 kopi). Du mister din race.
- Udstyr med race-krav er muligt senere, på samme måde som classReq. Det er ikke med i første omgang.
- ❌ Første udkast ("Kinship": goblin-monstre −3 mod en Goblin-spiller) er forkastet.
- ✅ Goblin er rettet mod kaos-siden af spillet: en Goblin-spiller saboterer andres kampe.

### Justeringer i fase 2 (fra balance-simulatoren)

- **Elf** fik i første udgave et level for *enhver* hjælp og vandt 37.7 % af spillene (fair 25 %), fordi hjælp nu bruges i ca. 65 % af kampene. Ændret til: kun et level for at hjælpe en spiller med højere level. Lederen kan ikke farme levels, mens bagudliggende Elvere indhenter. Resultat: 29.7 %.
- **Modvægt mod mere spillerkraft** (ønsket under fase 2):
  - *Show-off:* +2 Threat pr. ekstra class eller race (ikke på Calm).
  - *Anti-race-monstre:* The Elf-Eater, Mithril Wyrm, The Halfling Hound og The Goblin Slayer (+5/+6 mod den hadede race, også hvis det er hjælperen).
  - *Ambush:* Goblin Raiding Party og Highway Bandits trækker det næste door-kort med ind, hvis det er et monster.
  - *Horde:* Skeleton Legion får +3 pr. andet monster i kampen.
- **Siren** og **Highway Bandits** er sat ned til 1 kopi hver: kampene blev ellers for hårde (42 % vundne).

## B2. Vedvarende forbandelser og modkort

Nye forbandelser, der lægger en status-effekt (0.2) på offeret i stedet for at ramme én gang:

| Kort | Effekt | Udløber | Kopier |
|---|---|---|---|
| **Curse! Goblin on Your Head** | −1 på alle terningeslag (flugt, tyveri) | Når du vinder en kamp | 2 |
| **Curse! Butterfingers** | −2 i kamp | Efter din næste kamp | 2 |
| **Curse! Social Pariah** | Ingen kan hjælpe dig i kamp | Efter din næste kamp | 1 |
| **Curse! Cursed Coin Purse** | Dine items sælges for halv værdi | Permanent til fjernet | 1 |

Modkort:
- **Ring of Second Chances** (treasure, 2 kopier). Spilles når som helst og fjerner én aktiv effekt fra en *hvilken som helst* spiller. Den kan altså også sælges eller byttes i en Parley (B3).
- **Cleric-bonus:** En Cleric må kassere 2 kort for at fjerne en effekt fra en hvilken som helst spiller. Det giver Cleric en ny rolle ved bordet.

✅ En forbandelse kan ikke stoppes, idet den kastes. Ring of Second Chances og Cleric fjerner den bagefter.

### Justeringer i fase 3 (fra balance-simulatoren)

- **Forbandelser der låste svage spillere ude:** Butterfingers ("−2 indtil du vinder") gav en level 1-spiller uden udstyr kampstyrke −1, så de aldrig kunne vinde igen. Goblin on Your Head (permanent −1 på terninger) gav en dødsspiral. Med 4 spillere faldt vundne kampe til 28 %. Ændret til: Butterfingers gælder kun næste kamp; Goblin on Your Head gælder til du vinder en kamp. Resultat: 47 % vundne kampe.
- **Greedy Mercenary** tager automatisk dit billigste kort som betaling ved turens slutning; har du ingen kort, går han.
- **Dwarf-buff:** +1 i kamp pr. Big item du har på (højst +3). 23.8 % vinderrate (før 21.6 %, fair 25 %).
- **Thief-buff:** +1 på flugt, og tyveri lykkes på 3+ (med Lockpicks 2+). 24.2 % vinderrate (før 19.9 %).

## B3. The Grand Parley (spillets signatur)

Tre dele:

**1. Handel mellem spillere**
- Uden for kamp må alle foreslå en handel til en anden spiller: "mine items X, Y mod dine items Z".
- ✅ **Kun kort med en guldværdi**, altså kort der kan sælges og dermed bidrage til et level: udstyr (påtaget eller i rygsækken) og treasure-kort med guldværdi på hånden (one-shots, enhancers). Kort til 0g (fx Pretty Balloons, Huge Rock, Go Up a Level) og door-kort kan ikke handles.
- Modtageren accepterer eller afviser. Alt flyttes på én gang, så ingen kan snyde halvvejs.
- Byttet udstyr lander i rygsækken; man tager det på selv bagefter.

**2. Hjælp mod konkrete kort**
- Når angriberen beder om hjælp, kan tilbuddet nu indeholde *items* ud over et antal skatte.
- ✅ Items betales **forud, ved accept**, og kommer aldrig tilbage. Saboterer de andre spillere kampen bagefter, har hjælperen stadig fået sin betaling, og angriberen har betalt forgæves. Skattene betales først ved sejr, som i dag.
- Samme regler for, hvad der kan bydes, som ved handel: kun kort med guldværdi.

**3. Betal dig forbi monstret ("Toll")**
- Angriberen må, inden kampen afgøres, kassere items for mindst toldprisen. Så slutter kampen: ingen levels, ingen skatte, ingen Bad Stuff.
- Tæller som en kamp (man kan ikke Loot the Room bagefter).
- ✅ Prisen regnes på kampens **samlede** monster-level, så Wandering Monster, Goblin-sværm og Mate gør det dyrere.
- ✅ Over level 16 i alt kan man ikke købe sig fri. Bosser (anti-class) kan aldrig købes fri.
- ✅ Prisen stiger trinvist: under level 7 er den fast, fra level 7-10 koster hvert level 300g, og over 10 koster hvert level 600g.
- ✅ Trinvis "trappe" (som en skattetrappe): hvert trin lægges oven i det forrige, så prisen aldrig springer:

  | Samlet level | Pris |
  |---|---|
  | 1-6 | 500g (fast) |
  | 7 | 800g |
  | 8 | 1100g |
  | 10 | 1700g |
  | 12 | 2900g |
  | 14 | 4100g |
  | 16 | 5300g |
  | 17+ | Kan ikke købes fri |

- ✅ "Samlet level" = det tal, kamppanelet viser (inklusive enhancers, dungeons og anti-class bonus). Modstandere kan altså gøre det dyrere at slippe væk ved at spille enhancers.

## B4. Følgesvende

Én ny plads pr. spiller. Følgesvenden er et treasure-kort, man spiller ud ligesom udstyr.

| Kort | Effekt | Kopier |
|---|---|---|
| **Goblin Lackey** | +1 i kamp. Kan **ofres** i Run Away-fasen: du slipper automatisk væk. | 2 |
| **Battle Boar** | +2 i kamp, +1 på Run Away. | 1 |
| **Greedy Mercenary** | +4 i kamp. Kræver betaling: i slutningen af hver af *dine* ture kasserer du et kort, ellers forlader han dig. | 1 |

- Følgesvenden mistes ved død og ved "lose all items".
- Den kan ikke stjæles, og Robin Hood rører den ikke.

## B5. Forged Guild Papers (Cheat)

- **Forged Guild Papers** (treasure, 2 kopier). Spilles sammen med et item, når du tager det på: kravet ignoreres (class, race eller "ikke Warrior" på Kneepads).
- Papirerne sidder fast på itemet. Forsvinder itemet, kasseres papirerne også.
- Mister du din class, glider et item med papirer **ikke** ned i rygsækken.

## B6. Tags i brug

Ud over fundamentet (0.1):

- **Ignorerer de svage:** Udvalgte store monstre forfølger ikke spillere med lavt level. Ved Run Away slipper man automatisk væk, hvis ens level er ≤ grænsen.
  - Plutonium Dragon: ≤ 5. Bullrog: ≤ 4. Squidzilla: ≤ 4.
- Nye one-shots, der bruger tags:
  - **Holy Water** (2 kopier): +5 mod `undead`, ellers +2.
  - **Goblin Repellent** (2 kopier): +4 mod `goblin`, ellers +1.
- ✅ Dungeon of the Unrelenting Undead beholder sin effekt (alle monstre kan spilles ind i enhver kamp), men får et navn, der passer: **Dungeon of Uninvited Guests**.

## B7. Dual Class og Half-Breed

- **Guild Hopper** (door, 1 kopi). Lad dette kort ligge sammen med en *anden* class: du har begge classes på én gang. Alle evner og class-items virker.
  - Anti-class bosser får kun deres bonus én gang, selvom begge dine classes er hadede.
  - Amnesia og Juggernaut tager den class, du fik sidst.
- **Mixed Heritage** (door, 1 kopi). Det samme for racer.

## B8. Epic-variant

- ✅ I ventelokalet vælges målet: **level 10** (standard), **15** eller **20**. Valget kan ændres, indtil spillet startes, og alle kan se det.
- Alle grænser følger med: salg og "Go Up a Level" kan højst bringe dig til ét under målet, og målet kan kun nås ved at vinde en kamp.
- Elf-racens "level ved hjælp" kan heller ikke give sejren.

---

## C1. Interrupt-nedtælling (15 sekunder)

- Når kampens interrupt-vindue åbner, eller åbner igen fordi nogen spillede et kort, starter en nedtælling på **15 sekunder**.
- Når den løber ud, regnes alle, der ikke har trykket Pass, som om de har passet. Angriberen skal stadig selv trykke for at afgøre kampen.
- Nedtællingen styres af serveren, så alle ser samme tid. Klienten viser en bjælke, der løber ned.
- Overlever en genstart af serveren (fristen gemmes med spillet).
- I ventelokalet kan den slås fra eller sættes til en anden længde. Standard er 15 s.

## C2. Bunker der skalerer med antal spillere

- Bunkerne bygges når spillet **starter**, ikke når rummet oprettes, så antallet af spillere kendes.
- 1-6 spillere: én bunke. 7-12: dobbelt door- og treasure-bunke. Dungeon-bunken er altid enkelt.
- Kræver en lille rettelse: kort-id'erne nulstilles i dag mellem bunker og ville støde sammen ved dobbelte bunker.

## C3. TV-tilstand

- I lobbyen: "Join as table display" i stedet for et navn. Skærmen får ingen plads, ingen hånd og intet Pass-krav.
- Visning til stor skærm: bordet, aktive dungeons, kampen med tal og nedtælling (C1), scoreboard med effekter (0.2) og loggen i stor skrift.
- TV'et viser QR-koden permanent, så nye telefoner kan joine derfra.
- Telefonerne bliver rene "håndkontrollere", men har stadig deres fulde visning.

## C4. Kortdetaljer

- Tryk på et kort (hånd, bord, kamp, andre spilleres udstyr) for at se kortet stort med fuld tekst.
- Viser også: slot, guldværdi, krav (class/race), tags, og hvilke aktive dungeons og effekter der ændrer kortet lige nu.

---

## D. Fejlrettelser (uafhængige af resten)

| Fejl | Rettelse |
|---|---|
| To "Boots of Running Really Fast"; `e-running` har ingen effekt | Fjern `e-running`, eller giv den samme effekt |
| Amazon: tekst "Lose all hand items", effekt fjerner *alt* udstyr | Ret effekten til kun at ramme hånd-slots |
| Halo: "survive with 1 HP" | Ret teksten (spillet har ikke HP) |
| Cleric: class-teksten beskriver en anden evne | Ret teksten til den evne, der faktisk findes |

---

## Rækkefølge (faser)

| Fase | Indhold | Hvorfor i den rækkefølge |
|---|---|---|
| 0 ✅ | D + fundament (0.1-0.3) + balance-simulator med baseline | Alt andet bygger på det; baseline måles før noget ændres. Baseline: [docs/balance/baseline.md](balance/baseline.md) |
| 1 ✅ | C1, C4, B6, B8 | Lav risiko, størst effekt på spiloplevelsen med det samme. Balance: [docs/balance/fase1.md](balance/fase1.md) |
| 2 ✅ | B1, B7, B5 + modvægts-monstre | Racer først, så Dual/Half-Breed og Forged Papers, der bygger på dem. Balance: [docs/balance/fase2.md](balance/fase2.md) |
| 3 ✅ | B2, B4 + Dwarf/Thief-buff | Bruger status-effekterne fra fundamentet. Balance: [docs/balance/fase3.md](balance/fase3.md) |
| 4 ✅ | B3 | Største UX-opgave; drager nytte af alt det ovenstående. Balance: [docs/balance/fase4.md](balance/fase4.md) |
| 5 ✅ | C2, C3 | Mest relevant ved 6+ spillere. Balance: [docs/balance/fase5.md](balance/fase5.md) |

Hver fase afsluttes med: tests, fuzzeren (kortbevarelse, konsistens, ingen låste spil), balance-simulatoren og en browsertest på telefon, tablet og desktop.
