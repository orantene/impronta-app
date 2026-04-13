import type { ReactNode } from "react";
import { Languages } from "lucide-react";

import { TalentPageHeader } from "@/components/talent/talent-dashboard-primitives";
import { ADMIN_PAGE_STACK } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

function SectionSkeleton({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 shadow-sm">
      <div className="border-b border-border/50 px-5 py-4">
        <div className="h-4 w-40 animate-pulse rounded bg-muted/40" />
        <div className="mt-2 h-3 w-full max-w-lg animate-pulse rounded bg-muted/30" />
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export default function AdminTranslationsLoading() {
  return (
    <div className={cn(ADMIN_PAGE_STACK, "animate-in fade-in duration-200")}>
      <TalentPageHeader
        icon={Languages}
        title="Translations"
        description="Loading translation hub…"
      />

      <SectionSkeleton>
        <div className="space-y-3">
          <div className="h-20 animate-pulse rounded-xl bg-muted/25" />
          <div className="h-14 animate-pulse rounded-xl bg-muted/20" />
        </div>
      </SectionSkeleton>

      <SectionSkeleton>
        <div className="flex flex-wrap gap-2 rounded-xl bg-muted/30 p-2 ring-1 ring-border/40">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-9 w-40 animate-pulse rounded-lg bg-muted/45" />
          ))}
        </div>
      </SectionSkeleton>

      <SectionSkeleton>
        <div className="mb-4 flex flex-wrap gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-14 w-28 animate-pulse rounded-xl bg-muted/30" />
          ))}
        </div>
      </SectionSkeleton>

      <SectionSkeleton>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[4.25rem] animate-pulse rounded-xl bg-muted/20 ring-1 ring-border/35" />
          ))}
        </div>
      </SectionSkeleton>

      <SectionSkeleton>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-muted/35" />
            ))}
          </div>
          <div className="h-24 w-full max-w-xs animate-pulse rounded-lg bg-muted/25 sm:h-20" />
        </div>
      </SectionSkeleton>

      <div className="rounded-2xl border border-border/60 bg-card/30 shadow-sm">
        <div className="flex border-b border-border/50 px-4 py-3">
          <div className="h-4 w-40 animate-pulse rounded bg-muted/35" />
        </div>
        <div className="divide-y divide-border/40 px-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-4 py-2.5">
              <div className="h-10 flex-1 animate-pulse rounded-md bg-muted/25" />
              <div className="h-8 w-24 animate-pulse rounded-md bg-muted/25" />
              <div className="h-8 w-28 animate-pulse rounded-md bg-muted/25" />
              <div className="h-8 w-28 animate-pulse rounded-md bg-muted/25" />
              <div className="h-8 w-24 animate-pulse rounded-md bg-muted/25" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
