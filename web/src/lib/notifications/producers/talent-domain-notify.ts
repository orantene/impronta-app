import "server-only";

import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Talent custom-domain health + renewal producers (Wave 1B D4).
 *
 * Platform-scoped (`tenantId: null` → Tulala brand). Audience resolves via
 * `talentProfileId` on the payload (same as trial notices). Dedupes via
 * stable `eventId` so cron re-runs collapse.
 *
 * D5 billing is intentionally out of scope — renewal notices are informational
 * only; no Stripe charge is initiated here.
 */

export async function notifyTalentDomainBroken(params: {
  talentProfileId: string;
  domainId: string;
  domain: string;
  failureReason: string | null;
}): Promise<void> {
  try {
    await dispatchEventNotifications({
      type: "talent.domain_broken",
      tenantId: null,
      eventId: `talent-domain-broken:${params.domainId}:${params.failureReason ?? "unknown"}`,
      payload: {
        talentProfileId: params.talentProfileId,
        domainId: params.domainId,
        domain: params.domain,
        failureReason: params.failureReason,
      },
    });
  } catch (err) {
    logServerError("notifyTalentDomainBroken", err);
  }
}

export async function notifyTalentDomainRenewal(params: {
  talentProfileId: string;
  domainId: string;
  domain: string;
  days: 30 | 7;
  expiresAtIso: string | null;
}): Promise<void> {
  try {
    await dispatchEventNotifications({
      type: "talent.domain_renewal_notice",
      tenantId: null,
      eventId: `talent-domain-renewal:${params.domainId}:${params.days}:${params.expiresAtIso ?? "unknown"}`,
      payload: {
        talentProfileId: params.talentProfileId,
        domainId: params.domainId,
        domain: params.domain,
        days: params.days,
        expiresAtIso: params.expiresAtIso,
      },
    });
  } catch (err) {
    logServerError("notifyTalentDomainRenewal", err);
  }
}
