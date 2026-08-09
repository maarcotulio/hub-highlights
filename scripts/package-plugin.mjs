// Builds the hub.koplugin.zip attached to GitHub releases.
//
// KOReader expects the archive to contain the plugin FOLDER, with main.lua
// directly inside it — unpacking one level deeper is the usual way an install
// silently does nothing. That layout is what this script produces, and what
// plugins/hub.koplugin/README.md tells people to expect.
//
//   node scripts/package-plugin.mjs [outDir]

import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import JSZip from "jszip";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginDir = join(root, "plugins", "hub.koplugin");
const outDir = resolve(process.argv[2] ?? join(root, "dist"));
const outFile = join(outDir, "hub.koplugin.zip");

// A filled-in .env holds an API token granting full access to a library, so it
// must never be shipped. .env.example is documentation and does ship.
const EXCLUDE = new Set([".env"]);

async function collect(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (EXCLUDE.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collect(full)));
    else if (entry.isFile()) out.push(full);
  }
  return out.sort();
}

const files = await collect(pluginDir);
if (!files.some((f) => f.endsWith("/main.lua"))) {
  throw new Error("refusing to package: no main.lua found in plugins/hub.koplugin");
}

const zip = new JSZip();
for (const file of files) {
  const inZip = join("hub.koplugin", relative(pluginDir, file)).split("\\").join("/");
  zip.file(inZip, await readFile(file));
}

await mkdir(outDir, { recursive: true });
await pipeline(
  zip.generateNodeStream({ type: "nodebuffer", streamFiles: true, compression: "DEFLATE" }),
  createWriteStream(outFile),
);

const { size } = await stat(outFile);
console.log(`${outFile}  (${files.length} files, ${(size / 1024).toFixed(1)} KiB)`);
for (const file of files) console.log(`  hub.koplugin/${relative(pluginDir, file)}`);
