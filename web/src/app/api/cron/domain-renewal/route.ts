import { NextResponse } from "next/server";

import { logServerError } from "@/lib/server/safe-error";
import { runDomainRenewalSweep } from "@/lib/stripe/talent-domain-renewal";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * Scheduled job (daily): renewal billing for domains bought through Tulala (D5, TUL-526).
 * Reads each purchased domain's expiry from the registrar, charges the talent at cost before the
 * renewal, and turns auto-renew off at the registrar if it is still unpaid at the deadline.
 * Ships dark: without the registrar token it reports `registrar_not_configured` and does nothing.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` only (no query-string token; see domain-verification).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/domain-renewal", "CRON_SECRET env var not set; refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Not configured" }, { status: 500 });
  try {
    const report = await runDomainRenewalSweep(supabase);
    return NextResponse.json({ ok: true, sweptAt: new Date().toISOString(), report });
  } catch (error) {
    logServerError("cron/domain-renewal", error);
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}
