import { headers } from "next/headers";
import { requireDbUser } from "@/lib/currentUser";
import { BackLink } from "@/components/ui/BackLink";
import { formatRelativeDate } from "@/lib/readingStats";
import { AccountPanel } from "./_components/AccountPanel";
import { ApiTokenPanel } from "./_components/ApiTokenPanel";

export default async function SettingsPage() {
  const dbUser = await requireDbUser();

  // Only the hash is stored, so there is nothing here to display — the page
  // can say whether a token exists, and the user generates a new one to see a
  // plaintext value. Note this also means visiting Settings no longer mints a
  // token as a side effect of a GET.
  const hasToken = dbUser.apiTokenHash !== null;

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = headersList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const webhookUrl = `${protocol}://${host}/api/webhook/upload`;
  const lastSyncedLabel = dbUser.lastSyncAt
    ? `Last synced ${formatRelativeDate(dbUser.lastSyncAt)}`
    : "Never synced yet";

  return (
    <div className="w-full max-w-4xl mx-auto px-6 py-12">
      <BackLink href="/dashboard" className="text-sm text-text-2 inline-block mb-5">
        ← All books
      </BackLink>
      <div className="text-[26px] font-semibold mb-8">Settings</div>

      <div className="text-base font-semibold mb-1">Account</div>
      <div className="text-sm text-text-2 mb-4">Who you&apos;re signed in as.</div>
      <AccountPanel email={dbUser.email} />

      <div className="text-base font-semibold mt-10 mb-1">API access</div>
      <div className="text-sm text-text-2 mb-4">For automated uploads.</div>
      <ApiTokenPanel
        hasToken={hasToken}
        webhookUrl={webhookUrl}
        lastSyncedLabel={lastSyncedLabel}
      />
    </div>
  );
}
