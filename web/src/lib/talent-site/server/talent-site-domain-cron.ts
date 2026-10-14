import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  inspectCustomDomainProvisioning,
  type DomainHttpsProbe,
} from "@/lib/saas/custom-domain-actions";
import { getDomainRegistrarInfo } from "@/lib/saas/vercel-domains-registrar";
import { logServerError } from "@/lib/server/safe-error";
import {
  notifyTalentDomainBroken,
  notifyTalentDomainRenewal,
} from "@/lib/notifications/producers/talent-domain-notify";
import {
  syncTalentSiteDomainProvisioning,
  verifyTalentSiteDomainRecord,
  type TalentSiteDomainRecord,
  type TalentSiteDomainStatus,
} from "@/lib/talent-site/server/talent-site-domain-core";
import {
  resolveActiveDomainHealthTransition,
  resolveRenewalNoticeKind,
  talentDomainNeedsDailyHealthCheck,
} from "@/lib/talent-site/server/talent-site-domain-health";

/**
 * Wave 1B D4 cron sweeps for `talent_site_domains`.
 *
 * No new schema: preview/prebuild refuses unapplied migrations (same gate that
 * failed #3208). Health uses existing `failure_reason` + `last_health_check_at`.
 * Breakage notify fires on the healthy→broken transition (and when the reason
 * changes). Renewal notices read registrar expiry live from Vercel each run;
 * dispatch `eventId` dedupes 30/7-day sends. Persistence of expiry is a later
 * PM migration when ready to `db:push`.
 */

const CRON_COLUMNS =
  "id, talent_profile_id, domain, status, verification_token, is_primary, created_at, updated_at, verified_at, ssl_provisioned_at, last_health_check_at, failure_reason";

type CronDomainRow = {
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

export type TalentPendingSweepReport = {
  scanned: number;
  verified: number;
  stillPending: number;
  failed: number;
  results: Array<{
    id: string;
    domain: string;
    from: TalentSiteDomainStatus;
    to: TalentSiteDomainStatus;
  }>;
};

export type TalentProvisioningSweepReport = {
  scanned: number;
  active: number;
  sslProvisioned: number;
  stillVerified: number;
  results: Array<{
    id: string;
    domain: string;
    from: TalentSiteDomainStatus;
    to: TalentSiteDomainStatus;
  }>;
};

export type TalentActiveHealthSweepReport = {
  scanned: number;
  healthy: number;
  broken: number;
  notified: number;
  results: Array<{
    id: string;
    domain: string;
    healthy: boolean;
    failureReason: string | null;
    notified: boolean;
  }>;
};

export type TalentRenewalSweepReport = {
  scanned: number;
  expirySeen: number;
  noticed30d: number;
  noticed7d: number;
  results: Array<{
    id: string;
    domain: string;
    registrarExpiresAt: string | null;
    notice: 30 | 7 | null;
  }>;
};

function mapCronRow(row: CronDomainRow): TalentSiteDomainRecord {
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

async function loadTalentDomainsByStatus(
  supabase: SupabaseClient,
  statuses: TalentSiteDomainStatus[],
  limit: number,
): Promise<TalentSiteDomainRecord[]> {
  const { data, error } = await supabase
    .from("talent_site_domains")
    .select(CRON_COLUMNS)
    .in("status", statuses)
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as CronDomainRow[]).map(mapCronRow);
}

/** Advance pending / dns_verification_sent talent domains via TXT check. */
export async function sweepPendingTalentSiteDomainVerifications(
  supabase: SupabaseClient,
  options: {
    now?: Date;
    txtResolver?: (hostname: string) => Promise<string[][]>;
    limit?: number;
  } = {},
): Promise<TalentPendingSweepReport> {
  const rows = await loadTalentDomainsByStatus(
    supabase,
    ["pending", "dns_verification_sent"],
    options.limit ?? 100,
  );
  const report: TalentPendingSweepReport = {
    scanned: rows.length,
    verified: 0,
    stillPending: 0,
    failed: 0,
    results: [],
  };

  for (const row of rows) {
    try {
      const transition = await verifyTalentSiteDomainRecord(supabase, row, {
        now: options.now,
        txtResolver: options.txtResolver,
      });
      const to = (
        transition.status === "failed" || transition.status === "suspended"
          ? "error"
          : transition.status
      ) as TalentSiteDomainStatus;
      if (to === "verified") report.verified += 1;
      else if (to === "error") report.failed += 1;
      else report.stillPending += 1;
      report.results.push({
        id: row.id,
        domain: row.domain,
        from: row.status,
        to,
      });
    } catch (error) {
      logServerError("talent.domain.sweepPending", error);
      report.failed += 1;
      report.results.push({
        id: row.id,
        domain: row.domain,
        from: row.status,
        to: "error",
      });
    }
  }

  return report;
}

/** Advance verified / ssl_provisioned talent domains via DNS + HTTPS. */
export async function sweepProvisioningTalentSiteDomains(
  supabase: SupabaseClient,
  options: {
    now?: Date;
    resolveARecords?: (hostname: string) => Promise<string[]>;
    resolveCnameRecords?: (hostname: string) => Promise<string[]>;
    httpsProbe?: DomainHttpsProbe;
    limit?: number;
  } = {},
): Promise<TalentProvisioningSweepReport> {
  const rows = await loadTalentDomainsByStatus(
    supabase,
    ["verified", "ssl_provisioned"],
    options.limit ?? 100,
  );
  const report: TalentProvisioningSweepReport = {
    scanned: rows.length,
    active: 0,
    sslProvisioned: 0,
    stillVerified: 0,
    results: [],
  };

  for (const row of rows) {
    try {
      const transition = await syncTalentSiteDomainProvisioning(supabase, row, options);
      if (transition.status === "active") report.active += 1;
      else if (transition.status === "ssl_provisioned") report.sslProvisioned += 1;
      else report.stillVerified += 1;
      report.results.push({
        id: row.id,
        domain: row.domain,
        from: row.status,
        to: transition.status as TalentSiteDomainStatus,
      });
    } catch (error) {
      logServerError("talent.domain.sweepProvisioning", error);
      report.stillVerified += 1;
      report.results.push({
        id: row.id,
        domain: row.domain,
        from: row.status,
        to: row.status,
      });
    }
  }

  return report;
}

/**
 * Daily re-check of active talent domains (DNS + HTTPS). Sets failure_reason,
 * notifies once when entering a breakage episode (or reason changes). Clears
 * failure_reason on recovery. Keeps status=active.
 */
export async function sweepActiveTalentSiteDomainHealth(
  supabase: SupabaseClient,
  options: {
    now?: Date;
    resolveARecords?: (hostname: string) => Promise<string[]>;
    resolveCnameRecords?: (hostname: string) => Promise<string[]>;
    httpsProbe?: DomainHttpsProbe;
    notifyBroken?: typeof notifyTalentDomainBroken;
    limit?: number;
  } = {},
): Promise<TalentActiveHealthSweepReport> {
  const now = options.now ?? new Date();
  const notifyBroken = options.notifyBroken ?? notifyTalentDomainBroken;
  const candidates = await loadTalentDomainsByStatus(
    supabase,
    ["active"],
    options.limit ?? 100,
  );
  const rows = candidates.filter((row) =>
    talentDomainNeedsDailyHealthCheck(row.lastHealthCheckAt, now),
  );

  const report: TalentActiveHealthSweepReport = {
    scanned: rows.length,
    healthy: 0,
    broken: 0,
    notified: 0,
    results: [],
  };

  for (const row of rows) {
    try {
      const observation = await inspectCustomDomainProvisioning(row.domain, options);
      const transition = resolveActiveDomainHealthTransition(observation, now);
      const shouldNotify =
        !transition.healthy &&
        (row.failureReason == null || row.failureReason !== transition.failureReason);

      const { error } = await supabase
        .from("talent_site_domains")
        .update({
          failure_reason: transition.failureReason,
          last_health_check_at: transition.lastHealthCheckAt,
        })
        .eq("id", row.id);
      if (error) throw error;

      if (transition.healthy) report.healthy += 1;
      else report.broken += 1;

      let notified = false;
      if (shouldNotify) {
        await notifyBroken({
          talentProfileId: row.talentProfileId,
          domainId: row.id,
          domain: row.domain,
          failureReason: transition.failureReason,
        });
        notified = true;
        report.notified += 1;
      }

      report.results.push({
        id: row.id,
        domain: row.domain,
        healthy: transition.healthy,
        failureReason: transition.failureReason,
        notified,
      });
    } catch (error) {
      logServerError("talent.domain.sweepActiveHealth", error);
      report.broken += 1;
      report.results.push({
        id: row.id,
        domain: row.domain,
        healthy: false,
        failureReason: "Health check failed.",
        notified: false,
      });
    }
  }

  return report;
}

/**
 * Read registrar expiry live and emit 30/7-day renewal notices.
 * Dedupe is via notification `eventId` (dispatch_log), not DB stamps.
 * D5 billing is intentionally out of scope.
 */
export async function sweepTalentSiteDomainRenewals(
  supabase: SupabaseClient,
  options: {
    now?: Date;
    fetchRegistrarInfo?: typeof getDomainRegistrarInfo;
    notifyRenewal?: typeof notifyTalentDomainRenewal;
    limit?: number;
  } = {},
): Promise<TalentRenewalSweepReport> {
  const now = options.now ?? new Date();
  const fetchInfo = options.fetchRegistrarInfo ?? getDomainRegistrarInfo;
  const notifyRenewal = options.notifyRenewal ?? notifyTalentDomainRenewal;

  const rows = await loadTalentDomainsByStatus(
    supabase,
    ["active", "ssl_provisioned", "verified"],
    options.limit ?? 100,
  );

  const report: TalentRenewalSweepReport = {
    scanned: rows.length,
    expirySeen: 0,
    noticed30d: 0,
    noticed7d: 0,
    results: [],
  };

  for (const row of rows) {
    try {
      const info = await fetchInfo(row.domain);
      const registrarExpiresAt = info.attempted ? info.expiresAtIso : null;
      if (registrarExpiresAt) report.expirySeen += 1;

      // No DB notice stamps — always evaluate the window; dispatch eventId
      // collapses re-sends for the same (domain, days, expiresAt) tuple.
      const notice = resolveRenewalNoticeKind({
        registrarExpiresAt,
        notice30dSentAt: null,
        notice7dSentAt: null,
        now,
      });

      if (notice === 30) {
        await notifyRenewal({
          talentProfileId: row.talentProfileId,
          domainId: row.id,
          domain: row.domain,
          days: 30,
          expiresAtIso: registrarExpiresAt,
        });
        report.noticed30d += 1;
      } else if (notice === 7) {
        await notifyRenewal({
          talentProfileId: row.talentProfileId,
          domainId: row.id,
          domain: row.domain,
          days: 7,
          expiresAtIso: registrarExpiresAt,
        });
        report.noticed7d += 1;
      }

      report.results.push({
        id: row.id,
        domain: row.domain,
        registrarExpiresAt,
        notice,
      });
    } catch (error) {
      logServerError("talent.domain.sweepRenewals", error);
      report.results.push({
        id: row.id,
        domain: row.domain,
        registrarExpiresAt: null,
        notice: null,
      });
    }
  }

  return report;
}
