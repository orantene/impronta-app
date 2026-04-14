import Link from "next/link";
import { redirect } from "next/navigation";
import { AnalyticsHonestyLabel } from "@/components/admin/analytics-honesty-label";
import { loadSearchQualitySummary, rangeFromKey } from "@/lib/analytics/admin-data";
import { requireStaff } from "@/lib/server/action-guards";

export default async function AdminAnalyticsSearchPage() {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  const range = rangeFromKey("30d");
  const summary = await loadSearchQualitySummary(range);
  if (!summary) redirect("/login");

  const zeroRate =
    summary.total > 0 ? Math.round((summary.zeroResults / summary.total) * 1000) / 10 : 0;
  const aiRate =
    summary.total > 0 ? Math.round((summary.withAiPath / summary.total) * 1000) / 10 : 0;
  const fbRate =
    summary.total > 0 ? Math.round((summary.withFallback / summary.total) * 1000) / 10 : 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <AnalyticsHonestyLabel variant="internal">search_queries</AnalyticsHonestyLabel>
          <span className="text-sm text-muted-foreground">
            Last 30 days · hybrid / AI diagnostics
          </span>
        </div>
        <Link
          href="/admin/ai-workspace/console"
          className="text-sm text-[var(--impronta-gold)] underline-offset-2 hover:underline"
        >
          Open AI console
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Searches logged</p>
          <p className="mt-2 font-display text-3xl font-semibold tabular-nums">{summary.total}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Zero results</p>
          <p className="mt-2 font-display text-3xl font-semibold tabular-nums">{summary.zeroResults}</p>
          <p className="mt-1 text-xs text-muted-foreground">{zeroRate}% of searches</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">With AI path</p>
          <p className="mt-2 font-display text-3xl font-semibold tabular-nums">{summary.withAiPath}</p>
          <p className="mt-1 text-xs text-muted-foreground">{aiRate}% of searches</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Fallback triggered</p>
          <p className="mt-2 font-display text-3xl font-semibold tabular-nums">{summary.withFallback}</p>
          <p className="mt-1 text-xs text-muted-foreground">{fbRate}% of searches</p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Deeper intent/filters/refine strips can join `analytics_events` once those client events are wired
        to the same session keys.
      </p>
    </div>
  );
}
