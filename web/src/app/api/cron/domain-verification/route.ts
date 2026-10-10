import { NextResponse } from "next/server";
import {
  sweepPendingCustomDomainVerifications,
  sweepProvisioningCustomDomains,
} from "@/lib/saas/custom-domain-actions";
import {
  sweepActiveTalentSiteDomainHealth,
  sweepPendingTalentSiteDomainVerifications,
  sweepProvisioningTalentSiteDomains,
  sweepTalentSiteDomainRenewals,
} from "@/lib/talent-site/server/talent-site-domain-cron";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Scheduled job: custom-domain DNS verification + talent health/renewal sweep.
 *
 * Agency path (unchanged): pending TXT + provisioning for `agency_domains`.
 * Talent path (Wave 1B D4): pending advance, provisioning, daily active
 * DNS+HTTPS health (existing failure_reason + en/es notify), live registrar
 * expiry lookup + 30/7 renewal notices (dispatch eventId dedupe). No new
 * migration — prebuild blocks unapplied SQL (same as #3208). D5 billing off.
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
    const [
      verificationReport,
      provisioningReport,
      talentVerification,
      talentProvisioning,
      talentHealth,
      talentRenewal,
    ] = await Promise.all([
      sweepPendingCustomDomainVerifications(supabase),
      sweepProvisioningCustomDomains(supabase),
      sweepPendingTalentSiteDomainVerifications(supabase),
      sweepProvisioningTalentSiteDomains(supabase),
      sweepActiveTalentSiteDomainHealth(supabase),
      sweepTalentSiteDomainRenewals(supabase),
    ]);
    return NextResponse.json({
      ok: true,
      sweptAt: new Date().toISOString(),
      verification: verificationReport,
      provisioning: provisioningReport,
      talent: {
        verification: talentVerification,
        provisioning: talentProvisioning,
        health: talentHealth,
        renewal: talentRenewal,
      },
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
