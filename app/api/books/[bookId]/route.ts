import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { BOOK_STATUS_ORDER } from "@/lib/bookStatus";

export async function PATCH(
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
