"use server";

/**
 * Platform-admin server actions for the PLATFORM-DEFAULT integration keys.
 *
 * These manage the integration rows stored under the canonical platform tenant
 * id ({@link DEFAULT_AI_TENANT_ID}) — the values every tenant INHERITS (the
 * platform-DB layer of the tenant-custom → platform-DB → env fallback chain in
 * resolve.ts / analytics-resolver.ts / resend-client.ts).
 *
 * SECURITY CONTRACT (every write re-checks this server-side):
 *   - getCachedActorSession() + getPlatformRole(...) === 'super_admin'. The
 *     platform tenant has NO agency_membership, so the per-tenant
 *     manage_agency_settings capability does NOT apply here — the platform
 *     super_admin guard is the only authority.
 *   - Service-role repository writes (createServiceRoleClient under the hood).
 *   - NEVER returns a decrypted secret. The loader surfaces only masked status
 *     (present + last4); secrets go IN via setSecret, never OUT.
 */

import { revalidatePath } from "next/cache";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { getPlatformRole } from "@/lib/access/platform-role";
import { logServerError } from "@/lib/server/safe-error";
import {
  CAPTCHA_INTEGRATION_KEY,
  EMAIL_DOMAIN_INTEGRATION_KEY,
  GA4_INTEGRATION_KEY,
  GOOGLE_MAPS_INTEGRATION_KEY,
  getIntegrationDef,
} from "@/lib/integrations/catalog";
import {
  deleteSecret,
  setIntegrationConfig,
  setSecret,
} from "@/lib/integrations/repository";
import {
  invalidatePlatformDefaultsCache,
  PLATFORM_TENANT_ID,
  platformConfigField,
  platformSecretStatus,
} from "@/lib/integrations/platform-defaults";

export type PlatformIntegrationActionResult =
  | { ok: true }
  | { ok: false; error: string };

const REVALIDATE_PATH = "/platform/admin/integrations";

type GuardOk = { ok: true; actorId: string };
type GuardFail = { ok: false; error: string };

/**
 * super_admin gate. The ONLY authority for platform-default writes — the
 * platform tenant has no membership row, so the tenant manage_agency_settings
 * guard is deliberately NOT used here.
 */
async function requirePlatformAdmin(): Promise<GuardOk | GuardFail> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Please sign in again." };
  if (getPlatformRole(session.profile) !== "super_admin") {
    return { ok: false, error: "Forbidden." };
  }
  return { ok: true, actorId: session.user.id };
}

// ─── Loader (super_admin gated, masked secrets only) ─────────────────────────

export type PlatformDefaultStatus = "configured" | "env_fallback" | "unset";

export type PlatformIntegrationDefault = {
  key: string;
  label: string;
  /** PUBLIC config values currently stored (masked-safe — these are public). */
  config: Record<string, string>;
  /** Masked secret status, when this integration has a secret field. */
  secret: { present: boolean; last4: string | null } | null;
  /** Whether the platform DB row supplies a value vs. relying on env. */
  status: PlatformDefaultStatus;
  /** Human note on what env var the runtime falls back to when unset in DB. */
  envFallbackNote: string;
};

export type PlatformIntegrationDefaultsView = {
  ok: boolean;
  items: PlatformIntegrationDefault[];
};

/**
 * Load the four platform-default integrations for the admin UI. super_admin
 * gated. Returns PUBLIC config + MASKED secret status only — never a decrypted
 * secret.
 */
export async function loadPlatformIntegrationDefaults(): Promise<PlatformIntegrationDefaultsView> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return { ok: false, items: [] };

  // ── Google Maps (secret api_key) ──
  const mapsSecret = await platformSecretStatus(GOOGLE_MAPS_INTEGRATION_KEY, "api_key");
  const mapsEnv =
    (process.env.GOOGLE_PLACES_API_KEY?.trim() ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()) ?? null;

  // ── GA4 (public measurement_id) ──
  const ga4Id = await platformConfigField(GA4_INTEGRATION_KEY, "measurement_id");
  const ga4Env = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || null;

  // ── Captcha (public provider + site_key, secret secret_key) ──
  const capProvider = await platformConfigField(CAPTCHA_INTEGRATION_KEY, "provider");
  const capSiteKey = await platformConfigField(CAPTCHA_INTEGRATION_KEY, "site_key");
  const capSecret = await platformSecretStatus(CAPTCHA_INTEGRATION_KEY, "secret_key");
  const capEnv =
    (process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY?.trim() ||
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()) ?? null;

  // ── Email-from (public from_address or domain) ──
  const emailFrom = await platformConfigField(EMAIL_DOMAIN_INTEGRATION_KEY, "from_address");
  const emailDomain = await platformConfigField(EMAIL_DOMAIN_INTEGRATION_KEY, "domain");
  const emailEnv = process.env.EMAIL_FROM?.trim() || null;

  const items: PlatformIntegrationDefault[] = [
    {
      key: GOOGLE_MAPS_INTEGRATION_KEY,
      label: "Google Maps",
      config: {},
      secret: mapsSecret,
      status: mapsSecret.present ? "configured" : mapsEnv ? "env_fallback" : "unset",
      envFallbackNote: "GOOGLE_PLACES_API_KEY / NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
    },
    {
      key: GA4_INTEGRATION_KEY,
      label: "Google Analytics 4",
      config: ga4Id ? { measurement_id: ga4Id } : {},
      secret: null,
      status: ga4Id ? "configured" : ga4Env ? "env_fallback" : "unset",
      envFallbackNote: "NEXT_PUBLIC_GA_MEASUREMENT_ID",
    },
    {
      key: CAPTCHA_INTEGRATION_KEY,
      label: "Captcha",
      config: {
        ...(capProvider ? { provider: capProvider } : {}),
        ...(capSiteKey ? { site_key: capSiteKey } : {}),
      },
      secret: capSecret,
      status:
        capProvider && capSiteKey
          ? "configured"
          : capEnv
            ? "env_fallback"
            : "unset",
      envFallbackNote: "NEXT_PUBLIC_HCAPTCHA_SITE_KEY / NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    },
    {
      key: EMAIL_DOMAIN_INTEGRATION_KEY,
      label: "Email from-address",
      config: {
        ...(emailFrom ? { from_address: emailFrom } : {}),
        ...(emailDomain ? { domain: emailDomain } : {}),
      },
      secret: null,
      status: emailFrom || emailDomain ? "configured" : emailEnv ? "env_fallback" : "unset",
      envFallbackNote: "EMAIL_FROM",
    },
  ];

  return { ok: true, items };
}

// ─── Google Maps default (secret api_key) ────────────────────────────────────

/**
 * Set the platform-default Google Maps browser key (a referer-restricted key
 * the platform owns). Stored encrypted in the vault under the platform tenant.
 * A blank value is rejected — use clearGoogleMapsDefault to remove it.
 */
export async function savePlatformGoogleMapsKey(
  apiKey: string,
): Promise<PlatformIntegrationActionResult> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard;

  const value = (apiKey ?? "").trim();
  const def = getIntegrationDef(GOOGLE_MAPS_INTEGRATION_KEY);
  const field = def?.fields.find((f) => f.name === "api_key");
  if (field?.test) {
    const r = field.test(value);
    if (!r.ok) return { ok: false, error: "That doesn't look like a valid Maps key." };
  }

  const stored = await setSecret(
    PLATFORM_TENANT_ID,
    GOOGLE_MAPS_INTEGRATION_KEY,
    "api_key",
    value,
  );
  if (!stored) {
    logServerError("platform-integrations/savePlatformGoogleMapsKey", {});
    return { ok: false, error: "Couldn't save. Please try again." };
  }
  await setIntegrationConfig(PLATFORM_TENANT_ID, GOOGLE_MAPS_INTEGRATION_KEY, {}, {
    status: "connected",
    connectionMethod: "manual",
    lastVerifiedAt: new Date().toISOString(),
    lastError: null,
    actorId: guard.actorId,
  });

  invalidatePlatformDefaultsCache();
  revalidatePath(REVALIDATE_PATH);
  return { ok: true };
}

export async function clearPlatformGoogleMapsKey(): Promise<PlatformIntegrationActionResult> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard;
  await deleteSecret(PLATFORM_TENANT_ID, GOOGLE_MAPS_INTEGRATION_KEY, "api_key");
  await setIntegrationConfig(PLATFORM_TENANT_ID, GOOGLE_MAPS_INTEGRATION_KEY, {}, {
    status: "not_configured",
    lastVerifiedAt: null,
    lastError: null,
    actorId: guard.actorId,
  });
  invalidatePlatformDefaultsCache();
  revalidatePath(REVALIDATE_PATH);
  return { ok: true };
}

// ─── GA4 default (public measurement_id) ─────────────────────────────────────

export async function savePlatformGa4Id(
  measurementId: string,
): Promise<PlatformIntegrationActionResult> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard;

  const value = (measurementId ?? "").trim();
  const def = getIntegrationDef(GA4_INTEGRATION_KEY);
  const field = def?.fields.find((f) => f.name === "measurement_id");
  if (field?.test) {
    const r = field.test(value);
    if (!r.ok) return { ok: false, error: "Expected a GA4 Measurement ID (G-XXXXXXXXXX)." };
  }

  const row = await setIntegrationConfig(
    PLATFORM_TENANT_ID,
    GA4_INTEGRATION_KEY,
    { measurement_id: value },
    {
      status: "connected",
      connectionMethod: "manual",
      lastVerifiedAt: new Date().toISOString(),
      lastError: null,
      actorId: guard.actorId,
    },
  );
  if (!row) {
    logServerError("platform-integrations/savePlatformGa4Id", {});
    return { ok: false, error: "Couldn't save. Please try again." };
  }
  invalidatePlatformDefaultsCache();
  revalidatePath(REVALIDATE_PATH);
  return { ok: true };
}

export async function clearPlatformGa4Id(): Promise<PlatformIntegrationActionResult> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard;
  await setIntegrationConfig(
    PLATFORM_TENANT_ID,
    GA4_INTEGRATION_KEY,
    { measurement_id: null },
    { status: "not_configured", lastVerifiedAt: null, lastError: null, actorId: guard.actorId },
  );
  invalidatePlatformDefaultsCache();
  revalidatePath(REVALIDATE_PATH);
  return { ok: true };
}

// ─── Captcha default (public provider + site_key, secret secret_key) ─────────

export async function savePlatformCaptcha(input: {
  provider: "hcaptcha" | "turnstile";
  site_key: string;
  secret_key: string;
}): Promise<PlatformIntegrationActionResult> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard;

  const def = getIntegrationDef(CAPTCHA_INTEGRATION_KEY);
  if (!def) return { ok: false, error: "Unknown integration." };

  const provider = (input.provider ?? "").trim();
  const siteKey = (input.site_key ?? "").trim();
  const secretKey = (input.secret_key ?? "").trim();

  const providerField = def.fields.find((f) => f.name === "provider");
  const siteField = def.fields.find((f) => f.name === "site_key");
  const secretFieldDef = def.fields.find((f) => f.name === "secret_key");

  if (providerField?.test && !providerField.test(provider).ok) {
    return { ok: false, error: "Pick a captcha provider." };
  }
  if (siteField?.test && !siteField.test(siteKey).ok) {
    return { ok: false, error: "That doesn't look like a valid Site key." };
  }

  const row = await setIntegrationConfig(
    PLATFORM_TENANT_ID,
    CAPTCHA_INTEGRATION_KEY,
    { provider, site_key: siteKey },
    { connectionMethod: "manual", lastError: null, actorId: guard.actorId },
  );
  if (!row) {
    logServerError("platform-integrations/savePlatformCaptcha", {});
    return { ok: false, error: "Couldn't save. Please try again." };
  }

  // Persist the SECRET only when a new value was typed (blank leaves it intact).
  if (secretKey) {
    if (secretFieldDef?.test && !secretFieldDef.test(secretKey).ok) {
      return { ok: false, error: "That doesn't look like a valid Secret key." };
    }
    const stored = await setSecret(
      PLATFORM_TENANT_ID,
      CAPTCHA_INTEGRATION_KEY,
      "secret_key",
      secretKey,
    );
    if (!stored) {
      logServerError("platform-integrations/savePlatformCaptchaSecret", {});
      return { ok: false, error: "Couldn't save the secret key. Please try again." };
    }
  }

  const secretStatus = await platformSecretStatus(CAPTCHA_INTEGRATION_KEY, "secret_key");
  const connected = !!provider && !!siteKey && secretStatus.present;
  await setIntegrationConfig(PLATFORM_TENANT_ID, CAPTCHA_INTEGRATION_KEY, {}, {
    status: connected ? "connected" : "not_configured",
    connectionMethod: "manual",
    lastVerifiedAt: connected ? new Date().toISOString() : null,
    lastError: null,
    actorId: guard.actorId,
  });

  invalidatePlatformDefaultsCache();
  revalidatePath(REVALIDATE_PATH);
  return { ok: true };
}

export async function clearPlatformCaptcha(): Promise<PlatformIntegrationActionResult> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard;
  await deleteSecret(PLATFORM_TENANT_ID, CAPTCHA_INTEGRATION_KEY, "secret_key");
  await setIntegrationConfig(
    PLATFORM_TENANT_ID,
    CAPTCHA_INTEGRATION_KEY,
    { provider: null, site_key: null },
    { status: "not_configured", lastVerifiedAt: null, lastError: null, actorId: guard.actorId },
  );
  invalidatePlatformDefaultsCache();
  revalidatePath(REVALIDATE_PATH);
  return { ok: true };
}

// ─── Email from-address default (public) ─────────────────────────────────────

/**
 * Set the platform-default outbound `from`. Accepts either a full
 * "Name <addr@domain>" / bare address (stored as `from_address`) or a bare
 * sending domain (stored as `domain` → noreply@<domain>). At least one is
 * required; both blank → use clearPlatformEmailFrom instead.
 */
export async function savePlatformEmailFrom(input: {
  from_address?: string;
  domain?: string;
}): Promise<PlatformIntegrationActionResult> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard;

  const fromAddress = (input.from_address ?? "").trim();
  const domain = (input.domain ?? "").trim().toLowerCase();

  if (!fromAddress && !domain) {
    return { ok: false, error: "Enter a from-address or a sending domain." };
  }
  if (fromAddress && !fromAddress.includes("@")) {
    return { ok: false, error: "A from-address must contain an @." };
  }
  if (domain) {
    const def = getIntegrationDef(EMAIL_DOMAIN_INTEGRATION_KEY);
    const field = def?.fields.find((f) => f.name === "domain");
    if (field?.test && !field.test(domain).ok) {
      return { ok: false, error: "Enter a valid domain (e.g. mail.yourbrand.com)." };
    }
  }

  const row = await setIntegrationConfig(
    PLATFORM_TENANT_ID,
    EMAIL_DOMAIN_INTEGRATION_KEY,
    {
      from_address: fromAddress || null,
      domain: domain || null,
    },
    {
      status: "connected",
      connectionMethod: "manual",
      lastVerifiedAt: new Date().toISOString(),
      lastError: null,
      actorId: guard.actorId,
    },
  );
  if (!row) {
    logServerError("platform-integrations/savePlatformEmailFrom", {});
    return { ok: false, error: "Couldn't save. Please try again." };
  }
  invalidatePlatformDefaultsCache();
  revalidatePath(REVALIDATE_PATH);
  return { ok: true };
}

export async function clearPlatformEmailFrom(): Promise<PlatformIntegrationActionResult> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard;
  await setIntegrationConfig(
    PLATFORM_TENANT_ID,
    EMAIL_DOMAIN_INTEGRATION_KEY,
    { from_address: null, domain: null },
    { status: "not_configured", lastVerifiedAt: null, lastError: null, actorId: guard.actorId },
  );
  invalidatePlatformDefaultsCache();
  revalidatePath(REVALIDATE_PATH);
  return { ok: true };
}
