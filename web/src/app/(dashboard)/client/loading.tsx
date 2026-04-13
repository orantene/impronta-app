import { Skeleton } from "@/components/ui/skeleton";

export default function ClientSectionLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading section">
      <div className="space-y-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-32 rounded-xl border border-border/40" />
        <Skeleton className="h-32 rounded-xl border border-border/40" />
        <Skeleton className="h-32 rounded-xl border border-border/40" />
      </div>
      <Skeleton className="h-48 rounded-xl border border-border/40" />
    </div>
  );
}
