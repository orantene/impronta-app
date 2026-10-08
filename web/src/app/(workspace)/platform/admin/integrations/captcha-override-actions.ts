"use server";

/**
 * Platform-admin view + reset of workspaces that carry their OWN captcha row
 * (TUL-138). A workspace's own row silently overrides the platform default, so
 * HQ needs to see it and be able to hand the workspace back to the default.
 *
 * SECURITY: super_admin only (same gate as platform-integration-actions.ts).
 * NEVER returns a secret value or a full site key: only provider, booleans and
 * a site key masked to its last 4 characters.
 */

import { revalidatePath } from "next/cache";

import { getPlatformRole } from "@/lib/access/platform-role";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { CAPTCHA_INTEGRATION_KEY } from "@/lib/integrations/catalog";
import {
  deleteIntegrationSecrets,
  getSecretStatus,
  setIntegrationConfig,
} from "@/lib/integrations/repository";
import {
  invalidatePlatformDefaultsCache,
  platformConfigField,
  platformTenantId,
} from "@/lib/integrations/platform-defaults";
import {
  effectiveCaptchaProvider,
  maskSiteKey,
  normalizeCaptchaProvider,
  type EffectiveCaptchaProvider,
} from "@/lib/integrations/effective-captcha";
import {
  disconnectWorkspaceCaptchaWith,
  type CaptchaOverrideGuard,
  type CaptchaOverrideResult,
} from "@/lib/integrations/captcha-override-core";

import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";

const REVALIDATE_PATH = "/platform/admin/integrations";

export type WorkspaceCaptchaRow = {
  tenantId: string;
  name: string;
  slug: string | null;
  ownProvider: EffectiveCaptchaProvider;
  status: string;
  hasSiteKey: boolean;
  siteKeyMasked: string | null;
  hasSecret: boolean;
  effectiveProvider: EffectiveCaptchaProvider;
  usesOwn: boolean;
};

export type WorkspaceCaptchaView = {
  ok: boolean;
  platformDefault: EffectiveCaptchaProvider;
  rows: WorkspaceCaptchaRow[];
};

async function requirePlatformAdmin(): Promise<CaptchaOverrideGuard> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Please sign in again." };
  if (getPlatformRole(session.profile) !== "super_admin") {
    return { ok: false, error: "Forbidden." };
  }
  return { ok: true, actorId: session.user.id };
}

async function platformDefaultProvider(): Promise<EffectiveCaptchaProvider> {
  const provider = normalizeCaptchaProvider(
    await platformConfigField(CAPTCHA_INTEGRATION_KEY, "provider"),
  );
  const siteKey = await platformConfigField(CAPTCHA_INTEGRATION_KEY, "site_key");
  if (provider && siteKey) return provider;
  if (process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY?.trim()) return "hcaptcha";
  if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()) return "turnstile";
  return "none";
}

export async function loadWorkspaceCaptchaOverrides(): Promise<WorkspaceCaptchaView> {
  const empty: WorkspaceCaptchaView = { ok: false, platformDefault: "none", rows: [] };
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return empty;
  const supabase = createServiceRoleClient();
  if (!supabase) return empty;

  const platformDefault = await platformDefaultProvider();
  const hub = await platformTenantId();

  const { data, error } = await supabase
    .from("tenant_integrations")
    .select("tenant_id, status, config_json")
    .eq("integration_key", CAPTCHA_INTEGRATION_KEY);
  if (error || !data) return { ok: true, platformDefault, rows: [] };

  const own = (
    data as Array<{ tenant_id: string; status: string; config_json: unknown }>
  ).filter((r) => r.tenant_id !== hub);
  if (own.length === 0) return { ok: true, platformDefault, rows: [] };

  const { data: agencies, error: agErr } = await supabase
    .from("agencies")
    .select("id, display_name, slug")
    .in(
      "id",
      own.map((r) => r.tenant_id),
    );
  if (agErr) return { ok: true, platformDefault, rows: [] };
  const byId = new Map(
    (
      (agencies ?? []) as Array<{ id: string; display_name: string | null; slug: string | null }>
    ).map((a) => [a.id, a]),
  );

  const rows: WorkspaceCaptchaRow[] = [];
  for (const r of own) {
    const cfg = (r.config_json ?? {}) as Record<string, unknown>;
    const provider = normalizeCaptchaProvider(cfg.provider);
    const siteKey = typeof cfg.site_key === "string" ? cfg.site_key.trim() : "";
    const secret = await getSecretStatus(r.tenant_id, CAPTCHA_INTEGRATION_KEY, "secret_key");
    const eff = effectiveCaptchaProvider(
      { provider: cfg.provider, siteKey: cfg.site_key },
      platformDefault,
    );
    const ag = byId.get(r.tenant_id);
    rows.push({
      tenantId: r.tenant_id,
      name: ag?.display_name || ag?.slug || "Workspace",
      slug: ag?.slug ?? null,
      ownProvider: provider ?? "none",
      status: r.status,
      hasSiteKey: siteKey.length > 0,
      siteKeyMasked: maskSiteKey(siteKey),
      hasSecret: secret.present,
      effectiveProvider: eff.provider,
      usesOwn: eff.source === "own",
    });
  }
  // Only workspaces that actually carry a captcha setting.
  const shown = rows.filter((r) => r.ownProvider !== "none" || r.hasSiteKey || r.hasSecret);
  shown.sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, platformDefault, rows: shown };
}

/** Hand a workspace back to the platform default: remove its own captcha values. */
export async function resetWorkspaceCaptchaToPlatform(
  tenantId: string,
): Promise<CaptchaOverrideResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  return disconnectWorkspaceCaptchaWith(
    {
      guard: requirePlatformAdmin,
      platformTenantId,
      disconnect: async (id, actorId) => {
        const secretsGone = await deleteIntegrationSecrets(id, CAPTCHA_INTEGRATION_KEY);
        const row = await setIntegrationConfig(
          id,
          CAPTCHA_INTEGRATION_KEY,
          { provider: null, site_key: null },
          { status: "not_configured", lastVerifiedAt: null, lastError: null, actorId },
        );
        return secretsGone && row !== null;
      },
      onDone: () => {
        invalidatePlatformDefaultsCache();
        revalidatePath(REVALIDATE_PATH);
      },
    },
    tenantId,
  );
}
