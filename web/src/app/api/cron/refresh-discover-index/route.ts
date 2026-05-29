import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Scheduled job — D1.1: refresh the Discover materialized view.
 *
 * The view `talent_discover_index` denormalizes Discover catalog rows
 * (talent + primary agency + primary category + 30-day availability
 * snapshot) and is queried by `loadDiscoverTalents`. Source-data
 * writes (talent_profiles.is_discoverable, agency_talent_roster,
 * talent_availability_blocks, agencies.plan_tier) don't auto-propagate;
 * this cron job keeps the view fresh on a 15-min cadence.
 *
 * The SQL-side refresh function (`public.refresh_talent_discover_index`)
 * uses `REFRESH MATERIALIZED VIEW CONCURRENTLY`, so readers are never
 * blocked. SECURITY DEFINER means the service-role caller has enough
 * privilege without granting the underlying refresh permission widely.
 *
 * Auth: bearer-token + Vercel's cron infrastructure. Same shape as
 * /api/cron/cleanup-guest-cart.
 *
 * Configure in vercel.json:
 *   "crons": [
 *     { "path": "/api/cron/refresh-discover-index", "schedule": "* /15 * * * *" }
 *   ]
 * (15-min cadence; spec § 6 allows 15-min staleness for the catalog.)
 *
 * Companion: when Discover scales past a few hundred talents, swap
 * this for true on-event triggers on the source tables — but for
 * pre-launch the cron is plenty.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError(
      "cron/refresh-discover-index",
      "CRON_SECRET env var not set; refusing to run",
    );
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  return await Sentry.withMonitor(
    "refresh-discover-index",
    async () => {
      try {
        const startedAt = Date.now();
        const { error } = await supabase.rpc("refresh_talent_discover_index");

        if (error) {
          logServerError("cron/refresh-discover-index", error);
          return NextResponse.json(
            { ok: false, error: error.message },
            { status: 500 },
          );
        }

        // Touch the view to fetch the row count for observability.
        const { count, error: countError } = await supabase
          .from("talent_discover_index")
          .select("id", { count: "exact", head: true });

        if (countError) {
          // Refresh succeeded; count failure is non-fatal.
          logServerError("cron/refresh-discover-index.count", countError);
        }

        return NextResponse.json({
          ok: true,
          refreshedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          rowCount: count ?? null,
        });
      } catch (error) {
        logServerError("cron/refresh-discover-index", error);
        return NextResponse.json(
          {
            ok: false,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 500 },
        );
      }
    },
    {
      schedule: { type: "crontab", value: "*/15 * * * *" },
      checkinMargin: 5,
      maxRuntime: 25,
      timezone: "UTC",
    },
  );
}
