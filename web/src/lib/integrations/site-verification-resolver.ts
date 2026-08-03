import "server-only";

import { SEARCH_CONSOLE_INTEGRATION_KEY } from "@/lib/integrations/catalog";
import { getTenantIntegration } from "@/lib/integrations/repository";

/** Strict token shape — same whitelist the catalog `test()` enforces on save. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,100}$/;

/**
 * Site-ownership verification tokens resolved for a tenant storefront's <head>.
 * Null fields mean "no per-tenant tag" — the platform default (if any) applies.
 */
export interface TenantSiteVerification {
  /** Google Search Console meta-tag token, or null when not connected. */
  googleToken: string | null;
}

/**
 * Server-side resolver: the tenant's Google Search Console verification token,
 * ready to inject as `<meta name="google-site-verification" content="…">` in
 * the storefront <head>.
 *
 * Returns the token ONLY when the `search_console` integration row exists, is
 * `status='connected'`, and the stored value still matches the strict token
 * shape (re-validated here as defence-in-depth before it reaches the emitted
 * tag — even though Next escapes metadata `content`, a malformed value is
 * dropped rather than rendered). Null in every other case, so a tenant that has
 * not set a token simply gets no per-tenant verification tag.
 */
export async function resolveTenantSiteVerification(
  tenantId: string,
): Promise<TenantSiteVerification> {
  const row = await getTenantIntegration(
    tenantId,
    SEARCH_CONSOLE_INTEGRATION_KEY,
  );
  if (!row || row.status !== "connected") return { googleToken: null };

  const raw = row.config_json?.["verification_token"];
  const token = typeof raw === "string" ? raw.trim() : "";
  if (!token || !TOKEN_SHAPE.test(token)) return { googleToken: null };

  return { googleToken: token };
}
