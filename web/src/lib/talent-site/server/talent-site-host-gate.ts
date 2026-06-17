/**
 * Pure gate for the internal `_talent-site` host route.
 *
 * The proxy strips any client-supplied `x-impronta-talent-profile` /
 * `x-impronta-host-context` from the inbound request on EVERY path and re-sets
 * both ONLY on the legitimate `kind: "talent_site"` rewrite. This predicate is
 * the route's defense-in-depth second gate: it accepts the talent_profile_id
 * ONLY when the resolved host-context header is exactly `"talent_site"`.
 *
 * A direct `/_talent-site` request on a non-talent-site host (app/agency/hub)
 * carries a different (or stripped) host-context, so this returns null →
 * the route `notFound()`s before any render. Kept pure + header-shaped so it is
 * unit-testable without `next/headers`.
 */
export function resolveGatedTalentProfileId(input: {
  hostContext: string | null | undefined;
  talentProfileId: string | null | undefined;
}): string | null {
  if (input.hostContext?.trim() !== "talent_site") return null;
  const value = input.talentProfileId?.trim();
  return value ? value : null;
}
