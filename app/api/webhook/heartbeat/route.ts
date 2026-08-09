import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeWebhook } from "@/lib/webhook-auth";

// Called at the end of every plugin sync cycle (regardless of whether any
// file actually changed) so /dashboard/settings can show when the device
// last checked in.
export async function POST(request: NextRequest) {
  const auth = await authorizeWebhook(request);
  if ("response" in auth) return auth.response;

  await prisma.user.update({
    where: { id: auth.user.id },
    data: { lastSyncAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
