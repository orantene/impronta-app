/**
 * Talent custom-domain panel view model: the record -> what the panel renders.
 * Pure (no "use server"), so the actions file stays under its line budget and
 * the grace / purchased rules can be unit tested.
 */
import type { VercelDomainChallenge } from "@/lib/saas/custom-domain-actions";
import {
  buildCustomDomainRoutingRecords,
  type DomainRoutingRecord,
} from "@/lib/saas/custom-domain-routing";

import { isInPlanGrace, isPurchasedAcquisition } from "./talent-domain-plan-grace";
import type { TalentSiteDomainRecord } from "./talent-site-domain-core";

export type TalentSiteDomainView = {
  domain: string;
  status: TalentSiteDomainRecord["status"];
  isPrimary: boolean;
  /** How the domain was obtained; purchased hosts need no DNS steps. */
  acquisition: TalentSiteDomainRecord["acquisition"];
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
  planGraceEndsAt: string | null;
  vercelDetachedAt: string | null;
  domainDisposition: string | null;
  /** True while the 30-day restore window is open (D6). */
  inPlanGrace: boolean;
  /** Purchased + grace/detached + no disposition yet → show transfer/expire. */
  canChooseDisposition: boolean;
};

export type TalentSiteDomainActionResult =
  | {
      ok: true;
      message: string;
      domains: TalentSiteDomainView[];
      /** Present once after transfer-out; never persisted. */
      authCode?: string | null;
    }
  | { ok: false; error: string; domains?: TalentSiteDomainView[] };

const TXT_HOST_PREFIX = "_impronta-challenge";

function txtRecordHostFor(domain: string): string {
  return `${TXT_HOST_PREFIX}.${domain}`;
}

export function toView(
  row: TalentSiteDomainRecord,
  vercelChallenges: VercelDomainChallenge[] = [],
): TalentSiteDomainView {
  const isLive = row.status === "active" && !row.vercelDetachedAt && !row.planGraceStartedAt;
  const inGrace = isInPlanGrace({
    planGraceStartedAt: row.planGraceStartedAt,
    planGraceEndsAt: row.planGraceEndsAt,
    vercelDetachedAt: row.vercelDetachedAt,
  });
  // Purchased domains sit on Vercel DNS: never surface DIY TXT / routing cards.
  const purchased = isPurchasedAcquisition(row.acquisition);
  const canChooseDisposition =
    purchased &&
    Boolean(row.planGraceStartedAt) &&
    !row.domainDisposition;
  return {
    domain: row.domain,
    status: row.status,
    isPrimary: row.isPrimary,
    acquisition: row.acquisition,
    verificationToken: purchased ? null : row.verificationToken,
    failureReason: row.failureReason,
    verifiedAt: row.verifiedAt,
    sslProvisionedAt: row.sslProvisionedAt,
    lastHealthCheckAt: row.lastHealthCheckAt,
    routingRecords: purchased ? [] : buildCustomDomainRoutingRecords(row.domain),
    txtRecord:
      purchased || !row.verificationToken
        ? null
        : { host: txtRecordHostFor(row.domain), value: row.verificationToken },
    vercelChallenges: purchased ? [] : vercelChallenges,
    canBecomePrimary: !row.isPrimary && isLive,
    planGraceEndsAt: row.planGraceEndsAt,
    vercelDetachedAt: row.vercelDetachedAt,
    domainDisposition: row.domainDisposition,
    inPlanGrace: inGrace,
    canChooseDisposition,
  };
}

export function needsVercelChallengeRefresh(status: TalentSiteDomainRecord["status"]): boolean {
  return (
    status === "pending" ||
    status === "dns_verification_sent" ||
    status === "error"
  );
}
