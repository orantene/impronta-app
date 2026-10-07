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

export type TalentOwnPageState =
  | { live: true; href: string; label: string }
  | { live: false; href: null; label: null };

/**
 * TUL-90: the ONE answer to "is my public page live, and where?". A page is
 * live only when the profile is published, not hidden, and has a profile
 * code; then the address is her own `/t/<code>` (never a sample slug).
 * Anything else is "not published yet": no address is claimed, because
 * `/t/<code>` 404s for draft or hidden profiles.
 */
export function resolveTalentOwnPageState(input: {
  profileCode: string | null | undefined;
  workflowStatus: string | null | undefined;
  isPubliclyHidden: boolean | null | undefined;
  currentOrigin?: string | null;
}): TalentOwnPageState {
  const code = (input.profileCode ?? "").trim();
  if (!code || input.workflowStatus !== "published" || input.isPubliclyHidden) {
    return { live: false, href: null, label: null };
  }
  return {
    live: true,
    href: talentPublicProfileHref(code, input.currentOrigin),
    label: talentPublicProfileLabel(code, input.currentOrigin),
  };
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
  const websiteHref = normalizeDistinctPersonalSiteHref(
    input.publicSiteUrl,
    code,
    hubHref,
    input.currentOrigin,
  );

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
  currentOrigin?: string | null,
): string | null {
  const raw = (publicSiteUrl ?? "").trim();
  if (!raw || !profileCode) return null;

  // Relative `/t/site/...` must stay on the local origin during localhost QA
  // (subdomains off); elsewhere keep the canonical public host.
  const relativeBase = isLocalDevOrigin(currentOrigin)
    ? new URL(currentOrigin as string).origin
    : CANONICAL_PROFILE_ORIGIN;

  let absolute: string;
  try {
    absolute = raw.startsWith("http://") || raw.startsWith("https://")
      ? new URL(raw).toString().replace(/\/$/, "")
      : new URL(raw, relativeBase).toString().replace(/\/$/, "");
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

/** TUL-90: onboarding "Copy your public link": her own live address only, never a sample slug. */
export function copyTalentOwnPublicLink(
  self: { profileCode?: string | null; workflowStatus?: string | null; isPubliclyHidden?: boolean | null } | null | undefined,
  toast: (message: string) => void,
  t: (key: string) => string,
): void {
  const own = self
    ? resolveTalentOwnPageState({
        profileCode: self.profileCode,
        workflowStatus: self.workflowStatus,
        isPubliclyHidden: self.isPubliclyHidden,
        currentOrigin: typeof window === "undefined" ? null : window.location.origin,
      })
    : null;
  if (own && !own.live) {
    toast(t("Publish your profile first to get a public link"));
    return;
  }
  navigator.clipboard?.writeText(own?.href ?? "https://tulala.digital/t/marta-reyes");
  toast("Public link copied to clipboard");
}
