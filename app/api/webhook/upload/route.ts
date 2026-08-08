import { NextResponse, type NextRequest } from "next/server";
import { ingestUpload } from "@/lib/ingest";
import { requireApiUser } from "@/lib/webhook-auth";

// Ingestion endpoint for unattended clients (no browser session) — the
// KOReader-side plugin (plugins/hub.koplugin) pushing files automatically.
// Auth is a bearer token instead of the Supabase cookie session `/api/upload`
// uses. The file name travels via `?filename=` and the body is the raw file
// bytes (no multipart), since that's what a Lua HTTP client can build directly.
export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fileName = request.nextUrl.searchParams.get("filename");
  if (!fileName) {
    return NextResponse.json({ error: "Missing ?filename=" }, { status: 400 });
  }

  const fileBuffer = await request.arrayBuffer();
  const result = await ingestUpload(user.id, fileName, fileBuffer);
  return NextResponse.json(result, { status: result.status === "error" ? 400 : 200 });
}
