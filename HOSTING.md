# 🌍 Hosting Goblin Grand Parley yourself

The game has two parts:

| Part | What it is | Where it lives after `npm run build` |
|------|-----------|--------------------------------------|
| **Client** | React web page (HTML/CSS/JS) | `dist/` |
| **Server** | Node.js + Socket.io game server (holds all game state, live WebSocket connections) | `dist-server/index.mjs` (one self-contained file) |

The server also serves the client, so **one Node.js process on one port runs everything**.
The bundled server has no dependencies — the target machine only needs **Node.js 20 or newer**. No `npm install` there.

---

## ⚠️ Simply.com: which product?

Simply.com's normal **webhotel** only hosts *static* files (HTML/JS/CSS uploaded via FTP).
It **cannot** run a Node.js process that keeps WebSocket connections open
([Simply.com FAQ: "Can I run NodeJS applications on my web hosting?"](https://www.simply.com/en/support/faq/general/837-can-i-run-nodejs-applications-on-my-web-hosting/)).
Since this game needs a live server, use one of these:

### ✅ Option A — Simply.com VPS (recommended if you want to stay at Simply.com)
Everything on one Linux server. Steps below in **"Deploy to a Linux VPS"**.

### ✅ Option B — Simply.com domain + any Node host
Keep your domain/DNS at Simply.com and point a subdomain (e.g. `spil.ditdomæne.dk`) at a VPS or a
Node-friendly host (Render, Railway, Fly.io, Hetzner…). The included `Dockerfile` works on all Docker-based hosts.
In Simply.com's DNS settings add an **A record** (VPS IP) or **CNAME** (host's address) for the subdomain.

### ⚙️ Option C — Client on the Simply.com webhotel, server elsewhere
Possible, but more moving parts. Build the client pointing at your server:

```bash
# Windows PowerShell:  $env:VITE_SERVER_URL="https://game-server.example.com"; npm run build:client
VITE_SERVER_URL=https://game-server.example.com npm run build:client
```

Upload the **contents** of `dist/` to the webhotel via FTP. Run the server elsewhere with
`CORS_ORIGIN=https://www.ditdomæne.dk` so browsers are allowed to connect.
Also add an `.htaccess`/`web.config` rewrite so all paths serve `index.html` (the app has client-side routing).

---

## 📦 Build a release folder (on your own PC, in VS Code)

```bash
npm install
npm run package
```

This creates `release/` containing:

```
release/
  dist/                 ← client
  dist-server/index.mjs ← server (self-contained)
  deploy/               ← nginx + systemd config examples
  package.json          ← just `npm start`
  HOSTING.md
```

Test it locally before uploading:

```bash
cd release
node dist-server/index.mjs
# open http://localhost:3001
```

---

## 🐧 Deploy to a Linux VPS (Ubuntu/Debian — e.g. Simply.com VPS)

**1. Install Node.js 22, nginx and certbot** (run on the VPS via SSH):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx
sudo useradd --system --home /opt/goblin-grand-parley goblin
sudo mkdir -p /opt/goblin-grand-parley && sudo chown goblin /opt/goblin-grand-parley
```

**2. Upload the release folder** from your PC (or use WinSCP / FileZilla over SFTP):

```bash
scp -r release/* root@YOUR-VPS-IP:/opt/goblin-grand-parley/
```

**3. Run it as a service** (auto-start on boot, auto-restart on crash):

```bash
cd /opt/goblin-grand-parley
sudo cp deploy/goblin-grand-parley.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now goblin-grand-parley
curl http://127.0.0.1:3001/health        # → {"ok":true,"rooms":0}
```

**4. Put nginx in front + HTTPS.** Edit `deploy/nginx.conf` (replace `spil.example.dk` with your domain), then:

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/goblin-grand-parley
sudo ln -s /etc/nginx/sites-available/goblin-grand-parley /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d spil.ditdomæne.dk
```

**5. DNS at Simply.com:** control panel → your domain → DNS → add an **A record** for `spil` pointing at the VPS IP.

Open `https://spil.ditdomæne.dk` — done. 🎉

**Updating later:** run `npm run package` again, upload `release/*`, then `sudo systemctl restart goblin-grand-parley`.
Logs: `sudo journalctl -u goblin-grand-parley -f`.

---

## 🐳 Docker (any Docker host)

```bash
docker build -t goblin-grand-parley .
docker run -d --restart unless-stopped -p 3001:3001 -v goblin-data:/app/data goblin-grand-parley
```

---

## 🔧 Server settings (environment variables)

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3001` | Port the server listens on |
| `HOST` | `0.0.0.0` | Interface to bind (`127.0.0.1` when behind nginx) |
| `CORS_ORIGIN` | *(none — same origin only)* | Comma-separated allowed origins (only needed for Option C) |
| `CLIENT_DIST` | `dist/` in the app folder | Folder with the built client |
| `DATA_FILE` | `data/rooms.json` in the app folder | Where running games are saved |

Client build setting: `VITE_SERVER_URL` — only for Option C. By default the client connects to the same address it was loaded from.

## 📝 Good to know

- Running games are **saved to `data/rooms.json`** after every move and restored on start, so a restart or crash does not end a game. With Docker, keep the `-v goblin-data:/app/data` volume. Rooms untouched for 7 days are removed.
- Run **one** server process (no clustering/load balancing) — all players in a room must reach the same process.
- The reverse proxy **must** forward WebSocket upgrades (the included `nginx.conf` does).
