/**
 * Cron — execute self-serve account deletions whose 14-day grace has passed.
 *
 * For each due request (lib/account/deletion.ts): re-check blockers (future
 * bookings, held payouts, money on account or owed, a workspace with a team);
 * if clear, anonymize (lib/account/anonymize.ts: hides + unlists the talent
 * profile, removes roster rows, soft-deletes media so the reaper purges the
 * files, scrubs contact data, keeps bookings and payment records), then
 * deletes the auth user. Idempotent: a claimed-then-crashed run is retried
 * after an hour, and every step converges on a second pass.
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import {
  createExecutorDeps,
  executeDeletionRequest,
  listDueDeletionRequests,
} from "@/lib/account/deletion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PER_RUN = 20;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/process-account-deletions", "CRON_SECRET not set; refusing to run");
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

  const now = new Date();
  let due;
  try {
    due = await listDueDeletionRequests(admin, now, MAX_PER_RUN);
  } catch (e) {
    logServerError("cron/process-account-deletions.list", e);
    return NextResponse.json({ ok: false, error: "list failed" }, { status: 500 });
  }

  const deps = createExecutorDeps(admin);
  const tally = { due: due.length, completed: 0, blocked: 0, failed: 0, skipped: 0 };
  for (const req of due) {
    const outcome = await executeDeletionRequest(req, deps, now);
    if (outcome.kind === "completed") tally.completed += 1;
    else if (outcome.kind === "blocked") tally.blocked += 1;
    else if (outcome.kind === "failed") {
      tally.failed += 1;
      logServerError("cron/process-account-deletions.request", `${req.id}: ${outcome.error}`);
    } else tally.skipped += 1;
  }

  await improntaLog("cron.process-account-deletions", tally);
  return NextResponse.json({ ok: true, ...tally });
}
