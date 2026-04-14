import { redirect } from "next/navigation";
import { AnalyticsHonestyLabel } from "@/components/admin/analytics-honesty-label";
import {
  formatYmd,
  rangeFromKey,
} from "@/lib/analytics/admin-data";
import { fetchGscPages, fetchGscQueries } from "@/lib/server/gsc-reporting";
import { requireStaff } from "@/lib/server/action-guards";

export default async function AdminAnalyticsSeoPage() {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  const range = rangeFromKey("30d");
  const start = formatYmd(range.start);
  const end = formatYmd(range.end);

  const [queries, pages] = await Promise.all([
    fetchGscQueries(start, end),
    fetchGscPages(start, end),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-2">
        <AnalyticsHonestyLabel variant="gsc">Search Console</AnalyticsHonestyLabel>
        <span className="text-sm text-muted-foreground">
          {start} → {end} · cached server-side · requires GSC API credentials
        </span>
      </div>

      {queries.error ? (
        <p className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          {queries.error}
        </p>
      ) : null}
      {pages.error ? (
        <p className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          {pages.error}
        </p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Top queries
          </h2>
          <ul className="mt-3 max-h-96 space-y-2 overflow-auto text-sm">
            {queries.rows.map((row) => (
              <li key={row.query} className="flex flex-col gap-0.5 border-b border-border/30 pb-2 last:border-0">
                <span className="text-foreground">{row.query}</span>
                <span className="text-xs text-muted-foreground">
                  clicks {row.clicks} · impr. {row.impressions} · CTR {(row.ctr * 100).toFixed(1)}% · pos{" "}
                  {row.position.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Top landing pages (organic)
          </h2>
          <ul className="mt-3 max-h-96 space-y-2 overflow-auto text-sm">
            {pages.rows.map((row) => (
              <li key={row.page} className="flex flex-col gap-0.5 border-b border-border/30 pb-2 last:border-0">
                <span className="break-all text-foreground">{row.page}</span>
                <span className="text-xs text-muted-foreground">
                  clicks {row.clicks} · impr. {row.impressions} · CTR {(row.ctr * 100).toFixed(1)}% · pos{" "}
                  {row.position.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Classify “branded vs non-branded” and “page type” in a follow-up by matching URL patterns against
        your public routes.
      </p>
    </div>
  );
}
