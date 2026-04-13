import Link from "next/link";
import { Images } from "lucide-react";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { Button } from "@/components/ui/button";
import type { AdminPendingMediaRow } from "@/lib/dashboard/admin-dashboard-data";
import { cn } from "@/lib/utils";

export function AdminApprovedMediaLibrary({ rows }: { rows: AdminPendingMediaRow[] }) {
  if (rows.length === 0) {
    return (
      <DashboardEmptyState
        title="No approved assets in this feed yet"
        description="Approved uploads appear here for a quick browse. Open any talent to reorder, set primary, or manage the full gallery."
        icon={<Images className="size-6" aria-hidden />}
        className="border-border/50 bg-muted/[0.03]"
      />
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <li
          key={row.id}
          className={cn(
            "flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/30 shadow-sm",
            "transition-[border-color,box-shadow] duration-200 hover:border-[var(--impronta-gold-border)]/50 hover:shadow-md",
          )}
        >
          <div className="relative aspect-[4/3] bg-muted/25">
            {row.publicUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.publicUrl}
                alt={row.talent?.display_name ?? "Approved media"}
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
                Preview unavailable
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-medium tracking-wide text-foreground">
                {row.talent?.display_name ?? row.talent?.profile_code ?? "Talent"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {row.talent?.profile_code ?? "—"} · {row.variant_kind}
              </p>
            </div>
            <Button size="sm" variant="secondary" className="mt-auto w-full rounded-xl" asChild>
              <Link href={`/admin/talent/${row.owner_talent_profile_id}/media`} scroll={false}>
                Open talent media
              </Link>
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
