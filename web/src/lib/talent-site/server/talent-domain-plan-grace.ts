/**
 * WAVE 1B D6 — talent custom-domain plan grace / detach lifecycle.
 *
 * Serving already stops when Web Office lapses (`talent_site_domain_lookup` +
 * `talent_profile_has_max`). This module keeps the row, stamps a 30-day restore
 * window, disables registrar auto-renew on purchased domains (Tulala must not
 * keep paying), and after grace detaches the hostname from the Vercel project.
 *
 * Money: D5 (Payments) owns renewal charging. This file only turns auto-renew
 * OFF and offers transfer-out / expire — it never charges the talent.
 *
 * Dark: Vercel detach / registrar calls skip cleanly when env is missing.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  talentPlanGrantsCapability,
  type TalentPlanKey,
  normalizeTalentPlanKey,
} from "@/lib/access/talent-membership";
import { removeCustomDomainFromVercelProject } from "@/lib/saas/custom-domain-actions";
import {
  getDomainAuthCode,
  setDomainAutoRenew,
} from "@/lib/saas/vercel-domains-registrar";
import { notifyTalentDomainPlanGrace } from "@/lib/notifications/producers/talent-domain-grace-notify";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const TALENT_DOMAIN_PLAN_GRACE_DAYS = 30 as const;

export type TalentDomainDisposition = "transfer_out" | "expire" | "restored";

export type TalentDomainGraceRow = {
  id: string;
  talentProfileId: string;
  domain: string;
  acquisition: string | null;
  planGraceStartedAt: string | null;
  planGraceEndsAt: string | null;
  vercelDetachedAt: string | null;
  registrarAutoRenewDisabledAt: string | null;
  graceNoticeSentAt: string | null;
  dispositionNoticeSentAt: string | null;
  domainDisposition: TalentDomainDisposition | null;
  status: string;
};

export function computePlanGraceWindow(now: Date = new Date()): {
  startedAt: string;
  endsAt: string;
} {
  const started = new Date(now.getTime());
  const ends = new Date(now.getTime());
  ends.setUTCDate(ends.getUTCDate() + TALENT_DOMAIN_PLAN_GRACE_DAYS);
  return { startedAt: started.toISOString(), endsAt: ends.toISOString() };
}

export function planGrantsCustomDomain(planKey: string | null | undefined): boolean {
  return talentPlanGrantsCapability(
    normalizeTalentPlanKey(planKey),
    "personalSiteCustomDomain",
  );
}

/** True when the plan transition loses Web Office custom-domain access. */
export function shouldBeginDomainPlanGrace(
  previousPlanKey: string | null | undefined,
  nextPlanKey: string | null | undefined,
): boolean {
  return planGrantsCustomDomain(previousPlanKey) && !planGrantsCustomDomain(nextPlanKey);
}

/** True when Web Office custom-domain access is restored. */
export function shouldClearDomainPlanGrace(
  previousPlanKey: string | null | undefined,
  nextPlanKey: string | null | undefined,
): boolean {
  return !planGrantsCustomDomain(previousPlanKey) && planGrantsCustomDomain(nextPlanKey);
}

export function isPurchasedAcquisition(acquisition: string | null | undefined): boolean {
  return acquisition === "purchased";
}

export function graceDetachDue(
  row: Pick<TalentDomainGraceRow, "planGraceEndsAt" | "vercelDetachedAt">,
  now: Date = new Date(),
): boolean {
  if (row.vercelDetachedAt) return false;
  if (!row.planGraceEndsAt) return false;
  const ends = Date.parse(row.planGraceEndsAt);
  if (!Number.isFinite(ends)) return false;
  return ends <= now.getTime();
}

export function isInPlanGrace(
  row: Pick<TalentDomainGraceRow, "planGraceStartedAt" | "planGraceEndsAt" | "vercelDetachedAt">,
  now: Date = new Date(),
): boolean {
  if (!row.planGraceStartedAt || !row.planGraceEndsAt) return false;
  if (row.vercelDetachedAt) return false;
  const ends = Date.parse(row.planGraceEndsAt);
  if (!Number.isFinite(ends)) return false;
  return ends > now.getTime();
}

type GraceDbRow = {
  id: string;
  talent_profile_id: string;
  domain: string;
  acquisition: string | null;
  plan_grace_started_at: string | null;
  plan_grace_ends_at: string | null;
  vercel_detached_at: string | null;
  registrar_auto_renew_disabled_at: string | null;
  grace_notice_sent_at: string | null;
  disposition_notice_sent_at: string | null;
  domain_disposition: string | null;
  status: string;
};

const GRACE_COLUMNS =
  "id, talent_profile_id, domain, acquisition, plan_grace_started_at, plan_grace_ends_at, vercel_detached_at, registrar_auto_renew_disabled_at, grace_notice_sent_at, disposition_notice_sent_at, domain_disposition, status";

function mapGraceRow(row: GraceDbRow): TalentDomainGraceRow {
  const disposition = row.domain_disposition;
  return {
    id: row.id,
    talentProfileId: row.talent_profile_id,
    domain: row.domain,
    acquisition: row.acquisition,
    planGraceStartedAt: row.plan_grace_started_at,
    planGraceEndsAt: row.plan_grace_ends_at,
    vercelDetachedAt: row.vercel_detached_at,
    registrarAutoRenewDisabledAt: row.registrar_auto_renew_disabled_at,
    graceNoticeSentAt: row.grace_notice_sent_at,
    dispositionNoticeSentAt: row.disposition_notice_sent_at,
    domainDisposition:
      disposition === "transfer_out" || disposition === "expire" || disposition === "restored"
        ? disposition
        : null,
    status: row.status,
  };
}

async function disablePurchasedAutoRenew(
  row: TalentDomainGraceRow,
  options: {
    env?: Record<string, string | undefined>;
    fetchFn?: (input: string, init?: RequestInit) => Promise<Response>;
    now?: Date;
    admin: SupabaseClient;
  },
): Promise<boolean> {
  if (!isPurchasedAcquisition(row.acquisition)) return false;
  if (row.registrarAutoRenewDisabledAt) return true;

  const result = await setDomainAutoRenew(row.domain, false, {
    env: options.env,
    fetchFn: options.fetchFn,
  });

  // Dark / missing env: do NOT stamp — cron retries once D0 tokens exist so
  // Tulala never silently keeps paying. Only stamp after a real registrar OK.
  if (!result.attempted) return false;
  if (!result.updated) {
    logServerError("talentDomainGrace.disableAutoRenew", {
      domain: row.domain,
      code: result.errorCode,
      message: result.errorMessage,
    });
    return false;
  }

  const stamp = (options.now ?? new Date()).toISOString();
  const { error } = await options.admin
    .from("talent_site_domains")
    .update({
      registrar_auto_renew_disabled_at: stamp,
      updated_at: stamp,
    })
    .eq("id", row.id);
  if (error) {
    logServerError("talentDomainGrace.disableAutoRenew.stamp", error);
    return false;
  }
  return true;
}

/**
 * Stamp grace on every domain for a talent who just lost Web Office.
 * Idempotent when grace is already open. Disables purchased auto-renew.
 */
export async function beginTalentDomainPlanGrace(opts: {
  talentProfileId: string;
  now?: Date;
  admin?: SupabaseClient | null;
  env?: Record<string, string | undefined>;
  fetchFn?: (input: string, init?: RequestInit) => Promise<Response>;
  notify?: boolean;
}): Promise<{ stamped: number; notified: boolean }> {
  const admin = opts.admin ?? createServiceRoleClient();
  if (!admin) return { stamped: 0, notified: false };

  const now = opts.now ?? new Date();
  const window = computePlanGraceWindow(now);

  const { data, error } = await admin
    .from("talent_site_domains")
    .select(GRACE_COLUMNS)
    .eq("talent_profile_id", opts.talentProfileId);
  if (error) {
    logServerError("talentDomainGrace.begin.list", error);
    return { stamped: 0, notified: false };
  }

  const rows = ((data ?? []) as GraceDbRow[]).map(mapGraceRow);
  if (rows.length === 0) return { stamped: 0, notified: false };

  let stamped = 0;
  let anyNeedsNotice = false;

  for (const row of rows) {
    if (row.vercelDetachedAt) continue;
    if (row.planGraceStartedAt && row.planGraceEndsAt) {
      // Already in grace — still ensure auto-renew is off for purchased.
      await disablePurchasedAutoRenew(row, {
        admin,
        env: opts.env,
        fetchFn: opts.fetchFn,
        now,
      });
      if (!row.graceNoticeSentAt) anyNeedsNotice = true;
      continue;
    }

    const { error: upErr } = await admin
      .from("talent_site_domains")
      .update({
        plan_grace_started_at: window.startedAt,
        plan_grace_ends_at: window.endsAt,
        domain_disposition: null,
        updated_at: window.startedAt,
      })
      .eq("id", row.id);
    if (upErr) {
      logServerError("talentDomainGrace.begin.stamp", upErr);
      continue;
    }
    stamped += 1;
    anyNeedsNotice = true;

    await disablePurchasedAutoRenew(
      { ...row, planGraceStartedAt: window.startedAt, planGraceEndsAt: window.endsAt },
      { admin, env: opts.env, fetchFn: opts.fetchFn, now },
    );
  }

  let notified = false;
  if (opts.notify !== false && anyNeedsNotice) {
    const endsAt =
      rows.find((r) => r.planGraceEndsAt)?.planGraceEndsAt ?? window.endsAt;
    notifyTalentDomainPlanGrace({
      kind: "restore",
      talentProfileId: opts.talentProfileId,
      graceEndsAt: endsAt,
      domain: rows[0]?.domain ?? null,
    });
    notified = true;
    const stamp = now.toISOString();
    await admin
      .from("talent_site_domains")
      .update({ grace_notice_sent_at: stamp, updated_at: stamp })
      .eq("talent_profile_id", opts.talentProfileId)
      .is("grace_notice_sent_at", null);
  }

  return { stamped, notified };
}

/** Clear grace markers when Web Office is restored (before or after detach). */
export async function clearTalentDomainPlanGrace(opts: {
  talentProfileId: string;
  now?: Date;
  admin?: SupabaseClient | null;
}): Promise<{ cleared: number }> {
  const admin = opts.admin ?? createServiceRoleClient();
  if (!admin) return { cleared: 0 };

  const stamp = (opts.now ?? new Date()).toISOString();
  const { data, error } = await admin
    .from("talent_site_domains")
    .update({
      plan_grace_started_at: null,
      plan_grace_ends_at: null,
      grace_notice_sent_at: null,
      disposition_notice_sent_at: null,
      domain_disposition: "restored",
      updated_at: stamp,
    })
    .eq("talent_profile_id", opts.talentProfileId)
    .not("plan_grace_started_at", "is", null)
    .select("id");
  if (error) {
    logServerError("talentDomainGrace.clear", error);
    return { cleared: 0 };
  }
  return { cleared: (data ?? []).length };
}

/**
 * Reconcile after a talent plan sync. Called from syncTalentSubscriptionToDb.
 * Does not charge (D5); only starts/clears grace.
 */
export async function reconcileTalentDomainPlanGrace(opts: {
  talentProfileId: string;
  previousPlanKey: string | null | undefined;
  nextPlanKey: TalentPlanKey | string | null | undefined;
  now?: Date;
}): Promise<void> {
  try {
    if (shouldBeginDomainPlanGrace(opts.previousPlanKey, opts.nextPlanKey)) {
      await beginTalentDomainPlanGrace({
        talentProfileId: opts.talentProfileId,
        now: opts.now,
        notify: true,
      });
      return;
    }
    if (shouldClearDomainPlanGrace(opts.previousPlanKey, opts.nextPlanKey)) {
      await clearTalentDomainPlanGrace({
        talentProfileId: opts.talentProfileId,
        now: opts.now,
      });
    }
  } catch (err) {
    logServerError("talentDomainGrace.reconcile", err);
  }
}

export type TalentDomainGraceSweepReport = {
  scanned: number;
  detached: number;
  autoRenewDisabled: number;
  dispositionNotices: number;
  results: Array<{
    id: string;
    domain: string;
    detached: boolean;
    dispositionNoticed: boolean;
  }>;
};

/**
 * Cron sweep: detach Vercel after grace ends; notify purchased domains about
 * transfer-out vs expire. Also backfills grace for talents who lost Max without
 * a webhook stamp (defense in depth).
 */
export async function sweepTalentDomainPlanGrace(
  admin: SupabaseClient,
  options: {
    now?: Date;
    env?: Record<string, string | undefined>;
    fetchFn?: (input: string, init?: RequestInit) => Promise<Response>;
    limit?: number;
  } = {},
): Promise<TalentDomainGraceSweepReport> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 50;
  const report: TalentDomainGraceSweepReport = {
    scanned: 0,
    detached: 0,
    autoRenewDisabled: 0,
    dispositionNotices: 0,
    results: [],
  };

  // Backfill: domain rows with no grace stamp whose talent lost Web Office
  // (missed webhook). Group by talent profile.
  try {
    const { data: orphanCandidates, error: orphanErr } = await admin
      .from("talent_site_domains")
      .select("talent_profile_id")
      .is("plan_grace_started_at", null)
      .is("vercel_detached_at", null)
      .limit(limit * 4);
    if (orphanErr) {
      logServerError("talentDomainGrace.sweep.orphans", orphanErr);
    } else {
      const profileIds = [
        ...new Set(
          ((orphanCandidates ?? []) as Array<{ talent_profile_id: string }>).map(
            (r) => r.talent_profile_id,
          ),
        ),
      ].slice(0, limit);
      for (const talentProfileId of profileIds) {
        const { data: profile } = await admin
          .from("talent_profiles")
          .select("talent_plan_key")
          .eq("id", talentProfileId)
          .maybeSingle();
        const planKey =
          (profile as { talent_plan_key?: string | null } | null)?.talent_plan_key ??
          "talent_basic";
        if (planGrantsCustomDomain(planKey)) continue;
        await beginTalentDomainPlanGrace({
          talentProfileId,
          now,
          admin,
          env: options.env,
          fetchFn: options.fetchFn,
          notify: true,
        });
      }
    }
  } catch (err) {
    logServerError("talentDomainGrace.sweep.orphanCatch", err);
  }

  const { data: dueRows, error: dueErr } = await admin
    .from("talent_site_domains")
    .select(GRACE_COLUMNS)
    .not("plan_grace_ends_at", "is", null)
    .is("vercel_detached_at", null)
    .lte("plan_grace_ends_at", now.toISOString())
    .limit(limit);
  if (dueErr) {
    logServerError("talentDomainGrace.sweep.due", dueErr);
    return report;
  }

  const rows = ((dueRows ?? []) as GraceDbRow[]).map(mapGraceRow);
  report.scanned = rows.length;

  for (const row of rows) {
    if (!graceDetachDue(row, now)) continue;

    if (isPurchasedAcquisition(row.acquisition) && !row.registrarAutoRenewDisabledAt) {
      const off = await disablePurchasedAutoRenew(row, {
        admin,
        env: options.env,
        fetchFn: options.fetchFn,
        now,
      });
      if (off) report.autoRenewDisabled += 1;
    }

    const detach = await removeCustomDomainFromVercelProject(row.domain, {
      env: options.env,
      fetchFn: options.fetchFn,
    });

    const stamp = now.toISOString();
    // Dark / missing env: leave vercel_detached_at null so cron retries once
    // D0 tokens exist. Only stamp after a real remove (or already-gone 404).
    let detached = false;
    if (detach.attempted && detach.removed) {
      const { error: upErr } = await admin
        .from("talent_site_domains")
        .update({
          vercel_detached_at: stamp,
          is_primary: false,
          status: "error",
          failure_reason:
            "Disconnected after Web Office ended. Restore Web Office and reconnect this domain, or transfer it out.",
          updated_at: stamp,
        })
        .eq("id", row.id);
      if (upErr) {
        logServerError("talentDomainGrace.sweep.detachStamp", upErr);
      } else {
        detached = true;
        report.detached += 1;
      }
    } else if (detach.attempted && !detach.removed) {
      logServerError("talentDomainGrace.sweep.detach", {
        domain: row.domain,
        code: detach.errorCode,
        message: detach.errorMessage,
      });
    }

    let dispositionNoticed = false;
    if (
      isPurchasedAcquisition(row.acquisition) &&
      !row.dispositionNoticeSentAt &&
      !row.domainDisposition
    ) {
      notifyTalentDomainPlanGrace({
        kind: "disposition",
        talentProfileId: row.talentProfileId,
        graceEndsAt: row.planGraceEndsAt,
        domain: row.domain,
      });
      await admin
        .from("talent_site_domains")
        .update({ disposition_notice_sent_at: stamp, updated_at: stamp })
        .eq("id", row.id);
      report.dispositionNotices += 1;
      dispositionNoticed = true;
    } else if (detached && !isPurchasedAcquisition(row.acquisition)) {
      notifyTalentDomainPlanGrace({
        kind: "detached",
        talentProfileId: row.talentProfileId,
        graceEndsAt: row.planGraceEndsAt,
        domain: row.domain,
      });
    }

    report.results.push({
      id: row.id,
      domain: row.domain,
      detached,
      dispositionNoticed,
    });
  }

  return report;
}

/**
 * Talent chooses transfer-out: disable auto-renew, fetch auth code (when
 * registrar env is live), stamp disposition. Auth codes are NOT stored.
 */
export async function chooseTalentDomainTransferOut(opts: {
  talentProfileId: string;
  domainId: string;
  now?: Date;
  admin?: SupabaseClient | null;
  env?: Record<string, string | undefined>;
  fetchFn?: (input: string, init?: RequestInit) => Promise<Response>;
}): Promise<
  | { ok: true; authCode: string | null; skippedReason: string | null }
  | { ok: false; error: string }
> {
  const admin = opts.admin ?? createServiceRoleClient();
  if (!admin) return { ok: false, error: "Database not available." };

  const { data, error } = await admin
    .from("talent_site_domains")
    .select(GRACE_COLUMNS)
    .eq("id", opts.domainId)
    .eq("talent_profile_id", opts.talentProfileId)
    .maybeSingle();
  if (error || !data) {
    return { ok: false, error: "That custom domain is not attached to your site." };
  }
  const row = mapGraceRow(data as GraceDbRow);
  if (!isPurchasedAcquisition(row.acquisition)) {
    return {
      ok: false,
      error: "Transfer-out is only available for domains purchased through Tulala.",
    };
  }

  const now = opts.now ?? new Date();
  await disablePurchasedAutoRenew(row, {
    admin,
    env: opts.env,
    fetchFn: opts.fetchFn,
    now,
  });

  const auth = await getDomainAuthCode(row.domain, {
    env: opts.env,
    fetchFn: opts.fetchFn,
  });

  const stamp = now.toISOString();
  const { error: upErr } = await admin
    .from("talent_site_domains")
    .update({
      domain_disposition: "transfer_out",
      updated_at: stamp,
    })
    .eq("id", row.id);
  if (upErr) {
    logServerError("talentDomainGrace.transferOut", upErr);
    return { ok: false, error: "Could not save your transfer-out choice." };
  }

  return {
    ok: true,
    authCode: auth.authCode,
    skippedReason: auth.skippedReason,
  };
}

/** Talent chooses to let a purchased domain expire (auto-renew stays off). */
export async function chooseTalentDomainExpire(opts: {
  talentProfileId: string;
  domainId: string;
  now?: Date;
  admin?: SupabaseClient | null;
  env?: Record<string, string | undefined>;
  fetchFn?: (input: string, init?: RequestInit) => Promise<Response>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = opts.admin ?? createServiceRoleClient();
  if (!admin) return { ok: false, error: "Database not available." };

  const { data, error } = await admin
    .from("talent_site_domains")
    .select(GRACE_COLUMNS)
    .eq("id", opts.domainId)
    .eq("talent_profile_id", opts.talentProfileId)
    .maybeSingle();
  if (error || !data) {
    return { ok: false, error: "That custom domain is not attached to your site." };
  }
  const row = mapGraceRow(data as GraceDbRow);
  if (!isPurchasedAcquisition(row.acquisition)) {
    return {
      ok: false,
      error: "Expire is only available for domains purchased through Tulala.",
    };
  }

  const now = opts.now ?? new Date();
  await disablePurchasedAutoRenew(row, {
    admin,
    env: opts.env,
    fetchFn: opts.fetchFn,
    now,
  });

  const stamp = now.toISOString();
  const { error: upErr } = await admin
    .from("talent_site_domains")
    .update({
      domain_disposition: "expire",
      updated_at: stamp,
    })
    .eq("id", row.id);
  if (upErr) {
    logServerError("talentDomainGrace.expire", upErr);
    return { ok: false, error: "Could not save your expire choice." };
  }
  return { ok: true };
}

export async function loadTalentDomainGraceRows(
  admin: SupabaseClient,
  talentProfileId: string,
): Promise<TalentDomainGraceRow[]> {
  const { data, error } = await admin
    .from("talent_site_domains")
    .select(GRACE_COLUMNS)
    .eq("talent_profile_id", talentProfileId);
  if (error) throw error;
  return ((data ?? []) as GraceDbRow[]).map(mapGraceRow);
}
