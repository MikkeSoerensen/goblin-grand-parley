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

## ⬇️ Download the project

Either:
- **Git:** `git clone https://github.com/mikkesoerensen/goblin-grand-parley.git`
- **ZIP:** on GitHub click **Code → Download ZIP** and unzip it.

Then open the folder in **Visual Studio Code** (*File → Open Folder…*). VS Code will offer to install the recommended extensions — click *Install*.

Requirements: [Node.js 20+](https://nodejs.org) (LTS). Check with `node -v` in the VS Code terminal (*Terminal → New Terminal*).

## 🚀 Quick start (in VSCode)

### 1. Install
```bash
npm install
```

### 2. Run both client and server
```bash
npm run dev
```

This starts:
- **Client** (Vite, hot-reload): http://localhost:8080
- **Server** (Socket.io): http://localhost:3001

The client proxies WebSocket traffic to the server, so during dev you only need to share the **client URL** with your friends.

### 3. Find your LAN IP

When the server starts it prints something like:
```
🎲  Munchkin server listening on port 3001
    Local:  http://localhost:3001
    LAN:    http://192.168.1.42:3001   ← share with friends on same Wi-Fi
```

Tell your friends to open: **`http://<your-LAN-IP>:8080`** in any browser (phone, laptop, tablet).

> 💡 **Firewall**: macOS/Windows may ask to allow incoming connections on ports 8080 and 3001. Click *Allow* (private network only).

### 4. Play
1. Each player enters a **name** and the **same room code** (any short word — first joiner creates the room).
2. Once everyone is in, click **Start Game**.
3. On your turn, click **Kick Open the Door** to begin Phase 1.

## 🧪 Test & verify in VS Code

Everything is wired up in `.vscode/` — use **Terminal → Run Task…** (or `Ctrl+Shift+B` for the default build task):

| Task | What it does |
|------|--------------|
| **Dev: client + server (hot reload)** | Starts the game at http://localhost:8080 (default build task, `Ctrl+Shift+B`) |
| **Run tests** | Runs the Vitest test suite |
| **Lint** | ESLint; problems show up in the *Problems* panel |
| **Production: build + start** | Builds exactly what you'll host and runs it at http://localhost:3001 |
| **Package release folder** | Creates `release/` ready to upload to a server |

Debugging (**Run and Debug** panel, `Ctrl+Shift+D`):
- **Debug server** — set breakpoints in `server/index.ts`
- **Open game in Chrome** — breakpoints in the React code (start the dev task first)
- **Debug current test file**

Quick sanity check: open the game in **two browser windows** (or a normal + incognito window), join the same room code with two names, and click **Start Game**.
The server health endpoint is http://localhost:3001/health.

## 📦 Production build (single port)

```bash
npm run build      # builds React client to /dist and bundles the server to /dist-server
npm start          # server hosts both the game and the built client on :3001
```

Now everyone connects to `http://<your-LAN-IP>:3001` — no separate Vite dev server needed.

## 🌍 Hosting it online (e.g. Simply.com)

See **[HOSTING.md](HOSTING.md)**. Short version: `npm run package` builds a self-contained `release/` folder that only needs Node.js on the server.
Note that a Simply.com **webhotel** can only serve static files, so the game server needs a **VPS** (Simply.com sells these) or another Node.js host.

## 🗂 Project structure

```
shared/
  types.ts        ← single source of truth for card / state shapes
  deck.ts         ← ~120-card deck definitions
server/
  index.ts        ← authoritative state machine + Socket.io transport
deploy/           ← nginx + systemd examples for a Linux server
scripts/
  package-release.mjs ← builds the uploadable release/ folder
Dockerfile        ← container build for Docker hosts
src/
  lib/socket.ts   ← thin Socket.io wrapper
  lib/store.ts    ← Zustand store mirroring server view
  components/game/
    Lobby.tsx
    Scoreboard.tsx
    TableArea.tsx
    PlayerHand.tsx
    CombatPanel.tsx
    Modals.tsx    (charity + looting)
    GameCard.tsx
  pages/Index.tsx ← top-level routing between lobby / table / game-over
```

## 🧠 How combat works (the Interrupt system)

1. Attacker triggers combat (kicked door OR Look for Trouble).
2. Server enters `waitingForInterrupts` — every opponent gets a Pass button.
3. Anyone may play a one-shot or enhancer. **Doing so resets all Pass votes** (your interrupt window opens again).
4. Attacker may **Ask for Help** at any time, offering a fixed number of treasures.
5. Once a helper accepts → **🩸 Blood Oath**: they are locked in, and that contract overrides the eventual treasure split.
6. When **all opponents have passed**, the attacker sees a **Resolve Combat** button.
7. If players ≥ monster total → players win, gain levels + treasures (helper takes contracted share).
8. If not → **Run Away** phase: each fighter rolls 1d6. 5–6 escapes; 1–4 triggers Bad Stuff.

## ⚖️ House rule cheatsheet

- Hand limit (Charity): enforced at **end of turn** — overflow goes to lowest-level opponent.
- Selling: total ≥ 1000g per level; capped at Level 9.
- Death: keep your level; lose everything else; opponents loot one card each (highest level first); fresh hand on your next turn.

Have fun. Stab generously. 🗡️
