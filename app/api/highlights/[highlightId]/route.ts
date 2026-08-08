import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ highlightId: string }> }
) {
  const { highlightId } = await params;
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
  const rawTags = body?.tags;
  if (!Array.isArray(rawTags) || !rawTags.every((t: unknown) => typeof t === "string")) {
    return NextResponse.json({ error: "Expected { tags: string[] }" }, { status: 400 });
  }

  // The userId filter (via the book relation) is the authorization check —
  // a mismatch and a missing highlight both correctly 404.
  const highlight = await prisma.highlight.findFirst({
    where: { id: highlightId, book: { userId: dbUser.id } },
  });
  if (!highlight) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tags = [...new Set(rawTags.map((t) => t.trim()).filter(Boolean))];

  const updated = await prisma.highlight.update({
    where: { id: highlightId },
    data: { tags },
  });

  return NextResponse.json({ tags: updated.tags });
}
