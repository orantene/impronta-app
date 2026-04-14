import { PublicDiscoveryStateProvider } from "@/components/directory/public-discovery-state";
import { PublicHeader } from "@/components/public-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function PublicProfileLoading() {
  return (
    <PublicDiscoveryStateProvider>
      <PublicHeader />
      <main className="flex-1 bg-[var(--impronta-black)] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
            <Skeleton className="h-40 w-28 shrink-0 rounded-lg border border-[var(--impronta-gold-border)]/40" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-12 w-3/4 max-w-md" />
              <Skeleton className="h-4 w-full max-w-lg" />
            </div>
          </div>
          <Skeleton className="h-px w-full opacity-40" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] rounded-md" />
            ))}
          </div>
        </div>
      </main>
    </PublicDiscoveryStateProvider>
  );
}
