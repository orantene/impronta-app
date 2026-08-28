/**
 * DEFAULT PAGES CONTRACT — "a role page can be SWAPPED, never deleted into a
 * hole."
 *
 * WHY
 * ───
 * `home` and `notFound` are the two roles a public site cannot function
 * without: one is what `/` serves, the other is what every bad URL lands on.
 * Both are stored as SLUG POINTERS in `agencies.settings.pageRoles`, which
 * means deleting or archiving the page they point at silently empties the
 * pointer. `resolveRolePageSlug` then degrades to the built-in default — which
 * is a real fallback, but a SILENT one: the operator deleted their homepage,
 * got no warning, and their site quietly reverted to a design they had already
 * replaced. That is the "deleted into a hole" failure.
 *
 * THE RULE
 * ────────
 * Deleting or archiving a page that currently HOLDS `home` or `notFound` is
 * blocked with a plain-language explanation naming the swap. Assigning the role
 * to another page first clears the block, so nothing here is a dead end — it is
 * a one-step reorder, not a prohibition. `directory` is deliberately NOT
 * protected: a workspace with no roster has no business having a directory
 * page, and the built-in directory adapter covers the role without it.
 *
 * PURITY
 * ──────
 * {@link roleDeletionBlockReason} is pure so the same sentence can be shown by
 * the server guard and (later) by the All Pages panel before the operator even
 * clicks. {@link loadRoleDeletionBlockReason} is the thin I/O wrapper the
 * server write path calls.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { readTenantPageRoles } from "./page-roles";
import { rolesPointingAt, type PageRole, type TenantPageRoles } from "./page-roles-shape";

/**
 * The roles whose LAST holder may not be removed. Order matters only for the
 * message when a single page somehow holds both.
 */
export const PROTECTED_PAGE_ROLES: readonly PageRole[] = ["home", "notFound"];

const ROLE_LABEL: Record<PageRole, string> = {
  home: "homepage",
  notFound: "404 page",
  directory: "directory page",
};

export type PageRemovalVerb = "delete" | "archive";

/**
 * The plain-language reason this page may not be removed, or null when removal
 * is fine. Never a code, never a stack trace: the string is surfaced verbatim to
 * the operator through `SYSTEM_PAGE_IMMUTABLE`.
 */
export function roleDeletionBlockReason(args: {
  slug: string | null | undefined;
  roles: TenantPageRoles;
  verb?: PageRemovalVerb;
}): string | null {
  const slug = (args.slug ?? "").trim();
  if (!slug) return null;

  const held = rolesPointingAt(args.roles, slug).filter((role) =>
    PROTECTED_PAGE_ROLES.includes(role),
  );
  if (held.length === 0) return null;

  const verb = args.verb ?? "delete";
  const labels = PROTECTED_PAGE_ROLES.filter((role) => held.includes(role)).map(
    (role) => ROLE_LABEL[role],
  );
  const what = labels.length === 2 ? `${labels[0]} and your ${labels[1]}` : labels[0];

  return `This page is your ${what}. Give that role to another published page first, then ${verb} this one.`;
}

/**
 * Read the tenant's role map and apply {@link roleDeletionBlockReason}.
 *
 * Fails OPEN on a read error: a transient failure reading `agencies.settings`
 * must not make every page undeletable. The consequence of failing open is the
 * pre-existing silent-fallback behaviour, which is strictly better than a
 * workspace that cannot manage its own pages.
 */
export async function loadRoleDeletionBlockReason(
  supabase: SupabaseClient,
  tenantId: string,
  slug: string | null | undefined,
  verb: PageRemovalVerb = "delete",
): Promise<string | null> {
  const cleaned = (slug ?? "").trim();
  if (!cleaned || !tenantId) return null;
  try {
    const roles = await readTenantPageRoles(supabase, tenantId);
    return roleDeletionBlockReason({ slug: cleaned, roles, verb });
  } catch {
    return null;
  }
}
