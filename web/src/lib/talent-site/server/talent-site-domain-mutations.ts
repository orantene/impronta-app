/**
 * Injectable talent-site domain mutation runners (connect / verify / check /
 * set-primary / remove). Server actions call these after auth gates; unit tests
 * drive them with fake Supabase + mocked Vercel (no mock.module).
 */

import { randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeCustomDomainHostname } from "@/app/(workspace)/[tenantSlug]/admin/settings/domain-utils";
import {
  ensureCustomDomainOnVercelProject,
  removeCustomDomainFromVercelProject,
  type VercelDomainRemoveResult,
  type VercelDomainSyncResult,
} from "@/lib/saas/custom-domain-actions";
import {
  buildCustomDomainRoutingRecords,
  customDomainCanBecomePrimary,
  type DomainRoutingRecord,
} from "@/lib/saas/custom-domain-routing";
import { logServerError } from "@/lib/server/safe-error";

import {
  loadTalentSiteDomain,
  loadTalentSiteDomains,
  syncTalentSiteDomainProvisioning,
  verifyTalentSiteDomainRecord,
  type TalentSiteDomainRecord,
} from "./talent-site-domain-core";

export type TalentSiteDomainView = {
  domain: string;
  status: TalentSiteDomainRecord["status"];
  isPrimary: boolean;
  verificationToken: string | null;
  failureReason: string | null;
  verifiedAt: string | null;
  sslProvisionedAt: string | null;
  lastHealthCheckAt: string | null;
  routingRecords: DomainRoutingRecord[];
  txtRecord: { host: string; value: string } | null;
  canBecomePrimary: boolean;
};

export type TalentSiteDomainActionResult =
  | { ok: true; message: string; domains: TalentSiteDomainView[] }
  | { ok: false; error: string; domains?: TalentSiteDomainView[] };

export type TalentDomainMutationCtx = {
  supabase: SupabaseClient;
  talentProfileId: string;
};

const TXT_HOST_PREFIX = "_impronta-challenge";

function txtRecordHostFor(domain: string): string {
  return `${TXT_HOST_PREFIX}.${domain}`;
}

export function toTalentSiteDomainView(row: TalentSiteDomainRecord): TalentSiteDomainView {
  const isLive = row.status === "active";
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
    canBecomePrimary: !row.isPrimary && isLive,
  };
}

async function listDomainViews(ctx: TalentDomainMutationCtx): Promise<TalentSiteDomainView[]> {
  try {
    const rows = await loadTalentSiteDomains(ctx.supabase, ctx.talentProfileId);
    return rows.map(toTalentSiteDomainView);
  } catch (error) {
    logServerError("talentSiteDomain.list", error);
    return [];
  }
}

export type TalentDomainMutationDeps = {
  ensureOnVercel?: (
    domain: string,
  ) => Promise<VercelDomainSyncResult>;
  removeFromVercel?: (
    domain: string,
  ) => Promise<VercelDomainRemoveResult>;
  mintVerificationToken?: () => string;
  loadDomain?: typeof loadTalentSiteDomain;
  verifyRecord?: typeof verifyTalentSiteDomainRecord;
  syncProvisioning?: typeof syncTalentSiteDomainProvisioning;
  listViews?: (ctx: TalentDomainMutationCtx) => Promise<TalentSiteDomainView[]>;
};

function mintTokenDefault(): string {
  return `impronta-verify-${randomBytes(12).toString("hex")}`;
}

export async function runConnectTalentSiteDomain(
  ctx: TalentDomainMutationCtx,
  rawHostname: string,
  deps: TalentDomainMutationDeps = {},
): Promise<TalentSiteDomainActionResult> {
  const listViews = deps.listViews ?? listDomainViews;
  const loadDomain = deps.loadDomain ?? loadTalentSiteDomain;
  const ensureOnVercel = deps.ensureOnVercel ?? ensureCustomDomainOnVercelProject;
  const mintToken = deps.mintVerificationToken ?? mintTokenDefault;

  const normalized = normalizeCustomDomainHostname(rawHostname);
  if (!normalized.ok) {
    return { ok: false, error: normalized.message, domains: await listViews(ctx) };
  }
  const domain = normalized.hostname;

  let existing: TalentSiteDomainRecord | null = null;
  try {
    existing = await loadDomain(ctx.supabase, ctx.talentProfileId, domain);
  } catch (error) {
    logServerError("talentSiteDomain.connect.lookup", error);
    return {
      ok: false,
      error: "Existing domain records could not be checked.",
      domains: await listViews(ctx),
    };
  }

  if (existing && ["active", "verified", "ssl_provisioned"].includes(existing.status)) {
    return {
      ok: false,
      error: `${domain} is already connected.`,
      domains: await listViews(ctx),
    };
  }

  const verificationToken = mintToken();

  if (existing) {
    const { error } = await ctx.supabase
      .from("talent_site_domains")
      .update({
        status: "dns_verification_sent",
        verification_token: verificationToken,
        verified_at: null,
        ssl_provisioned_at: null,
        failure_reason: null,
        acquisition: "connected",
      })
      .eq("id", existing.id);
    if (error) {
      logServerError("talentSiteDomain.connect.refresh", error);
      return {
        ok: false,
        error: "Verification could not be restarted for that domain.",
        domains: await listViews(ctx),
      };
    }
  } else {
    const { error } = await ctx.supabase.from("talent_site_domains").insert({
      talent_profile_id: ctx.talentProfileId,
      domain,
      is_primary: false,
      status: "dns_verification_sent",
      verification_token: verificationToken,
      acquisition: "connected",
    });
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return {
          ok: false,
          error: "That domain is already connected somewhere else.",
          domains: await listViews(ctx),
        };
      }
      logServerError("talentSiteDomain.connect.insert", error);
      return {
        ok: false,
        error: "That domain could not be saved.",
        domains: await listViews(ctx),
      };
    }
  }

  const vercelSync = await ensureOnVercel(domain);
  if (vercelSync.attempted && !vercelSync.attached) {
    logServerError("talentSiteDomain.connect.vercelAttach", {
      domain,
      code: vercelSync.errorCode,
      message: vercelSync.errorMessage,
    });
  }

  const vercelHint =
    !vercelSync.attempted && vercelSync.skippedReason
      ? " Vercel provisioning is not configured yet; finish DNS and re-check after env setup."
      : vercelSync.attempted && !vercelSync.attached
        ? " DNS token is ready, but Vercel provisioning needs attention."
        : "";

  return {
    ok: true,
    message: `DNS instructions are ready for ${domain}. Add the TXT record to verify it.${vercelHint}`,
    domains: await listViews(ctx),
  };
}

export async function runVerifyTalentSiteDomain(
  ctx: TalentDomainMutationCtx,
  rawHostname: string,
  deps: TalentDomainMutationDeps = {},
): Promise<TalentSiteDomainActionResult> {
  const listViews = deps.listViews ?? listDomainViews;
  const loadDomain = deps.loadDomain ?? loadTalentSiteDomain;
  const verifyRecord = deps.verifyRecord ?? verifyTalentSiteDomainRecord;

  const normalized = normalizeCustomDomainHostname(rawHostname);
  if (!normalized.ok) {
    return { ok: false, error: normalized.message, domains: await listViews(ctx) };
  }
  const domain = normalized.hostname;

  let record: TalentSiteDomainRecord | null = null;
  try {
    record = await loadDomain(ctx.supabase, ctx.talentProfileId, domain);
  } catch (error) {
    logServerError("talentSiteDomain.verify.lookup", error);
    return {
      ok: false,
      error: "The saved domain record could not be loaded.",
      domains: await listViews(ctx),
    };
  }
  if (!record) {
    return {
      ok: false,
      error: "That custom domain is not attached to your site.",
      domains: await listViews(ctx),
    };
  }
  if (["verified", "ssl_provisioned", "active"].includes(record.status)) {
    return { ok: true, message: `${domain} is already verified.`, domains: await listViews(ctx) };
  }
  if (!record.verificationToken) {
    return {
      ok: false,
      error: "No verification token is saved for that domain. Reconnect it for a fresh token.",
      domains: await listViews(ctx),
    };
  }

  try {
    const transition = await verifyRecord(ctx.supabase, record);
    if (transition.status === "verified") {
      return { ok: true, message: `${domain} is now verified.`, domains: await listViews(ctx) };
    }
    if (transition.status === "failed") {
      return {
        ok: false,
        error: `TXT record for ${domain} still has not been found within the verification window. Add it now and reconnect the domain for a fresh token.`,
        domains: await listViews(ctx),
      };
    }
    return {
      ok: false,
      error: `TXT record not found for ${domain} yet. DNS changes may still be propagating.`,
      domains: await listViews(ctx),
    };
  } catch (error) {
    logServerError("talentSiteDomain.verify.update", error);
    return {
      ok: false,
      error: "The domain could not be re-checked right now.",
      domains: await listViews(ctx),
    };
  }
}

export async function runCheckTalentSiteDomainProvisioning(
  ctx: TalentDomainMutationCtx,
  rawHostname: string,
  deps: TalentDomainMutationDeps = {},
): Promise<TalentSiteDomainActionResult> {
  const listViews = deps.listViews ?? listDomainViews;
  const loadDomain = deps.loadDomain ?? loadTalentSiteDomain;
  const syncProvisioning = deps.syncProvisioning ?? syncTalentSiteDomainProvisioning;

  const normalized = normalizeCustomDomainHostname(rawHostname);
  if (!normalized.ok) {
    return { ok: false, error: normalized.message, domains: await listViews(ctx) };
  }
  const domain = normalized.hostname;

  let record: TalentSiteDomainRecord | null = null;
  try {
    record = await loadDomain(ctx.supabase, ctx.talentProfileId, domain);
  } catch (error) {
    logServerError("talentSiteDomain.check.lookup", error);
    return {
      ok: false,
      error: "The saved domain record could not be loaded.",
      domains: await listViews(ctx),
    };
  }
  if (!record) {
    return {
      ok: false,
      error: "That custom domain is not attached to your site.",
      domains: await listViews(ctx),
    };
  }
  if (record.status === "dns_verification_sent" || record.status === "pending") {
    return {
      ok: false,
      error: `${domain} still needs TXT verification before routing can be checked.`,
      domains: await listViews(ctx),
    };
  }

  try {
    const transition = await syncProvisioning(ctx.supabase, record);
    if (transition.status === "active") {
      return {
        ok: true,
        message: `${domain} is now live with routing and HTTPS on Vercel.`,
        domains: await listViews(ctx),
      };
    }
    if (transition.status === "ssl_provisioned") {
      return {
        ok: true,
        message: `${domain} routing is detected. HTTPS is still finishing on Vercel.`,
        domains: await listViews(ctx),
      };
    }
    return {
      ok: false,
      error: `Routing records for ${domain} are not live yet. Add the Vercel A/CNAME record and check again.`,
      domains: await listViews(ctx),
    };
  } catch (error) {
    logServerError("talentSiteDomain.check.update", error);
    return {
      ok: false,
      error: "Routing and SSL could not be checked right now.",
      domains: await listViews(ctx),
    };
  }
}

export async function runSetPrimaryTalentSiteDomain(
  ctx: TalentDomainMutationCtx,
  rawHostname: string,
  deps: TalentDomainMutationDeps = {},
): Promise<TalentSiteDomainActionResult> {
  const listViews = deps.listViews ?? listDomainViews;
  const loadDomain = deps.loadDomain ?? loadTalentSiteDomain;

  const normalized = normalizeCustomDomainHostname(rawHostname);
  if (!normalized.ok) {
    return { ok: false, error: normalized.message, domains: await listViews(ctx) };
  }
  const domain = normalized.hostname;

  let record: TalentSiteDomainRecord | null = null;
  try {
    record = await loadDomain(ctx.supabase, ctx.talentProfileId, domain);
  } catch (error) {
    logServerError("talentSiteDomain.setPrimary.lookup", error);
    return {
      ok: false,
      error: "The saved domain record could not be loaded.",
      domains: await listViews(ctx),
    };
  }
  if (!record) {
    return {
      ok: false,
      error: "That domain is not attached to your site.",
      domains: await listViews(ctx),
    };
  }
  if (record.isPrimary) {
    return { ok: true, message: `${domain} is already your primary domain.`, domains: await listViews(ctx) };
  }
  if (!customDomainCanBecomePrimary(record.status)) {
    return {
      ok: false,
      error: `${domain} must finish routing and SSL checks before it can become your primary domain.`,
      domains: await listViews(ctx),
    };
  }

  const demote = await ctx.supabase
    .from("talent_site_domains")
    .update({ is_primary: false })
    .eq("talent_profile_id", ctx.talentProfileId)
    .eq("is_primary", true);
  if (demote.error) {
    logServerError("talentSiteDomain.setPrimary.demote", demote.error);
    return {
      ok: false,
      error: "Your primary domain could not be updated.",
      domains: await listViews(ctx),
    };
  }

  const promote = await ctx.supabase
    .from("talent_site_domains")
    .update({ is_primary: true })
    .eq("id", record.id);
  if (promote.error) {
    logServerError("talentSiteDomain.setPrimary.promote", promote.error);
    return {
      ok: false,
      error: "Your primary domain could not be updated.",
      domains: await listViews(ctx),
    };
  }

  return { ok: true, message: `${domain} is now your primary domain.`, domains: await listViews(ctx) };
}

export async function runRemoveTalentSiteDomain(
  ctx: TalentDomainMutationCtx,
  rawHostname: string,
  deps: TalentDomainMutationDeps = {},
): Promise<TalentSiteDomainActionResult> {
  const listViews = deps.listViews ?? listDomainViews;
  const loadDomain = deps.loadDomain ?? loadTalentSiteDomain;
  const removeFromVercel = deps.removeFromVercel ?? removeCustomDomainFromVercelProject;

  const normalized = normalizeCustomDomainHostname(rawHostname);
  if (!normalized.ok) {
    return { ok: false, error: normalized.message, domains: await listViews(ctx) };
  }
  const domain = normalized.hostname;

  let record: TalentSiteDomainRecord | null = null;
  try {
    record = await loadDomain(ctx.supabase, ctx.talentProfileId, domain);
  } catch (error) {
    logServerError("talentSiteDomain.remove.lookup", error);
    return {
      ok: false,
      error: "The saved domain record could not be loaded.",
      domains: await listViews(ctx),
    };
  }
  if (!record) {
    return {
      ok: false,
      error: "That custom domain is not attached to your site.",
      domains: await listViews(ctx),
    };
  }

  const { error: deleteError } = await ctx.supabase
    .from("talent_site_domains")
    .delete()
    .eq("id", record.id);
  if (deleteError) {
    logServerError("talentSiteDomain.remove.delete", deleteError);
    return {
      ok: false,
      error: "That custom domain could not be removed.",
      domains: await listViews(ctx),
    };
  }

  const vercelRemove = await removeFromVercel(domain);
  if (vercelRemove.attempted && !vercelRemove.removed) {
    logServerError("talentSiteDomain.remove.vercelRemove", {
      domain,
      code: vercelRemove.errorCode,
      message: vercelRemove.errorMessage,
    });
  }

  return { ok: true, message: `${domain} was removed.`, domains: await listViews(ctx) };
}
