/**
 * Pure helpers for talent custom-domain health + renewal windows (D4).
 * No I/O — cron persistence and Vercel calls live in talent-site-domain-cron.ts.
 */

import type { DomainProvisioningObservation } from "@/lib/saas/custom-domain-actions";

export const TALENT_DOMAIN_HEALTH_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const RENEWAL_NOTICE_30D_MS = 30 * 24 * 60 * 60 * 1000;
export const RENEWAL_NOTICE_7D_MS = 7 * 24 * 60 * 60 * 1000;

export type ActiveDomainHealthTransition = {
  healthy: boolean;
  failureReason: string | null;
  lastHealthCheckAt: string;
  matchedRouting: boolean;
  httpsReachable: boolean;
  httpsFromVercel: boolean;
};

export type RenewalNoticeKind = 30 | 7;

/** True when the row is due for a daily active-domain DNS + HTTPS re-check. */
export function talentDomainNeedsDailyHealthCheck(
  lastHealthCheckAt: string | null,
  now: Date = new Date(),
): boolean {
  if (!lastHealthCheckAt) return true;
  const last = Date.parse(lastHealthCheckAt);
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= TALENT_DOMAIN_HEALTH_INTERVAL_MS;
}

/**
 * Map a DNS + HTTPS observation to a health transition for an already-active
 * talent domain. Keeps status as `active` (card: set failure_reason + notify);
 * recovery clears the reason.
 */
export function resolveActiveDomainHealthTransition(
  observation: DomainProvisioningObservation,
  now: Date = new Date(),
): ActiveDomainHealthTransition {
  const lastHealthCheckAt = now.toISOString();
  if (!observation.matchedRouting) {
    return {
      healthy: false,
      failureReason: "DNS routing records are missing or no longer point to Tulala.",
      lastHealthCheckAt,
      matchedRouting: false,
      httpsReachable: observation.httpsReachable,
      httpsFromVercel: observation.httpsFromVercel,
    };
  }
  if (!observation.httpsReachable || !observation.httpsFromVercel) {
    return {
      healthy: false,
      failureReason: "The domain is not serving a valid HTTPS certificate from Tulala.",
      lastHealthCheckAt,
      matchedRouting: true,
      httpsReachable: observation.httpsReachable,
      httpsFromVercel: observation.httpsFromVercel,
    };
  }
  return {
    healthy: true,
    failureReason: null,
    lastHealthCheckAt,
    matchedRouting: true,
    httpsReachable: true,
    httpsFromVercel: true,
  };
}

/** Which renewal notice (if any) is due for the stored registrar expiry. */
export function resolveRenewalNoticeKind(params: {
  registrarExpiresAt: string | null;
  notice30dSentAt: string | null;
  notice7dSentAt: string | null;
  now?: Date;
}): RenewalNoticeKind | null {
  const expiresMs = params.registrarExpiresAt
    ? Date.parse(params.registrarExpiresAt)
    : NaN;
  if (!Number.isFinite(expiresMs)) return null;
  const nowMs = (params.now ?? new Date()).getTime();
  const remaining = expiresMs - nowMs;
  if (remaining <= 0) return null;
  if (remaining <= RENEWAL_NOTICE_7D_MS && !params.notice7dSentAt) return 7;
  if (remaining <= RENEWAL_NOTICE_30D_MS && !params.notice30dSentAt) return 30;
  return null;
}

/**
 * When the registrar reports a later expiry than we stored, prior notice
 * stamps belong to the previous term and must reset.
 */
export function shouldResetRenewalNoticeStamps(
  previousExpiresAt: string | null,
  nextExpiresAt: string | null,
): boolean {
  if (!nextExpiresAt) return false;
  if (!previousExpiresAt) return false;
  const prev = Date.parse(previousExpiresAt);
  const next = Date.parse(nextExpiresAt);
  if (!Number.isFinite(prev) || !Number.isFinite(next)) return false;
  return next > prev;
}

/** Convert Vercel `expiresAt` (ms number, or numeric string) to ISO, or null. */
export function registrarExpiresAtToIso(expiresAt: unknown): string | null {
  if (expiresAt == null) return null;
  const ms =
    typeof expiresAt === "number"
      ? expiresAt
      : typeof expiresAt === "string" && expiresAt.trim()
        ? Number(expiresAt)
        : NaN;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString();
}
