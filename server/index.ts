// Entry point: starts the Goblin Grand Parley LAN server (bundled to dist-server/index.mjs by `npm run build`).
//   PORT         (default 3001)
//   HOST         (default 0.0.0.0 — all interfaces; use 127.0.0.1 behind a reverse proxy)
//   DATA_FILE    (default ./data/rooms.json) — where running games are saved
//   CLIENT_DIST  (default ./dist) — the built client
//   CORS_ORIGIN  comma-separated origins, only needed when the client is hosted on another domain

import path from "path";
import { fileURLToPath } from "url";

import { networkReport, startGameServer } from "./app.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`Ugyldig PORT "${process.env.PORT}".`);
  process.exit(1);
}
const host = process.env.HOST ?? "0.0.0.0";
const dataFile = path.resolve(root, process.env.DATA_FILE ?? "data/rooms.json");
const distDir = path.resolve(root, process.env.CLIENT_DIST ?? "dist");
const corsOrigins = (process.env.CORS_ORIGIN ?? "").split(",").map(o => o.trim()).filter(Boolean);

try {
  const server = await startGameServer({ port, host, dataFile, distDir, corsOrigins });

  console.log(`\n👺  Goblin Grand Parley-serveren kører på port ${server.port}`);
  console.log(`    Lokalt: http://localhost:${server.port}`);
  if (host === "0.0.0.0" || host === "::") {
    const net = networkReport();
    for (const ip of net.lan) console.log(`    LAN:    http://${ip}:${server.port}   ← del med vennerne på samme Wi-Fi`);
    if (net.skipped.length) {
      console.log(`
    ⚠️  VPN / virtuelt netværk fundet: ${net.skipped.map(s => `${s.adapter} (${s.ip})`).join(", ")}`);
      console.log("        Telefoner på dit Wi-Fi kan som regel ikke forbinde, mens en VPN er tændt.");
      console.log("        Slå den fra, eller slå dens \"Allow LAN connections\"-indstilling til.");
    }
    if (net.lan.length === 0) console.log("    ⚠️  Ingen Wi-Fi/Ethernet-adresse fundet — er computeren på netværket?");
  }
  console.log(`    Gemte spil: ${dataFile} (${server.rooms.size} rum genskabt)\n`);

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
  if (code === "EADDRINUSE") console.error(`Port ${port} er allerede i brug — kører serveren allerede? Sæt PORT for at bruge en anden port.`);
  else console.error(err);
  process.exit(1);
}
