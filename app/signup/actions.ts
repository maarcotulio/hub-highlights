"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validateSignUp, type AuthFormState } from "@/lib/auth/credentials";
import { checkSignUpRateLimit } from "@/lib/auth/rateLimit";
import { resolveDbUser } from "@/lib/currentUser";
import { safeNextPath } from "@/lib/safeRedirect";
import { createClient } from "@/lib/supabase/server";

const ALREADY_REGISTERED = "That email already has an account. Sign in instead.";

export async function signUp(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const next = safeNextPath(formData.get("next")?.toString());

  const invalid = validateSignUp(email, password, confirmPassword);
  if (invalid) return { error: invalid };

  // Keyed on IP alone. Keying on the submitted email would let an attacker
  // trip a victim's budget and lock them out of registering, and the answer
  // worth rationing here is "is this address taken?", which they can only ask
  // one request at a time.
  const throttled = await checkSignUpRateLimit();
  if (throttled) return { error: throttled };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    // Sign-in stays deliberately generic, so this is the one place that
    // confirms an address is registered — without it the form has no usable
    // next step for someone who simply forgot they had signed up.
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return { error: ALREADY_REGISTERED };
    }
    console.error("Sign-up failed:", error);
    return { error: "We couldn't create that account. Please try again." };
  }

  // With email confirmations enabled, Supabase hides the existing-account case
  // behind a decoy user carrying no identities rather than an error.
  if (data.user && data.user.identities?.length === 0) {
    return { error: ALREADY_REGISTERED };
  }

  // A session comes back directly only because `enable_confirmations` is off.
  // If that setting is ever flipped on, the account exists but is not signed
  // in, and redirecting to the dashboard would just bounce back to /login.
  if (!data.session || !data.user) {
    return { error: "Account created. Confirm it from your email, then sign in." };
  }

  try {
    await resolveDbUser(data.user);
  } catch (err) {
    console.error("Failed to provision User row after sign-up:", err);
    return { error: "We couldn't finish setting up your account. Please try again." };
  }

  revalidatePath("/", "layout");
  // redirect() signals by throwing, so it has to stay outside the try above.
  redirect(next);
}
