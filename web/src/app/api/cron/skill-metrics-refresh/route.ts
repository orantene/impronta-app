import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Phase 5.1 — Nightly skill-metrics refresh.
 *
 * Calls public.refresh_talent_skill_metrics_all() which truncates and
 * rebuilds talent_skill_metrics from booking_talent + agency_bookings +
 * inquiries. Per-row triggers keep the table fresh in real time; this
 * cron is the safety net for cases the triggers cannot observe — e.g.
 * an inquiry's requested_skill_term_id being edited after a booking
 * already exists.
 *
 * Auth: shared CRON_SECRET bearer token (same convention as the other
 * cron routes in this directory). Configured in vercel.json.
 */

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const startedAt = new Date().toISOString();
  const { data, error } = await supabase.rpc(
    "refresh_talent_skill_metrics_all",
  );

  if (error) {
    logServerError("cron/skill-metrics-refresh", error);
    return NextResponse.json(
      { ok: false, error: error.message, startedAt },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    startedAt,
    completedAt: new Date().toISOString(),
    pairsWritten: typeof data === "number" ? data : null,
  });
}
