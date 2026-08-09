import { NextResponse, type NextRequest } from "next/server";
import { getSessionDbUser } from "@/lib/currentUser";
import { prisma } from "@/lib/db";
import { BOOK_STATUS_ORDER } from "@/lib/bookStatus";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  const dbUser = await getSessionDbUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const status = body?.status;
  if (typeof status !== "string" || !BOOK_STATUS_ORDER.includes(status as never)) {
    return NextResponse.json(
      { error: `Expected { status: one of ${BOOK_STATUS_ORDER.join(", ")} }` },
      { status: 400 }
    );
  }

  const book = await prisma.book.findFirst({ where: { id: bookId, userId: dbUser.id } });
  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.book.update({
    where: { id: bookId },
    data: { status: status as "NOT_STARTED" | "READING" | "FINISHED" },
  });

  return NextResponse.json({ status: updated.status });
}
