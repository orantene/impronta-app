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
 * Resolve the PLATFORM-DEFAULT `from` address — the value used when a tenant has
 * no white-label sending domain (and for platform mail with no tenant).
 *
 * Fallback order: platform-DB default (the super-admin's stored email_domain —
 * a full `from_address`, or a bare `domain` → `noreply@<domain>`) → env
 * `EMAIL_FROM`. When no platform-DB default is set this returns `EMAIL_FROM`
 * exactly (zero regression).
 *
 * Server-only: dynamically imports the integrations repository so this module
 * stays importable from client bundles that only reference EMAIL_FROM.
 */
export async function resolvePlatformEmailFrom(): Promise<string> {
  try {
    const [{ platformConfigField }, { EMAIL_DOMAIN_INTEGRATION_KEY }] =
      await Promise.all([
        import("@/lib/integrations/platform-defaults"),
        import("@/lib/integrations/catalog"),
      ]);

    // A full "Name <addr>" or bare address the super-admin pasted wins.
    const fromAddress = await platformConfigField(
      EMAIL_DOMAIN_INTEGRATION_KEY,
      "from_address",
    );
    if (fromAddress) return fromAddress;

    // Else, a bare default sending domain → noreply@<domain>.
    const domain = await platformConfigField(
      EMAIL_DOMAIN_INTEGRATION_KEY,
      "domain",
    );
    if (domain) return `noreply@${domain.toLowerCase()}`;
  } catch {
    // Fall through to the env default on any read/decrypt error.
  }
  return EMAIL_FROM;
}

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
  // The platform default (DB → env) is the fallback whenever the tenant has no
  // verified white-label domain of its own. When no platform DB default is set
  // this is exactly the env EMAIL_FROM (zero regression).
  if (!tenantId) return resolvePlatformEmailFrom();
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
  if (!ent.white_label_email) return resolvePlatformEmailFrom();

  const config = (row?.config_json ?? {}) as Record<string, unknown>;
  const verified =
    config.verification_status === "verified" && row?.status === "connected";
  const domain =
    typeof config.domain === "string" ? config.domain.trim().toLowerCase() : "";
  if (!verified || !domain) return resolvePlatformEmailFrom();

  const address = `noreply@${domain}`;
  const name = (displayName ?? "").trim();
  return name ? `${name} <${address}>` : address;
}
