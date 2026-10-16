import { NextResponse } from "next/server";

import { sweepTalentDomainPlanGrace } from "@/lib/talent-site/server/talent-domain-plan-grace";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * WAVE 1B D6 — after Web Office grace ends: detach talent custom domains from
 * Vercel, keep auto-renew off on purchased domains, notify transfer/expire.
 *
 * Dark when VERCEL_* env is missing (detach/auto-renew skip; retry next run).
 * Auth: Authorization Bearer CRON_SECRET (no query-token fallback).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/talent-domain-grace", "CRON_SECRET env var not set; refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  try {
    const report = await sweepTalentDomainPlanGrace(supabase);
    return NextResponse.json({
      ok: true,
      sweptAt: new Date().toISOString(),
      grace: report,
    });
  } catch (error) {
    logServerError("cron/talent-domain-grace", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
