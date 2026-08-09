"use server";

import { validateEmail, type AuthFormState } from "@/lib/auth/credentials";
import { checkPasswordResetRateLimit } from "@/lib/auth/rateLimit";
import { createClient } from "@/lib/supabase/server";

export type ForgotPasswordState = AuthFormState & { sent?: boolean };

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();

  const invalid = validateEmail(email);
  if (invalid) return { error: invalid };

  // Reported as a throttle rather than swallowed into the "check your email"
  // screen. It reveals nothing — the budget is keyed on the address that was
  // typed, whether or not it has an account — and silence here would leave
  // someone waiting on mail that was never going to arrive.
  const throttled = await checkPasswordResetRateLimit(email);
  if (throttled) return { error: throttled };

  const supabase = await createClient();

  // The link itself is built by supabase/templates/recovery.html from
  // `{{ .SiteURL }}` and `{{ .TokenHash }}`, so no `redirectTo` is passed here
  // — nothing has to be kept in step with the redirect allow-list.
  const { error } = await supabase.auth.resetPasswordForEmail(email);

  if (error) {
    // Rate limiting is the one failure worth naming: silently claiming the mail
    // was sent would leave the user waiting for something that never arrives.
    if (error.code === "over_email_send_rate_limit") {
      return { error: "Too many reset emails just went out. Wait a bit and try again." };
    }
    // Everything else — including "no such user" — is swallowed on purpose.
    // The response must not reveal whether the address has an account.
    console.error("Password reset request failed:", error);
  }

  return { sent: true };
}
