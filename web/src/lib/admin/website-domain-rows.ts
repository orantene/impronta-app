/**
 * website-domain-rows.ts — pure derivations for the Website domain manager.
 *
 * WHAT THIS IS
 * ────────────
 * The client-side companion to `admin/settings/domain-actions.ts`. Everything
 * here answers one question about a REAL `agency_domains` row — what to call
 * its status, which DNS records the owner must add, which actions apply — and
 * every answer is derived from the same modules the server actions use
 * (`lib/saas/custom-domain-routing.ts`), so the UI and the verifier can never
 * disagree about what record is being checked.
 *
 * HONESTY RULES
 * ─────────────
 *   • The TXT ownership record is rendered ONLY when the registry row carries
 *     a real `verification_token`. No token, no invented record.
 *   • The TXT record is placed AT the hostname itself, because that is where
 *     `verifyCustomDomainRecord` resolves it (`resolveTxt(domain.hostname)`).
 *     This is DIFFERENT from the talent-site lane, which uses an
 *     `_impronta-challenge.` prefix with its own verifier — copying that shape
 *     here would render an instruction the agency verifier never reads.
 *   • Routing records come from `buildCustomDomainRoutingRecords`, the exact
 *     builder `syncCustomDomainProvisioning` validates against.
 *
 * No `server-only` import — runs under the plain `tsx --test` lane
 * (`test:builder-capabilities:a`).
 */

import {
  buildCustomDomainRoutingRecords,
  customDomainCanBecomePrimary,
  customDomainNeedsRouting,
  isLikelyApexCustomDomain,
  type DomainRoutingRecord,
} from "@/lib/saas/custom-domain-routing";

/** Mirrors the `agency_domains.status` enum (see WorkspaceDomainSummary). */
export type AgencyDomainRowStatus =
  | "pending"
  | "dns_verification_sent"
  | "verified"
  | "ssl_provisioned"
  | "active"
  | "failed"
  | "suspended";

export type DomainStatusTone = "success" | "amber" | "critical" | "indigo";

/**
 * Status chip copy + tone per registry status. `labelKey` resolves under
 * `dashboard.adminWebsite.domain.status.*` via `useT()`.
 */
export const DOMAIN_STATUS_META: Record<
  AgencyDomainRowStatus,
  { labelKey: string; tone: DomainStatusTone }
> = {
  pending: { labelKey: "pending", tone: "amber" },
  dns_verification_sent: { labelKey: "awaitingTxt", tone: "amber" },
  verified: { labelKey: "verifiedRouting", tone: "indigo" },
  ssl_provisioned: { labelKey: "provisioningSsl", tone: "indigo" },
  active: { labelKey: "live", tone: "success" },
  failed: { labelKey: "needsAttention", tone: "critical" },
  suspended: { labelKey: "suspended", tone: "critical" },
};

export type DomainDnsRow = { type: string; host: string; value: string };

/**
 * The DNS records the owner must add for one custom domain, split into the
 * ownership-proof TXT (step 1) and the routing record (step 2).
 *
 * TXT host: the registrar convention is `@` for a record at the zone apex and
 * the bare sub-label otherwise — the verifier resolves the full hostname, so
 * `www.acme.com` needs the TXT at host `www`, and `acme.com` at `@`.
 */
export function agencyDomainDnsRows(
  hostname: string,
  verificationToken: string | null,
): { txt: DomainDnsRow | null; routing: DomainDnsRow[] } {
  const routing: DomainDnsRow[] = buildCustomDomainRoutingRecords(hostname).map(
    (r: DomainRoutingRecord) => ({ type: r.type, host: r.host, value: r.value }),
  );
  const txt: DomainDnsRow | null = verificationToken
    ? {
        type: "TXT",
        host: isLikelyApexCustomDomain(hostname)
          ? "@"
          : routing[0]?.host ?? "@",
        value: verificationToken,
      }
    : null;
  return { txt, routing };
}

/** Row still needs its TXT ownership proof → offer "Verify now". */
export function domainNeedsTxtVerification(status: AgencyDomainRowStatus): boolean {
  return status === "pending" || status === "dns_verification_sent";
}

/** Row is verified but routing/SSL unconfirmed → offer "Check routing". */
export function domainNeedsRoutingCheck(status: AgencyDomainRowStatus): boolean {
  return customDomainNeedsRouting(status);
}

/**
 * Row can be offered "Make primary". Matches `switchPrimaryDomainAction`:
 * custom domains must be fully `active`; subdomains may always be primary.
 */
export function domainCanBecomePrimary(row: {
  kind: "subdomain" | "custom";
  status: AgencyDomainRowStatus;
  isPrimary: boolean;
}): boolean {
  if (row.isPrimary) return false;
  if (row.kind === "subdomain") return true;
  return customDomainCanBecomePrimary(row.status);
}
