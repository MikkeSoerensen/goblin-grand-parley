// Entry point: starts the Munchkin LAN server (bundled to dist-server/index.mjs by `npm run build`).
//   PORT         (default 3001)
//   HOST         (default 0.0.0.0 — all interfaces; use 127.0.0.1 behind a reverse proxy)
//   DATA_FILE    (default ./data/rooms.json) — where running games are saved
//   CLIENT_DIST  (default ./dist) — the built client
//   CORS_ORIGIN  comma-separated origins, only needed when the client is hosted on another domain

import path from "path";
import { fileURLToPath } from "url";

import { lanAddresses, startGameServer } from "./app.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`Invalid PORT "${process.env.PORT}".`);
  process.exit(1);
}
const host = process.env.HOST ?? "0.0.0.0";
const dataFile = path.resolve(root, process.env.DATA_FILE ?? "data/rooms.json");
const distDir = path.resolve(root, process.env.CLIENT_DIST ?? "dist");
const corsOrigins = (process.env.CORS_ORIGIN ?? "").split(",").map(o => o.trim()).filter(Boolean);

try {
  const server = await startGameServer({ port, host, dataFile, distDir, corsOrigins });

  console.log(`\n🎲  Munchkin server listening on port ${server.port}`);
  console.log(`    Local:  http://localhost:${server.port}`);
  if (host === "0.0.0.0" || host === "::") for (const ip of lanAddresses()) console.log(`    LAN:    http://${ip}:${server.port}   ← share with friends on same Wi-Fi`);
  console.log(`    Saved games: ${dataFile} (${server.rooms.size} room(s) restored)\n`);

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch (err) {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "EADDRINUSE") console.error(`Port ${port} is already in use — is the server already running? Set PORT to use another port.`);
  else console.error(err);
  process.exit(1);
}
