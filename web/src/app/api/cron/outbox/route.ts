// GET /api/cron/outbox   (CRON_SECRET bearer auth)
//   → 200 { ok: true, claimed, delivered, retrying, dead, unhandled }
//
// The outbox's only worker. One poll takes a bounded batch under
// `FOR UPDATE SKIP LOCKED`, performs each message's handler, and settles it —
// delivered, backed off, or dead.
//
// THE SUMMARY IS THE POINT OF THE RESPONSE. `dead` and `unhandled` above zero
// are the two numbers that mean a person needs to look: a dead message is an
// effect the system gave up on, and an unhandled one is a topic whose handler
// was removed while messages for it were still in flight. Returning them
// rather than a bare `ok` is what lets the cron dashboard show a problem
// without anyone opening the database.
//
// BOUNDED BATCH, NOT DRAIN-TO-EMPTY. A worker that loops until the queue is
// empty turns one bad day into one request that runs until the platform's
// function timeout kills it mid-delivery — and mid-delivery is precisely the
// state that costs an at-least-once queue a duplicate. A fixed batch per poll
// means depth recovers over several polls, visibly, instead of one invocation
// either finishing or dying.

import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { drainOutbox } from "@/lib/outbox/drain";
import { OUTBOX_HANDLERS } from "@/lib/outbox/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH = 25;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/outbox", "CRON_SECRET not set; refusing to run");
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (token !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "no_service_role" }, { status: 503 });
  }

  const summary = await drainOutbox(admin, OUTBOX_HANDLERS, { limit: BATCH });
  return NextResponse.json({ ok: true, ...summary });
}
