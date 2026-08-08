import { EmptyState } from "@/components/ui/EmptyState";
import { BackLink } from "@/components/ui/BackLink";

export default function BookNotFound() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <EmptyState
        title="Book not found"
        description="This book doesn't exist or may have been removed."
        action={
          <BackLink
            href="/dashboard"
            className="text-sm font-medium px-5 py-2.5 rounded-lg bg-accent text-accent-text hover:opacity-90"
          >
            Back to your books
          </BackLink>
        }
      />
    </div>
  );
}
