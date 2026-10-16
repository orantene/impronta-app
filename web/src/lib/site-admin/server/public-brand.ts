/**
 * TUL-710: the name and footer line a workspace's public chrome shows.
 *
 * Pure so the rules are unit-tested without a request. A workspace that never
 * filled the business-identity form has no `public_name`, but it always has the
 * name it was created with (`agencies.display_name`). Falling straight to the
 * PLATFORM brand put "TULALA" in the header of someone else's site.
 */
import type { IndustryPreset } from "@/lib/words/presets";

/** Operator's public name, else the workspace's own name, else null. */
export function resolvePublicBrandName(
  identityPublicName: string | null | undefined,
  workspaceDisplayName: string | null | undefined,
): string | null {
  return identityPublicName?.trim() || workspaceDisplayName?.trim() || null;
}

/**
 * Footer line for the page-less / default home.
 *
 * The operator's own line wins, then a people-less business falls to its
 * tagline or descriptor. The generic agency sentence is a claim about the
 * workspace, so it only applies when the preset represents people AND the
 * operator has named the business; an unconfigured workspace says nothing
 * rather than "Agency-managed discovery and representation".
 */
export function resolveHomeFooterTagline(input: {
  footerTagline: string | null | undefined;
  tagline: string | null | undefined;
  identityPublicName: string | null | undefined;
  preset: Pick<IndustryPreset, "representsPeople"> | null;
  businessDescription: string | null | undefined;
  agencyLine: string;
}): string {
  const own = input.footerTagline?.trim();
  if (own) return own;
  const tagline = input.tagline?.trim() || "";
  if (input.preset && !input.preset.representsPeople) {
    return tagline || input.businessDescription || "";
  }
  if (tagline) return tagline;
  return input.identityPublicName?.trim() ? input.agencyLine : "";
}
