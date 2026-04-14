import { redirect } from "next/navigation";
import { AnalyticsHonestyLabel } from "@/components/admin/analytics-honesty-label";
import {
  loadFunnelEventCounts,
  rangeFromKey,
} from "@/lib/analytics/admin-data";
import { requireStaff } from "@/lib/server/action-guards";

const FUNNEL_STEPS = [
  "view_directory",
  "view_talent_card",
  "view_talent_profile",
  "start_inquiry",
  "submit_inquiry",
  "start_application",
  "submit_application",
] as const;

const STEP_LABELS: Record<(typeof FUNNEL_STEPS)[number], string> = {
  view_directory: "Directory view",
  view_talent_card: "Talent card seen",
  view_talent_profile: "Full profile view",
  start_inquiry: "Inquiry started",
  submit_inquiry: "Inquiry submitted",
  start_application: "Application started",
  submit_application: "Application submitted",
};

export default async function AdminAnalyticsFunnelsPage() {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  const range = rangeFromKey("30d");
  const counts = await loadFunnelEventCounts(range);
  if (!counts) redirect("/login");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <AnalyticsHonestyLabel variant="internal">Internal events</AnalyticsHonestyLabel>
        <span className="text-sm text-muted-foreground">Last 30 days · funnel from product instrumentation</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Step</th>
              <th className="px-4 py-3 font-medium">Events</th>
              <th className="px-4 py-3 font-medium">Vs previous step</th>
            </tr>
          </thead>
          <tbody>
            {FUNNEL_STEPS.map((k, i) => {
              const n = counts[k] ?? 0;
              const prevKey = i > 0 ? FUNNEL_STEPS[i - 1] : null;
              const prevCount = prevKey ? (counts[prevKey] ?? 0) : 0;
              const pct =
                prevKey && prevCount > 0
                  ? Math.round((n / prevCount) * 1000) / 10
                  : null;
              return (
                <tr key={k} className="border-t border-border/40">
                  <td className="px-4 py-3 text-muted-foreground">{STEP_LABELS[k]}</td>
                  <td className="px-4 py-3 tabular-nums text-foreground">{n}</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {pct === null ? "—" : `${pct}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Retention compares each step to the previous row (approximate drop-off). Refine with session-level
        funnel rows when you enable `analytics_funnel_steps` writes.
      </p>
    </div>
  );
}
