import { Skeleton } from "@/components/ui/skeleton";

const PLACEHOLDER_COUNT = 8;

export function DirectoryGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
      {Array.from({ length: PLACEHOLDER_COUNT }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-lg border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)]"
        >
          <Skeleton className="aspect-[3/4] w-full rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DirectoryFiltersSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-16" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 3 + i }).map((_, j) => (
              <Skeleton key={j} className="h-7 w-20 rounded-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
