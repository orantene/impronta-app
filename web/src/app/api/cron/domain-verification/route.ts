import { NextResponse } from "next/server";
import {
  sweepPendingCustomDomainVerifications,
  sweepProvisioningCustomDomains,
} from "@/lib/saas/custom-domain-actions";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Scheduled job: custom-domain DNS verification sweep.
 *
 * Auth (audit H12): require Authorization header bearer token.
 * The `?token=` query-param fallback was removed because Vercel access logs
 * record full URLs including query strings, leaking the secret. Vercel's
 * own cron infrastructure sends `Authorization: Bearer ${CRON_SECRET}`
 * automatically when CRON_SECRET is set in project env.
 *
 * Configure in `vercel.json`:
 *
 * ```json
 * {
 *   "crons": [
 *     { "path": "/api/cron/domain-verification", "schedule": "every 10 minutes" }
 *   ]
 * }
 * ```
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError(
      "cron/domain-verification",
      "CRON_SECRET env var not set; refusing to run",
    );
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
    const [verificationReport, provisioningReport] = await Promise.all([
      sweepPendingCustomDomainVerifications(supabase),
      sweepProvisioningCustomDomains(supabase),
    ]);
    return NextResponse.json({
      ok: true,
      sweptAt: new Date().toISOString(),
      verification: verificationReport,
      provisioning: provisioningReport,
    });
  } catch (error) {
    logServerError("cron/domain-verification", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
