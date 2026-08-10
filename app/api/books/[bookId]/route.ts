import { NextResponse, type NextRequest } from "next/server";
import { getSessionDbUser } from "@/lib/currentUser";
import { prisma } from "@/lib/db";
import { BOOK_STATUS_ORDER, type BookStatus } from "@/lib/bookStatus";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  const dbUser = await getSessionDbUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Expected an object containing status or archived" },
      { status: 400 }
    );
  }

  const payload = body as { status?: unknown; archived?: unknown };
  const hasStatus = Object.prototype.hasOwnProperty.call(payload, "status");
  const hasArchived = Object.prototype.hasOwnProperty.call(payload, "archived");
  if (hasStatus === hasArchived) {
    return NextResponse.json(
      { error: "Expected exactly one of status or archived" },
      { status: 400 }
    );
  }

  const book = await prisma.book.findFirst({ where: { id: bookId, userId: dbUser.id } });
  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (hasStatus) {
    const status = payload.status;
    if (typeof status !== "string" || !BOOK_STATUS_ORDER.includes(status as BookStatus)) {
      return NextResponse.json(
        { error: `Expected { status: one of ${BOOK_STATUS_ORDER.join(", ")} }` },
        { status: 400 }
      );
    }

    const updated = await prisma.book.update({
      where: { id: book.id },
      data: { status: status as BookStatus },
    });
    return NextResponse.json({ status: updated.status });
  }

  if (typeof payload.archived !== "boolean") {
    return NextResponse.json({ error: "Expected archived to be a boolean" }, { status: 400 });
  }

  const updated = await prisma.book.update({
    where: { id: book.id },
    data: { archivedAt: payload.archived ? new Date() : null },
    select: { archivedAt: true },
  });

  return NextResponse.json({
    archived: updated.archivedAt !== null,
    archivedAt: updated.archivedAt,
  });
}
