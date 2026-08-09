import { safeNextPath } from "@/lib/safeRedirect";
import { SignupForm } from "./_components/SignupForm";

export default async function SignupPage({
  searchParams,
}: {
  // A repeated query param arrives as an array; safeNextPath falls back on
  // anything that isn't a plain string.
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-24">
      <SignupForm next={safeNextPath(next)} />
    </div>
  );
}
