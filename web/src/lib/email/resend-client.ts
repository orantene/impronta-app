import { Resend } from "resend";

let _resend: Resend | null = null;

/** Returns a singleton Resend client. Returns null if RESEND_API_KEY is not set. */
export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!_resend) _resend = new Resend(apiKey);
  return _resend;
}

/**
 * The hardcoded platform-default sender of LAST resort. MUST be an address on a
 * domain VERIFIED in Resend, or every fall-through send is rejected
 * ("not authorized to send from <domain>"). tulala.digital is the verified
 * domain. This is the single source of truth shared with `getFrom()` in
 * email/index.ts — keep them identical so the two fallbacks can never diverge
 * (a past divergence onto an unverified domain caused silent send failures).
 */
export const DEFAULT_PLATFORM_FROM = "Tulala <noreply@tulala.digital>";

/** Agency sender identity. Customise via env vars or set once here. */
export const EMAIL_FROM = process.env.EMAIL_FROM ?? DEFAULT_PLATFORM_FROM;

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

/**
 * Resolve the tenant's public REPLY-TO address (2026-09-05, CEO ruling).
 *
 * THE PROBLEM THIS FIXES: no catalog email has ever carried a Reply-To, so a
 * customer who hits Reply goes to the From address — `noreply@tulala.digital`
 * for every tenant without a verified white-label domain. tulala.digital has
 * NO MX record, so that reply BOUNCES, and neither the customer nor we find
 * out. Every guest-facing send has this property, not just the reply mirror.
 *
 * The address comes from `agency_business_identity.contact_email` — the same
 * row the Business Identity settings card writes and the storefront's contact
 * block reads, so replies and the public contact details cannot drift apart.
 *
 * Returns undefined when the tenant has no contact email, which leaves the
 * header unset rather than inventing an address: an absent Reply-To is honest
 * (replies go to From, as today), a wrong one is not. Never throws — a
 * Reply-To lookup must not be able to stop a send.
 */
export async function resolveTenantReplyTo(
  tenantId: string | null | undefined,
  /**
   * Test seam only — production always resolves its own service-role client.
   * Same optional-deps pattern the refunds handlers use.
   */
  deps?: { admin?: { from: (table: string) => unknown } | null },
): Promise<string | undefined> {
  if (!tenantId) return undefined;
  try {
    let admin = deps?.admin ?? null;
    if (!admin) {
      const { createServiceRoleClient } = await import("@/lib/supabase/admin");
      admin = createServiceRoleClient();
    }
    if (!admin) return undefined;
    const { data, error } = await (admin as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => {
            maybeSingle: () => Promise<{
              data: { contact_email?: string | null } | null;
              error: unknown;
            }>;
          };
        };
      };
    })
      .from("agency_business_identity")
      .select("contact_email")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error || !data) return undefined;
    const email = data.contact_email;
    const trimmed = (email ?? "").trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch {
    return undefined;
  }
}
