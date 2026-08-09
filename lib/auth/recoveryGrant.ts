import "server-only";
import { cookies } from "next/headers";

/**
 * A short-lived marker saying "this session was just established by redeeming a
 * recovery token", set by app/auth/confirm/actions.ts and required by
 * /reset-password.
 *
 * It is a marker of origin, not a capability. The authorisation to change the
 * password is still the Supabase session plus `secure_password_change`; what
 * this adds is that an ordinary dashboard session — a cookie lifted off a
 * shared machine, say — can't wander into /reset-password and rotate the
 * password. Being httpOnly, page script can't forge it.
 */
const COOKIE_NAME = "hub-recovery";

// Long enough to choose a password, short enough that the grant doesn't linger
// on the machine after the reset is done or abandoned.
const TTL_SEC = 15 * 60;

export async function grantRecoveryAccess() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SEC,
  });
}

export async function hasRecoveryAccess(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value === "1";
}

export async function clearRecoveryAccess() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
