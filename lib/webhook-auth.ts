import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hashApiToken } from "@/lib/apiToken";
import { rateLimit, WEBHOOK_LIMIT, WEBHOOK_WINDOW_SEC } from "@/lib/http/rateLimit";

// Shared bearer-token auth for the /api/webhook/* routes — unattended
// clients (the KOReader plugin) authenticate with the API token instead of
// the Supabase cookie session the browser routes use. Only the sha256 of the
// token is stored, so what's in the database can't be replayed against these
// endpoints.
export async function requireApiUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  return prisma.user.findUnique({ where: { apiTokenHash: hashApiToken(token) } });
}

/**
 * Authenticates the caller and applies the per-token rate limit, returning
 * either the user or the response to send back. Callers get one branch to
 * handle instead of repeating both checks in every webhook route.
 */
export async function authorizeWebhook(
  request: NextRequest
): Promise<{ user: NonNullable<Awaited<ReturnType<typeof requireApiUser>>> } | { response: NextResponse }> {
  const user = await requireApiUser(request);
  if (!user) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const limit = rateLimit(`webhook:${user.id}`, WEBHOOK_LIMIT, WEBHOOK_WINDOW_SEC);
  if (!limit.ok) {
    return {
      response: NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
      ),
    };
  }

  return { user };
}
