import type { NextRequest } from "next/server";

// A KOReader cover thumbnail is capped at 300x450 by the plugin, so a real one
// lands around 100 KB. 2 MiB is ~20x that — comfortable margin for an unusually
// large or unscaled cover, while anything past it is definitionally not a book
// cover. Deliberately the same number as `file_size_limit` on the covers bucket
// in supabase/config.toml, so there is no band that passes the route and then
// fails at Storage with a confusing 502.
export const MAX_COVER_BYTES = 2 * 1024 * 1024;

// metadata.lua files are a few KB, but statistics.sqlite3 grows with reading
// history and genuinely reaches several MB for a heavy reader, so this is set
// well above any realistic file rather than snugly around today's samples.
// Note that on Vercel the platform's own request-body cap (~4.5 MB) applies
// first; this bound is what protects a self-hosted deployment, which has none.
export const MAX_UPLOAD_BYTES = 16 * 1024 * 1024;

/**
 * Reads the request body, aborting as soon as it exceeds `maxBytes` rather
 * than buffering the whole thing first. Returns `null` when the limit is hit.
 *
 * Streaming matters here: `request.arrayBuffer()` would materialize whatever
 * the client sent before anything could check its size, so a single request
 * could exhaust the function's memory. Content-Length is only a fast path —
 * it's client-supplied and may be absent on a chunked upload or simply lie,
 * so the running total is what actually enforces the cap.
 */
export async function readLimitedBody(
  request: NextRequest,
  maxBytes: number
): Promise<ArrayBuffer | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const size = Number(declared);
    if (Number.isFinite(size) && size > maxBytes) return null;
  }

  const body = request.body;
  if (!body) return new ArrayBuffer(0);

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.byteLength < magic.length) return false;
  return magic.every((b, i) => bytes[i] === b);
}

/**
 * Identifies an image from its leading bytes, returning null for anything that
 * isn't a PNG or JPEG.
 *
 * The filename is not evidence: trusting `?filename=x.png` let a caller store
 * arbitrary bytes under an `image/png` content type, turning the public covers
 * bucket into free file hosting on the project's own supabase.co domain.
 */
export function sniffImageType(bytes: Uint8Array): "image/png" | "image/jpeg" | null {
  if (startsWith(bytes, PNG_MAGIC)) return "image/png";
  if (startsWith(bytes, JPEG_MAGIC)) return "image/jpeg";
  return null;
}
