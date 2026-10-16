/**
 * Talent custom-domain panel view model: the row-to-view mapper and its type.
 * Split out of `talent-site-domain-actions.ts` ("use server", async-only, on the
 * 800-line lint cap) so the actions file stays under the cap. Pure, no IO.
 */
import type { VercelDomainChallenge } from "@/lib/saas/custom-domain-actions";
import { buildCustomDomainRoutingRecords, type DomainRoutingRecord } from "@/lib/saas/custom-domain-routing";
import { isInPlanGrace, isPurchasedAcquisition } from "./talent-domain-plan-grace";
import type { TalentSiteDomainRecord } from "./talent-site-domain-core";

export type TalentSiteDomainView = {
  domain: string;
  status: TalentSiteDomainRecord["status"];
  isPrimary: boolean;
  verificationToken: string | null;
  failureReason: string | null;
  verifiedAt: string | null;
  sslProvisionedAt: string | null;
  lastHealthCheckAt: string | null;
  /** A/CNAME records the talent must add at their DNS host. */
  routingRecords: DomainRoutingRecord[];
  /** The TXT record the talent must add to prove ownership. */
  txtRecord: { host: string; value: string } | null;
  /**
   * Vercel project-domain challenges (TXT/CNAME) from attach/verify/GET.
   * Sourced live from the Vercel API (no DB column — keeps preview builds dark
   * without a pending migration).
   */
  vercelChallenges: VercelDomainChallenge[];
  canBecomePrimary: boolean;
  acquisition: string | null;
  planGraceEndsAt: string | null;
  vercelDetachedAt: string | null;
  domainDisposition: string | null;
  /** True while the 30-day restore window is open (D6). */
  inPlanGrace: boolean;
  /** Purchased + grace/detached + no disposition yet → show transfer/expire. */
  canChooseDisposition: boolean;
};

const TXT_HOST_PREFIX = "_impronta-challenge";

function txtRecordHostFor(domain: string): string {
  return `${TXT_HOST_PREFIX}.${domain}`;
}

export function toTalentSiteDomainView(
  row: TalentSiteDomainRecord,
  vercelChallenges: VercelDomainChallenge[] = [],
): TalentSiteDomainView {
  const isLive = row.status === "active" && !row.vercelDetachedAt && !row.planGraceStartedAt;
  const inGrace = isInPlanGrace({
    planGraceStartedAt: row.planGraceStartedAt,
    planGraceEndsAt: row.planGraceEndsAt,
    vercelDetachedAt: row.vercelDetachedAt,
  });
  const purchased = isPurchasedAcquisition(row.acquisition);
  const canChooseDisposition =
    purchased &&
    Boolean(row.planGraceStartedAt) &&
    !row.domainDisposition;
  return {
    domain: row.domain,
    status: row.status,
    isPrimary: row.isPrimary,
    verificationToken: row.verificationToken,
    failureReason: row.failureReason,
    verifiedAt: row.verifiedAt,
    sslProvisionedAt: row.sslProvisionedAt,
    lastHealthCheckAt: row.lastHealthCheckAt,
    routingRecords: buildCustomDomainRoutingRecords(row.domain),
    txtRecord: row.verificationToken
      ? { host: txtRecordHostFor(row.domain), value: row.verificationToken }
      : null,
    vercelChallenges,
    canBecomePrimary: !row.isPrimary && isLive,
    acquisition: row.acquisition,
    planGraceEndsAt: row.planGraceEndsAt,
    vercelDetachedAt: row.vercelDetachedAt,
    domainDisposition: row.domainDisposition,
    inPlanGrace: inGrace,
    canChooseDisposition,
  };
}
