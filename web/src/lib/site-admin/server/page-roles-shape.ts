/**
 * page-roles-shape.ts — PURE (no I/O) resolution of per-tenant page ROLE
 * pointers stored in `agencies.settings.pageRoles`.
 *
 * A "role" is an assignable designation that points at a normal page's slug,
 * replacing the old hard-coded system-page model:
 *   - home       → the page served at `/`
 *   - directory  → the page served at `/directory`
 *   - notFound   → the page rendered for unknown storefront paths (404)
 *
 * Storing the SLUG (not a page id) is locale-safe: the renderer loads the slug
 * for the active locale, so en/es fall out for free. An UNSET pointer means
 * "use the built-in default" (the legacy system page) — so a tenant that never
 * assigns a role behaves exactly as before. Pure so the public render path, the
 * admin assign action, and the All Pages badges all derive roles identically.
 */

export type PageRole = "home" | "directory" | "notFound";

export const PAGE_ROLES: readonly PageRole[] = ["home", "directory", "notFound"];

/** Each role → the assigned page slug, or null when unset (use the default). */
export type TenantPageRoles = Record<PageRole, string | null>;

export const EMPTY_PAGE_ROLES: TenantPageRoles = {
  home: null,
  directory: null,
  notFound: null,
};

function cleanSlug(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  // Reserved/system slugs ('__site_shell__', '__directory__', '') are NOT valid
  // role targets — a role must point at a real, addressable page slug. The
  // empty-string home is the legacy default, represented by null (= unset).
  if (s === "" || s.startsWith("__")) return null;
  return s;
}

/** Read the role map out of an opaque `agencies.settings` JSON value. */
export function parsePageRoles(settings: unknown): TenantPageRoles {
  const raw =
    settings && typeof settings === "object"
      ? (settings as Record<string, unknown>).pageRoles
      : null;
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    home: cleanSlug(obj.home),
    directory: cleanSlug(obj.directory),
    notFound: cleanSlug(obj.notFound),
  };
}

/** Return a new role map with `role` set to `slug` (null/invalid clears it). */
export function withPageRole(
  roles: TenantPageRoles,
  role: PageRole,
  slug: string | null,
): TenantPageRoles {
  return { ...roles, [role]: cleanSlug(slug) };
}

/**
 * Merge a role map back into an opaque `agencies.settings` object WITHOUT
 * disturbing any other keys. Roles that are null are written as null (explicit
 * unset) so a cleared role round-trips. Returns a fresh settings object.
 */
export function pageRolesToSettings(
  prevSettings: unknown,
  roles: TenantPageRoles,
): Record<string, unknown> {
  const base =
    prevSettings && typeof prevSettings === "object"
      ? { ...(prevSettings as Record<string, unknown>) }
      : {};
  base.pageRoles = { home: roles.home, directory: roles.directory, notFound: roles.notFound };
  return base;
}

/** The slug a route should serve for `role`, or the supplied built-in default
 *  when the tenant hasn't assigned the role. */
export function resolveRoleSlug(
  roles: TenantPageRoles,
  role: PageRole,
  builtinDefault: string,
): string {
  return roles[role] ?? builtinDefault;
}
