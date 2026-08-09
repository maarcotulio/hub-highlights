/**
 * Credential validation shared by the auth server actions and the forms that
 * feed them. Both sides import the same functions so the client-side check and
 * the authoritative server-side check cannot drift apart.
 */

export const MIN_PASSWORD_LENGTH = 8;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Return value of every auth server action: an error to show, or nothing. */
export type AuthFormState = { error?: string };

export function validateEmail(email: string): string | null {
  if (!email) return "Enter your email address.";
  if (!EMAIL_RE.test(email)) return "That doesn't look like a valid email address.";
  return null;
}

/**
 * Sign-in only checks that the fields are filled in. The length policy governs
 * passwords being *set* — applying it here would reject accounts created under
 * an older policy while telling the caller nothing they can act on.
 */
export function validateSignIn(email: string, password: string): string | null {
  const emailError = validateEmail(email);
  if (emailError) return emailError;
  if (!password) return "Enter your password.";
  return null;
}

/**
 * The rules for a password being *set* — at sign-up and at reset alike, so the
 * two can't drift apart.
 *
 * `MIN_PASSWORD_LENGTH` must stay in step with `auth.minimum_password_length`
 * in supabase/config.toml (and the same setting in the hosted project), or the
 * form accepts a password that Supabase then rejects.
 */
export function validatePasswordChoice(
  password: string,
  confirmPassword: string
): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`;
  }
  if (password !== confirmPassword) return "Those passwords don't match.";
  return null;
}

export function validateSignUp(
  email: string,
  password: string,
  confirmPassword: string
): string | null {
  return validateEmail(email) ?? validatePasswordChoice(password, confirmPassword);
}
