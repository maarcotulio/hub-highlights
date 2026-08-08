import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/webhook-auth";

// Called at the end of every plugin sync cycle (regardless of whether any
// file actually changed) so /dashboard/settings can show when the device
// last checked in.
export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastSyncAt: new Date() } });
  return NextResponse.json({ ok: true });
}
