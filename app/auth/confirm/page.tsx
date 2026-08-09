import { redirect } from "next/navigation";
import { confirmRecovery } from "./actions";
import { ConfirmForm } from "./_components/ConfirmForm";

/**
 * The recovery token is redeemed behind a click, never on page load: mail
 * clients and security scanners prefetch links, and a one-time token consumed
 * by a scanner is a token the actual person can no longer use.
 *
 * `next` is deliberately not read here — confirmRecovery pins the destination.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  // A repeated query param arrives as an array, so the type has to admit one
  // even though anything but a plain string is rejected below.
  searchParams: Promise<{ token_hash?: string | string[]; type?: string | string[] }>;
}) {
  const { token_hash, type } = await searchParams;

  if (typeof token_hash !== "string" || type !== "recovery") {
    redirect("/login?error=link_expired");
  }

  const action = confirmRecovery.bind(null, token_hash);

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-24">
      <ConfirmForm action={action} />
    </div>
  );
}
