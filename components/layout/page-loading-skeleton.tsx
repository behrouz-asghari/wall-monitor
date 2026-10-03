import { Skeleton } from "@/components/ui/skeleton";

/** Page-level skeleton shown while a dashboard route streams in. */
export function PageLoadingSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="در حال بارگذاری">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-[96px]" />
        ))}
      </div>
      <Skeleton className="h-[320px] w-full" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
      <span className="sr-only">در حال بارگذاری…</span>
    </div>
  );
}
