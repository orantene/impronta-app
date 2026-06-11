/**
 * Cron — field-mirror A↔B reconcile sweep (TRANSITIONAL, T1.2b).
 *
 * Endpoint: GET /api/cron/reconcile-field-mirror  (CRON_SECRET bearer auth)
 *
 * Backstop for the field-engine A→B bridge (`@/lib/fields/legacy-mirror`):
 * the product write paths now write System B (`talent_profile_field_values`)
 * ONLY — T2.6 step 3 removed the B→A mirror and froze System A (`field_values`).
 * This sweep re-detects A↔B drift (one read-only RPC) and heals A→B ONLY
 * (a_only/disagree rows), re-applying the same proven `mirrorWriteToCanonical`
 * helper the live path uses. b_only rows are the post-cutover steady state and
 * are reported but never written back to A. Idempotent: a clean run heals 0.
 *
 * TRANSITIONAL — scaffolding only. Phase 3 drops System A entirely, after which
 * this route + `@/lib/fields/reconcile-field-mirror` become a true no-op and
 * should be deleted alongside `legacy-mirror.ts`.
 *
 * Scheduled nightly off-peak in `web/vercel.json` (09:00 UTC ~ low traffic).
 * Safe to run more often — purely re-heals existing drift; no double-effect.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/reconcile-field-mirror
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { reconcileFieldMirror } from "@/lib/fields/reconcile-field-mirror";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/reconcile-field-mirror", "CRON_SECRET not set; refusing to run");
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

  try {
    const result = await reconcileFieldMirror(admin);
    void improntaLog("field.cron.reconcile", { ...result });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logServerError("cron/reconcile-field-mirror", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
