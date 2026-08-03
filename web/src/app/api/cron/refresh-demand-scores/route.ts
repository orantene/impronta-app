/**
 * Cron — refresh the directory's demand scores.
 *
 * Endpoint: GET /api/cron/refresh-demand-scores  (CRON_SECRET bearer auth)
 *
 * Aggregates the last 30 days of first-party engagement per (tenant, talent)
 * and upserts it into `talent_demand_scores`, which the "Recommended" sort
 * reads. Live per-request computation could only re-order the cards already on
 * the loaded page — a talent with real demand sitting on page 3 could never
 * climb. Persisting the score lets the ranking span the whole roster.
 *
 * Idempotent: a full recompute of the window, so re-running is always safe.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/refresh-demand-scores
 */

import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { DEMAND_EVENT_WEIGHTS, DEMAND_WINDOW_DAYS } from "@/lib/directory/demand-score";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Safety valve: one night of events for a busy tenant, not the whole table. */
const SCAN_LIMIT = 200_000;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/refresh-demand-scores", "CRON_SECRET not set; refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role unavailable" }, { status: 503 });
  }

  const since = new Date(
    Date.now() - DEMAND_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await admin
    .from("analytics_events")
    .select("tenant_id, talent_id, name")
    .in("name", Object.keys(DEMAND_EVENT_WEIGHTS))
    .not("talent_id", "is", null)
    .gte("created_at", since)
    .limit(SCAN_LIMIT);

  if (error) {
    logServerError("cron/refresh-demand-scores.read", error);
    return NextResponse.json({ error: "Read failed" }, { status: 500 });
  }

  // Sum weights per (tenant, talent).
  const scores = new Map<string, { tenant: string; talent: string; score: number }>();
  for (const row of (data ?? []) as Array<{
    tenant_id: string | null;
    talent_id: string | null;
    name: string;
  }>) {
    if (!row.tenant_id || !row.talent_id) continue;
    const key = `${row.tenant_id}:${row.talent_id}`;
    const prev = scores.get(key);
    const weight = DEMAND_EVENT_WEIGHTS[row.name] ?? 0;
    if (prev) prev.score += weight;
    else
      scores.set(key, {
        tenant: row.tenant_id,
        talent: row.talent_id,
        score: weight,
      });
  }

  const rows = [...scores.values()].map((s) => ({
    tenant_id: s.tenant,
    talent_profile_id: s.talent,
    score: s.score,
    computed_at: new Date().toISOString(),
  }));

  // Clear the window first so a talent whose engagement dropped to zero stops
  // ranking on a stale score. Delete + insert (not upsert) makes the table a
  // faithful picture of the window rather than an ever-growing high-water mark.
  const { error: clearErr } = await admin
    .from("talent_demand_scores")
    .delete()
    .gte("score", 0);
  if (clearErr) {
    logServerError("cron/refresh-demand-scores.clear", clearErr);
    return NextResponse.json({ error: "Clear failed" }, { status: 500 });
  }

  if (rows.length > 0) {
    // Chunked so a large roster can't exceed the statement/payload limit.
    for (let i = 0; i < rows.length; i += 500) {
      const { error: insertErr } = await admin
        .from("talent_demand_scores")
        .insert(rows.slice(i, i + 500));
      if (insertErr) {
        logServerError("cron/refresh-demand-scores.insert", insertErr);
        return NextResponse.json({ error: "Write failed" }, { status: 500 });
      }
    }
  }

  void improntaLog("cron_refresh_demand_scores.info", {
    message: JSON.stringify({
      event: "cron_refresh_demand_scores",
      eventsScanned: data?.length ?? 0,
      pairsScored: rows.length,
      windowDays: DEMAND_WINDOW_DAYS,
    }),
  });

  return NextResponse.json({ ok: true, pairsScored: rows.length });
}
