/**
 * Build the public roster profile URL for a talent on a given agency workspace.
 * Used on the talent "My pages" hub so links open the correct host/path.
 *
 * Default: path-scoped `/[agencySlug]/t/[code]` — SSR-safe on the platform app host
 * (localhost + app.tulala.digital). Custom-domain agencies can use absolute origins.
 */
const AGENCY_PUBLIC_ORIGINS: Record<string, string> = {
  impronta: "https://improntamodels.com",
};

export function agencyRosterProfileUrl(
  agencySlug: string,
  profileCode: string | null | undefined,
  opts?: { absolute?: boolean },
): string | null {
  const code = profileCode?.trim();
  if (!code) return null;

  const path = `/t/${encodeURIComponent(code)}`;

  if (!opts?.absolute) {
    return `/${agencySlug}${path}`;
  }

  const origin = AGENCY_PUBLIC_ORIGINS[agencySlug];
  if (origin) {
    return `${origin}${path}`;
  }

  return `https://tulala.digital/${agencySlug}${path}`;
}
