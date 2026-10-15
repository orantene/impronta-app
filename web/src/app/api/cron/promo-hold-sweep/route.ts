import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
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
  return NextResponse.json({ ok: true, released: result.released ?? 0 });
}
