/**
 * Workspace admin locale seeding, pure decisions (TUL-117).
 *
 * The talent dashboard seeds its `locale` cookie from the talent's own
 * language (`talent-locale-seed.ts`); the workspace admin has no such step, so
 * the owner of a Spanish workspace saw English in any fresh browser. This
 * mirrors that mechanism with the tenant's stored `default_locale` as the
 * source. The decision itself is NOT duplicated: `talentLocaleSeedPlan` is the
 * one planner (absent or auto cookie -> seed; a deliberate cookie owned by the
 * signed-in user -> never overwritten; foreign or unstamped owner -> seed and
 * stamp). Contract: `@/i18n/locale-cookies`.
 */

import { localeSeedMayApply, talentLocaleSeedPlan } from "./talent-locale-seed";
import { talentSeedPrimary } from "./talent-locale-settings";

export const WORKSPACE_LOCALE_SEED_ROUTE = "/api/admin/locale-seed";

/** Loop breaker, same shape as the talent one: set by the route, checked by the layout. */
export const WORKSPACE_LOCALE_SEED_ATTEMPT_COOKIE = "workspace_locale_seed_attempt";
export const WORKSPACE_LOCALE_SEED_ATTEMPT_MAX_AGE_SECONDS = 60;

/** The tenant default the cookie may be seeded to, or null when not known for certain. */
export function workspaceSeedPrimary(input: {
  rowRead: boolean;
  defaultLocale: string | null | undefined;
  publicLocales: readonly string[] | null;
}) {
  return talentSeedPrimary({
    rowRead: input.rowRead,
    preferred: input.defaultLocale,
    publicLocales: input.publicLocales,
  });
}

export type WorkspaceLocaleSeedCookieState = {
  cookieLocale: string | null | undefined;
  cookieIsAuto: boolean;
  cookieOwner: string | null | undefined;
  userId: string;
};

/**
 * Cheap pre-check the layout runs BEFORE it reads the tenant's language: false
 * means no stored default could change anything (a deliberate cookie the user
 * owns), so the steady state costs no extra read.
 */
export function workspaceLocaleSeedMayApply(state: WorkspaceLocaleSeedCookieState): boolean {
  return localeSeedMayApply(state);
}

export function workspaceLocaleSeedPlan(
  state: WorkspaceLocaleSeedCookieState & { primary: string | null | undefined },
): { locale: string | null; stamp: boolean } {
  return talentLocaleSeedPlan(state);
}

/** True when `pathname` is this tenant's admin, in either URL shape (`/admin/...` on its own host, `/{slug}/admin/...` on the app host). */
export function isWorkspaceSeedablePath(pathname: string | null | undefined, tenantSlug: string): boolean {
  if (!pathname || typeof pathname !== "string" || !tenantSlug) return false;
  const bases = ["/admin", `/${tenantSlug}/admin`];
  return bases.some((b) => pathname === b || pathname.startsWith(`${b}/`));
}

/**
 * Same-origin return-URL guard for the seed route's `next`. Parses against a
 * sentinel origin (never a bare `startsWith("/")`), rejects absolute,
 * protocol-relative, backslash and control-character forms, the seed route
 * itself (loop) and anything that is not this tenant's admin, and otherwise
 * returns the EXACT original path + query so the hop is invisible. Invalid
 * input collapses to the tenant's admin home.
 */
export function safeWorkspaceNextPath(next: string | null | undefined, tenantSlug: string): string {
  const fallback = `/${tenantSlug}/admin`;
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f]/.test(next)) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(next, "http://seed.invalid");
  } catch {
    return fallback;
  }
  if (parsed.origin !== "http://seed.invalid") return fallback;
  if (!isWorkspaceSeedablePath(parsed.pathname, tenantSlug)) return fallback;
  return `${parsed.pathname}${parsed.search}`;
}

/** Build the seed route URL that returns the visitor to `next`. */
export function workspaceLocaleSeedHref(next: string, tenantSlug: string): string {
  const safe = safeWorkspaceNextPath(next, tenantSlug);
  return `${WORKSPACE_LOCALE_SEED_ROUTE}?slug=${encodeURIComponent(tenantSlug)}&next=${encodeURIComponent(safe)}`;
}
