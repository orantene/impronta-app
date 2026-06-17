"use server";

/**
 * ONB-4 — lightweight inline page CRUD actions for the AllPagesPanel rename /
 * delete forms. Extracted from admin-site-pages.ts to keep that file under the
 * 800-line ESLint cap. Guards + scoping are identical to the full save/delete
 * paths; they differ only in the narrower update shape (title+slug only) and
 * the direct delete (no CAS, no audit-event since these are draft-level ops).
 */

import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

// ---- quick inline rename ---------------------------------------------------

/**
 * Renames a CMS page (title + slug). The homepage (slug="") is excluded from
 * the slug-change path; title-only changes are accepted for the homepage via
 * slug="" pass-through.
 */
export async function quickRenamePageAction(input: {
  id: string;
  title: string;
  slug: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "No workspace." };

  const title = input.title.trim();
  const slug = input.slug.trim().toLowerCase();
  if (!title) return { ok: false, error: "Title is required." };
  // Homepage keeps slug="" — only title is updated.
  if (slug !== "" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { ok: false, error: "Slug may only contain lowercase letters, digits, and hyphens." };
  }

  if (slug !== "") {
    // Check the slug isn't already taken by another page in this tenant.
    const { data: clash } = await tenantScopedQuery(auth.supabase, "cms_pages", scope.tenantId)
      .select("id")
      .eq("slug", slug)
      .neq("id", input.id)
      .maybeSingle();
    if (clash) return { ok: false, error: "That slug is already used by another page." };
  }

  const patch: Record<string, unknown> = { title, updated_at: new Date().toISOString() };
  if (slug !== "") patch.slug = slug;

  const { error } = await tenantScopedQuery(auth.supabase, "cms_pages", scope.tenantId)
    .update(patch)
    .eq("id", input.id);

  if (error) {
    logServerError("site-admin/pages/quick-rename", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  return { ok: true };
}

// ---- quick inline delete ---------------------------------------------------

/**
 * Deletes a CMS page. Guards: staff + same tenant + not system-owned.
 * The DB trigger `cms_pages_reserved_slug_guard` provides a second layer.
 */
export async function quickDeletePageAction(input: {
  id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "No workspace." };

  const { data: page } = await tenantScopedQuery(auth.supabase, "cms_pages", scope.tenantId)
    .select("id, is_system_owned")
    .eq("id", input.id)
    .maybeSingle() as { data: { id: string; is_system_owned: boolean } | null };

  if (!page) return { ok: false, error: "Page not found." };
  if (page.is_system_owned) return { ok: false, error: "System pages cannot be deleted." };

  const { error } = await tenantScopedQuery(auth.supabase, "cms_pages", scope.tenantId)
    .delete()
    .eq("id", input.id);

  if (error) {
    logServerError("site-admin/pages/quick-delete", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  return { ok: true };
}
