/**
 * F41: the talent dashboard's "Preview profile" / "Preview site" / share
 * links. Production keeps the canonical `https://tulala.digital/t/<code>`
 * (the app host is robots-blocked for /t/). A local development origin
 * (localhost, 127.0.0.1, [::1], *.localhost, *.test) builds the link on
 * itself, so QA on localhost:3001 never jumps to the live site.
 */

export const CANONICAL_PROFILE_ORIGIN = "https://tulala.digital";

export function isLocalDevOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host.endsWith(".localhost") ||
    host.endsWith(".test")
  );
}

/** Absolute href for her public page, on the current origin when it is local. */
export function talentPublicProfileHref(profileCode: string, currentOrigin?: string | null): string {
  const base = isLocalDevOrigin(currentOrigin) ? new URL(currentOrigin as string).origin : CANONICAL_PROFILE_ORIGIN;
  return `${base}/t/${encodeURIComponent(profileCode)}`;
}

/** The same link without the scheme, for display ("tulala.digital/t/abc"). */
export function talentPublicProfileLabel(profileCode: string, currentOrigin?: string | null): string {
  return talentPublicProfileHref(profileCode, currentOrigin).replace(/^https?:\/\//, "");
}

export type TalentPublicPreviewKind = "website" | "hub";

export type TalentPublicPreviewDestination = {
  kind: TalentPublicPreviewKind;
  href: string;
};

/**
 * Public surfaces the top-bar eye / preview control can open.
 *
 * - Hub: always `tulala.digital/t/<code>` (or local-dev equivalent).
 * - Website: published personal site (`<slug>.tulala.digital`, custom domain,
 *   or `/t/site/<slug>`) when it is distinct from the hub profile path.
 *
 * Default prefers the live personal website when present; otherwise the hub.
 */
export function resolveTalentPublicPreviewDestinations(input: {
  profileCode: string | null | undefined;
  publicSiteUrl: string | null | undefined;
  currentOrigin?: string | null;
}): {
  destinations: TalentPublicPreviewDestination[];
  defaultHref: string | null;
} {
  const code = (input.profileCode ?? "").trim();
  const destinations: TalentPublicPreviewDestination[] = [];

  const hubHref = code ? talentPublicProfileHref(code, input.currentOrigin) : null;
  const websiteHref = normalizeDistinctPersonalSiteHref(input.publicSiteUrl, code, hubHref);

  if (websiteHref) {
    destinations.push({ kind: "website", href: websiteHref });
  }
  if (hubHref) {
    destinations.push({ kind: "hub", href: hubHref });
  }

  return {
    destinations,
    defaultHref: destinations[0]?.href ?? null,
  };
}

function normalizeDistinctPersonalSiteHref(
  publicSiteUrl: string | null | undefined,
  profileCode: string,
  hubHref: string | null,
): string | null {
  const raw = (publicSiteUrl ?? "").trim();
  if (!raw || !profileCode) return null;

  let absolute: string;
  try {
    absolute = raw.startsWith("http://") || raw.startsWith("https://")
      ? new URL(raw).toString().replace(/\/$/, "")
      : new URL(raw, CANONICAL_PROFILE_ORIGIN).toString().replace(/\/$/, "");
  } catch {
    return null;
  }

  if (isHubProfileHref(absolute, profileCode)) return null;

  const hubNormalized = hubHref?.replace(/\/$/, "") ?? null;
  if (hubNormalized && absolute === hubNormalized) return null;

  return absolute;
}

function isHubProfileHref(href: string, profileCode: string): boolean {
  try {
    const path = new URL(href).pathname.replace(/\/$/, "");
    const encoded = `/t/${encodeURIComponent(profileCode)}`;
    const plain = `/t/${profileCode}`;
    return path === encoded || path === plain;
  } catch {
    return false;
  }
}
