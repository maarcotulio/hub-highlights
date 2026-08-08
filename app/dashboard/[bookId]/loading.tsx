import { BookDetailSkeleton } from "@/components/ui/BookDetailSkeleton";

export default function BookDetailLoading() {
  return (
    <div className="w-full max-w-4xl mx-auto px-6 py-12">
      <BookDetailSkeleton />
    </div>
  );
}
