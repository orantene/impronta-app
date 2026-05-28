"use server";

/**
 * Platform Admin — workspace control actions.
 *
 * Settings update, status lifecycle (active/suspend/archive/cancel),
 * delete, domain management, and workspace creation.
 * Every action is gated to `super_admin` and audited.
 */

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getPlatformRole } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

type TenantActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type PlatformAdminContext = { ok: true; sb: SupabaseClient; actorId: string };

async function requirePlatformAdmin(): Promise<
  PlatformAdminContext | { ok: false; error: string }
> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "You must be signed in." };
  if (getPlatformRole(session.profile) !== "super_admin") {
    return { ok: false, error: "Forbidden — platform admin only." };
  }
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Platform service client unavailable." };
  return { ok: true, sb, actorId: session.user.id };
}

async function recordAudit(
  sb: SupabaseClient,
  args: {
    actorId: string;
    action: string;
    tenantId: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
    severity?: "info" | "warn" | "emergency";
  },
): Promise<void> {
  try {
    await sb.from("platform_audit_log").insert({
      actor_profile_id: args.actorId,
      actor_role: "super_admin",
      action: args.action,
      target_type: args.targetType,
      target_id: args.targetId,
      tenant_id: args.tenantId,
      severity: args.severity ?? "info",
      metadata: args.metadata ?? {},
    });
  } catch (err) {
    logServerError("platform.tenant.audit", err);
  }
}

function revalidateTenantSurfaces(tenantId?: string): void {
  revalidatePath("/platform/admin/tenants");
  if (tenantId) revalidatePath(`/platform/admin/tenants/${tenantId}`);
}

const NOW = () => new Date().toISOString();

async function findProfileIdByEmail(
  sb: SupabaseClient,
  email: string,
): Promise<string | null> {
  for (let page = 1; page <= 6; page += 1) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) break;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) {
      const { data: profile } = await sb
        .from("profiles")
        .select("id")
        .eq("id", hit.id)
        .maybeSingle();
      return profile ? hit.id : null;
    }
    if (data.users.length < 200) break;
  }
  return null;
}

// ─── Workspace settings ───────────────────────────────────────────────────────

export async function actionUpdateTenantSettings(input: {
  tenantId: string;
  displayName?: string;
  kind?: string;
}): Promise<TenantActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb, actorId } = auth;
  if (!input.tenantId) return { ok: false, error: "Missing workspace." };

  const updates: Record<string, string> = {};
  if (input.displayName?.trim()) updates.display_name = input.displayName.trim();
  if (input.kind && ["agency", "hub"].includes(input.kind)) updates.kind = input.kind;
  if (Object.keys(updates).length === 0) return { ok: false, error: "Nothing to update." };

  const { error } = await sb
    .from("agencies")
    .update({ ...updates, updated_at: NOW() })
    .eq("id", input.tenantId);
  if (error) {
    logServerError("platform.updateSettings", error);
    return { ok: false, error: "Could not update settings." };
  }

  await recordAudit(sb, {
    actorId,
    action: "platform.tenant.settings.update",
    tenantId: input.tenantId,
    targetType: "workspace",
    targetId: input.tenantId,
    metadata: updates,
  });
  revalidateTenantSurfaces(input.tenantId);
  return { ok: true, data: undefined };
}

// ─── Status control ───────────────────────────────────────────────────────────

const ALLOWED_STATUSES = [
  "active", "suspended", "archived", "cancelled", "draft", "onboarding",
] as const;

export async function actionSetTenantStatus(input: {
  tenantId: string;
  status: string;
  reason?: string | null;
}): Promise<TenantActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb, actorId } = auth;
  if (!input.tenantId) return { ok: false, error: "Missing workspace." };
  if (!(ALLOWED_STATUSES as readonly string[]).includes(input.status)) {
    return { ok: false, error: "Invalid status." };
  }

  const { data: current } = await sb
    .from("agencies")
    .select("id, slug, status")
    .eq("id", input.tenantId)
    .maybeSingle();
  if (!current) return { ok: false, error: "Workspace not found." };

  const updates: Record<string, unknown> = { status: input.status, updated_at: NOW() };
  if (input.status === "suspended") {
    updates.suspended_at = NOW();
    updates.suspended_reason = input.reason?.trim() || null;
  } else {
    updates.suspended_at = null;
    updates.suspended_reason = null;
  }

  const { error } = await sb.from("agencies").update(updates).eq("id", input.tenantId);
  if (error) {
    logServerError("platform.setStatus", error);
    return { ok: false, error: "Could not update status." };
  }

  const severity: "info" | "warn" = ["suspended", "cancelled", "archived"].includes(input.status)
    ? "warn"
    : "info";
  await recordAudit(sb, {
    actorId,
    action: `platform.tenant.status.${input.status}`,
    tenantId: input.tenantId,
    targetType: "workspace",
    targetId: input.tenantId,
    severity,
    metadata: { from: current.status, to: input.status, reason: input.reason?.trim() || null },
  });
  revalidateTenantSurfaces(input.tenantId);
  return { ok: true, data: undefined };
}

// ─── Delete tenant (soft — sets status to "cancelled") ─────────────────────

export async function actionDeleteTenant(input: {
  tenantId: string;
  confirmSlug: string;
}): Promise<TenantActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb, actorId } = auth;
  if (!input.tenantId) return { ok: false, error: "Missing workspace." };

  const { data: agency } = await sb
    .from("agencies")
    .select("id, slug")
    .eq("id", input.tenantId)
    .maybeSingle();
  if (!agency) return { ok: false, error: "Workspace not found." };
  if (input.confirmSlug.trim().toLowerCase() !== agency.slug.toLowerCase()) {
    return { ok: false, error: `Type the workspace slug "${agency.slug}" to confirm.` };
  }

  const { error } = await sb
    .from("agencies")
    .update({ status: "cancelled", updated_at: NOW() })
    .eq("id", input.tenantId);
  if (error) {
    logServerError("platform.deleteTenant", error);
    return { ok: false, error: "Could not cancel workspace." };
  }

  await recordAudit(sb, {
    actorId,
    action: "platform.tenant.delete",
    tenantId: input.tenantId,
    targetType: "workspace",
    targetId: input.tenantId,
    severity: "emergency",
    metadata: { slug: agency.slug },
  });
  revalidateTenantSurfaces(input.tenantId);
  return { ok: true, data: undefined };
}

// ─── Domain management ────────────────────────────────────────────────────────

export async function actionAddDomain(input: {
  tenantId: string;
  hostname: string;
  kind: string;
}): Promise<TenantActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb, actorId } = auth;
  if (!input.tenantId) return { ok: false, error: "Missing workspace." };
  const hostname = input.hostname.trim().toLowerCase();
  if (!hostname || hostname.length < 4) return { ok: false, error: "Enter a valid hostname." };
  if (!["subdomain", "custom"].includes(input.kind)) {
    return { ok: false, error: "Invalid domain kind." };
  }

  const { data: existing } = await sb
    .from("agency_domains")
    .select("id")
    .eq("hostname", hostname)
    .maybeSingle();
  if (existing) return { ok: false, error: "That hostname is already registered." };

  // A tenant must always have exactly one primary domain so host/canonical
  // resolution has a stable target. If this tenant currently has no primary
  // (brand-new tenant, or a prior orphaned state), the newly-added domain is
  // promoted to primary. Previously this was hardcoded `false`, which left a
  // tenant whose *only* domain was added here without any primary at all.
  const { data: existingPrimary } = await sb
    .from("agency_domains")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("is_primary", true)
    .maybeSingle();
  const shouldBePrimary = !existingPrimary;

  const { error } = await sb.from("agency_domains").insert({
    tenant_id: input.tenantId,
    hostname,
    kind: input.kind,
    is_primary: shouldBePrimary,
    status: "active",
    verified_at: input.kind === "subdomain" ? NOW() : null,
    ssl_provisioned_at: input.kind === "subdomain" ? NOW() : null,
  });
  if (error) {
    logServerError("platform.addDomain", error);
    return { ok: false, error: "Could not add domain." };
  }

  await recordAudit(sb, {
    actorId,
    action: "platform.tenant.domain.add",
    tenantId: input.tenantId,
    targetType: "agency_domain",
    targetId: hostname,
    metadata: { hostname, kind: input.kind },
  });
  revalidateTenantSurfaces(input.tenantId);
  return { ok: true, data: undefined };
}

export async function actionRemoveDomain(input: {
  tenantId: string;
  domainId: string;
}): Promise<TenantActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb, actorId } = auth;

  const { data: domain } = await sb
    .from("agency_domains")
    .select("id, hostname, kind, is_primary, tenant_id")
    .eq("id", input.domainId)
    .maybeSingle();
  if (!domain || domain.tenant_id !== input.tenantId) {
    return { ok: false, error: "Domain not found." };
  }
  if (domain.kind === "subdomain") {
    return { ok: false, error: "Platform subdomains cannot be removed." };
  }
  if (domain.is_primary) {
    return { ok: false, error: "Set another domain as primary before removing this one." };
  }

  const { error } = await sb.from("agency_domains").delete().eq("id", input.domainId);
  if (error) {
    logServerError("platform.removeDomain", error);
    return { ok: false, error: "Could not remove domain." };
  }

  await recordAudit(sb, {
    actorId,
    action: "platform.tenant.domain.remove",
    tenantId: input.tenantId,
    targetType: "agency_domain",
    targetId: domain.hostname,
    metadata: { hostname: domain.hostname },
  });
  revalidateTenantSurfaces(input.tenantId);
  return { ok: true, data: undefined };
}

export async function actionSetPrimaryDomain(input: {
  tenantId: string;
  domainId: string;
}): Promise<TenantActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb, actorId } = auth;

  const { data: domain } = await sb
    .from("agency_domains")
    .select("id, hostname, kind, status, tenant_id")
    .eq("id", input.domainId)
    .maybeSingle();
  if (!domain || domain.tenant_id !== input.tenantId) {
    return { ok: false, error: "Domain not found." };
  }
  if (!["active", "ssl_provisioned", "verified"].includes(domain.status ?? "")) {
    return { ok: false, error: "Domain must be active before setting as primary." };
  }

  await sb.from("agency_domains").update({ is_primary: false }).eq("tenant_id", input.tenantId);
  const { error } = await sb
    .from("agency_domains")
    .update({ is_primary: true })
    .eq("id", input.domainId);
  if (error) {
    logServerError("platform.setPrimary", error);
    return { ok: false, error: "Could not set primary domain." };
  }

  await recordAudit(sb, {
    actorId,
    action: "platform.tenant.domain.set_primary",
    tenantId: input.tenantId,
    targetType: "agency_domain",
    targetId: domain.hostname,
    metadata: { hostname: domain.hostname },
  });
  revalidateTenantSurfaces(input.tenantId);
  return { ok: true, data: undefined };
}

// ─── Create tenant ─────────────────────────────────────────────────────────────

export async function actionCreateTenant(input: {
  displayName: string;
  slug: string;
  kind: string;
  ownerEmail?: string | null;
}): Promise<TenantActionResult<{ id: string }>> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb, actorId } = auth;

  const displayName = input.displayName.trim();
  const slug = input.slug.trim().toLowerCase();
  if (!displayName) return { ok: false, error: "Display name is required." };
  if (!slug || slug.length < 3) return { ok: false, error: "Slug must be at least 3 characters." };
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
    return {
      ok: false,
      error: "Slug: lowercase letters, numbers, hyphens only (no leading/trailing hyphens).",
    };
  }
  if (!["agency", "hub"].includes(input.kind)) return { ok: false, error: "Invalid workspace type." };

  const { data: taken } = await sb.from("agencies").select("id").eq("slug", slug).maybeSingle();
  if (taken) return { ok: false, error: `Slug "${slug}" is already in use.` };

  const { data: agency, error: insErr } = await sb
    .from("agencies")
    // Free-tier seat cap explicitly set on insert. Without it the column
    // defaults to NULL, and `evaluateRosterSeatAvailability` in
    // lib/saas/roster-seat-limit.ts treats NULL as "unlimited" — meaning
    // a Platform-Admin-created Free workspace would silently bypass the
    // 5-profile cap that every other Free workspace enforces. Mirrors
    // SEAT_LIMITS.free in lib/server-actions/admin-billing.ts and the
    // seed value workspace-signup.server.ts uses for the get-started
    // funnel path, so all 3 agency-creation entry points converge.
    .insert({
      display_name: displayName,
      slug,
      kind: input.kind,
      status: "active",
      plan_tier: "free",
      talent_seat_limit: 5,
    })
    .select("id")
    .single();
  if (insErr || !agency) {
    logServerError("platform.createTenant.insert", insErr);
    return { ok: false, error: "Could not create workspace." };
  }
  const tenantId = (agency as { id: string }).id;

  if (input.ownerEmail?.trim()) {
    const email = input.ownerEmail.trim().toLowerCase();
    const profileId = await findProfileIdByEmail(sb, email);
    if (profileId) {
      await sb.from("agency_memberships").insert({
        tenant_id: tenantId,
        profile_id: profileId,
        role: "owner",
        status: "active",
        invited_by: actorId,
        invited_at: NOW(),
        accepted_at: NOW(),
      });
    }
  }

  await recordAudit(sb, {
    actorId,
    action: "platform.tenant.create",
    tenantId,
    targetType: "workspace",
    targetId: tenantId,
    severity: "warn",
    metadata: { slug, display_name: displayName, kind: input.kind },
  });
  revalidateTenantSurfaces();
  return { ok: true, data: { id: tenantId } };
}
