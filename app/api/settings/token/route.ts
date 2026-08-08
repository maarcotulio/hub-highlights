import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";

export async function POST() {
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

  const updated = await prisma.user.update({
    where: { id: dbUser.id },
    data: { apiToken: randomBytes(24).toString("hex") },
  });

  return NextResponse.json({ apiToken: updated.apiToken });
}
