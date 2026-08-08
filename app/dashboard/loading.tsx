import { BookListSkeleton } from "@/components/ui/BookListSkeleton";

export default function DashboardLoading() {
  return (
    <div className="w-full max-w-4xl mx-auto px-6 py-12">
      <BookListSkeleton />
    </div>
  );
}
