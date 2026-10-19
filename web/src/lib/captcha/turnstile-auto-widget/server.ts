import "server-only";

/**
 * TUL-1017: real wiring for the automatic Turnstile widget. The keys land in
 * the SAME encrypted store the workspace Captcha drawer writes
 * (`tenant_integrations` config_json for the public site key,
 * `tenant_integration_secrets` for the secret), marked
 * `managed_by: "tulala-auto"`, so `resolveTenantCaptcha` picks them up with no
 * form-code change. No migration: the marker lives in config_json.
 */

import { CAPTCHA_INTEGRATION_KEY } from "@/lib/integrations/catalog";
import {
  deleteSecret,
  getSecretStatus,
  getTenantIntegration,
  setCredentialMode,
  setIntegrationConfig,
  setSecret,
} from "@/lib/integrations/repository";
import { logServerError } from "@/lib/server/safe-error";

import { hasOwnUserKeys, MANAGED_BY_TULALA_AUTO, type CaptchaConfigView } from "./decision";
import {
  provisionAutoTurnstileWidgets,
  releaseAutoTurnstileWidget,
  type ActivatedDomain,
  type AutoWidgetDeps,
  type AutoWidgetRunReport,
  type ManagedCaptchaStore,
  type ReleaseOutcome,
} from "./run";

const store: ManagedCaptchaStore = {
  async getConfig(tenantId) {
    const row = await getTenantIntegration(tenantId, CAPTCHA_INTEGRATION_KEY);
    return row ? ((row.config_json ?? {}) as CaptchaConfigView) : null;
  },
  async hasSecret(tenantId) {
    return (await getSecretStatus(tenantId, CAPTCHA_INTEGRATION_KEY, "secret_key")).present;
  },
  async saveManaged(tenantId, input) {
    // Re-check right before writing: never overwrite keys the workspace typed in.
    const fresh = await getTenantIntegration(tenantId, CAPTCHA_INTEGRATION_KEY);
    if (hasOwnUserKeys((fresh?.config_json ?? null) as CaptchaConfigView | null)) return false;
    const secretOk = await setSecret(tenantId, CAPTCHA_INTEGRATION_KEY, "secret_key", input.secret);
    if (!secretOk) return false;
    const row = await setIntegrationConfig(
      tenantId,
      CAPTCHA_INTEGRATION_KEY,
      {
        provider: "turnstile",
        site_key: input.siteKey,
        managed_by: MANAGED_BY_TULALA_AUTO,
        managed_domain: input.domain,
        managed_widget_name: input.widgetName,
      },
      { status: "connected", connectionMethod: "manual", lastVerifiedAt: new Date().toISOString(), lastError: null },
    );
    if (!row) {
      await deleteSecret(tenantId, CAPTCHA_INTEGRATION_KEY, "secret_key");
      return false;
    }
    await setCredentialMode(tenantId, CAPTCHA_INTEGRATION_KEY, "custom");
    return true;
  },
  async clearManaged(tenantId) {
    const secretGone = await deleteSecret(tenantId, CAPTCHA_INTEGRATION_KEY, "secret_key");
    const row = await setIntegrationConfig(
      tenantId,
      CAPTCHA_INTEGRATION_KEY,
      { provider: null, site_key: null, managed_by: null, managed_domain: null, managed_widget_name: null },
      { status: "not_configured", lastVerifiedAt: null, lastError: null },
    );
    return secretGone && row !== null;
  },
};

function realDeps(): AutoWidgetDeps {
  return {
    env: process.env,
    fetch: (input, init) => fetch(input, init),
    store,
    log: (context, detail) => logServerError(context, detail),
  };
}

/** Cron hook: domains that just turned active. Never throws. */
export async function provisionAutoTurnstileWidgetsForActivatedDomains(
  domains: ActivatedDomain[],
): Promise<AutoWidgetRunReport> {
  return provisionAutoTurnstileWidgets(domains, realDeps());
}

/** Detach hook: removes a tulala-auto widget + keys for this domain. Never throws. */
export async function releaseAutoTurnstileWidgetForDomain(input: ActivatedDomain): Promise<ReleaseOutcome> {
  return releaseAutoTurnstileWidget(input, realDeps());
}
