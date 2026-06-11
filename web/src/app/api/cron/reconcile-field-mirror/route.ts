/**
 * Cron — field-mirror A↔B reconcile sweep (TRANSITIONAL, T1.2b).
 *
 * Endpoint: GET /api/cron/reconcile-field-mirror  (CRON_SECRET bearer auth)
 *
 * Backstop for the FIRE-AND-FORGET legacy mirror (`@/lib/fields/legacy-mirror`):
 * every shell write dual-writes the 17 bridged keys between System A
 * (`field_values`) and System B (`talent_profile_field_values`), but mirror
 * errors are logged + swallowed, so a failed mirror leaves silent A↔B drift.
 * This sweep re-detects drift (one read-only RPC) and re-heals each drifted
 * (talent, key) by re-applying the SAME proven mirror helpers the live path
 * uses — A→B for A-only/disagree, B→A for B-only (while the legacy mirror is
 * active). Idempotent: a clean run heals 0.
 *
 * TRANSITIONAL — scaffolding for the transition window only. Phase 2.6 stops
 * the B→A mirror (set ENGINE_LEGACY_MIRROR_ACTIVE=0); Phase 3 drops System A,
 * after which this route + `@/lib/fields/reconcile-field-mirror` become a no-op
 * and should be deleted alongside `legacy-mirror.ts`.
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
