"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validateSignIn, type AuthFormState } from "@/lib/auth/credentials";
import { checkSignInRateLimit } from "@/lib/auth/rateLimit";
import { resolveDbUser } from "@/lib/currentUser";
import { safeNextPath } from "@/lib/safeRedirect";
import { createClient } from "@/lib/supabase/server";

export async function signIn(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next")?.toString());

  const invalid = validateSignIn(email, password);
  if (invalid) return { error: invalid };

  // Counted before the credentials are checked, not after they fail: a budget
  // spent only on failures still lets a guesser probe at full speed until the
  // moment they succeed, which is the moment that matters.
  const throttled = await checkSignInRateLimit(email);
  if (throttled) return { error: throttled };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  // Deliberately one generic message. Distinguishing "no such account" from
  // "wrong password" turns this form into an account-enumeration oracle.
  if (error || !data.user) {
    return { error: "Email or password is incorrect." };
  }

  try {
    await resolveDbUser(data.user);
  } catch (err) {
    console.error("Failed to provision User row after sign-in:", err);
    return { error: "We couldn't finish setting up your account. Please try again." };
  }

  // The session cookie was just written; drop the cached anonymous render.
  revalidatePath("/", "layout");
  // redirect() signals by throwing, so it has to stay outside the try above.
  redirect(next);
}
