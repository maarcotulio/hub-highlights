"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validatePasswordChoice, type AuthFormState } from "@/lib/auth/credentials";
import { clearRecoveryAccess, hasRecoveryAccess } from "@/lib/auth/recoveryGrant";
import { createClient } from "@/lib/supabase/server";

export async function updatePassword(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const invalid = validatePasswordChoice(password, confirmPassword);
  if (invalid) return { error: invalid };

  // Re-checked server-side rather than trusted from the page render: a server
  // action is a public endpoint, reachable without ever loading the page whose
  // guard it sits behind.
  if (!(await hasRecoveryAccess())) {
    return { error: "Your reset link expired. Request a new one from the sign-in page." };
  }

  const supabase = await createClient();
  const { data, error: sessionError } = await supabase.auth.getUser();
  if (sessionError || !data.user) {
    return { error: "Your reset link expired. Request a new one from the sign-in page." };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    if (error.code === "same_password") {
      return { error: "That's already your password. Choose a different one." };
    }
    if (error.code === "weak_password") {
      return { error: "That password is too easy to guess. Try a longer one." };
    }
    // `secure_password_change` is on, so a session that wasn't established
    // recently can't silently rotate the password — the reset link is a fresh
    // sign-in and passes, an old dashboard cookie does not.
    if (error.code === "reauthentication_needed") {
      return { error: "For safety, sign in again before changing your password." };
    }
    console.error("Password update failed:", error);
    return { error: "We couldn't update your password. Please try again." };
  }

  // The reason to reset a password is usually that someone else has it. Leaving
  // their sessions alive would make the reset cosmetic. "others" spares the
  // session that just did the reset, so the redirect below still lands.
  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutError) {
    // The password did change, so this is not worth failing the request over —
    // but it does mean a stolen session may have survived, which is the whole
    // point of the reset.
    console.error("Password changed but other sessions may still be live:", signOutError);
  }

  // One reset per grant. Without this the marker would sit on the machine for
  // the rest of its 15 minutes, still good for another rotation.
  await clearRecoveryAccess();

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
