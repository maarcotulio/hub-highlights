import JSZip from "jszip";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { toObsidianMarkdown, toSafeFilename } from "@/lib/export/toObsidianMarkdown";

export async function GET() {
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

  const books = await prisma.book.findMany({
    where: { userId: dbUser.id },
    include: { highlights: { orderBy: { highlightedAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  const zip = new JSZip();
  const usedNames = new Map<string, number>();
  for (const book of books) {
    const base = toSafeFilename(book.title);
    const count = usedNames.get(base) ?? 0;
    usedNames.set(base, count + 1);
    const filename = count === 0 ? `${base}.md` : `${base}-${count + 1}.md`;
    zip.file(filename, toObsidianMarkdown(book));
  }

  const archive = await zip.generateAsync({ type: "arraybuffer" });

  return new NextResponse(archive, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="highlights-hub-export.zip"',
    },
  });
}
