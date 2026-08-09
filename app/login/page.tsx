import { safeNextPath } from "@/lib/safeRedirect";
import { LoginForm } from "./_components/LoginForm";

// Set by app/auth/confirm/actions.ts when a recovery link can't be redeemed.
const ERROR_MESSAGES: Record<string, string> = {
  link_expired: "That reset link expired or was already used. Request a new one.",
  account_setup_failed: "We couldn't finish setting up your account. Please try again.",
};

/**
 * Looks up a caller-supplied code without inheriting from Object.prototype.
 * A bare `ERROR_MESSAGES[code]` answers `?error=toString` with a *function*,
 * which then reaches React as a child and crashes the render — so the lookup
 * has to be own-property only, and the input has to be a string at all.
 */
function errorMessage(code: string | string[] | undefined): string | undefined {
  if (typeof code !== "string") return undefined;
  return Object.hasOwn(ERROR_MESSAGES, code) ? ERROR_MESSAGES[code] : undefined;
}

export default async function LoginPage({
  searchParams,
}: {
  // A repeated query param arrives as an array; safeNextPath falls back on
  // anything that isn't a plain string.
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const { next, error } = await searchParams;

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-24">
      <LoginForm
        next={safeNextPath(next)}
        initialError={errorMessage(error)}
      />
    </div>
  );
}
