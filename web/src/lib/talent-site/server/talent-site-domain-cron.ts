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
  loadTalentSiteDomain,
  syncTalentSiteDomainProvisioning,
  verifyTalentSiteDomainRecord,
  type TalentSiteDomainRecord,
  type TalentSiteDomainStatus,
} from "@/lib/talent-site/server/talent-site-domain-core";
import {
  resolveActiveDomainHealthTransition,
  resolveRenewalNoticeKind,
  shouldResetRenewalNoticeStamps,
  talentDomainNeedsDailyHealthCheck,
} from "@/lib/talent-site/server/talent-site-domain-health";

const CRON_COLUMNS =
  "id, talent_profile_id, domain, status, verification_token, is_primary, created_at, updated_at, verified_at, ssl_provisioned_at, last_health_check_at, failure_reason, registrar_expires_at, renewal_notice_30d_sent_at, renewal_notice_7d_sent_at, breakage_notified_at";

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
  registrar_expires_at: string | null;
  renewal_notice_30d_sent_at: string | null;
  renewal_notice_7d_sent_at: string | null;
  breakage_notified_at: string | null;
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
  expiryUpdated: number;
  noticed30d: number;
  noticed7d: number;
  results: Array<{
    id: string;
    domain: string;
    registrarExpiresAt: string | null;
    notice: 30 | 7 | null;
  }>;
};

function mapCronRow(row: CronDomainRow): TalentSiteDomainRecord & {
  registrarExpiresAt: string | null;
  renewalNotice30dSentAt: string | null;
  renewalNotice7dSentAt: string | null;
  breakageNotifiedAt: string | null;
} {
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
    registrarExpiresAt: row.registrar_expires_at,
    renewalNotice30dSentAt: row.renewal_notice_30d_sent_at,
    renewalNotice7dSentAt: row.renewal_notice_7d_sent_at,
    breakageNotifiedAt: row.breakage_notified_at,
  };
}

async function loadTalentDomainsByStatus(
  supabase: SupabaseClient,
  statuses: TalentSiteDomainStatus[],
  limit: number,
): Promise<ReturnType<typeof mapCronRow>[]> {
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
 * notifies once per breakage episode, clears on recovery. Does not demote
 * status (D1 owns redirect gating on status=active).
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
        !transition.healthy && row.breakageNotifiedAt == null;
      const patch: Record<string, unknown> = {
        failure_reason: transition.failureReason,
        last_health_check_at: transition.lastHealthCheckAt,
      };
      if (transition.healthy) {
        patch.breakage_notified_at = null;
        report.healthy += 1;
      } else {
        report.broken += 1;
        if (shouldNotify) {
          patch.breakage_notified_at = now.toISOString();
        }
      }

      const { error } = await supabase
        .from("talent_site_domains")
        .update(patch)
        .eq("id", row.id);
      if (error) throw error;

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
 * Refresh registrar expiry for talent domains and emit 30/7-day renewal
 * notices. Skips D5 billing (notice only).
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

  // Active + purchased-in-progress rows; expiry is meaningless once error/gone.
  const rows = await loadTalentDomainsByStatus(
    supabase,
    ["active", "ssl_provisioned", "verified"],
    options.limit ?? 100,
  );

  const report: TalentRenewalSweepReport = {
    scanned: rows.length,
    expiryUpdated: 0,
    noticed30d: 0,
    noticed7d: 0,
    results: [],
  };

  for (const row of rows) {
    try {
      const info = await fetchInfo(row.domain);
      let registrarExpiresAt = row.registrarExpiresAt;
      let notice30 = row.renewalNotice30dSentAt;
      let notice7 = row.renewalNotice7dSentAt;
      const patch: Record<string, unknown> = {};

      if (info.attempted && info.expiresAtIso) {
        if (shouldResetRenewalNoticeStamps(row.registrarExpiresAt, info.expiresAtIso)) {
          notice30 = null;
          notice7 = null;
          patch.renewal_notice_30d_sent_at = null;
          patch.renewal_notice_7d_sent_at = null;
        }
        if (info.expiresAtIso !== row.registrarExpiresAt) {
          registrarExpiresAt = info.expiresAtIso;
          patch.registrar_expires_at = info.expiresAtIso;
          report.expiryUpdated += 1;
        }
      }

      const notice = resolveRenewalNoticeKind({
        registrarExpiresAt,
        notice30dSentAt: notice30,
        notice7dSentAt: notice7,
        now,
      });

      if (notice === 30) {
        patch.renewal_notice_30d_sent_at = now.toISOString();
        await notifyRenewal({
          talentProfileId: row.talentProfileId,
          domainId: row.id,
          domain: row.domain,
          days: 30,
          expiresAtIso: registrarExpiresAt,
        });
        report.noticed30d += 1;
      } else if (notice === 7) {
        patch.renewal_notice_7d_sent_at = now.toISOString();
        // A 7-day window also covers the 30-day stamp so we never send both
        // on the first discovery inside the last week.
        if (!notice30) patch.renewal_notice_30d_sent_at = now.toISOString();
        await notifyRenewal({
          talentProfileId: row.talentProfileId,
          domainId: row.id,
          domain: row.domain,
          days: 7,
          expiresAtIso: registrarExpiresAt,
        });
        report.noticed7d += 1;
      }

      if (Object.keys(patch).length > 0) {
        const { error } = await supabase
          .from("talent_site_domains")
          .update(patch)
          .eq("id", row.id);
        if (error) throw error;
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
        registrarExpiresAt: row.registrarExpiresAt,
        notice: null,
      });
    }
  }

  return report;
}

/** Re-load one row after a write (tests / debugging). */
export async function reloadTalentSiteDomainForCron(
  supabase: SupabaseClient,
  talentProfileId: string,
  domain: string,
): Promise<TalentSiteDomainRecord | null> {
  return loadTalentSiteDomain(supabase, talentProfileId, domain);
}
