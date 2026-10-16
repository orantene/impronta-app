"use server";
/**
 * Captcha domain notice (own file: integration-actions.ts sits at the 800-line cap).
 * Live custom domain where the platform captcha cannot render and the workspace has
 * no own captcha keys yet; null = no notice. Best-effort: any failure = no notice.
 */
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { requireSession } from "@/lib/server/action-guards";
import { userHasCapability } from "@/lib/access";
import { getTenantIntegration } from "@/lib/integrations/repository";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { captchaNoticeDomain, type NoticeDomainRow } from "@/lib/integrations/captcha-domain-notice";

export async function loadCaptchaNoticeDomain(tenantSlug: string): Promise<string | null> {
  try {
    const auth = await requireSession();
    if (!auth.ok) return null;
    const scope = await getTenantScopeBySlug(tenantSlug);
    if (!scope) return null;
    if (!(await userHasCapability("agency.workspace.view", scope.tenantId))) return null;
    const admin = createServiceRoleClient();
    if (!admin) return null;
    const [row, domains] = await Promise.all([
      getTenantIntegration(scope.tenantId, "captcha"),
      admin
        .from("agency_domains")
        .select("hostname, kind, status, is_primary")
        .eq("tenant_id", scope.tenantId)
        .eq("kind", "custom"),
    ]);
    if (domains.error) return null;
    const config = ((row as { config_json?: unknown } | null)?.config_json ?? {}) as Record<string, unknown>;
    return captchaNoticeDomain({
      domains: (domains.data ?? []) as NoticeDomainRow[],
      ownCaptcha: { provider: config.provider, siteKey: config.site_key },
    });
  } catch {
    return null;
  }
}
