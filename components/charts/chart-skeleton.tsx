import { Skeleton } from "@/components/ui/skeleton";

/** Loading placeholder for chart cards (used by Suspense boundaries). */
export function ChartSkeleton({ height = 320 }: { height?: number }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="w-full" style={{ height }} />
    </div>
  );
}
