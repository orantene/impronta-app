"use server";

import { revalidatePath } from "next/cache";

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { readTenantPageRoles, writeTenantPageRole } from "@/lib/site-admin/server/page-roles";
import type { PageRole, TenantPageRoles } from "@/lib/site-admin/server/page-roles-shape";
import { EMPTY_PAGE_ROLES, PAGE_ROLES } from "@/lib/site-admin/server/page-roles-shape";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { createDraftPageAction } from "./admin-site-pages";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Current role→slug map for the active tenant (for the All Pages badges). */
export async function readPageRolesAction(): Promise<
  { ok: true; roles: TenantPageRoles } | { ok: false; error: string }
> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "No workspace." };
  const svc = createServiceRoleClient();
  if (!svc) return { ok: true, roles: EMPTY_PAGE_ROLES };
  return { ok: true, roles: await readTenantPageRoles(svc, scope.tenantId) };
}

/**
 * Assign (slug set) or clear (slug null) a page ROLE for the active tenant.
 * Authz: must be staff AND scoped to a tenant; the privileged settings write
 * runs with the service role but only ever for `scope.tenantId`, after the
 * slug is verified to be a real, non-shell page of that tenant.
 */
export async function setPageRoleAction(
  role: PageRole,
  slug: string | null,
): Promise<ActionResult> {
  if (!PAGE_ROLES.includes(role)) return { ok: false, error: "Unknown role." };

  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Select an agency workspace first." };

  const cleaned = (slug ?? "").trim();

  // slug === null/empty ⇒ CLEAR the role (revert to the built-in default).
  if (cleaned !== "") {
    if (cleaned.startsWith("__")) {
      return { ok: false, error: "Pick a real page for this role." };
    }
    // Verify the target is a real, non-archived, non-shell page of THIS tenant.
    const { data: page, error } = await tenantScopedQuery(
      auth.supabase,
      "cms_pages",
      scope.tenantId,
    )
      .select("id, system_template_key")
      .eq("slug", cleaned)
      .neq("status", "archived")
      .limit(1)
      .maybeSingle<{ id: string; system_template_key: string | null }>();
    if (error) return { ok: false, error: "Could not verify the page." };
    if (!page) return { ok: false, error: "That page no longer exists." };
    if (page.system_template_key === "site_shell") {
      return { ok: false, error: "The site shell can't be a page role." };
    }
  }

  const svc = createServiceRoleClient();
  if (!svc) return { ok: false, error: "Server not configured." };
  const res = await writeTenantPageRole(svc, scope.tenantId, role, cleaned || null);
  if (!res.ok) return res;

  // Bust the storefront route caches that a role pointer feeds.
  revalidatePath("/");
  revalidatePath("/directory");
  return { ok: true };
}

/**
 * Turn the legacy system homepage into a NORMAL, editable page: copies the
 * published homepage's builder tree into a fresh freeform page, publishes it,
 * and assigns it the `home` role so `/` serves it (with the full builder incl.
 * Page Templates). The old system homepage row stays as an inert fallback. Safe
 * + idempotent-ish: refuses if a home role is already assigned.
 */
export async function convertLegacyHomepageToPageAction(): Promise<
  { ok: true; slug: string } | { ok: false; error: string }
> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Select an agency workspace first." };

  const svc = createServiceRoleClient();
  if (!svc) return { ok: false, error: "Server not configured." };

  // Already an editable home? Don't duplicate it.
  const roles = await readTenantPageRoles(svc, scope.tenantId);
  if (roles.home) {
    return { ok: false, error: "Your homepage is already an editable page." };
  }

  const localeSettings = await loadTenantLocaleSettings(scope.tenantId);
  const locale = localeSettings.defaultLocale;

  // Pull the legacy homepage's builder tree from its published snapshot.
  const { data: hp } = await tenantScopedQuery(svc, "cms_pages", scope.tenantId)
    .select("published_homepage_snapshot")
    .eq("system_template_key", "homepage")
    .eq("locale", locale)
    .maybeSingle<{ published_homepage_snapshot: { builderTree?: unknown } | null }>();
  const tree = hp?.published_homepage_snapshot?.builderTree;
  if (!Array.isArray(tree) || tree.length === 0) {
    return {
      ok: false,
      error: "Publish your homepage first — there's no builder content to convert yet.",
    };
  }

  // Create a blank freeform page through the vetted create path (handles slug
  // mint + RLS + is_freeform), then fill it with the homepage tree + publish.
  const created = await createDraftPageAction();
  if (!created.ok) return { ok: false, error: created.error };

  // Prefer a clean "home" slug when free; else keep the minted one.
  const { data: homeTaken } = await tenantScopedQuery(svc, "cms_pages", scope.tenantId)
    .select("id")
    .eq("slug", "home")
    .limit(1)
    .maybeSingle<{ id: string }>();
  const slug = homeTaken ? created.slug : "home";

  const { error: fillErr } = await tenantScopedQuery(svc, "cms_pages", scope.tenantId)
    .update({
      blocks: tree,
      status: "published",
      title: "Home",
      slug,
      published_at: new Date().toISOString(),
    })
    .eq("id", created.id);
  if (fillErr) {
    return { ok: false, error: "Created the page but couldn't copy the homepage content." };
  }

  const res = await writeTenantPageRole(svc, scope.tenantId, "home", slug);
  if (!res.ok) return res;

  revalidatePath("/");
  return { ok: true, slug };
}
