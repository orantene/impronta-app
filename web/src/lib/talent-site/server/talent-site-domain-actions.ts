"use server";

import { randomBytes } from "node:crypto";

import {
  ensureCustomDomainOnVercelProject,
  removeCustomDomainFromVercelProject,
} from "@/lib/saas/custom-domain-actions";
import {
  buildCustomDomainRoutingRecords,
  customDomainCanBecomePrimary,
  type DomainRoutingRecord,
} from "@/lib/saas/custom-domain-routing";
import { normalizeCustomDomainHostname } from "@/app/(workspace)/[tenantSlug]/admin/settings/domain-utils";
import { logServerError } from "@/lib/server/safe-error";
import {
  assertTalentCanConnectCustomDomain,
  requireTalentSelf,
} from "@/lib/server/talent-self-guard";
import {
  loadTalentSiteDomain,
  loadTalentSiteDomains,
  syncTalentSiteDomainProvisioning,
  verifyTalentSiteDomainRecord,
  type TalentSiteDomainRecord,
} from "./talent-site-domain-core";

/**
 * Talent Max-site custom domains — SERVER ACTIONS ("use server", async-only).
 *
 * Mirrors the agency custom-domain action surface
 * (`app/(workspace)/[tenantSlug]/admin/settings/domain-actions.ts`), scoped to
 * the talent's OWN Max site instead of an agency tenant:
 *   - connect      → insert a `talent_site_domains` row + mint a TXT token +
 *                    attach the host to the Vercel project.
 *   - verify       → re-check the TXT record, advance the status.
 *   - check        → probe DNS + HTTPS, advance verified → ssl/active.
 *   - setPrimary   → promote a live domain to the talent's primary.
 *   - remove       → delete the row + detach from the Vercel project.
 *
 * Every write is gated TWICE: the action requires the caller to BE the talent
 * (owner) AND hold Max, and the underlying `talent_site_domains` RLS enforces
 * `is_talent_profile_owner(...) AND talent_profile_has_max(...)`. The Vercel +
 * DNS helpers are imported from the agency stack — not duplicated.
 *
 * These actions return a discriminated result (not a redirect) so the panel can
 * render the outcome inline. They never throw to the client.
 */

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
  canBecomePrimary: boolean;
};

export type TalentSiteDomainActionResult =
  | { ok: true; message: string; domains: TalentSiteDomainView[] }
  | { ok: false; error: string; domains?: TalentSiteDomainView[] };

const TXT_HOST_PREFIX = "_impronta-challenge";

function txtRecordHostFor(domain: string): string {
  return `${TXT_HOST_PREFIX}.${domain}`;
}

function toView(row: TalentSiteDomainRecord): TalentSiteDomainView {
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

type GuardedTalentContext = {
  supabase: import("@supabase/supabase-js").SupabaseClient;
  talentProfileId: string;
};

/**
 * Resolve the calling talent + assert Max. Returns a typed failure result on any
 * gate miss so the action can short-circuit without throwing.
 */
async function guardTalentDomainContext(): Promise<
  | { ok: true; ctx: GuardedTalentContext }
  | { ok: false; error: string }
> {
  const scope = await requireTalentSelf();
  if (!scope.ok) {
    return {
      ok: false,
      error:
        scope.code === "not_authenticated"
          ? "You must be signed in to manage your site domain."
          : "We could not find your talent profile.",
    };
  }
  if (!assertTalentCanConnectCustomDomain(scope.planKey)) {
    return {
      ok: false,
      error: "Connecting a custom domain is a Max feature. Upgrade to Max to use your own domain.",
    };
  }
  return {
    ok: true,
    ctx: { supabase: scope.session.supabase, talentProfileId: scope.talentProfile.id },
  };
}

/** Read the current domain set (used to hydrate the panel + after each write). */
async function listDomains(ctx: GuardedTalentContext): Promise<TalentSiteDomainView[]> {
  try {
    const rows = await loadTalentSiteDomains(ctx.supabase, ctx.talentProfileId);
    return rows.map(toView);
  } catch (error) {
    logServerError("talentSiteDomain.list", error);
    return [];
  }
}

/** Read-only load of the talent's domains for initial panel render. */
export async function loadTalentSiteDomainsForPanel(): Promise<TalentSiteDomainActionResult> {
  const guard = await guardTalentDomainContext();
  if (!guard.ok) return { ok: false, error: guard.error, domains: [] };
  const domains = await listDomains(guard.ctx);
  return { ok: true, message: "", domains };
}

export async function connectTalentSiteDomainAction(
  rawHostname: string,
): Promise<TalentSiteDomainActionResult> {
  const guard = await guardTalentDomainContext();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { ctx } = guard;

  const normalized = normalizeCustomDomainHostname(rawHostname);
  if (!normalized.ok) {
    return { ok: false, error: normalized.message, domains: await listDomains(ctx) };
  }
  const domain = normalized.hostname;

  let existing: TalentSiteDomainRecord | null = null;
  try {
    existing = await loadTalentSiteDomain(ctx.supabase, ctx.talentProfileId, domain);
  } catch (error) {
    logServerError("talentSiteDomain.connect.lookup", error);
    return {
      ok: false,
      error: "Existing domain records could not be checked.",
      domains: await listDomains(ctx),
    };
  }

  if (existing && ["active", "verified", "ssl_provisioned"].includes(existing.status)) {
    return {
      ok: false,
      error: `${domain} is already connected.`,
      domains: await listDomains(ctx),
    };
  }

  const verificationToken = `impronta-verify-${randomBytes(12).toString("hex")}`;

  if (existing) {
    const { error } = await ctx.supabase
      .from("talent_site_domains")
      .update({
        status: "dns_verification_sent",
        verification_token: verificationToken,
        verified_at: null,
        ssl_provisioned_at: null,
        failure_reason: null,
      })
      .eq("id", existing.id);
    if (error) {
      logServerError("talentSiteDomain.connect.refresh", error);
      return {
        ok: false,
        error: "Verification could not be restarted for that domain.",
        domains: await listDomains(ctx),
      };
    }
  } else {
    const { error } = await ctx.supabase.from("talent_site_domains").insert({
      talent_profile_id: ctx.talentProfileId,
      domain,
      is_primary: false,
      status: "dns_verification_sent",
      verification_token: verificationToken,
    });
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return {
          ok: false,
          error: "That domain is already connected somewhere else.",
          domains: await listDomains(ctx),
        };
      }
      logServerError("talentSiteDomain.connect.insert", error);
      return {
        ok: false,
        error: "That domain could not be saved.",
        domains: await listDomains(ctx),
      };
    }
  }

  // Attach to the Vercel project (best-effort — the TXT token is already saved).
  const vercelSync = await ensureCustomDomainOnVercelProject(domain);
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
    domains: await listDomains(ctx),
  };
}

export async function verifyTalentSiteDomainAction(
  rawHostname: string,
): Promise<TalentSiteDomainActionResult> {
  const guard = await guardTalentDomainContext();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { ctx } = guard;

  const normalized = normalizeCustomDomainHostname(rawHostname);
  if (!normalized.ok) {
    return { ok: false, error: normalized.message, domains: await listDomains(ctx) };
  }
  const domain = normalized.hostname;

  let record: TalentSiteDomainRecord | null = null;
  try {
    record = await loadTalentSiteDomain(ctx.supabase, ctx.talentProfileId, domain);
  } catch (error) {
    logServerError("talentSiteDomain.verify.lookup", error);
    return {
      ok: false,
      error: "The saved domain record could not be loaded.",
      domains: await listDomains(ctx),
    };
  }
  if (!record) {
    return {
      ok: false,
      error: "That custom domain is not attached to your site.",
      domains: await listDomains(ctx),
    };
  }
  if (["verified", "ssl_provisioned", "active"].includes(record.status)) {
    return { ok: true, message: `${domain} is already verified.`, domains: await listDomains(ctx) };
  }
  if (!record.verificationToken) {
    return {
      ok: false,
      error: "No verification token is saved for that domain. Reconnect it for a fresh token.",
      domains: await listDomains(ctx),
    };
  }

  try {
    const transition = await verifyTalentSiteDomainRecord(ctx.supabase, record);
    if (transition.status === "verified") {
      return { ok: true, message: `${domain} is now verified.`, domains: await listDomains(ctx) };
    }
    if (transition.status === "failed") {
      return {
        ok: false,
        error: `TXT record for ${domain} still has not been found within the verification window. Add it now and reconnect the domain for a fresh token.`,
        domains: await listDomains(ctx),
      };
    }
    return {
      ok: false,
      error: `TXT record not found for ${domain} yet. DNS changes may still be propagating.`,
      domains: await listDomains(ctx),
    };
  } catch (error) {
    logServerError("talentSiteDomain.verify.update", error);
    return {
      ok: false,
      error: "The domain could not be re-checked right now.",
      domains: await listDomains(ctx),
    };
  }
}

export async function checkTalentSiteDomainProvisioningAction(
  rawHostname: string,
): Promise<TalentSiteDomainActionResult> {
  const guard = await guardTalentDomainContext();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { ctx } = guard;

  const normalized = normalizeCustomDomainHostname(rawHostname);
  if (!normalized.ok) {
    return { ok: false, error: normalized.message, domains: await listDomains(ctx) };
  }
  const domain = normalized.hostname;

  let record: TalentSiteDomainRecord | null = null;
  try {
    record = await loadTalentSiteDomain(ctx.supabase, ctx.talentProfileId, domain);
  } catch (error) {
    logServerError("talentSiteDomain.check.lookup", error);
    return {
      ok: false,
      error: "The saved domain record could not be loaded.",
      domains: await listDomains(ctx),
    };
  }
  if (!record) {
    return {
      ok: false,
      error: "That custom domain is not attached to your site.",
      domains: await listDomains(ctx),
    };
  }
  if (record.status === "dns_verification_sent" || record.status === "pending") {
    return {
      ok: false,
      error: `${domain} still needs TXT verification before routing can be checked.`,
      domains: await listDomains(ctx),
    };
  }

  try {
    const transition = await syncTalentSiteDomainProvisioning(ctx.supabase, record);
    if (transition.status === "active") {
      return {
        ok: true,
        message: `${domain} is now live with routing and HTTPS on Vercel.`,
        domains: await listDomains(ctx),
      };
    }
    if (transition.status === "ssl_provisioned") {
      return {
        ok: true,
        message: `${domain} routing is detected. HTTPS is still finishing on Vercel.`,
        domains: await listDomains(ctx),
      };
    }
    return {
      ok: false,
      error: `Routing records for ${domain} are not live yet. Add the Vercel A/CNAME record and check again.`,
      domains: await listDomains(ctx),
    };
  } catch (error) {
    logServerError("talentSiteDomain.check.update", error);
    return {
      ok: false,
      error: "Routing and SSL could not be checked right now.",
      domains: await listDomains(ctx),
    };
  }
}

export async function setPrimaryTalentSiteDomainAction(
  rawHostname: string,
): Promise<TalentSiteDomainActionResult> {
  const guard = await guardTalentDomainContext();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { ctx } = guard;

  const normalized = normalizeCustomDomainHostname(rawHostname);
  if (!normalized.ok) {
    return { ok: false, error: normalized.message, domains: await listDomains(ctx) };
  }
  const domain = normalized.hostname;

  let record: TalentSiteDomainRecord | null = null;
  try {
    record = await loadTalentSiteDomain(ctx.supabase, ctx.talentProfileId, domain);
  } catch (error) {
    logServerError("talentSiteDomain.setPrimary.lookup", error);
    return {
      ok: false,
      error: "The saved domain record could not be loaded.",
      domains: await listDomains(ctx),
    };
  }
  if (!record) {
    return {
      ok: false,
      error: "That domain is not attached to your site.",
      domains: await listDomains(ctx),
    };
  }
  if (record.isPrimary) {
    return { ok: true, message: `${domain} is already your primary domain.`, domains: await listDomains(ctx) };
  }
  if (!customDomainCanBecomePrimary(record.status)) {
    return {
      ok: false,
      error: `${domain} must finish routing and SSL checks before it can become your primary domain.`,
      domains: await listDomains(ctx),
    };
  }

  // Clear any current primary, then promote this one. The partial unique index
  // `talent_site_domains_one_primary_per_profile` is the hard backstop; doing
  // the demote first avoids a transient two-primary violation.
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
      domains: await listDomains(ctx),
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
      domains: await listDomains(ctx),
    };
  }

  return { ok: true, message: `${domain} is now your primary domain.`, domains: await listDomains(ctx) };
}

export async function removeTalentSiteDomainAction(
  rawHostname: string,
): Promise<TalentSiteDomainActionResult> {
  const guard = await guardTalentDomainContext();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { ctx } = guard;

  const normalized = normalizeCustomDomainHostname(rawHostname);
  if (!normalized.ok) {
    return { ok: false, error: normalized.message, domains: await listDomains(ctx) };
  }
  const domain = normalized.hostname;

  let record: TalentSiteDomainRecord | null = null;
  try {
    record = await loadTalentSiteDomain(ctx.supabase, ctx.talentProfileId, domain);
  } catch (error) {
    logServerError("talentSiteDomain.remove.lookup", error);
    return {
      ok: false,
      error: "The saved domain record could not be loaded.",
      domains: await listDomains(ctx),
    };
  }
  if (!record) {
    return {
      ok: false,
      error: "That custom domain is not attached to your site.",
      domains: await listDomains(ctx),
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
      domains: await listDomains(ctx),
    };
  }

  const vercelRemove = await removeCustomDomainFromVercelProject(domain);
  if (vercelRemove.attempted && !vercelRemove.removed) {
    logServerError("talentSiteDomain.remove.vercelRemove", {
      domain,
      code: vercelRemove.errorCode,
      message: vercelRemove.errorMessage,
    });
  }

  return { ok: true, message: `${domain} was removed.`, domains: await listDomains(ctx) };
}
