/**
 * 1D · one source for the address promised at "Ready to build" and shown at
 * the finish. Free workspaces are path-canonical at `tulala.digital/w/<slug>`
 * (see workspace-public-url / workspace-live-url). The promise and the finish
 * must use that address — never invent `<slug>.tulala.digital` over a delivered
 * `/w/` URL — so live-check, the preview iframe, and the admin chip agree.
 * Pure.
 */

import { WORKSPACE_PATH_SEGMENT } from "@/lib/saas/tenant-paths";
import { GALLERY_PROFESSIONS, normalizeSearchText, professionsForTerm } from "@/lib/talent-site/theme-catalog/gallery-meta";

export const WORKSPACE_ROOT_DOMAIN = "tulala.digital";

/** Display form for the Free path promise: `tulala.digital/w/<slug>`. */
export function promisedHost(slug: string | null | undefined): string | null {
  const s = (slug ?? "").trim().toLowerCase();
  return s ? `${WORKSPACE_ROOT_DOMAIN}/${WORKSPACE_PATH_SEGMENT}/${s}` : null;
}

export function promisedUrl(slug: string | null | undefined): string | null {
  const host = promisedHost(slug);
  return host ? `https://${host}` : null;
}

/** True when `url` is the Free path shape (`…/w/<slug>`), with or without scheme. */
export function isWorkspacePathPublicUrl(url: string): boolean {
  const bare = url.replace(/^https?:\/\//i, "").split(/[?#]/)[0] ?? "";
  const parts = bare.split("/").filter(Boolean);
  // host / w / slug
  return parts.length >= 3 && parts[1] === WORKSPACE_PATH_SEGMENT && !!parts[2];
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//i, "");
}

export type FinishUrl = { url: string; display: string; promised: boolean; differs: boolean };

/**
 * Workspace finish address. `delivered` is what provisioning really made
 * (`getTenantPreviewUrl` → Free `/w/<slug>`). Path delivery always wins so we
 * never verify or preview a subdomain the Free plan does not advertise.
 */
export function resolveWorkspaceFinishUrl(input: {
  linkSlug: string | null;
  tenantSlug: string;
  delivered: string;
}): FinishUrl {
  const link = (input.linkSlug ?? "").trim().toLowerCase();
  const tenant = input.tenantSlug.trim().toLowerCase();
  const slugMatch = !!link && link === tenant;
  const promised = promisedUrl(input.linkSlug);
  const delivered = input.delivered;

  if (isWorkspacePathPublicUrl(delivered)) {
    return {
      url: delivered,
      display: stripScheme(delivered),
      promised: slugMatch,
      differs: !!link && !slugMatch,
    };
  }

  // Delivered is subdomain/custom. Prefer the path promise when the reserved
  // slug matches — Free onboarding must finish on `/w/<slug>`.
  if (slugMatch && promised) {
    return {
      url: promised,
      display: stripScheme(promised),
      promised: true,
      differs: stripScheme(delivered) !== stripScheme(promised),
    };
  }

  return {
    url: delivered,
    display: stripScheme(delivered),
    promised: false,
    differs: !!link && !slugMatch,
  };
}

/**
 * The three Maison v2 palettes offered to a talent: recommended first. Old
 * stored v1 keys (pink / pearl / sand) fail this guard on purpose, so a
 * resumed brief reads them as "no pick" and gets the default (rose).
 */
export const DESIGN_LOOK_KEYS = ["rose", "blush", "orchid", "sage", "porcelain"] as const;
export type DesignLookKey = (typeof DESIGN_LOOK_KEYS)[number];

const BEAUTY_LOOKS: readonly DesignLookKey[] = ["rose", "blush", "orchid"];
/** Non-beauty trades (cleaning, home services, ...): the neutral Maison v2 palettes. */
const NEUTRAL_LOOKS: readonly DesignLookKey[] = ["sage", "porcelain"];

/**
 * The looks offered for a business category (free text, EN or ES). Beauty
 * keeps the rose family; any other named trade gets the neutral palettes so a
 * cleaning business is never shown Rosé/Rubor/Orquídea. No category yet keeps
 * the old default set.
 */
export function designLooksForCategory(category: string | null | undefined): readonly DesignLookKey[] {
  const label = normalizeSearchText(category ?? "");
  if (!label) return BEAUTY_LOOKS;
  const words = [label, ...label.split(/[\s,&/-]+/)];
  const beautyWords = ["belleza", "beauty", "salon", "spa", "maquillaje", "makeup"];
  if (beautyWords.some((w) => label.includes(w))) return BEAUTY_LOOKS;
  for (const w of words) {
    const profs = professionsForTerm(w);
    if (profs.some((p) => GALLERY_PROFESSIONS[p].chip === "beauty")) return BEAUTY_LOOKS;
  }
  return NEUTRAL_LOOKS;
}

export function isDesignLookKey(v: unknown): v is DesignLookKey {
  return typeof v === "string" && (DESIGN_LOOK_KEYS as readonly string[]).includes(v);
}
