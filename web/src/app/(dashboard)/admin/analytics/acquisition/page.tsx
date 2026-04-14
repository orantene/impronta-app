import { redirect } from "next/navigation";
import { AnalyticsHonestyLabel } from "@/components/admin/analytics-honesty-label";
import {
  formatYmd,
  rangeFromKey,
} from "@/lib/analytics/admin-data";
import {
  fetchGa4ChannelSessions,
  fetchGa4Countries,
  fetchGa4DeviceCategories,
  fetchGa4LandingPages,
  fetchGa4Realtime,
} from "@/lib/server/ga4-reporting";
import { requireStaff } from "@/lib/server/action-guards";

export default async function AdminAnalyticsAcquisitionPage() {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  const range = rangeFromKey("30d");
  const start = formatYmd(range.start);
  const end = formatYmd(range.end);

  const [channels, landings, devices, countries, realtime] = await Promise.all([
    fetchGa4ChannelSessions(start, end),
    fetchGa4LandingPages(start, end),
    fetchGa4DeviceCategories(start, end),
    fetchGa4Countries(start, end),
    fetchGa4Realtime(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-2">
        <AnalyticsHonestyLabel variant="ga4">GA4 Data API</AnalyticsHonestyLabel>
        <AnalyticsHonestyLabel variant="realtime">Realtime</AnalyticsHonestyLabel>
        <span className="text-sm text-muted-foreground">
          {start} → {end} · responses cached server-side
        </span>
      </div>

      {channels.error ? (
        <p className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          {channels.error}
        </p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Active users now
          </h2>
          <p className="mt-2 font-display text-3xl font-semibold tabular-nums">{realtime.activeUsers}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/40 p-4 lg:col-span-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Device categories
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {devices.rows.map((row) => (
              <li key={row.category} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{row.category}</span>
                <span className="tabular-nums">{row.sessions}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Channel breakdown
          </h2>
          <ul className="mt-3 max-h-80 space-y-2 overflow-auto text-sm">
            {channels.rows.map((row) => (
              <li key={row.channel} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{row.channel}</span>
                <span className="tabular-nums">{row.sessions}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Countries
          </h2>
          <ul className="mt-3 max-h-80 space-y-2 overflow-auto text-sm">
            {countries.rows.map((row) => (
              <li key={row.country} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{row.country}</span>
                <span className="tabular-nums">{row.sessions}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card/40 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Landing pages
        </h2>
        <ul className="mt-3 space-y-2 text-sm">
          {landings.rows.map((row) => (
            <li key={row.page} className="flex justify-between gap-4">
              <span className="min-w-0 truncate text-muted-foreground" title={row.page}>
                {row.page}
              </span>
              <span className="shrink-0 tabular-nums">{row.views}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
