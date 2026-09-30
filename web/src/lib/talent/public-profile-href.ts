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
