import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { parseKoreaderMetadata } from "@/lib/parsers/koreader-lua";
import type { RawHighlight } from "@/lib/parsers/normalize";
import type { UploadResult } from "@/lib/upload";

function groupByBook(highlights: RawHighlight[]) {
  const groups = new Map<string, { bookTitle: string; author: string | null; highlights: RawHighlight[] }>();
  for (const h of highlights) {
    const key = `${h.bookTitle}\0${h.author ?? ""}`;
    const group = groups.get(key);
    if (group) {
      group.highlights.push(h);
    } else {
      groups.set(key, { bookTitle: h.bookTitle, author: h.author, highlights: [h] });
    }
  }
  return [...groups.values()];
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await prisma.user.upsert({
    where: { email: data.user.email },
    update: {},
    create: { email: data.user.email },
  });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const fileName = file.name;

  if (fileName.toLowerCase().endsWith(".sqlite3")) {
    const result: UploadResult = {
      status: "error",
      reason: "unsupported",
      fileName,
    };
    return NextResponse.json(result, { status: 400 });
  }

  if (!fileName.toLowerCase().endsWith(".lua")) {
    const result: UploadResult = {
      status: "error",
      reason: "unsupported",
      fileName,
    };
    return NextResponse.json(result, { status: 400 });
  }

  let highlights: RawHighlight[];
  try {
    const text = await file.text();
    highlights = parseKoreaderMetadata(text);
  } catch {
    const result: UploadResult = { status: "error", reason: "corrupt", fileName };
    return NextResponse.json(result, { status: 400 });
  }

  let totalImported = 0;
  let totalSkipped = 0;

  for (const group of groupByBook(highlights)) {
    // Prisma's compound-unique selector for `[userId, title, author, source]`
    // doesn't accept a nullable `author` (NULL isn't equal to NULL in SQL, so
    // exact-match composite lookups can't use it) — find-then-create instead.
    const book =
      (await prisma.book.findFirst({
        where: {
          userId: dbUser.id,
          title: group.bookTitle,
          author: group.author,
          source: "KOREADER",
        },
      })) ??
      (await prisma.book.create({
        data: {
          userId: dbUser.id,
          title: group.bookTitle,
          author: group.author,
          source: "KOREADER",
        },
      }));

    const { count } = await prisma.highlight.createMany({
      data: group.highlights.map((h) => ({
        bookId: book.id,
        text: h.text,
        note: h.note,
        location: h.location,
        chapter: h.chapter,
        highlightedAt: h.highlightedAt,
        dedupeHash: h.dedupeHash,
      })),
      skipDuplicates: true,
    });

    totalImported += count;
    totalSkipped += group.highlights.length - count;
  }

  const result: UploadResult = {
    status: "success",
    imported: totalImported,
    skipped: totalSkipped,
    fileName,
  };
  return NextResponse.json(result);
}
