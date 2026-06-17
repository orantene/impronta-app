import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveTxt } from "node:dns/promises";

import {
  DOMAIN_VERIFICATION_WINDOW_MS,
  flattenTxtRecords,
  inspectCustomDomainProvisioning,
  resolveDomainProvisioningTransition,
  resolveDomainVerificationTransition,
  type DomainProvisioningTransition,
  type DomainVerificationTransition,
} from "@/lib/saas/custom-domain-actions";

/**
 * Talent Max-site custom domains — DB lifecycle layer.
 *
 * The agency custom-domain stack (`lib/saas/custom-domain-actions.ts`) owns the
 * Vercel API client, the DNS routing-record helpers, and the PURE lifecycle
 * functions (`resolveDomainVerificationTransition`,
 * `inspectCustomDomainProvisioning`, `resolveDomainProvisioningTransition`).
 * Those are all table-agnostic, so this module REUSES them verbatim — it only
 * adds the `talent_site_domains` persistence wrapper.
 *
 * Two deltas from `agency_domains`:
 *   1. column `domain` (not `hostname`).
 *   2. the failure status is `error` (the table CHECK constraint has no
 *      `failed`/`suspended`); the pure functions return `"failed"`, so we map
 *      `failed → error` on write.
 *
 * Every write is performed with the CALLER's user-scoped Supabase client, so
 * the `talent_site_domains` RLS (owner + Max) is the authorization backstop.
 */

export type TalentSiteDomainStatus =
  | "pending"
  | "dns_verification_sent"
  | "verified"
  | "ssl_provisioned"
  | "active"
  | "error";

export type TalentSiteDomainRecord = {
  id: string;
  talentProfileId: string;
  domain: string;
  status: TalentSiteDomainStatus;
  verificationToken: string | null;
  isPrimary: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  verifiedAt: string | null;
  sslProvisionedAt: string | null;
  lastHealthCheckAt: string | null;
  failureReason: string | null;
};

const DOMAIN_COLUMNS =
  "id, talent_profile_id, domain, status, verification_token, is_primary, created_at, updated_at, verified_at, ssl_provisioned_at, last_health_check_at, failure_reason";

type DomainRowDb = {
  id: string;
  talent_profile_id: string;
  domain: string;
  status: string;
  verification_token: string | null;
  is_primary: boolean;
  created_at: string | null;
  updated_at: string | null;
  verified_at: string | null;
  ssl_provisioned_at: string | null;
  last_health_check_at: string | null;
  failure_reason: string | null;
};

function mapDomainRow(row: DomainRowDb): TalentSiteDomainRecord {
  return {
    id: row.id,
    talentProfileId: row.talent_profile_id,
    domain: row.domain,
    status: row.status as TalentSiteDomainStatus,
    verificationToken: row.verification_token,
    isPrimary: Boolean(row.is_primary),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    verifiedAt: row.verified_at,
    sslProvisionedAt: row.ssl_provisioned_at,
    lastHealthCheckAt: row.last_health_check_at,
    failureReason: row.failure_reason,
  };
}

/**
 * The pure transitions return the agency lifecycle vocab. The talent table's
 * CHECK constraint has no `failed`/`suspended` — both terminal failure states
 * map to the talent table's `error`; every shared status passes through. (In
 * practice the verification/provisioning transitions only ever return
 * `verified` / `dns_verification_sent` / `ssl_provisioned` / `active` /
 * `failed`, but the source type is the full lifecycle union, so we map the
 * whole failure family.)
 */
function toTalentStatus(
  status: DomainVerificationTransition["status"] | DomainProvisioningTransition["status"],
): TalentSiteDomainStatus {
  if (status === "failed" || status === "suspended") return "error";
  return status;
}

/** Load every domain row for a talent's site, primary first then oldest first. */
export async function loadTalentSiteDomains(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<TalentSiteDomainRecord[]> {
  const { data, error } = await supabase
    .from("talent_site_domains")
    .select(DOMAIN_COLUMNS)
    .eq("talent_profile_id", talentProfileId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as DomainRowDb[]).map(mapDomainRow);
}

/** Load one domain row for a talent by its hostname. */
export async function loadTalentSiteDomain(
  supabase: SupabaseClient,
  talentProfileId: string,
  domain: string,
): Promise<TalentSiteDomainRecord | null> {
  const { data, error } = await supabase
    .from("talent_site_domains")
    .select(DOMAIN_COLUMNS)
    .eq("talent_profile_id", talentProfileId)
    .eq("domain", domain)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapDomainRow(data as DomainRowDb);
}

/**
 * Re-check the TXT verification record. Resolves the host's TXT records and
 * advances `pending`/`dns_verification_sent` → `verified` (token matched) or
 * `error` (window expired) / unchanged (still propagating). Reuses the agency
 * pure transition, then persists to `talent_site_domains`.
 */
export async function verifyTalentSiteDomainRecord(
  supabase: SupabaseClient,
  domain: TalentSiteDomainRecord,
  options: {
    now?: Date;
    txtResolver?: (hostname: string) => Promise<string[][]>;
  } = {},
): Promise<DomainVerificationTransition> {
  const now = options.now ?? new Date();
  const txtResolver = options.txtResolver ?? resolveTxt;

  let txtRecords: string[] = [];
  try {
    txtRecords = flattenTxtRecords(await txtResolver(domain.domain));
  } catch {
    txtRecords = [];
  }

  const transition = resolveDomainVerificationTransition(
    {
      status: agencyStatusForLifecycle(domain.status),
      verificationToken: domain.verificationToken,
      createdAt: domain.createdAt,
      updatedAt: domain.updatedAt,
    },
    txtRecords,
    now,
  );

  const { error } = await supabase
    .from("talent_site_domains")
    .update({
      status: toTalentStatus(transition.status),
      verified_at: transition.verifiedAt,
      ssl_provisioned_at: null,
      failure_reason: transition.failureReason,
      last_health_check_at: transition.lastHealthCheckAt,
    })
    .eq("id", domain.id);
  if (error) throw error;

  return transition;
}

/**
 * Probe DNS + HTTPS for a verified domain and advance
 * `verified`/`ssl_provisioned` → `active` (routing + HTTPS from Vercel),
 * `ssl_provisioned` (routing detected, HTTPS pending), or hold at `verified`.
 * Reuses the agency pure inspection + transition, then persists.
 */
export async function syncTalentSiteDomainProvisioning(
  supabase: SupabaseClient,
  domain: TalentSiteDomainRecord,
  options: {
    now?: Date;
    resolveARecords?: (hostname: string) => Promise<string[]>;
    resolveCnameRecords?: (hostname: string) => Promise<string[]>;
    httpsProbe?: (
      hostname: string,
    ) => Promise<{ reachable: boolean; fromVercel: boolean }>;
  } = {},
): Promise<DomainProvisioningTransition> {
  const observation = await inspectCustomDomainProvisioning(domain.domain, options);
  const transition = resolveDomainProvisioningTransition(
    {
      status: agencyStatusForLifecycle(domain.status),
      sslProvisionedAt: domain.sslProvisionedAt,
    },
    observation,
    options.now ?? new Date(),
  );

  const { error } = await supabase
    .from("talent_site_domains")
    .update({
      status: toTalentStatus(transition.status),
      failure_reason: transition.failureReason,
      last_health_check_at: transition.lastHealthCheckAt,
      ssl_provisioned_at: transition.sslProvisionedAt,
    })
    .eq("id", domain.id);
  if (error) throw error;

  return transition;
}

/**
 * Bridge the talent `error` status back to the agency lifecycle vocab the pure
 * functions expect. `error` maps to `failed`; all shared statuses pass through.
 */
function agencyStatusForLifecycle(
  status: TalentSiteDomainStatus,
): "pending" | "dns_verification_sent" | "verified" | "ssl_provisioned" | "active" | "failed" {
  return status === "error" ? "failed" : status;
}

export { DOMAIN_VERIFICATION_WINDOW_MS };
