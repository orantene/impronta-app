import { TalentDashboardPage } from "@/components/talent/talent-dashboard-primitives";
import { Skeleton } from "@/components/ui/skeleton";

export default function TalentSectionLoading() {
  return (
    <div aria-busy="true" aria-label="Loading talent workspace">
    <TalentDashboardPage className="py-1">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
        <Skeleton className="size-11 shrink-0 rounded-2xl lg:size-14 lg:rounded-3xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-52 max-w-full lg:h-6 lg:w-64" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </div>
        <Skeleton className="hidden h-9 w-36 shrink-0 rounded-xl sm:block" />
      </div>

      <div className="rounded-2xl border border-border/40 bg-muted/15 p-4 lg:p-5">
        <Skeleton className="mb-3 h-3 w-40" />
        <Skeleton className="h-2 w-full max-w-md rounded-full" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-40 rounded-2xl border border-border/40 lg:h-44" />
        <Skeleton className="h-40 rounded-2xl border border-border/40 sm:col-span-2 lg:col-span-2 lg:h-44" />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2.5 px-0.5">
          <Skeleton className="size-8 rounded-xl" />
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl border border-border/40" />
          ))}
        </div>
      </div>
    </TalentDashboardPage>
    </div>
  );
}
