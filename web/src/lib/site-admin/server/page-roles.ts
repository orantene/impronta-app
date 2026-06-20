import type { SupabaseClient } from "@supabase/supabase-js";

import { improntaLog } from "@/lib/server/structured-log";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import {
  parsePageRoles,
  pageRolesToSettings,
  withPageRole,
  EMPTY_PAGE_ROLES,
  type PageRole,
  type TenantPageRoles,
} from "./page-roles-shape";

/**
 * page-roles.ts — DB read/write for the per-tenant page ROLE pointers stored in
 * `agencies.settings.pageRoles`. Pure parsing/merging lives in
 * `page-roles-shape.ts`; this module only does the I/O (a `select`/`update` on
 * `agencies.settings`). The caller supplies the Supabase client so the public
 * render path (anon/cached) and the authed assign action share one code path.
 */

/** Read the role map for a tenant. Never throws — returns EMPTY on any error so
 *  routing falls back to the built-in defaults (legacy behaviour). */
export async function readTenantPageRoles(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantPageRoles> {
  if (!tenantId) return EMPTY_PAGE_ROLES;
  const { data, error } = await supabase
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle<{ settings: unknown }>();
  if (error || !data) {
    if (error) {
      void improntaLog("site_admin_page_roles.warn", {
        message: "[site-admin/page-roles] read failed",
        tenantId,
        error: error.message,
      });
    }
    return EMPTY_PAGE_ROLES;
  }
  return parsePageRoles(data.settings);
}

/**
 * Assign (or clear, with slug=null) one role for a tenant by merging into the
 * existing `agencies.settings` JSON — other settings keys are preserved. Reads
 * the current settings first to avoid clobbering concurrent keys.
 */
export async function writeTenantPageRole(
  supabase: SupabaseClient,
  tenantId: string,
  role: PageRole,
  slug: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!tenantId) return { ok: false, error: "Missing tenant." };
  const { data, error: readErr } = await supabase
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle<{ settings: unknown }>();
  if (readErr) {
    void improntaLog("site_admin_page_roles.warn", {
      message: "[site-admin/page-roles] write pre-read failed",
      tenantId,
      error: readErr.message,
    });
    return { ok: false, error: "Could not load workspace settings." };
  }
  const next = withPageRole(parsePageRoles(data?.settings), role, slug);
  const nextSettings = pageRolesToSettings(data?.settings, next);
  const { error: writeErr } = await supabase
    .from("agencies")
    .update({ settings: nextSettings })
    .eq("id", tenantId);
  if (writeErr) {
    void improntaLog("site_admin_page_roles.warn", {
      message: "[site-admin/page-roles] write failed",
      tenantId,
      error: writeErr.message,
    });
    return { ok: false, error: "Could not save the page role." };
  }
  return { ok: true };
}

/**
 * Resolve the slug the storefront root (`/`) should serve for a tenant, or null
 * to use the legacy homepage. Returns the assigned `home` slug ONLY when a
 * PUBLISHED page actually exists at that slug for the requested locale — so a
 * dangling pointer (page deleted, or not published in this locale) can never
 * 404 the homepage; `/` falls back to the legacy storefront instead. Reads with
 * the service role (server-only) so anon RLS on `agencies.settings` can't
 * silently disable the pointer.
 */
async function resolveRolePageSlug(
  tenantId: string,
  locale: string,
  role: PageRole,
): Promise<string | null> {
  if (!tenantId) return null;
  const svc = createServiceRoleClient();
  if (!svc) return null;
  const roles = await readTenantPageRoles(svc, tenantId);
  const slug = roles[role];
  if (!slug) return null;
  const { data } = await tenantScopedQuery(svc, "cms_pages", tenantId)
    .select("id")
    .eq("slug", slug)
    .eq("locale", locale)
    .eq("status", "published")
    .limit(1)
    .maybeSingle<{ id: string }>();
  return data ? slug : null;
}

export function resolveAgencyHomeSlug(
  tenantId: string,
  locale: string,
): Promise<string | null> {
  return resolveRolePageSlug(tenantId, locale, "home");
}

/**
 * The slug the agency 404 boundary should render (with the shell) for a tenant,
 * or null to use the built-in branded 404. Like {@link resolveAgencyHomeSlug},
 * returns the assigned `notFound` slug ONLY when a PUBLISHED page exists at it
 * for the locale — so a dangling pointer can never recurse the not-found
 * boundary; it falls back to the generic 404 instead.
 */
export function resolveNotFoundSlug(
  tenantId: string,
  locale: string,
): Promise<string | null> {
  return resolveRolePageSlug(tenantId, locale, "notFound");
}
