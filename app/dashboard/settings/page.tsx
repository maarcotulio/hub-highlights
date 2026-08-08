import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { requireUser } from "@/lib/supabase/auth";
import { prisma } from "@/lib/db";
import { BackLink } from "@/components/ui/BackLink";
import { formatRelativeDate } from "@/lib/readingStats";
import { ApiTokenPanel } from "./_components/ApiTokenPanel";

export default async function SettingsPage() {
  const user = await requireUser();
  const dbUser = await prisma.user.upsert({
    where: { email: user.email! },
    update: {},
    create: { email: user.email! },
  });

  let apiToken = dbUser.apiToken;
  if (!apiToken) {
    apiToken = randomBytes(24).toString("hex");
    await prisma.user.update({ where: { id: dbUser.id }, data: { apiToken } });
  }

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
      <div className="text-[26px] font-semibold mb-1">Settings</div>
      <div className="text-sm text-text-2 mb-8">API access for automated uploads.</div>
      <ApiTokenPanel token={apiToken} webhookUrl={webhookUrl} lastSyncedLabel={lastSyncedLabel} />
    </div>
  );
}
