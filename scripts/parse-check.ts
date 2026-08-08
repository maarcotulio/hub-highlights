import { readFileSync } from "fs";
import { parseKoreaderMetadata } from "../lib/parsers/koreader-lua";
import { parseKoreaderStatistics } from "../lib/parsers/koreader-sqlite";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: npm run parse:check -- <path-to-file>");
    console.error("Accepts a KOReader metadata.<ext>.lua / <book>.<ext>.annotations.lua, or a statistics.sqlite3.");
    process.exit(1);
  }

  if (path.endsWith(".sqlite3")) {
    const buffer = new Uint8Array(readFileSync(path));
    const result = await parseKoreaderStatistics(buffer);
    console.log(`${result.books.length} book(s), ${result.pageStats.length} page-stat row(s)\n`);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (path.endsWith(".lua")) {
    const content = readFileSync(path, "utf-8");
    const highlights = parseKoreaderMetadata(content);
    console.log(`${highlights.length} highlight(s) found\n`);
    console.log(JSON.stringify(highlights, null, 2));
    return;
  }

  console.error(`Unrecognized file type: ${path}`);
  console.error("Accepts a KOReader metadata.<ext>.lua / <book>.<ext>.annotations.lua, or a statistics.sqlite3.");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
