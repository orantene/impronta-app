import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { sweepStaleShowOnSite, type SweepDb } from "@/lib/promos/hygiene/sweep";
import { sweepExpiredHolds } from "@/lib/promos/redemption/service";

/**
 * Scheduled job: expired promo holds -> released (TUL-941).
 *
 * Seat counts already ignore expired holds, so a late or missed run never
 * blocks a client. This keeps the table honest for reports and the talent's
 * "uses 1 of your 3 spots" view.
 *
 * Manual test:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/promo-hold-sweep
 *
 * Not yet in `vercel.json` (registered separately). Suggested: every 5 min.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/promo-hold-sweep", "CRON_SECRET env var not set; refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const result = await sweepExpiredHolds(supabase);
  if (!result.ok) {
    logServerError("cron/promo-hold-sweep", result.reason ?? "sweep failed");
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
  // Step 2 (best effort): clear the stale show_on_site flag on promos that
  // ended by date or were archived. Never affects the hold sweep result.
  const hygiene = await sweepStaleShowOnSite(supabase as unknown as SweepDb, new Date(), undefined, (m) =>
    logServerError("cron/promo-hold-sweep/show-on-site", m),
  );
  return NextResponse.json({
    ok: true,
    released: result.released ?? 0,
    showOnSiteCleared: hygiene.cleared,
    showOnSiteFailed: hygiene.failed,
  });
}
