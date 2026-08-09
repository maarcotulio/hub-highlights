import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/safeRedirect";
import { confirmSignIn } from "./actions";
import { ConfirmForm } from "./_components/ConfirmForm";

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash, type, next } = await searchParams;

  if (!token_hash || !type) {
    redirect("/login?error=link_expired");
  }

  const action = confirmSignIn.bind(
    null,
    token_hash,
    type as EmailOtpType,
    safeNextPath(next)
  );

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-24">
      <ConfirmForm action={action} />
    </div>
  );
}
