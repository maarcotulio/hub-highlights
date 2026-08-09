import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeWebhook } from "@/lib/webhook-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_COVER_BYTES, readLimitedBody, sniffImageType } from "@/lib/http/body";

const COVERS_BUCKET = "covers";

// Cover-thumbnail upload for the KOReader plugin. Identifies the book by the
// same partial-md5 checksum KOReader embeds in metadata.<ext>.lua (and that
// lib/ingest.ts already stores on Book.md5) — a book with no matching md5
// yet (e.g. its metadata.lua hasn't been uploaded in this pass) 404s, which
// the plugin treats as a silent skip rather than an error.
export async function POST(request: NextRequest) {
  const auth = await authorizeWebhook(request);
  if ("response" in auth) return auth.response;
  const user = auth.user;

  const md5 = request.nextUrl.searchParams.get("md5");
  if (!md5) {
    return NextResponse.json({ error: "Missing ?md5=" }, { status: 400 });
  }

  const book = await prisma.book.findFirst({ where: { userId: user.id, md5 } });
  if (!book) {
    return NextResponse.json({ error: "No matching book" }, { status: 404 });
  }

  const body = await readLimitedBody(request, MAX_COVER_BYTES);
  if (!body) {
    return NextResponse.json(
      { error: `Cover too large (max ${MAX_COVER_BYTES / (1024 * 1024)} MiB)` },
      { status: 413 }
    );
  }

  const bytes = new Uint8Array(body);
  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }

  // The content type comes from the bytes, never from ?filename= — otherwise
  // any caller with a token could park arbitrary content in a public bucket
  // under an image/* label and serve it off the project's supabase.co domain.
  const contentType = sniffImageType(bytes);
  if (!contentType) {
    return NextResponse.json({ error: "Body is not a PNG or JPEG image" }, { status: 400 });
  }

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
