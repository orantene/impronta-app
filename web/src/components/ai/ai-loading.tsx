"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type AILoadingStateProps = {
  className?: string;
  /** "dots" for typing-indicator feel; "shimmer" for blocks */
  mode?: "shimmer" | "dots";
};

export function AILoadingState({
  className,
  mode = "shimmer",
}: AILoadingStateProps) {
  if (mode === "dots") {
    return (
      <div
        className={cn("flex items-center gap-1 py-2", className)}
        role="status"
        aria-label="Loading"
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-pulse rounded-full bg-primary/50"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2 py-1", className)} role="status" aria-label="Loading">
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}
