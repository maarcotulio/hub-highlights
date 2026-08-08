import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/webhook-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const COVERS_BUCKET = "covers";

function contentTypeFor(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "image/png";
}

// Cover-thumbnail upload for the KOReader plugin. Identifies the book by the
// same partial-md5 checksum KOReader embeds in metadata.<ext>.lua (and that
// lib/ingest.ts already stores on Book.md5) — a book with no matching md5
// yet (e.g. its metadata.lua hasn't been uploaded in this pass) 404s, which
// the plugin treats as a silent skip rather than an error.
export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const md5 = request.nextUrl.searchParams.get("md5");
  const fileName = request.nextUrl.searchParams.get("filename") ?? "cover.png";
  if (!md5) {
    return NextResponse.json({ error: "Missing ?md5=" }, { status: 400 });
  }

  const book = await prisma.book.findFirst({ where: { userId: user.id, md5 } });
  if (!book) {
    return NextResponse.json({ error: "No matching book" }, { status: 404 });
  }

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }

  const contentType = contentTypeFor(fileName);
  const objectPath = `${user.id}/${book.id}${contentType === "image/jpeg" ? ".jpg" : ".png"}`;

  const supabase = createAdminClient();
  const { error: uploadError } = await supabase.storage
    .from(COVERS_BUCKET)
    .upload(objectPath, bytes, { contentType, upsert: true });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 502 });
  }

  const { data } = supabase.storage.from(COVERS_BUCKET).getPublicUrl(objectPath);
  // Cache-bust so the dashboard picks up a re-uploaded cover for the same book.
  const coverUrl = `${data.publicUrl}?v=${Date.now()}`;

  await prisma.book.update({ where: { id: book.id }, data: { coverUrl } });
  return NextResponse.json({ ok: true, coverUrl });
}
