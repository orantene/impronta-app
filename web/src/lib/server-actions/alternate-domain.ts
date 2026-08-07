"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  ensureCustomDomainOnVercelProject,
  removeCustomDomainFromVercelProject,
} from "@/lib/saas/custom-domain-actions";
import { normalizeCustomDomainHostname } from "@/app/(workspace)/[tenantSlug]/admin/settings/domain-utils";
import { logServerError } from "@/lib/server/safe-error";
import type { ServerActionResult } from "./result";

/**
 * F.3 — Add alternate domain (multi-domain support).
 *
 * Companion to the existing `connectCustomDomainAction` (form-data
 * driven, redirect-on-result). This action is JSON in / JSON out for
 * the modern drawer UI, returns structured DNS instructions so the
 * client can render a copy-paste verification box without scraping
 * the redirect URL.
 *
 * Plan caps (alternate = "not the primary domain"):
 *   - free / studio: 0 alternate domains (plan gate handled by
 *     builder.domain.custom + builder.domain.alternates capability)
 *   - agency:        2 alternates (3 total custom domains)
 *   - network:       9 alternates (10 total, soft cap)
 *
 * Caps apply to non-primary custom rows; subdomains + the platform
 * tulala subdomain don't count.
 */

const PLAN_ALTERNATE_CAPS: Record<string, number> = {
  free: 0,
  studio: 0,
  agency: 2,
  network: 9,
};

export type AddAlternateDomainResult = ServerActionResult<{
  domainId: string;
  hostname: string;
  verificationToken: string;
  /** Plain English DNS instructions for the user to copy-paste. */
  dnsInstructions: string;
  /** True when Vercel attach succeeded; false means manual ops follow-up needed. */
  vercelAttached: boolean;
}>;

export async function addAlternateDomain(
  rawHostname: string,
): Promise<AddAlternateDomainResult> {
  try {
    const auth = await requireWorkspaceStaffAction();
    if (!auth.ok) return { ok: false, error: "Not authenticated.", reason: "unauthenticated" };
    const { tenantId, user, supabase } = auth;

    const normalized = normalizeCustomDomainHostname(rawHostname);
    if (!normalized.ok) {
      return { ok: false, error: normalized.message, reason: "validation_failed" };
    }
    const hostname = normalized.hostname;

    // Owner/admin only.
    const { data: myMembership } = await supabase
      .from("agency_memberships")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("profile_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    const myRole = (myMembership as { role?: string } | null)?.role;
    if (myRole !== "owner" && myRole !== "admin") {
      return { ok: false, error: "Only owner/admin can add a domain.", reason: "forbidden" };
    }

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable.", reason: "unexpected" };

    // Resolve plan tier.
    const { data: agencyRow } = await admin
      .from("agencies")
      .select("slug, plan_tier")
      .eq("id", tenantId)
      .maybeSingle();
    const planTier = (agencyRow as { plan_tier?: string } | null)?.plan_tier ?? "free";
    const tenantSlug = (agencyRow as { slug?: string } | null)?.slug ?? "";

    const altCap = PLAN_ALTERNATE_CAPS[planTier] ?? 0;
    if (altCap === 0) {
      return {
        ok: false,
        error: planTier === "free"
          ? "Custom domains require Studio or higher."
          : "Alternate domains require Agency tier.",
        reason: "feature_not_enabled",
      };
    }

    // Count existing non-primary custom domains.
    const { data: existingDomains } = await admin
      .from("agency_domains")
      .select("id, hostname, is_primary, status")
      .eq("tenant_id", tenantId)
      .eq("kind", "custom");

    const altCount = ((existingDomains ?? []) as Array<{ is_primary: boolean }>).filter(
      (d) => !d.is_primary,
    ).length;
    if (altCount >= altCap) {
      return {
        ok: false,
        error: `Your plan allows ${altCap} alternate domain${altCap === 1 ? "" : "s"} on top of the primary. Remove one first or upgrade.`,
        reason: "feature_not_enabled",
      };
    }

    // Duplicate check.
    const dupe = ((existingDomains ?? []) as Array<{ id: string; hostname: string }>).find(
      (d) => d.hostname.toLowerCase() === hostname,
    );
    if (dupe) {
      return {
        ok: false,
        error: `${hostname} is already connected to this workspace.`,
        reason: "already_exists",
      };
    }

    const verificationToken = `impronta-verify-${randomBytes(12).toString("hex")}`;

    const { data: inserted, error: insertErr } = await admin
      .from("agency_domains")
      .insert({
        tenant_id: tenantId,
        tenant_slug: tenantSlug,
        hostname,
        kind: "custom",
        is_primary: false,
        status: "dns_verification_sent",
        verification_token: verificationToken,
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      if ((insertErr as { code?: string } | null)?.code === "23505") {
        return { ok: false, error: "That domain is already connected somewhere.", reason: "already_exists" };
      }
      logServerError("alternate-domain.insert", insertErr);
      return { ok: false, error: "Couldn't save domain.", reason: "unexpected" };
    }

    const vercel = await ensureCustomDomainOnVercelProject(hostname);

    const dnsInstructions = [
      `1. Add a TXT record at _impronta_verify.${hostname}`,
      `   value: ${verificationToken}`,
      "",
      `2. Add an A record at ${hostname}`,
      "   value: 76.76.21.21",
      "",
      "Verification usually completes within 5 minutes once DNS propagates.",
    ].join("\n");

    revalidatePath("/", "layout");
    return {
      ok: true,
      data: {
        domainId: (inserted as { id: string }).id,
        hostname,
        verificationToken,
        dnsInstructions,
        vercelAttached: vercel.attached === true,
      },
    };
  } catch (err) {
    logServerError("alternate-domain", err);
    return { ok: false, error: "Unexpected error.", reason: "unexpected" };
  }
}

/**
 * F.3 — Remove an alternate domain (cannot remove the primary).
 */
export async function removeAlternateDomain(
  domainId: string,
): Promise<ServerActionResult> {
  try {
    const auth = await requireWorkspaceStaffAction();
    if (!auth.ok) return { ok: false, error: "Not authenticated.", reason: "unauthenticated" };
    const { tenantId } = auth;

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable.", reason: "unexpected" };

    const { data: row } = await admin
      .from("agency_domains")
      .select("id, hostname, is_primary, tenant_id")
      .eq("id", domainId)
      .maybeSingle();
    if (!row) return { ok: false, error: "Domain not found.", reason: "not_found" };
    const r = row as { id: string; hostname: string; is_primary: boolean; tenant_id: string };

    if (r.tenant_id !== tenantId) {
      return { ok: false, error: "Not your domain.", reason: "forbidden" };
    }
    if (r.is_primary) {
      return {
        ok: false,
        error: "Switch a different domain to primary before removing this one.",
        reason: "forbidden",
      };
    }

    await removeCustomDomainFromVercelProject(r.hostname);

    const { error: deleteErr } = await admin
      .from("agency_domains")
      .delete()
      .eq("id", domainId);
    if (deleteErr) {
      logServerError("alternate-domain.remove", deleteErr);
      return { ok: false, error: "Couldn't remove domain.", reason: "unexpected" };
    }

    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (err) {
    logServerError("alternate-domain.remove", err);
    return { ok: false, error: "Unexpected error.", reason: "unexpected" };
  }
}
