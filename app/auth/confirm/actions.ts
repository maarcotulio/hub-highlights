"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { grantRecoveryAccess } from "@/lib/auth/recoveryGrant";
import { resolveDbUser } from "@/lib/currentUser";
import { createClient } from "@/lib/supabase/server";

/**
 * Redeems a password-recovery token. `type` is pinned to "recovery" here rather
 * than read from the URL: recovery is the only email this app sends, and taking
 * the OTP type from a caller-supplied query param hands an attacker a choice of
 * verification flows for a token they got hold of.
 *
 * The destination is pinned for the same reason. A redeemed recovery token only
 * ever leads to /reset-password, so there is nothing for a `?next=` to express
 * — and honouring one would make this the one open-redirect sink an attacker
 * could reach *with a valid token in hand*.
 */
export async function confirmRecovery(tokenHash: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    type: "recovery",
    token_hash: tokenHash,
  });

  if (error || !data.user) {
    redirect("/login?error=link_expired");
  }

  try {
    await resolveDbUser(data.user);
  } catch (err) {
    console.error("Failed to provision User row after recovery:", err);
    redirect("/login?error=account_setup_failed");
  }

  // Marks this session as recovery-established, which is what /reset-password
  // requires. Set before the redirect, since redirect() signals by throwing.
  await grantRecoveryAccess();

  revalidatePath("/", "layout");
  redirect("/reset-password");
}
