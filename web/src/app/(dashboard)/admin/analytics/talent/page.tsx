import Link from "next/link";
import { redirect } from "next/navigation";
import { AnalyticsHonestyLabel } from "@/components/admin/analytics-honesty-label";
import { loadTalentWorkflowDistribution, loadTopSavedTalent } from "@/lib/analytics/admin-talent-data";
import { requireStaff } from "@/lib/server/action-guards";

export default async function AdminAnalyticsTalentPage() {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  const [topSaved, workflow] = await Promise.all([
    loadTopSavedTalent(12),
    loadTalentWorkflowDistribution(),
  ]);

  if (!topSaved || !workflow) redirect("/login");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-2">
        <AnalyticsHonestyLabel variant="internal">Internal exact</AnalyticsHonestyLabel>
        <span className="text-sm text-muted-foreground">
          Marketplace metrics from Supabase (not available in generic analytics tools).
        </span>
      </div>

      <section aria-labelledby="wf-heading">
        <h2 id="wf-heading" className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Workflow distribution
        </h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(workflow).map(([k, v]) => (
            <span
              key={k}
              className="rounded-full border border-border/60 bg-muted/20 px-3 py-1 text-xs text-muted-foreground"
            >
              {k}: <span className="font-medium text-foreground">{v}</span>
            </span>
          ))}
        </div>
      </section>

      <section aria-labelledby="saved-heading">
        <h2 id="saved-heading" className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Most saved talent (shortlist)
        </h2>
        <div className="overflow-hidden rounded-2xl border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Talent</th>
                <th className="px-4 py-3 font-medium">Saves</th>
              </tr>
            </thead>
            <tbody>
              {topSaved.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-muted-foreground" colSpan={2}>
                    No saved talent rows yet.
                  </td>
                </tr>
              ) : (
                topSaved.map((row) => (
                  <tr key={row.talent_profile_id} className="border-t border-border/40">
                    <td className="px-4 py-3">
                      {row.profile_code ? (
                        <Link
                          href={`/t/${encodeURIComponent(row.profile_code)}`}
                          className="text-[var(--impronta-gold)] underline-offset-2 hover:underline"
                        >
                          {row.display_name ?? row.profile_code}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{row.display_name ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{row.saves}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
