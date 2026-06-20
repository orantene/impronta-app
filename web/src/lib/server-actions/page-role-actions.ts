"use server";

import { revalidatePath } from "next/cache";

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { readTenantPageRoles, writeTenantPageRole } from "@/lib/site-admin/server/page-roles";
import type { PageRole, TenantPageRoles } from "@/lib/site-admin/server/page-roles-shape";
import { EMPTY_PAGE_ROLES, PAGE_ROLES } from "@/lib/site-admin/server/page-roles-shape";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

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
