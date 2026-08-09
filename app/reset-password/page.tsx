import { redirect } from "next/navigation";
import { hasRecoveryAccess } from "@/lib/auth/recoveryGrant";
import { requireUser } from "@/lib/supabase/auth";
import { ResetPasswordForm } from "./_components/ResetPasswordForm";

/**
 * Reached only by a session that `/auth/confirm` just established from a
 * recovery link. A session alone is not enough: without the recovery grant,
 * any signed-in tab could rotate the password, which is the wrong bar for the
 * one action that locks the real owner out. Someone who is signed in and wants
 * a new password goes through "Forgot your password?" like everyone else.
 *
 * The check is repeated in the action — a page guard is navigation, not
 * authorisation.
 */
export default async function ResetPasswordPage() {
  const authUser = await requireUser();

  if (!(await hasRecoveryAccess())) {
    redirect("/forgot-password");
  }

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-24">
      <ResetPasswordForm email={authUser.email ?? ""} />
    </div>
  );
}
