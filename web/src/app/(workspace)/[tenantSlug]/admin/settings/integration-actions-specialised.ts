"use server";

/**
 * Server actions for the SPECIALISED integration drawers (custom code, captcha,
 * white-label email domain). Split out of integration-actions.ts purely to keep
 * each server-action file under the 800-line cap — the guard pattern and return
 * contract are identical (requireSession → getTenantScopeBySlug →
 * userHasCapability("manage_agency_settings") → service-role write →
 * revalidatePath; never throws; never returns a decrypted secret).
 */

import { revalidatePath } from "next/cache";

import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { requireSession } from "@/lib/server/action-guards";
import { userHasCapability } from "@/lib/access";
import { logServerError } from "@/lib/server/safe-error";
import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";
import {
  CAPTCHA_INTEGRATION_KEY,
  CUSTOM_CODE_INTEGRATION_KEY,
  EMAIL_DOMAIN_INTEGRATION_KEY,
  getIntegrationDef,
  type IntegrationEntitlement,
} from "@/lib/integrations/catalog";
import {
  getIntegrationEntitlements,
  getSecretStatus,
  getTenantIntegration,
  setCredentialMode,
  setIntegrationConfig,
  setSecret,
} from "@/lib/integrations/repository";
import {
  createResendDomain,
  fetchResendDomain,
  type ResendDnsRecord,
} from "@/lib/integrations/email-domain";

export type IntegrationActionResult = { ok: true } | { ok: false; error: string };

type GuardOk = { ok: true; tenantId: string; actorId: string };
type GuardFail = { ok: false; error: string };

/** Staff-of-tenant guard (manage_agency_settings) — mirrors integration-actions.ts. */
async function requireSettingsManager(
  tenantSlug: string,
): Promise<GuardOk | GuardFail> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: "Please sign in again." };
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return { ok: false, error: "Workspace not found." };
  const canManage = await userHasCapability(
    "manage_agency_settings",
    scope.tenantId,
  );
  if (!canManage) {
    return { ok: false, error: "You don't have permission to change integrations." };
  }
  return { ok: true, tenantId: scope.tenantId, actorId: auth.user.id };
}

/** Settings-manager guard PLUS a plan-entitlement check. */
async function requireEntitledSettingsManager(
  tenantSlug: string,
  entitlement: IntegrationEntitlement,
): Promise<GuardOk | GuardFail> {
  const guard = await requireSettingsManager(tenantSlug);
  if (!guard.ok) return guard;
  const ent = await getIntegrationEntitlements(guard.tenantId);
  if (!ent[entitlement]) {
    return { ok: false, error: "Your plan doesn't include this — upgrade to unlock it." };
  }
  return guard;
}

// ── custom_code — head/body HTML injected on the tenant's storefront ─────────

/**
 * Save the two custom-code HTML blobs (head_html + body_html) into config_json.
 * Gated on the custom_css_allowed entitlement. These are PUBLIC values (they
 * ship to the browser by definition) — NOT secrets. Empty strings clear the
 * respective slot. Marks the integration connected when any code remains.
 */
export async function saveCustomCode(
  tenantSlug: string,
  input: { head_html: string; body_html: string },
): Promise<IntegrationActionResult> {
  const guard = await requireEntitledSettingsManager(
    tenantSlug,
    "custom_css_allowed",
  );
  if (!guard.ok) return guard;

  const head = (input.head_html ?? "").trim();
  const body = (input.body_html ?? "").trim();
  const anyPresent = head.length > 0 || body.length > 0;

  const row = await setIntegrationConfig(
    guard.tenantId,
    CUSTOM_CODE_INTEGRATION_KEY,
    { head_html: head || null, body_html: body || null },
    {
      status: anyPresent ? "connected" : "not_configured",
      connectionMethod: "manual",
      lastVerifiedAt: anyPresent ? new Date().toISOString() : null,
      lastError: null,
      actorId: guard.actorId,
    },
  );
  if (!row) {
    logServerError("integrations/saveCustomCode", { tenantId: guard.tenantId });
    return { ok: false, error: "Couldn't save. Please try again." };
  }

  scheduleWorkspaceAudit({
    tenantId: guard.tenantId,
    category: "integration",
    action: `integration.${CUSTOM_CODE_INTEGRATION_KEY}.updated`,
    summary: anyPresent ? "Updated custom site code" : "Cleared custom site code",
    targetType: "integration",
    targetId: CUSTOM_CODE_INTEGRATION_KEY,
    targetLabel: "Custom code",
  });

  revalidatePath(`/${tenantSlug}/admin/settings`);
  return { ok: true };
}

// ── captcha — provider + PUBLIC site_key (config) + SECRET secret_key (vault) ─

/**
 * Save the captcha configuration: provider + site_key into config_json (PUBLIC)
 * and secret_key into the encrypted vault. A blank secret_key leaves the stored
 * secret untouched (so a tenant can edit the site key without re-pasting the
 * secret). Provider + site_key are validated against the catalog format tests.
 */
export async function saveCaptcha(
  tenantSlug: string,
  input: { provider: "hcaptcha" | "turnstile"; site_key: string; secret_key: string },
): Promise<IntegrationActionResult> {
  const guard = await requireSettingsManager(tenantSlug);
  if (!guard.ok) return guard;

  const def = getIntegrationDef(CAPTCHA_INTEGRATION_KEY);
  if (!def) return { ok: false, error: "Unknown integration." };

  const provider = (input.provider ?? "").trim();
  const siteKey = (input.site_key ?? "").trim();
  const secretKey = (input.secret_key ?? "").trim();

  const providerField = def.fields.find((f) => f.name === "provider");
  const siteField = def.fields.find((f) => f.name === "site_key");
  const secretFieldDef = def.fields.find((f) => f.name === "secret_key");

  if (providerField?.test) {
    const r = providerField.test(provider);
    if (!r.ok) return { ok: false, error: "Pick a captcha provider." };
  }
  if (siteField?.test) {
    const r = siteField.test(siteKey);
    if (!r.ok) return { ok: false, error: "That doesn't look like a valid Site key." };
  }

  // Persist the PUBLIC values first.
  const row = await setIntegrationConfig(
    guard.tenantId,
    CAPTCHA_INTEGRATION_KEY,
    { provider, site_key: siteKey },
    {
      connectionMethod: "manual",
      lastError: null,
      actorId: guard.actorId,
    },
  );
  if (!row) {
    logServerError("integrations/saveCaptcha", { tenantId: guard.tenantId });
    return { ok: false, error: "Couldn't save. Please try again." };
  }

  // Persist the SECRET only when a new value was typed.
  if (secretKey) {
    if (secretFieldDef?.test) {
      const r = secretFieldDef.test(secretKey);
      if (!r.ok) {
        return { ok: false, error: "That doesn't look like a valid Secret key." };
      }
    }
    const stored = await setSecret(
      guard.tenantId,
      CAPTCHA_INTEGRATION_KEY,
      "secret_key",
      secretKey,
    );
    if (!stored) {
      logServerError("integrations/saveCaptchaSecret", { tenantId: guard.tenantId });
      return { ok: false, error: "Couldn't save the secret key. Please try again." };
    }
  }

  // Connected only when the public widget config AND a stored secret both exist.
  const secretStatus = await getSecretStatus(
    guard.tenantId,
    CAPTCHA_INTEGRATION_KEY,
    "secret_key",
  );
  const connected = !!provider && !!siteKey && secretStatus.present;
  await setIntegrationConfig(guard.tenantId, CAPTCHA_INTEGRATION_KEY, {}, {
    status: connected ? "connected" : "not_configured",
    connectionMethod: "manual",
    lastVerifiedAt: connected ? new Date().toISOString() : null,
    lastError: null,
    actorId: guard.actorId,
  });
  await setCredentialMode(guard.tenantId, CAPTCHA_INTEGRATION_KEY, "custom", guard.actorId);

  scheduleWorkspaceAudit({
    tenantId: guard.tenantId,
    category: "integration",
    action: `integration.${CAPTCHA_INTEGRATION_KEY}.updated`,
    summary: `Updated captcha settings (${provider})`,
    targetType: "integration",
    targetId: CAPTCHA_INTEGRATION_KEY,
    targetLabel: "Captcha",
    metadata: { provider, secretUpdated: secretKey.length > 0 },
  });

  revalidatePath(`/${tenantSlug}/admin/settings`);
  return { ok: true };
}

// ── email_domain — white-label sending domain via Resend Domains API ─────────

/**
 * Register (or re-register) the tenant's white-label sending domain with the
 * platform Resend account and store the returned domain id + DNS records +
 * status in config_json. Gated on white_label_email. The tenant then adds the
 * DNS records and calls verifyEmailDomain to poll for verification.
 */
export async function saveEmailDomain(
  tenantSlug: string,
  domain: string,
): Promise<IntegrationActionResult> {
  const guard = await requireEntitledSettingsManager(
    tenantSlug,
    "white_label_email",
  );
  if (!guard.ok) return guard;

  const def = getIntegrationDef(EMAIL_DOMAIN_INTEGRATION_KEY);
  const field = def?.fields.find((f) => f.name === "domain");
  const normalized = (domain ?? "").trim().toLowerCase();
  if (field?.test) {
    const r = field.test(normalized);
    if (!r.ok) {
      return { ok: false, error: "Enter a valid domain (e.g. mail.yourbrand.com)." };
    }
  }

  const created = await createResendDomain(normalized);
  if (!created.ok) {
    return { ok: false, error: created.error };
  }

  const row = await setIntegrationConfig(
    guard.tenantId,
    EMAIL_DOMAIN_INTEGRATION_KEY,
    {
      domain: created.name,
      resend_domain_id: created.id,
      verification_status: created.status,
      dns_records: created.records as unknown,
    },
    {
      status: created.status === "verified" ? "connected" : "not_configured",
      connectionMethod: "manual",
      lastVerifiedAt: created.status === "verified" ? new Date().toISOString() : null,
      lastError: null,
      actorId: guard.actorId,
    },
  );
  if (!row) {
    logServerError("integrations/saveEmailDomain", { tenantId: guard.tenantId });
    return { ok: false, error: "Couldn't save. Please try again." };
  }

  scheduleWorkspaceAudit({
    tenantId: guard.tenantId,
    category: "integration",
    action: `integration.${EMAIL_DOMAIN_INTEGRATION_KEY}.updated`,
    summary: `Registered email sending domain ${created.name}`,
    targetType: "integration",
    targetId: EMAIL_DOMAIN_INTEGRATION_KEY,
    targetLabel: created.name,
  });

  revalidatePath(`/${tenantSlug}/admin/settings`);
  return { ok: true };
}

export type VerifyEmailDomainResult =
  | { ok: true; status: string; records: ResendDnsRecord[] }
  | { ok: false; error: string };

/**
 * Poll Resend for the current verification status of the tenant's stored
 * sending domain (triggers a re-verify, then reads state) and persist the
 * fresh status + DNS records back into config_json. Flips the integration to
 * connected when Resend reports 'verified'.
 */
export async function verifyEmailDomain(
  tenantSlug: string,
): Promise<VerifyEmailDomainResult> {
  const guard = await requireEntitledSettingsManager(
    tenantSlug,
    "white_label_email",
  );
  if (!guard.ok) return guard;

  const existing = await getTenantIntegration(
    guard.tenantId,
    EMAIL_DOMAIN_INTEGRATION_KEY,
  );
  const config = (existing?.config_json ?? {}) as Record<string, unknown>;
  const domainId =
    typeof config.resend_domain_id === "string" ? config.resend_domain_id : "";
  if (!domainId) {
    return { ok: false, error: "Add a domain first, then verify." };
  }

  const fetched = await fetchResendDomain(domainId, true);
  if (!fetched.ok) {
    return { ok: false, error: fetched.error };
  }

  const verified = fetched.status === "verified";
  await setIntegrationConfig(
    guard.tenantId,
    EMAIL_DOMAIN_INTEGRATION_KEY,
    {
      verification_status: fetched.status,
      dns_records: fetched.records as unknown,
    },
    {
      status: verified ? "connected" : "not_configured",
      connectionMethod: "manual",
      lastVerifiedAt: verified ? new Date().toISOString() : null,
      lastError: verified
        ? null
        : "Domain not yet verified — DNS records may still be propagating.",
      actorId: guard.actorId,
    },
  );

  if (verified) {
    const domainLabel = typeof config.domain === "string" ? config.domain : null;
    scheduleWorkspaceAudit({
      tenantId: guard.tenantId,
      category: "integration",
      action: `integration.${EMAIL_DOMAIN_INTEGRATION_KEY}.verified`,
      summary: domainLabel
        ? `Email sending domain ${domainLabel} verified`
        : "Email sending domain verified",
      targetType: "integration",
      targetId: EMAIL_DOMAIN_INTEGRATION_KEY,
      targetLabel: domainLabel,
    });
  }

  revalidatePath(`/${tenantSlug}/admin/settings`);
  return { ok: true, status: fetched.status, records: fetched.records };
}
