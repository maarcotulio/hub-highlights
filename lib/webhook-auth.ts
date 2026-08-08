import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

// Shared bearer-token auth for the /api/webhook/* routes — unattended
// clients (the KOReader plugin) authenticate with `User.apiToken` instead of
// the Supabase cookie session the browser routes use.
export async function requireApiUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) return null;
  return prisma.user.findUnique({ where: { apiToken: token } });
}
