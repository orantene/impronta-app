"use server";

/**
 * Server actions for the workspace Settings → Integrations hub.
 *
 * Covers the BYO per-tenant integration credentials (mirrors the AI
 * credential-vault inherit|custom pattern):
 *   - PUBLIC identifiers (GA4 measurement ID, Meta/TikTok pixel IDs, LinkedIn
 *     partner ID, GTM container ID) → tenant_integrations.config_json. No secret.
 *   - True secrets (the Google Maps API key) → encrypted tenant_integration_secrets.
 *
 * EVERY action follows the canonical guard order: requireSession →
 * getTenantScopeBySlug → userHasCapability("manage_agency_settings") →
 * service-role write → revalidatePath. Actions NEVER throw — they always return
 * { ok: true, ... } | { ok: false, error }. Decrypted secrets are NEVER returned
 * to the client; only a masked last4 + status ever leaves the server.
 */

import { revalidatePath } from "next/cache";

import { isConnectionOAuthConfigured } from "@/lib/connection-oauth/providers";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { requireSession } from "@/lib/server/action-guards";
import { userHasCapability } from "@/lib/access";
import { logServerError } from "@/lib/server/safe-error";
import { auditEvent } from "@/lib/audit/emit";
import {
  YOUTUBE_INTEGRATION_KEY,
  getIntegrationDef,
  listIntegrationDefs,
  listSurfacedIntegrations,
  type IntegrationDef,
  type IntegrationEntitlement,
} from "@/lib/integrations/catalog";
import {
  deleteIntegrationSecrets,
  deleteSecret,
  getIntegrationEntitlements,
  getSecretStatus,
  getTenantIntegration,
  listTenantIntegrations,
  setCredentialMode,
  setIntegrationConfig,
  setSecret,
  tenantHasConnectedPayoutAccount,
  tenantHasCustomDomain,
  type TenantIntegrationRow,
} from "@/lib/integrations/repository";
import {
  applyWorkspaceYouTubePublishState,
  clearWorkspaceYouTubeIdentity,
} from "@/lib/integrations/workspace-social-sync";

// ── Shared types ────────────────────────────────────────────────────────────

export type IntegrationActionResult = { ok: true } | { ok: false; error: string };

/** Resolved snapshot of one integration for the UI (never includes secrets). */
export type IntegrationView = {
  key: string;
  label: string;
  /**
   * i18n catalog keys mirroring `label` / `description` / `instructions`, copied
   * straight off the catalog def. The English strings stay for non-UI consumers;
   * every client surface renders `t(labelKey)` / `t(descriptionKey)` /
   * `instructionKeys.map(t)`. `instructionKeys` is index-aligned with
   * `instructions` (both empty for surfaced link cards).
   */
  labelKey: string;
  category: IntegrationDef["category"];
  connection: IntegrationDef["connection"];
  inheritable: boolean;
  description: string;
  descriptionKey: string;
  instructions: string[];
  instructionKeys: string[];
  fields: {
    name: string;
    label: string;
    labelKey: string;
    secret: boolean;
    public: boolean;
    /** Current PUBLIC config value (only for non-secret fields). */
    value: string | null;
    /** For secret fields: masked status, never the value. */
    secretPresent: boolean;
    secretLast4: string | null;
  }[];
  credentialMode: "inherit" | "custom";
  status: TenantIntegrationRow["status"];
  lastVerifiedAt: string | null;
  lastError: string | null;
  /**
   * The plan-entitlement gate (if any) and whether the tenant currently meets
   * it. `locked: true` → the drawer renders read-only with an upgrade prompt
   * and the write actions refuse.
   */
  entitlement: IntegrationEntitlement | null;
  locked: boolean;
  /**
   * For `connection: 'link'` (surfaced) integrations only: the in-app href the
   * card navigates to. Null for credential-bearing integrations.
   */
  href: string | null;
  /**
   * Raw config_json snapshot (PUBLIC values only) — lets specialised drawers
   * (custom code, captcha, email domain) read multi-field state without a
   * second round-trip. Never contains secrets.
   */
  config: Record<string, unknown>;
  /**
   * OAuth integrations only: whether THIS DEPLOYMENT has the provider's client
   * credentials. False → the card shows "Setup required" (a platform gap the
   * operator cannot fix) instead of "Action needed" (which implies they can).
   */
  providerConfigured?: boolean;
};

export type LoadIntegrationsResult =
  | { ok: true; canManage: boolean; integrations: IntegrationView[] }
  | { ok: false; error: string };

// ── Guard helper ─────────────────────────────────────────────────────────────

type GuardOk = { ok: true; tenantId: string; actorId: string };
type GuardFail = { ok: false; error: string };

/**
 * Staff-of-tenant guard for every write below. Confirms a live session, resolves
 * the tenant from the URL slug, and re-checks the manage_agency_settings
 * capability server-side (never trusted from the client).
 */
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
    return {
      ok: false,
      error: "You don't have permission to change integrations.",
    };
  }
  return { ok: true, tenantId: scope.tenantId, actorId: auth.user.id };
}

// ── Read (loader for the Settings → Integrations section) ────────────────────

/**
 * Load the integrations hub state for a tenant: every catalog integration with
 * its current mode/status, PUBLIC config values, and MASKED secret status.
 * View-gated (agency.workspace.view); editing is gated separately by canManage.
 */
export async function loadTenantIntegrations(
  tenantSlug: string,
): Promise<LoadIntegrationsResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: "Please sign in again." };

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return { ok: false, error: "Workspace not found." };

  const canView = await userHasCapability(
    "agency.workspace.view",
    scope.tenantId,
  );
  if (!canView) {
    return { ok: false, error: "You don't have access to this workspace." };
  }
  const canManage = await userHasCapability(
    "manage_agency_settings",
    scope.tenantId,
  );

  const [rows, entitlements] = await Promise.all([
    listTenantIntegrations(scope.tenantId),
    getIntegrationEntitlements(scope.tenantId),
  ]);
  const rowByKey = new Map(rows.map((r) => [r.integration_key, r]));

  // Iterate the catalog so unconfigured integrations still appear.
  const defs = listIntegrationDefs();

  const integrations: IntegrationView[] = [];
  for (const def of defs) {
    const row = rowByKey.get(def.key) ?? null;
    const config = (row?.config_json ?? {}) as Record<string, unknown>;
    const locked = def.entitlement ? !entitlements[def.entitlement] : false;

    const fields: IntegrationView["fields"] = [];
    for (const f of def.fields) {
      if (f.secret) {
        const status = await getSecretStatus(scope.tenantId, def.key, f.name);
        fields.push({
          name: f.name,
          label: f.label,
          labelKey: f.labelKey,
          secret: true,
          public: false,
          value: null,
          secretPresent: status.present,
          secretLast4: status.last4,
        });
      } else {
        const raw = config[f.name];
        fields.push({
          name: f.name,
          label: f.label,
          labelKey: f.labelKey,
          secret: false,
          public: f.public,
          value: typeof raw === "string" ? raw : null,
          secretPresent: false,
          secretLast4: null,
        });
      }
    }

    integrations.push({
      key: def.key,
      label: def.label,
      labelKey: def.labelKey,
      category: def.category,
      connection: def.connection,
      inheritable: def.inheritable,
      description: def.description,
      descriptionKey: def.descriptionKey,
      instructions: def.instructions,
      instructionKeys: def.instructionKeys,
      fields,
      credentialMode: row?.credential_mode ?? "inherit",
      status: row?.status ?? "not_configured",
      lastVerifiedAt: row?.last_verified_at ?? null,
      lastError: row?.last_error ?? null,
      entitlement: def.entitlement ?? null,
      locked,
      href: null,
      config,
      providerConfigured:
        def.connection === "oauth"
          ? isConnectionOAuthConfigured(
              def.key as Parameters<typeof isConnectionOAuthConfigured>[0],
            )
          : undefined,
    });
  }

  // Surfaced (link-only) integrations: no drawer, no credential — a card that
  // navigates to the existing in-app settings route. Status is best-effort live
  // (Stripe payout-account connected; otherwise a neutral "Set up" state).
  for (const surfaced of listSurfacedIntegrations()) {
    const liveStatus = await resolveSurfacedStatus(scope.tenantId, surfaced.key);
    integrations.push({
      key: surfaced.key,
      label: surfaced.label,
      labelKey: surfaced.labelKey,
      category: surfaced.category,
      connection: "link",
      inheritable: false,
      description: surfaced.description,
      descriptionKey: surfaced.descriptionKey,
      instructions: [],
      instructionKeys: [],
      fields: [],
      credentialMode: "inherit",
      status: liveStatus,
      lastVerifiedAt: null,
      lastError: null,
      entitlement: null,
      locked: false,
      href: `/${tenantSlug}${surfaced.hrefPath}`,
      config: {},
    });
  }

  return { ok: true, canManage, integrations };
}

/**
 * Best-effort live status for a surfaced (link-only) integration. Read-only;
 * never throws. Stripe is 'connected' when the tenant has a connected payout
 * account; custom domain is 'connected' when an active agency_domains row
 * exists; AI provider is 'connected' when the entitlement is on. Anything we
 * can't positively confirm resolves to 'not_configured' (the card shows
 * "Set up").
 */
async function resolveSurfacedStatus(
  tenantId: string,
  key: string,
): Promise<TenantIntegrationRow["status"]> {
  try {
    if (key === "stripe_connect") {
      const connected = await tenantHasConnectedPayoutAccount(tenantId);
      return connected ? "connected" : "not_configured";
    }
    if (key === "custom_domain") {
      const connected = await tenantHasCustomDomain(tenantId);
      return connected ? "connected" : "not_configured";
    }
    if (key === "ai_provider") {
      // No tenant route resolves a per-tenant key today; surface a neutral
      // "Set up" so the card is a navigation entry point, not a false-positive.
      return "not_configured";
    }
  } catch {
    // fall through
  }
  return "not_configured";
}

// ── Write: PUBLIC config (GA4 / pixel / GTM identifiers) ─────────────────────

/**
 * Save PUBLIC identifier(s) into config_json for an integration. Validates each
 * supplied value against the catalog field's offline test() before writing — a
 * value that fails the format check is REJECTED and nothing persists. A field
 * that is blank/whitespace is removed from config_json (a "clear"). Sets
 * status='connected' when at least one value remains, else 'not_configured'.
 *
 * Because every written value has already passed its format test() here, the
 * same upsert stamps last_verified_at=now() (the format check IS the offline
 * verification) — no separate post-save testIntegration round-trip is needed.
 */
export async function saveIntegrationConfig(
  tenantSlug: string,
  key: string,
  configValues: Record<string, string>,
): Promise<IntegrationActionResult> {
  const guard = await requireSettingsManager(tenantSlug);
  if (!guard.ok) return guard;

  const def = getIntegrationDef(key);
  if (!def) return { ok: false, error: "Unknown integration." };

  const patch: Record<string, unknown> = {};
  let anyValuePresent = false;

  for (const [fieldName, rawValue] of Object.entries(configValues)) {
    const field = def.fields.find((f) => f.name === fieldName && !f.secret);
    if (!field) {
      return { ok: false, error: `Unknown field "${fieldName}".` };
    }
    const value = (rawValue ?? "").trim();
    if (!value) {
      // Clear this identifier.
      patch[fieldName] = null;
      continue;
    }
    if (field.test) {
      const result = field.test(value);
      if (!result.ok) {
        return {
          ok: false,
          error: `That doesn't look like a valid ${field.label}.`,
        };
      }
    }
    patch[fieldName] = value;
    anyValuePresent = true;
  }

  // setIntegrationConfig merges (null deletes), then we re-evaluate presence
  // against the resulting row to pick the status.
  const existing = await getTenantIntegration(guard.tenantId, key);
  const projected: Record<string, unknown> = {
    ...((existing?.config_json ?? {}) as Record<string, unknown>),
  };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete projected[k];
    else projected[k] = v;
  }
  anyValuePresent = def.fields.some(
    (f) => !f.secret && typeof projected[f.name] === "string",
  );

  const row = await setIntegrationConfig(guard.tenantId, key, patch, {
    status: anyValuePresent ? "connected" : "not_configured",
    connectionMethod: "manual",
    // Every persisted value passed its catalog test() above, so this save IS the
    // offline verification — stamp it now (and clear it when nothing remains).
    lastVerifiedAt: anyValuePresent ? new Date().toISOString() : null,
    lastError: null,
    actorId: guard.actorId,
  });
  if (!row) {
    logServerError("integrations/saveConfig", { key, tenantId: guard.tenantId });
    return { ok: false, error: "Couldn't save. Please try again." };
  }

  if (key === YOUTUBE_INTEGRATION_KEY) {
    // Reconcile the public-site identity through the single toggle-aware path:
    // the channel only publishes into social_youtube when show_on_public_site
    // is ON (privacy-first). Editing the URL never changes the publish choice.
    const previousProfileUrl =
      typeof existing?.config_json?.profile_url === "string"
        ? existing.config_json.profile_url
        : null;
    await applyWorkspaceYouTubePublishState({
      tenantId: guard.tenantId,
      config: row.config_json as Record<string, unknown>,
      previousProfileUrl,
      actorUserId: guard.actorId,
    });
  }

  auditEvent(guard.tenantId, "integration", `integration.${key}.updated`,
    `Updated ${def.label} settings`,
    { targetType: "integration", targetId: key, targetLabel: def.label,
      metadata: { changedKeys: Object.keys(patch) } });

  revalidatePath(`/${tenantSlug}/admin/settings`);
  return { ok: true };
}

// ── Write: workspace YouTube "Show on public site" toggle ────────────────────

/**
 * Flip the "Show on public site" control for the workspace YouTube integration.
 *
 * Connecting/verifying a channel and publishing it to the public site are
 * deliberately decoupled (privacy-first): the connection + OAuth verification
 * persist regardless of this toggle. When ON, the verified channel URL is
 * mirrored into agency_business_identity.social_youtube (public header/footer);
 * when OFF, that mirror is cleared — but only if it still matches the
 * integration-owned value, so a hand-edited Business-identity value is never
 * clobbered.
 *
 * The toggle is stored in tenant_integrations.config_json.show_on_public_site.
 */
export async function setWorkspaceYouTubePublic(
  tenantSlug: string,
  showOnPublicSite: boolean,
): Promise<IntegrationActionResult> {
  const guard = await requireSettingsManager(tenantSlug);
  if (!guard.ok) return guard;

  const existing = await getTenantIntegration(guard.tenantId, YOUTUBE_INTEGRATION_KEY);
  const previousProfileUrl =
    typeof existing?.config_json?.profile_url === "string"
      ? existing.config_json.profile_url
      : null;

  const row = await setIntegrationConfig(
    guard.tenantId,
    YOUTUBE_INTEGRATION_KEY,
    { show_on_public_site: showOnPublicSite },
    { actorId: guard.actorId },
  );
  if (!row) {
    logServerError("integrations/setYouTubePublic", {
      tenantId: guard.tenantId,
    });
    return { ok: false, error: "Couldn't save. Please try again." };
  }

  await applyWorkspaceYouTubePublishState({
    tenantId: guard.tenantId,
    config: row.config_json as Record<string, unknown>,
    previousProfileUrl,
    actorUserId: guard.actorId,
  });

  auditEvent(guard.tenantId, "integration", `integration.${YOUTUBE_INTEGRATION_KEY}.updated`,
    showOnPublicSite
      ? "YouTube channel is now shown on the public site"
      : "YouTube channel is now hidden from the public site",
    { targetType: "integration", targetId: YOUTUBE_INTEGRATION_KEY,
      targetLabel: "YouTube", metadata: { showOnPublicSite } });

  revalidatePath(`/${tenantSlug}/admin/settings`);
  return { ok: true };
}

// ── Write: SECRET (Google Maps API key) ──────────────────────────────────────

/**
 * Encrypt + store a secret value for an integration field (e.g. the Maps API
 * key). The plaintext is validated against the catalog test() then handed to
 * the repository, which encrypts it and persists only ciphertext + last4. The
 * plaintext is never returned. Storing a secret also flips the integration into
 * custom mode + connected status, and — since the value passed its format
 * test() above — stamps last_verified_at=now() in the same write (no separate
 * post-save testIntegration round-trip).
 */
export async function saveIntegrationSecret(
  tenantSlug: string,
  key: string,
  secretField: string,
  plaintext: string,
): Promise<IntegrationActionResult> {
  const guard = await requireSettingsManager(tenantSlug);
  if (!guard.ok) return guard;

  const def = getIntegrationDef(key);
  if (!def) return { ok: false, error: "Unknown integration." };

  const field = def.fields.find((f) => f.name === secretField && f.secret);
  if (!field) {
    return { ok: false, error: "Unknown secret field for this integration." };
  }

  const value = (plaintext ?? "").trim();
  if (!value) return { ok: false, error: "Please paste a value." };
  if (field.test) {
    const result = field.test(value);
    if (!result.ok) {
      return { ok: false, error: `That doesn't look like a valid ${field.label}.` };
    }
  }

  const stored = await setSecret(guard.tenantId, key, secretField, value);
  if (!stored) {
    logServerError("integrations/saveSecret", { key, tenantId: guard.tenantId });
    return { ok: false, error: "Couldn't save the key. Please try again." };
  }

  // Storing a custom secret implies custom mode + connected. The plaintext
  // passed its catalog test() above, so stamp last_verified_at here too.
  await setIntegrationConfig(guard.tenantId, key, {}, {
    status: "connected",
    connectionMethod: "manual",
    lastVerifiedAt: new Date().toISOString(),
    lastError: null,
    actorId: guard.actorId,
  });
  await setCredentialMode(guard.tenantId, key, "custom", guard.actorId);

  auditEvent(guard.tenantId, "integration", `integration.${key}.updated`,
    `Saved a new ${def.label} key`,
    { targetType: "integration", targetId: key, targetLabel: def.label,
      metadata: { field: secretField } });

  revalidatePath(`/${tenantSlug}/admin/settings`);
  return { ok: true };
}

// ── Write: credential mode (inherit | custom) ────────────────────────────────

/**
 * Switch an integration between inherit (use the platform credential) and custom
 * (use the tenant's own). Only inheritable integrations may go back to inherit;
 * non-inheritable ones (analytics) are always effectively custom.
 */
export async function setIntegrationMode(
  tenantSlug: string,
  key: string,
  mode: "inherit" | "custom",
): Promise<IntegrationActionResult> {
  const guard = await requireSettingsManager(tenantSlug);
  if (!guard.ok) return guard;

  const def = getIntegrationDef(key);
  if (!def) return { ok: false, error: "Unknown integration." };
  if (mode === "inherit" && !def.inheritable) {
    return {
      ok: false,
      error: "This integration has no platform default to inherit.",
    };
  }

  const row = await setCredentialMode(guard.tenantId, key, mode, guard.actorId);
  if (!row) {
    logServerError("integrations/setMode", { key, tenantId: guard.tenantId });
    return { ok: false, error: "Couldn't update. Please try again." };
  }

  // Reflect mode in status: inherit + inheritable → 'inherited'.
  if (mode === "inherit") {
    await setIntegrationConfig(guard.tenantId, key, {}, {
      status: "inherited",
      connectionMethod: "inherit",
      lastError: null,
      actorId: guard.actorId,
    });
  }

  auditEvent(guard.tenantId, "integration", `integration.${key}.updated`,
    mode === "inherit"
      ? `Switched ${def.label} to the platform default credential`
      : `Switched ${def.label} to custom credentials`,
    { targetType: "integration", targetId: key, targetLabel: def.label,
      metadata: { mode } });

  revalidatePath(`/${tenantSlug}/admin/settings`);
  return { ok: true };
}

// ── Test (offline format check via catalog test()) ───────────────────────────

export type TestIntegrationResult =
  | { ok: true; verified: true; details: { field: string; ok: boolean; reason?: string }[] }
  | { ok: true; verified: false; details: { field: string; ok: boolean; reason?: string }[] }
  | { ok: false; error: string };

/**
 * Run the catalog's offline format test() across an integration's configured
 * values (public config values + a presence check on stored secrets). This is a
 * plausibility gate, NOT a live API call. Records the outcome on the row
 * (status + last_verified_at / last_error) so the UI shows a verified state.
 */
export async function testIntegration(
  tenantSlug: string,
  key: string,
): Promise<TestIntegrationResult> {
  const guard = await requireSettingsManager(tenantSlug);
  if (!guard.ok) return guard;

  const def = getIntegrationDef(key);
  if (!def) return { ok: false, error: "Unknown integration." };

  const row = await getTenantIntegration(guard.tenantId, key);
  const config = (row?.config_json ?? {}) as Record<string, unknown>;

  const details: { field: string; ok: boolean; reason?: string }[] = [];
  let anyChecked = false;
  let allOk = true;

  for (const field of def.fields) {
    if (field.secret) {
      const status = await getSecretStatus(guard.tenantId, key, field.name);
      // We cannot re-run test() on the plaintext (never decrypt here); presence
      // is the offline signal for a secret.
      anyChecked = true;
      const present = status.present;
      details.push({
        field: field.name,
        ok: present,
        reason: present ? undefined : "missing",
      });
      if (!present) allOk = false;
    } else {
      const raw = config[field.name];
      const value = typeof raw === "string" ? raw.trim() : "";
      if (!value) {
        // Not configured → skip (don't fail an empty optional field).
        continue;
      }
      anyChecked = true;
      const result = field.test ? field.test(value) : { ok: true };
      details.push({
        field: field.name,
        ok: result.ok,
        reason: result.ok ? undefined : result.reason,
      });
      if (!result.ok) allOk = false;
    }
  }

  const verified = anyChecked && allOk;

  await setIntegrationConfig(guard.tenantId, key, {}, {
    status: verified ? "connected" : anyChecked ? "error" : "not_configured",
    lastVerifiedAt: verified ? new Date().toISOString() : null,
    lastError: verified ? null : anyChecked ? "Format check failed." : null,
    actorId: guard.actorId,
  });

  revalidatePath(`/${tenantSlug}/admin/settings`);
  return verified
    ? { ok: true, verified: true, details }
    : { ok: true, verified: false, details };
}

// ── Remove / clear ───────────────────────────────────────────────────────────

/**
 * Clear a stored secret (e.g. remove the custom Maps key) and revert the
 * integration to inherit mode when inheritable, else not_configured.
 */
export async function clearIntegrationSecret(
  tenantSlug: string,
  key: string,
  secretField: string,
): Promise<IntegrationActionResult> {
  const guard = await requireSettingsManager(tenantSlug);
  if (!guard.ok) return guard;

  const def = getIntegrationDef(key);
  if (!def) return { ok: false, error: "Unknown integration." };
  const field = def.fields.find((f) => f.name === secretField && f.secret);
  if (!field) return { ok: false, error: "Unknown secret field." };

  const removed = await deleteSecret(guard.tenantId, key, secretField);
  if (!removed) {
    logServerError("integrations/clearSecret", { key, tenantId: guard.tenantId });
    return { ok: false, error: "Couldn't remove the key. Please try again." };
  }

  const revertMode = def.inheritable ? "inherit" : "custom";
  await setCredentialMode(guard.tenantId, key, revertMode, guard.actorId);
  await setIntegrationConfig(guard.tenantId, key, {}, {
    status: def.inheritable ? "inherited" : "not_configured",
    connectionMethod: def.inheritable ? "inherit" : "manual",
    lastVerifiedAt: null,
    lastError: null,
    actorId: guard.actorId,
  });

  auditEvent(guard.tenantId, "integration", `integration.${key}.cleared`,
    `Removed the ${def.label} key`,
    { targetType: "integration", targetId: key, targetLabel: def.label,
      metadata: { field: secretField } });

  revalidatePath(`/${tenantSlug}/admin/settings`);
  return { ok: true };
}

/**
 * Fully reset an integration for a tenant: clear all secrets, reset config_json,
 * and revert to inherit (or not_configured for non-inheritable). Used by a
 * "Disconnect" / "Remove" control in the UI.
 */
export async function removeIntegration(
  tenantSlug: string,
  key: string,
): Promise<IntegrationActionResult> {
  const guard = await requireSettingsManager(tenantSlug);
  if (!guard.ok) return guard;

  const def = getIntegrationDef(key);
  if (!def) return { ok: false, error: "Unknown integration." };

  const existing = await getTenantIntegration(guard.tenantId, key);

  await deleteIntegrationSecrets(guard.tenantId, key);

  // Clear every secret field.
  for (const field of def.fields) {
    if (field.secret) {
      await deleteSecret(guard.tenantId, key, field.name);
    }
  }

  // Build a null-patch over every existing public config key (null deletes).
  const clearPatch: Record<string, unknown> = {};
  for (const k of Object.keys(existing?.config_json ?? {})) {
    clearPatch[k] = null;
  }

  const revertMode = def.inheritable ? "inherit" : "custom";
  await setCredentialMode(guard.tenantId, key, revertMode, guard.actorId);

  const row = await setIntegrationConfig(guard.tenantId, key, clearPatch, {
    status: def.inheritable ? "inherited" : "not_configured",
    connectionMethod: def.inheritable ? "inherit" : "manual",
    lastVerifiedAt: null,
    lastError: null,
    actorId: guard.actorId,
  });
  if (!row) {
    logServerError("integrations/remove", { key, tenantId: guard.tenantId });
    return { ok: false, error: "Couldn't remove. Please try again." };
  }

  if (key === YOUTUBE_INTEGRATION_KEY) {
    const previousProfileUrl =
      typeof existing?.config_json?.profile_url === "string"
        ? existing.config_json.profile_url
        : null;
    await clearWorkspaceYouTubeIdentity({
      tenantId: guard.tenantId,
      expectedProfileUrl: previousProfileUrl,
      actorUserId: guard.actorId,
    });
  }

  auditEvent(guard.tenantId, "integration", `integration.${key}.removed`,
    `Disconnected ${def.label}`,
    { targetType: "integration", targetId: key, targetLabel: def.label });

  revalidatePath(`/${tenantSlug}/admin/settings`);
  return { ok: true };
}
