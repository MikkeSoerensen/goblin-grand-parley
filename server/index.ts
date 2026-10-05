// Entry point: starts the Munchkin LAN server.
//   PORT       (default 3001)
//   DATA_FILE  (default ./data/rooms.json) — where running games are saved

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
const dataFile = path.resolve(root, process.env.DATA_FILE ?? "data/rooms.json");

try {
  const server = await startGameServer({ port, dataFile, distDir: path.join(root, "dist") });

  console.log(`\n🎲  Munchkin server listening on port ${server.port}`);
  console.log(`    Local:  http://localhost:${server.port}`);
  for (const ip of lanAddresses()) console.log(`    LAN:    http://${ip}:${server.port}   ← share with friends on same Wi-Fi`);
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
