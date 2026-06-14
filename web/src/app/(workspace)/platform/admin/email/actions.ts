"use server";

/**
 * Platform-admin server actions for the Email console (/platform/admin/email).
 *
 * SECURITY: every action re-checks super_admin server-side (the platform tenant
 * has no agency_membership, so the platform super_admin guard is the only
 * authority — same contract as platform-integration-actions.ts). All writes use
 * the service-role client (bypasses RLS, appropriate for a super-admin console).
 */

import { revalidatePath } from "next/cache";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { getPlatformRole } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { retryDispatchLogRow } from "@/lib/notifications/retry";
import {
  invalidateNotificationOverlayCache,
  invalidateTemplateOverrideCache,
} from "@/lib/notifications/overlay";
import { sendEmailResult } from "@/lib/email";
import { createResendDomain, fetchResendDomain } from "@/lib/integrations/email-domain";
import { setIntegrationConfig, getTenantIntegration } from "@/lib/integrations/repository";
import { EMAIL_DOMAIN_INTEGRATION_KEY } from "@/lib/integrations/catalog";

const REVALIDATE_PATH = "/platform/admin/email";

type GuardOk = { ok: true; actorId: string };
type GuardFail = { ok: false; error: string };

async function requirePlatformAdmin(): Promise<GuardOk | GuardFail> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Please sign in again." };
  if (getPlatformRole(session.profile) !== "super_admin") {
    return { ok: false, error: "Forbidden." };
  }
  return { ok: true, actorId: session.user.id };
}

// ─── Manual retry of a failed/suppressed send ────────────────────────────────

export type RetryActionResult =
  | { ok: true; outcome: "recovered" | "suppressed" | "skipped" | "failed" | "not_found" }
  | { ok: false; error: string };

export async function retryEmailRow(rowId: string): Promise<RetryActionResult> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service unavailable." };
  try {
    const outcome = await retryDispatchLogRow(admin, rowId);
    revalidatePath(REVALIDATE_PATH);
    return { ok: true, outcome };
  } catch (err) {
    logServerError("email-console.retryEmailRow", err);
    return { ok: false, error: "Retry failed. See logs." };
  }
}

// ─── Suppression management ──────────────────────────────────────────────────

export type SuppressionActionResult = { ok: true } | { ok: false; error: string };

export async function addSuppression(input: {
  email: string;
  notes?: string;
}): Promise<SuppressionActionResult> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard;
  const email = (input.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) return { ok: false, error: "Enter a valid email address." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service unavailable." };

  const { error } = await admin.from("email_suppressions").insert({
    email_address: email,
    reason: "manual",
    source: "admin",
    notes: (input.notes ?? "").trim() || null,
  });
  // 23505 = already suppressed; treat as success (idempotent).
  if (error && error.code !== "23505") {
    logServerError("email-console.addSuppression", error);
    return { ok: false, error: "Couldn't suppress. See logs." };
  }
  revalidatePath(REVALIDATE_PATH);
  return { ok: true };
}

export async function removeSuppression(email: string): Promise<SuppressionActionResult> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard;
  const addr = (email ?? "").trim().toLowerCase();
  if (!addr) return { ok: false, error: "Missing email." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service unavailable." };
  const { error } = await admin.from("email_suppressions").delete().eq("email_address", addr);
  if (error) {
    logServerError("email-console.removeSuppression", error);
    return { ok: false, error: "Couldn't unsuppress. See logs." };
  }
  revalidatePath(REVALIDATE_PATH);
  return { ok: true };
}

// ─── Diagnostic test-send ────────────────────────────────────────────────────

export type TestSendResult =
  | { ok: true; status: "sent" | "skipped"; id: string | null; from: string }
  | { ok: false; error: string; from?: string };

/**
 * Fire a REAL diagnostic email through the production send path so an admin can
 * verify deliverability + the resolved sender. Optionally pass a tenantId to
 * exercise the tenant-scoped from-resolution (the path that previously fell back
 * to an unverified domain). Returns the resolved `from` + Resend message id.
 */
export async function sendTestEmail(input: {
  to: string;
  tenantId?: string | null;
}): Promise<TestSendResult> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard;
  const to = (input.to ?? "").trim();
  if (!to.includes("@")) return { ok: false, error: "Enter a valid email address." };
  const tenantId = (input.tenantId ?? "").trim() || null;

  // Resolve the effective sender for display (same resolver the send uses).
  let from = "(unresolved)";
  try {
    const { resolveTenantEmailFrom } = await import("@/lib/email/resend-client");
    from = await resolveTenantEmailFrom(tenantId, null);
  } catch {
    /* display only — the send below resolves it again */
  }

  const sentAt = new Date().toISOString();
  const html = `<div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
    <h2 style="margin:0 0 12px;font-size:20px">Tulala email system — test</h2>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.5">This is a diagnostic test sent from the Platform Admin email console. If you received it, the send path is healthy.</p>
    <table style="font-size:13px;color:#555;border-collapse:collapse;margin-top:12px">
      <tr><td style="padding:4px 12px 4px 0">Resolved sender</td><td style="padding:4px 0"><strong>${from}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0">Tenant scope</td><td style="padding:4px 0">${tenantId ?? "platform default"}</td></tr>
      <tr><td style="padding:4px 12px 4px 0">Sent at</td><td style="padding:4px 0">${sentAt}</td></tr>
    </table>
  </div>`;

  const result = await sendEmailResult({
    to,
    subject: "Tulala email system — test send",
    html,
    tenantId,
  });

  if (result.status === "failed") {
    return { ok: false, error: result.error, from };
  }
  return { ok: true, status: result.status, id: result.status === "sent" ? result.id : null, from };
}

// ─── Per-event channel toggle (P3b) ──────────────────────────────────────────

export type ToggleActionResult = { ok: true } | { ok: false; error: string };

/**
 * Enable/disable a channel for one catalog entry (the console toggle grid).
 * Upserts the single channel column so the other channel is preserved. The
 * dispatcher consults this overlay (degrade-open, cached ~60s); we invalidate
 * the cache so the change takes effect on the next dispatch.
 */
export async function setEventOverlay(input: {
  catalogEntryId: string;
  channel: "email" | "in_app";
  enabled: boolean;
}): Promise<ToggleActionResult> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard;
  const entryId = (input.catalogEntryId ?? "").trim();
  if (!entryId) return { ok: false, error: "Missing entry." };
  if (input.channel !== "email" && input.channel !== "in_app") {
    return { ok: false, error: "Invalid channel." };
  }
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service unavailable." };

  const column = input.channel === "email" ? "email_enabled" : "in_app_enabled";
  const { error } = await admin.from("notification_overlay").upsert(
    {
      catalog_entry_id: entryId,
      [column]: input.enabled,
      updated_by: guard.actorId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "catalog_entry_id" },
  );
  if (error) {
    logServerError("email-console.setEventOverlay", error);
    return { ok: false, error: "Couldn't save the toggle. See logs." };
  }
  invalidateNotificationOverlayCache();
  revalidatePath(REVALIDATE_PATH);
  return { ok: true };
}

// ─── Editable template overrides (P3b) ───────────────────────────────────────

/**
 * Save (upsert) an email subject/body override for an entry+locale. Blank
 * subject AND blank body with enabled=false is equivalent to clearing it. The
 * render path consults this (cached) before the code template, with a
 * fallback-on-error guarantee.
 */
export async function setTemplateOverride(input: {
  catalogEntryId: string;
  locale?: string;
  subject: string;
  body: string;
  enabled: boolean;
}): Promise<ToggleActionResult> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard;
  const entryId = (input.catalogEntryId ?? "").trim();
  if (!entryId) return { ok: false, error: "Missing entry." };
  const locale = (input.locale ?? "en").trim() || "en";
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service unavailable." };

  const subject = input.subject.trim() || null;
  const body = input.body.trim() || null;
  const { error } = await admin.from("notification_template_override").upsert(
    {
      catalog_entry_id: entryId,
      locale,
      subject,
      body_markdown: body,
      enabled: input.enabled,
      updated_by: guard.actorId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "catalog_entry_id,locale" },
  );
  if (error) {
    logServerError("email-console.setTemplateOverride", error);
    return { ok: false, error: "Couldn't save the template. See logs." };
  }
  invalidateTemplateOverrideCache();
  revalidatePath(REVALIDATE_PATH);
  return { ok: true };
}

/** Delete an override so the entry reverts to its code template. */
export async function clearTemplateOverride(input: {
  catalogEntryId: string;
  locale?: string;
}): Promise<ToggleActionResult> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard;
  const entryId = (input.catalogEntryId ?? "").trim();
  if (!entryId) return { ok: false, error: "Missing entry." };
  const locale = (input.locale ?? "en").trim() || "en";
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service unavailable." };
  const { error } = await admin
    .from("notification_template_override")
    .delete()
    .eq("catalog_entry_id", entryId)
    .eq("locale", locale);
  if (error) {
    logServerError("email-console.clearTemplateOverride", error);
    return { ok: false, error: "Couldn't reset the template. See logs." };
  }
  invalidateTemplateOverrideCache();
  revalidatePath(REVALIDATE_PATH);
  return { ok: true };
}

// ─── Self-serve white-label sending domains (Resend Domains API) ──────────────

const PLATFORM_TENANT_ID = "00000000-0000-0000-0000-000000000001";

export type SendingDomainActionResult = { ok: true } | { ok: false; error: string };

/**
 * Register a tenant's own sending domain with Resend (via the platform key) and
 * store the returned id + DNS records + status on the tenant's email_domain
 * integration. The tenant then adds the DNS records; `verifySendingDomain` polls
 * until verified, at which point resolveTenantEmailFrom sends from that domain
 * (also gated by the white_label_email entitlement).
 */
export async function addSendingDomain(input: {
  tenantId: string;
  domain: string;
}): Promise<SendingDomainActionResult> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard;
  const tenantId = (input.tenantId ?? "").trim();
  const domain = (input.domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!tenantId) return { ok: false, error: "Missing tenant id." };
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return { ok: false, error: "Enter a valid domain (e.g. mail.agency.com)." };
  if (tenantId === PLATFORM_TENANT_ID) return { ok: false, error: "That's the platform default — use the from-address card instead." };

  const created = await createResendDomain(domain);
  if (!created.ok) return { ok: false, error: created.error };

  const verified = created.status === "verified";
  const saved = await setIntegrationConfig(
    tenantId,
    EMAIL_DOMAIN_INTEGRATION_KEY,
    {
      domain,
      resend_domain_id: created.id,
      verification_status: created.status,
      records: created.records,
    },
    {
      status: verified ? "connected" : "not_configured",
      actorId: guard.actorId,
      lastVerifiedAt: verified ? new Date().toISOString() : null,
    },
  );
  if (!saved) {
    logServerError("email-console.addSendingDomain.save", new Error("setIntegrationConfig returned null"));
    return { ok: false, error: "Registered with Resend but couldn't save. See logs." };
  }
  revalidatePath(REVALIDATE_PATH);
  return { ok: true };
}

/** Re-check a tenant domain's DNS with Resend and update its stored status + records. */
export async function verifySendingDomain(input: { tenantId: string }): Promise<SendingDomainActionResult> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard;
  const tenantId = (input.tenantId ?? "").trim();
  if (!tenantId) return { ok: false, error: "Missing tenant id." };

  const row = await getTenantIntegration(tenantId, EMAIL_DOMAIN_INTEGRATION_KEY);
  const cfg = (row?.config_json ?? {}) as Record<string, unknown>;
  const domainId = typeof cfg.resend_domain_id === "string" ? cfg.resend_domain_id : null;
  if (!domainId) return { ok: false, error: "No registered domain to verify." };

  const fresh = await fetchResendDomain(domainId, true);
  if (!fresh.ok) return { ok: false, error: fresh.error };

  const verified = fresh.status === "verified";
  const saved = await setIntegrationConfig(
    tenantId,
    EMAIL_DOMAIN_INTEGRATION_KEY,
    { verification_status: fresh.status, records: fresh.records },
    {
      status: verified ? "connected" : "not_configured",
      actorId: guard.actorId,
      lastVerifiedAt: verified ? new Date().toISOString() : null,
    },
  );
  if (!saved) return { ok: false, error: "Couldn't save the refreshed status. See logs." };
  revalidatePath(REVALIDATE_PATH);
  return { ok: true };
}

/** Disconnect a tenant's white-label domain (reverts that tenant to the platform sender). */
export async function removeSendingDomain(input: { tenantId: string }): Promise<SendingDomainActionResult> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard;
  const tenantId = (input.tenantId ?? "").trim();
  if (!tenantId) return { ok: false, error: "Missing tenant id." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service unavailable." };
  // Clear the integration so resolveTenantEmailFrom falls back to the platform
  // sender. (The domain stays in the Resend account; re-adding re-links it.)
  const { error } = await admin
    .from("tenant_integrations")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("integration_key", EMAIL_DOMAIN_INTEGRATION_KEY);
  if (error) {
    logServerError("email-console.removeSendingDomain", error);
    return { ok: false, error: "Couldn't disconnect the domain. See logs." };
  }
  revalidatePath(REVALIDATE_PATH);
  return { ok: true };
}
