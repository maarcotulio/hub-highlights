import { NextResponse, type NextRequest } from "next/server";
import { ingestUpload } from "@/lib/ingest";
import { authorizeWebhook } from "@/lib/webhook-auth";
import { MAX_UPLOAD_BYTES, readLimitedBody } from "@/lib/http/body";

// Ingestion endpoint for unattended clients (no browser session) — the
// KOReader-side plugin (plugins/hub.koplugin) pushing files automatically.
// Auth is a bearer token instead of the Supabase cookie session `/api/upload`
// uses. The file name travels via `?filename=` and the body is the raw file
// bytes (no multipart), since that's what a Lua HTTP client can build directly.
export async function POST(request: NextRequest) {
  const auth = await authorizeWebhook(request);
  if ("response" in auth) return auth.response;

  const fileName = request.nextUrl.searchParams.get("filename");
  if (!fileName) {
    return NextResponse.json({ error: "Missing ?filename=" }, { status: 400 });
  }

  // Bounded before the parsers see it: a statistics.sqlite3 is loaded whole
  // into sql.js's WASM heap, so an unbounded body is an unbounded allocation.
  const fileBuffer = await readLimitedBody(request, MAX_UPLOAD_BYTES);
  if (!fileBuffer) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_UPLOAD_BYTES / (1024 * 1024)} MiB)` },
      { status: 413 }
    );
  }

  const result = await ingestUpload(auth.user.id, fileName, fileBuffer);
  return NextResponse.json(result, { status: result.status === "error" ? 400 : 200 });
}
