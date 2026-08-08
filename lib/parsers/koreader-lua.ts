import { parse } from "luaparse";
import type { Expression, ReturnStatement, TableConstructorExpression } from "luaparse";
import { computeDedupeHash, type RawHighlight } from "./normalize";

// --- safe Lua table evaluation ---------------------------------------------
// Never `eval` Lua source. Only walk the whitelisted subset of the AST that
// KOReader actually emits in metadata.lua / annotations.lua: nested table
// constructors, string/number/boolean/nil literals, and unary minus on a
// number. Anything else throws instead of being silently guessed at.

// luaparse's default `encodingMode: "none"` discards `StringLiteral.value`
// (returns null) by design, and its other built-in modes assume a
// single-byte Latin-1 source - they raise on real Unicode text (e.g. a CJK
// book title). Decoding `.raw` ourselves sidesteps encodingMode entirely and
// works correctly on the UTF-8 JS strings we actually have.
function unescapeLuaString(raw: string): string {
  const inner = raw.slice(1, -1);
  let result = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch !== "\\") {
      result += ch;
      continue;
    }
    const next = inner[++i];
    switch (next) {
      case "n":
        result += "\n";
        break;
      case "t":
        result += "\t";
        break;
      case "r":
        result += "\r";
        break;
      case "a":
        result += "\x07";
        break;
      case "b":
        result += "\b";
        break;
      case "f":
        result += "\f";
        break;
      case "v":
        result += "\v";
        break;
      case "\\":
        result += "\\";
        break;
      case '"':
        result += '"';
        break;
      case "'":
        result += "'";
        break;
      case "\n":
        result += "\n";
        break;
      case "x": {
        const hex = inner.slice(i + 1, i + 3);
        result += String.fromCharCode(parseInt(hex, 16));
        i += 2;
        break;
      }
      default:
        if (next >= "0" && next <= "9") {
          let digits = next;
          while (digits.length < 3 && /[0-9]/.test(inner[i + 1] ?? "")) {
            digits += inner[++i];
          }
          result += String.fromCharCode(parseInt(digits, 10));
        } else {
          result += next ?? "";
        }
    }
  }
  return result;
}

function evalExpression(node: Expression): unknown {
  switch (node.type) {
    case "StringLiteral":
      return unescapeLuaString(node.raw);
    case "NumericLiteral":
      return node.value;
    case "BooleanLiteral":
      return node.value;
    case "NilLiteral":
      return null;
    case "UnaryExpression":
      if (node.operator === "-" && node.argument.type === "NumericLiteral") {
        return -node.argument.value;
      }
      throw new Error(`Unsupported Lua unary expression: ${node.operator}`);
    case "TableConstructorExpression":
      return evalTable(node);
    default:
      throw new Error(`Unsupported Lua construct: ${node.type}`);
  }
}

function evalTable(node: TableConstructorExpression): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let arrayIndex = 1;
  for (const field of node.fields) {
    if (field.type === "TableKeyString") {
      result[field.key.name] = evalExpression(field.value);
    } else if (field.type === "TableKey") {
      result[String(evalExpression(field.key))] = evalExpression(field.value);
    } else {
      result[String(arrayIndex)] = evalExpression(field.value);
      arrayIndex += 1;
    }
  }
  return result;
}

function parseLuaTable(source: string): Record<string, unknown> {
  const chunk = parse(source);
  const returnStatement = chunk.body.find(
    (statement): statement is ReturnStatement => statement.type === "ReturnStatement"
  );
  if (!returnStatement || returnStatement.arguments.length !== 1) {
    throw new Error(
      "Unsupported metadata.lua format: expected a single `return { ... }` statement"
    );
  }

  const [table] = returnStatement.arguments;
  if (table.type !== "TableConstructorExpression") {
    throw new Error("Unsupported metadata.lua format: expected the returned value to be a table");
  }

  return evalTable(table);
}

// --- KOReader-specific mapping ----------------------------------------------

function parseKoreaderDate(datetime: string): Date | null {
  const date = new Date(datetime.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseKoreaderMetadata(luaContent: string): RawHighlight[] {
  const table = parseLuaTable(luaContent);

  const annotations = table.annotations;
  if (!annotations || typeof annotations !== "object") {
    throw new Error(
      "Unsupported metadata.lua format: no 'annotations' table found (the older KOReader " +
        "'highlight'/'bookmarks' format is not supported yet)"
    );
  }

  const docProps = (table.doc_props ?? {}) as Record<string, unknown>;
  const bookTitle =
    typeof docProps.title === "string" && docProps.title ? docProps.title : "Untitled";
  const author =
    typeof docProps.authors === "string" && docProps.authors ? docProps.authors : null;
  // KOReader's own cross-file identifier: the same partial-content hash is
  // stored here and in statistics.sqlite3's `book.md5`, letting us match a
  // book's highlights to its reading stats without relying on title/author.
  const md5 =
    typeof table.partial_md5_checksum === "string" && table.partial_md5_checksum
      ? table.partial_md5_checksum
      : null;

  return Object.values(annotations as Record<string, unknown>)
    .filter((entry): entry is Record<string, unknown> => {
      if (typeof entry !== "object" || entry === null) return false;
      const e = entry as Record<string, unknown>;
      // A genuine highlight has a highlighted span, marked by a `color`.
      // Entries without one are plain notes/bookmarks at a location.
      return typeof e.color === "string" && typeof e.text === "string" && e.text.length > 0;
    })
    .map((entry) => {
      const text = entry.text as string;
      const location =
        typeof entry.pageno === "number"
          ? String(entry.pageno)
          : typeof entry.page === "string"
            ? entry.page
            : null;
      const chapter = typeof entry.chapter === "string" ? entry.chapter : null;
      const note = typeof entry.note === "string" ? entry.note : null;
      const highlightedAt =
        typeof entry.datetime === "string" ? parseKoreaderDate(entry.datetime) : null;

      return {
        bookTitle,
        author,
        source: "KOREADER" as const,
        md5,
        text,
        note,
        location,
        chapter,
        highlightedAt,
        dedupeHash: computeDedupeHash(text, location),
      };
    });
}
