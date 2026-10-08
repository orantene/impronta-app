/**
 * Public-guest tenant fallback for the inquiry drawer submit.
 *
 * The drawer resolves its tenant through `getTenantPortalScopeBySlug`, which
 * requires a caller relationship: the request's host bound to that tenant, or a
 * signed-in member/client/talent. A guest on the platform talent profile
 * (`/t/<code>` on the app or marketing host) has neither, so the profile's
 * "Reserve a time" drawer answered every anonymous visitor with the raw
 * `tenant_not_found` (QA on Jor, 2026-10-01).
 *
 * The guest chat on the same page already files to that tenant by a public
 * slug lookup plus the roster gate. This mirrors it, and only for the narrow
 * case where that same gate applies: an anonymous caller, naming at least one
 * talent. The submit action then runs `assertAllTalentOnTenantRoster` on every
 * named talent before any write, so a guest can only reach a tenant whose
 * public roster carries the talent they are booking.
 */

export function guestDrawerFallbackAllowed(input: {
  hasUser: boolean;
  selectedTalentIds: readonly unknown[] | null | undefined;
}): boolean {
  if (input.hasUser) return false;
  const ids = input.selectedTalentIds ?? [];
  return ids.some((id) => typeof id === "string" && id.trim().length > 0);
}

/** A tenant row is a valid public target unless it is closed. */
export function isPublicTenantStatus(status: string | null | undefined): boolean {
  return status !== "cancelled" && status !== "archived";
}
