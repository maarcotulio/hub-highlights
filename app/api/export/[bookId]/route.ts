import { NextResponse, type NextRequest } from "next/server";
import { getSessionDbUser } from "@/lib/currentUser";
import { prisma } from "@/lib/db";
import { toObsidianMarkdown, toSafeFilename } from "@/lib/export/toObsidianMarkdown";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  const dbUser = await getSessionDbUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
