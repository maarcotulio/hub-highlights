import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ingestUpload } from "@/lib/ingest";

// Ingestion endpoint for unattended clients (no browser session) — e.g. a
// future KOReader-side plugin pushing files automatically. Auth is a bearer
// token instead of the Supabase cookie session `/api/upload` uses. The file
// name travels via `?filename=` and the body is the raw file bytes (no
// multipart), since that's what a Lua HTTP client can build directly.
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { apiToken: token } });
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
