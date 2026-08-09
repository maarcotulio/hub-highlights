import { NextResponse } from "next/server";
import { getSessionDbUser } from "@/lib/currentUser";
import { prisma } from "@/lib/db";
import { generateApiToken, hashApiToken } from "@/lib/apiToken";

// Issues a new API token, replacing any previous one (so this doubles as
// revocation). Only the hash is persisted, which means this response is the
// one and only time the plaintext exists outside the user's device — the
// settings page can no longer redisplay it, by design.
export async function POST() {
  const dbUser = await getSessionDbUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiToken = generateApiToken();
  await prisma.user.update({
    where: { id: dbUser.id },
    data: { apiTokenHash: hashApiToken(apiToken) },
  });

  return NextResponse.json({ apiToken });
}
