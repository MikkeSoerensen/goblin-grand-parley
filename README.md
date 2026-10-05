# 🎲 Munchkin — LAN Multiplayer

A turn-based card game inspired by Munchkin, built with React + TypeScript on the client and a Node.js + Socket.io authoritative server. Designed to be **run locally from VSCode** so you and your friends can play on the same Wi-Fi.

## ✨ Features

- **4-phase turn loop** — Kick Open the Door → Look for Trouble → Loot the Room → Charity
- **Authoritative server state machine** — no cheating; hidden hands stay hidden per device
- **Iterative combat with Interrupts** — every played one-shot/enhancer **resets all Pass votes**; the attacker can only resolve combat once every opponent has clicked Pass
- **Negotiation & Blood Oaths** — ask any opponent for help with a fixed treasure offer; once accepted the helper is **locked in** and gets exactly that many treasures regardless of how the fight escalates
- **Equipment slots** — head / armor / feet / 2× hand (or 1 two-handed) / 1 Big item
- **Curses with immediate effects** — lose level, lose specific item, lose all items, death
- **Death & Looting the Body** — opponents take one card each in highest-level-first order
- **Auto-reshuffle** — discard piles automatically reshuffle into the deck when empty
- **Strict victory rule** — Level 10 can ONLY be reached by winning a combat (selling caps at Level 9)
- **Reactive Scoreboard** — name / level / combat power, always visible
- **Dark game-board theme** — felt table, wooden rim, parchment & brass typography, overlapping cards in hand

## 🚀 Game night (host computer)

Requires [Node.js](https://nodejs.org) 20 or newer on **one** computer — the host. Everyone else only needs a browser.

```bash
npm install     # first time only
npm start       # builds the client and starts the server on port 3001
```

The server prints the address to share:

```
🎲  Munchkin server listening on port 3001
    Local:  http://localhost:3001
    LAN:    http://192.168.1.42:3001   ← share with friends on same Wi-Fi
    Saved games: …/data/rooms.json (0 room(s) restored)
```

1. Open the game, enter a **name** and a **room code**. The waiting room shows a **QR code** with the LAN address — friends scan it with their phone (or type the address).
2. Everyone enters the same room code. Click **Start Game** when all are in.
3. Works on phones, tablets and computers. No internet needed — fonts and everything else are served from the host.

> 💡 **Firewall**: the first time, Windows/macOS asks whether to allow incoming connections for Node.js. Allow it on **private networks**. Guest/hotel Wi-Fi often blocks devices from seeing each other — use a phone hotspot or your own router instead.

### Reconnecting & saved games

- A phone that goes to sleep, a reloaded tab or a dropped Wi-Fi connection rejoins automatically in the same seat (a session token is stored in the browser).
- Lost the token (other browser, private mode)? Join with **the same name** while your old seat is offline to reclaim it. A name that is online cannot be taken.
- Offline players never block a fight: only connected players must click *Pass*.
- Every game is saved to `data/rooms.json`. Stop the server with `Ctrl+C` and start it again — the game continues where it was. Rooms untouched for 7 days are cleaned up.
- Options: `PORT=4000 npm start`, `DATA_FILE=some/where.json npm start`.

## 🛠 Development

```bash
npm run dev         # Vite (hot reload) on :8080 + server (auto-restart) on :3001
npm test            # engine, protocol, persistence and socket integration tests
npm run typecheck   # strict TypeScript for server + client
FUZZ_SEEDS=500 npm test   # deeper randomized rule testing before a release
```

In dev, Vite proxies `/socket.io` and `/api` to the server, so friends can also use `http://<your-LAN-IP>:8080`.

## 🗂 Project structure

```
shared/
  types.ts        ← single source of truth for card / state / wire shapes
  deck.ts         ← deck definitions
server/
  engine.ts       ← authoritative game rules (pure, no I/O)
  protocol.ts     ← zod validation of every client message
  persistence.ts  ← atomic JSON snapshots (data/rooms.json)
  app.ts          ← HTTP + Socket.io transport, sessions, rate limiting
  index.ts        ← entry point (npm start)
  *.test.ts       ← tests, incl. fuzzing for card conservation and deadlocks
src/
  lib/socket.ts   ← Socket.io client (same origin)
  lib/session.ts  ← seat token in localStorage
  lib/store.ts    ← Zustand store mirroring the server view, auto-rejoin
  components/game/
    Lobby.tsx, JoinInfo.tsx (QR), Scoreboard.tsx, TableArea.tsx,
    PlayerHand.tsx, CombatPanel.tsx, Modals.tsx, GameCard.tsx
  pages/Index.tsx ← lobby / waiting room / table / game-over
```

## 🧠 How combat works (the Interrupt system)

1. Attacker triggers combat (kicked door OR Look for Trouble).
2. Server enters `waitingForInterrupts` — every opponent gets a Pass button.
3. Anyone may play a one-shot or enhancer. **Doing so resets all Pass votes** (your interrupt window opens again).
4. Attacker may **Ask for Help** at any time, offering a fixed number of treasures.
5. Once a helper accepts → **🩸 Blood Oath**: they are locked in, and that contract overrides the eventual treasure split.
6. When **all connected opponents have passed**, the attacker sees a **Resolve Combat** button.
7. If players ≥ monster total → players win, gain levels + treasures (helper takes contracted share).
8. If not → **Run Away** phase: each fighter rolls 1d6. 5–6 escapes; 1–4 triggers Bad Stuff.

## ⚖️ House rule cheatsheet

- Hand limit (Charity): enforced at **end of turn** — overflow goes to lowest-level opponent.
- Selling: total ≥ 1000g per level; capped at Level 9.
- Death: keep your level; lose everything else; opponents loot one card each (highest level first); fresh hand on your next turn.

Have fun. Stab generously. 🗡️
