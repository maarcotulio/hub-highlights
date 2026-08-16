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
 * Nothing here is ever resolved by email, not even a pre-migration row with a
 * null `authId`. Sign-up runs with `enable_confirmations = false`, so creating
 * an account proves nothing about owning the address — adopting a row by email
 * would hand whoever signs up first the previous owner's whole library. Under
 * the old magic-link flow the email *was* proven, which is what made the
 * adoption safe then and unsafe now.
 *
 * The cost is that a legacy row whose `authId` the migration couldn't backfill
 * becomes unreachable and its owner gets a fresh empty account. That is the
 * direction to fail in: stranded data can be reattached by hand, a handed-over
 * library cannot be taken back.
 */
export const resolveDbUser = cache(async (authUser: AuthUser) => {
  const authId = authUser.id;
  const email = authUser.email ?? "";

  // One statement owns both lookup and creation. The unique authId constraint
  // therefore remains the arbiter when two first requests arrive together.
  // Email is only a mutable copy of Auth data and never participates in the
  // ownership lookup.
  return prisma.user.upsert({
    where: { authId },
    update: email ? { email } : {},
    create: { authId, email },
  });
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
