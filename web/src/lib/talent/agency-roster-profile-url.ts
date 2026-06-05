/**
 * Build the public roster profile URL for a talent on a given agency workspace.
 * Used on the talent "My pages" hub so links open the correct host/path.
 *
 * Always returns an absolute URL pointing at a host where `/t/[profileCode]`
 * actually resolves:
 *   - Agencies with a registered custom origin (e.g. Impronta) → custom domain.
 *   - Free / branded-subdomain agencies (e.g. Morena Studio) → path-scoped on
 *     `tulala.digital` — the marketing host enables path-based tenant dispatch
 *     (`resolveTenantContextFromPathSlug`) so `tulala.digital/<slug>/t/<code>`
 *     serves the agency-skinned roster view.
 *
 * The path-scoped relative form (`/<slug>/t/<code>`) was previously returned by
 * default, but that form 404s on `app.tulala.digital` (the host that runs the
 * talent dashboard) because the surface allow-list there does not include
 * path-based tenant dispatch in production. Always emitting an absolute URL
 * sidesteps that mismatch.
 */
const AGENCY_PUBLIC_ORIGINS: Record<string, string> = {
  impronta: "https://improntamodels.com",
};

const TULALA_MARKETING_ORIGIN = "https://tulala.digital";

/** Platform hub + self page — always the marketing apex, never a subdomain. */
export function platformSelfProfileUrl(
  profileCode: string | null | undefined,
): string | null {
  const code = profileCode?.trim();
  if (!code) return null;
  return `${TULALA_MARKETING_ORIGIN}/t/${encodeURIComponent(code)}`;
}

export function agencyRosterProfileUrl(
  agencySlug: string,
  profileCode: string | null | undefined,
  isHub = false,
): string | null {
  const code = profileCode?.trim();
  if (!code) return null;

  if (isHub) {
    return platformSelfProfileUrl(code);
  }

  const path = `/t/${encodeURIComponent(code)}`;

  const origin = AGENCY_PUBLIC_ORIGINS[agencySlug];
  if (origin) {
    return `${origin}${path}`;
  }

  return `${TULALA_MARKETING_ORIGIN}/${agencySlug}${path}`;
}
