import "server-only";
import { cache } from "react";
import type { User as AuthUser } from "@supabase/supabase-js";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";

/**
 * Maps a Supabase Auth identity onto our own `User` row.
 *
 * Keyed on `authId` (the auth `sub`), never on the email: an address is
 * mutable and re-registrable, so keying on it means a user who changes their
 * email silently gets an empty account, and whoever later claims a released
 * address inherits the previous owner's library.
 *
 * A row with no `authId` is a pre-migration row, adopted by email exactly
 * once. A row whose `authId` is already set to *someone else* is never
 * adopted, no matter how the emails compare — that is precisely the
 * recycled-address case, and the correct outcome is a fresh empty account.
 */
export const resolveDbUser = cache(async (authUser: AuthUser) => {
  const authId = authUser.id;
  const email = authUser.email ?? "";

  const byAuthId = await prisma.user.findUnique({ where: { authId } });
  if (byAuthId) {
    // Keep the denormalized email in step with Auth, which is the source of
    // truth for it. Identity is unaffected either way.
    if (email && byAuthId.email !== email) {
      return prisma.user.update({ where: { id: byAuthId.id }, data: { email } });
    }
    return byAuthId;
  }

  if (email) {
    const unclaimed = await prisma.user.findFirst({ where: { email, authId: null } });
    if (unclaimed) {
      return prisma.user.update({ where: { id: unclaimed.id }, data: { authId } });
    }
  }

  return prisma.user.create({ data: { authId, email } });
});

/**
 * Page/server-component helper: resolves the signed-in user's `User` row,
 * redirecting to /login when there is no session.
 */
export async function requireDbUser() {
  return resolveDbUser(await requireUser());
}

/**
 * Route-handler helper: same resolution, but returns `null` instead of
 * redirecting so the caller can answer 401.
 */
export async function getSessionDbUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return resolveDbUser(data.user);
}
