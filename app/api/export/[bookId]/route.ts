import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { toObsidianMarkdown, toSafeFilename } from "@/lib/export/toObsidianMarkdown";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
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

  // The userId filter is the authorization check, not just "is someone logged
  // in" — a mismatch and a missing book both correctly 404.
  const book = await prisma.book.findFirst({
    where: { id: bookId, userId: dbUser.id },
    include: { highlights: { orderBy: { highlightedAt: "asc" } } },
  });
  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const markdown = toObsidianMarkdown(book);

  return new NextResponse(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${toSafeFilename(book.title)}.md"`,
    },
  });
}
