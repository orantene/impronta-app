import { Resend } from "resend";

let _resend: Resend | null = null;

/** Returns a singleton Resend client. Returns null if RESEND_API_KEY is not set. */
export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!_resend) _resend = new Resend(apiKey);
  return _resend;
}

/** Agency sender identity. Customise via env vars or set once here. */
export const EMAIL_FROM =
  process.env.EMAIL_FROM ?? "Impronta Agency <noreply@impronta.agency>";

/** Agency support address shown in email footers. */
export const EMAIL_REPLY_TO =
  process.env.EMAIL_REPLY_TO ?? undefined;

/**
 * Resolve the effective `from` for a tenant's outbound mail.
 *
 * When the tenant has the white_label_email entitlement AND a VERIFIED custom
 * sending domain (the email_domain integration), mail is sent from
 * `noreply@<domain>` (optionally branded with displayName). Otherwise we fall
 * back to the platform default (`EMAIL_FROM`).
 *
 * Server-only: reads tenant_integrations + agency_entitlements via service role.
 * Safe to call without a tenant (returns the platform default).
 *
 * @param displayName optional sender display name (e.g. the agency name).
 */
export async function resolveTenantEmailFrom(
  tenantId: string | null | undefined,
  displayName?: string | null,
): Promise<string> {
  if (!tenantId) return EMAIL_FROM;
  // Lazy server-only imports — keep this module importable from client bundles
  // that only reference EMAIL_FROM (the dynamic import is never reached there).
  const [{ getIntegrationEntitlements, getTenantIntegration }, { EMAIL_DOMAIN_INTEGRATION_KEY }] =
    await Promise.all([
      import("@/lib/integrations/repository"),
      import("@/lib/integrations/catalog"),
    ]);

  const [ent, row] = await Promise.all([
    getIntegrationEntitlements(tenantId),
    getTenantIntegration(tenantId, EMAIL_DOMAIN_INTEGRATION_KEY),
  ]);
  if (!ent.white_label_email) return EMAIL_FROM;

  const config = (row?.config_json ?? {}) as Record<string, unknown>;
  const verified =
    config.verification_status === "verified" && row?.status === "connected";
  const domain =
    typeof config.domain === "string" ? config.domain.trim().toLowerCase() : "";
  if (!verified || !domain) return EMAIL_FROM;

  const address = `noreply@${domain}`;
  const name = (displayName ?? "").trim();
  return name ? `${name} <${address}>` : address;
}
