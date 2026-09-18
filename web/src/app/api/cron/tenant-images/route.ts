/**
 * Cron: drain the per-site image queue (Visual Asset Engine, 03 §4b).
 *
 * Endpoint: GET /api/cron/tenant-images  (CRON_SECRET bearer auth)
 * Schedule: every minute (vercel.json). Each run drains for ≤ 50 s at
 * concurrency 2, paced under the organisation's 5-images-per-minute limit;
 * a job that runs past the budget (or meets the limit) goes back to `queued`
 * with its finished slots kept, so a signup burst becomes a longer wait,
 * never a failure.
 */

import { NextResponse } from "next/server";

import { runTenantImageJobs } from "@/lib/media/tenant-image-jobs.server";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/tenant-images", "CRON_SECRET not set; refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "Service role unavailable" }, { status: 503 });

  try {
    const report = await runTenantImageJobs(admin, { budgetMs: 50_000 });
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    logServerError("cron/tenant-images", error);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
