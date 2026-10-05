// Collects everything needed to run the game on a server into ./release.
// The server is bundled into a single file, so the release needs no `npm install` — only Node.js 20+.
import { cpSync, rmSync, mkdirSync, writeFileSync, existsSync } from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "release");

for (const dir of ["dist", "dist-server"]) {
  if (!existsSync(path.join(root, dir))) {
    console.error(`Missing ./${dir} — run \`npm run build\` first.`);
    process.exit(1);
  }
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(path.join(root, "dist"), path.join(out, "dist"), { recursive: true });
cpSync(path.join(root, "dist-server"), path.join(out, "dist-server"), { recursive: true });
cpSync(path.join(root, "deploy"), path.join(out, "deploy"), { recursive: true });
cpSync(path.join(root, "HOSTING.md"), path.join(out, "HOSTING.md"));

writeFileSync(
  path.join(out, "package.json"),
  JSON.stringify(
    {
      name: "goblin-grand-parley-server",
      private: true,
      type: "module",
      engines: { node: ">=20" },
      scripts: { start: "node dist-server/index.mjs" },
    },
    null,
    2,
  ) + "\n",
);

console.log(`\n📦  Release ready in ${path.relative(process.cwd(), out) || "."}/`);
console.log("    Upload that folder to your server and run:  node dist-server/index.mjs");
