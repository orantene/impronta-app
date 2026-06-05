"use server";

/**
 * P4-SEO (T4.3) — in-canvas SEO authoring server actions for the Page settings
 * drawer (`edit-chrome/page-settings-drawer.tsx`).
 *
 * Why a focused module rather than reusing `server/pages.ts` `upsertPage`:
 * the drawer edits ONE page in-canvas and only wants to touch a few SEO knobs
 * (slug, sitemap flag, structured data) + manage redirects. `upsertPage`
 * demands a full page envelope (body/hero/templateSchemaVersion/…) which the
 * in-canvas editor doesn't carry. These actions are targeted, CAS-safe patches
 * scoped to the tenant.
 *
 * Boundaries we respect:
 *   - Slug edits are blocked on system-owned pages (homepage). The DB trigger
 *     `cms_pages_system_ownership_guard` is the backstop; we pre-check so the
 *     operator gets a friendly message and the input is disabled in the UI.
 *   - Slug validation reuses `pageSlugSchema` (lowercase/hyphen/slash, reserved
 *     first-segment guard) so it matches the admin Pages editor exactly.
 *   - Redirects read/write `cms_redirects` scoped to `tenant_id`; the existing
 *     middleware resolver + sitemap already consume the table.
 *
 * All writes bust the relevant `pages` / `pages-all` / `storefront` cache tags.
 */

import { updateTag } from "next/cache";

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { pageSlugSchema } from "@/lib/site-admin/forms/pages";
import { tagFor } from "@/lib/site-admin/cache-tags";
import {
  jsonLdDocumentToEditorText,
  normalizeRedirectPair,
  parsePageJsonLd,
  type JsonLdDocument,
} from "@/lib/site-admin/cms-seo";

const GENERIC_ERROR = "Couldn't save — try again.";

// ── slug ─────────────────────────────────────────────────────────────────────

export type SavePageSlugResult =
  | { ok: true; slug: string }
  | { ok: false; error: string };

/**
 * Update a non-homepage page's slug. CAS on a fresh read of the row (the
 * drawer doesn't thread page version for SEO-only edits). System-owned pages
 * (homepage) are rejected — their URL is framework-owned.
 */
export async function savePageSlugAction(input: {
  pageId: string;
  slug: string;
}): Promise<SavePageSlugResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const parsed = pageSlugSchema.safeParse(input.slug);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "That slug isn't valid.",
    };
  }
  const slug = parsed.data;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data: row, error: loadErr } = await admin
    .from("cms_pages")
    .select("id, is_system_owned, slug")
    .eq("id", input.pageId)
    .eq("tenant_id", scope.tenantId)
    .maybeSingle<{ id: string; is_system_owned: boolean; slug: string }>();
  if (loadErr || !row) return { ok: false, error: "Page not found." };
  if (row.is_system_owned) {
    return {
      ok: false,
      error: "The homepage URL is fixed at / and can't be changed.",
    };
  }
  if (row.slug === slug) return { ok: true, slug };

  const { error: updErr } = await admin
    .from("cms_pages")
    .update({ slug, updated_by: auth.user.id, updated_at: new Date().toISOString() })
    .eq("id", input.pageId)
    .eq("tenant_id", scope.tenantId);
  if (updErr) {
    // Surface the two DB triggers (reserved-slug + system-ownership) + uniqueness.
    const msg = updErr.message ?? "";
    if (/RESERVED_SLUG|reserved/i.test(msg)) {
      return { ok: false, error: "That slug is reserved by the platform." };
    }
    if (/duplicate key|unique/i.test(msg)) {
      return { ok: false, error: "Another page already uses that slug." };
    }
    if (/SYSTEM_PAGE_IMMUTABLE|42501/i.test(msg)) {
      return { ok: false, error: "This page's URL can't be changed." };
    }
    return { ok: false, error: GENERIC_ERROR };
  }

  updateTag(tagFor(scope.tenantId, "pages", { id: input.pageId }));
  updateTag(tagFor(scope.tenantId, "pages-all"));
  updateTag(tagFor(scope.tenantId, "storefront"));
  return { ok: true, slug };
}

// ── load current SEO state ───────────────────────────────────────────────────

export type LoadPageSeoResult =
  | {
      ok: true;
      seo: {
        slug: string;
        isSystemOwned: boolean;
        includeInSitemap: boolean;
        /** Pretty-printed JSON-LD for the authoring textarea, or "" when none. */
        jsonLdText: string;
      };
    }
  | { ok: false; error: string };

/**
 * Read the SEO knobs the drawer manages independently of the composition save
 * (slug / sitemap flag / structured data). Called once on drawer open. The
 * og/meta/noindex fields still flow through the composition metadata payload;
 * these three are page-row-only and edited in place.
 */
export async function loadPageSeoAction(input: {
  pageId: string;
}): Promise<LoadPageSeoResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data: row, error } = await admin
    .from("cms_pages")
    .select("slug, is_system_owned, include_in_sitemap, json_ld")
    .eq("id", input.pageId)
    .eq("tenant_id", scope.tenantId)
    .maybeSingle<{
      slug: string;
      is_system_owned: boolean;
      include_in_sitemap: boolean;
      json_ld: JsonLdDocument | null;
    }>();
  if (error || !row) return { ok: false, error: "Page not found." };

  return {
    ok: true,
    seo: {
      slug: row.slug,
      isSystemOwned: row.is_system_owned,
      includeInSitemap: row.include_in_sitemap,
      jsonLdText: jsonLdDocumentToEditorText(row.json_ld),
    },
  };
}

// ── sitemap + structured data ────────────────────────────────────────────────

export type SavePageSeoFlagsResult =
  | { ok: true; includeInSitemap: boolean; jsonLd: JsonLdDocument | null }
  | { ok: false; error: string };

/**
 * Persist the sitemap-inclusion flag and/or operator-authored JSON-LD on a
 * page (homepage or non-home). `jsonLdRaw` is parsed + validated here; an empty
 * string clears it. Pass `undefined` for a field to leave it untouched.
 */
export async function savePageSeoFlagsAction(input: {
  pageId: string;
  includeInSitemap?: boolean;
  jsonLdRaw?: string | null;
}): Promise<SavePageSeoFlagsResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const patch: Record<string, unknown> = {
    updated_by: auth.user.id,
    updated_at: new Date().toISOString(),
  };

  let jsonLd: JsonLdDocument | null = null;
  if (input.jsonLdRaw !== undefined) {
    const parsed = parsePageJsonLd(input.jsonLdRaw);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    jsonLd = parsed.value;
    patch.json_ld = jsonLd;
  }
  if (typeof input.includeInSitemap === "boolean") {
    patch.include_in_sitemap = input.includeInSitemap;
  }

  const { data: row, error: loadErr } = await admin
    .from("cms_pages")
    .select("id, include_in_sitemap")
    .eq("id", input.pageId)
    .eq("tenant_id", scope.tenantId)
    .maybeSingle<{ id: string; include_in_sitemap: boolean }>();
  if (loadErr || !row) return { ok: false, error: "Page not found." };

  const { error: updErr } = await admin
    .from("cms_pages")
    .update(patch)
    .eq("id", input.pageId)
    .eq("tenant_id", scope.tenantId);
  if (updErr) return { ok: false, error: GENERIC_ERROR };

  updateTag(tagFor(scope.tenantId, "pages", { id: input.pageId }));
  updateTag(tagFor(scope.tenantId, "pages-all"));
  updateTag(tagFor(scope.tenantId, "storefront"));
  return {
    ok: true,
    includeInSitemap:
      typeof input.includeInSitemap === "boolean"
        ? input.includeInSitemap
        : row.include_in_sitemap,
    jsonLd,
  };
}

// ── redirects ────────────────────────────────────────────────────────────────

export interface CmsRedirectRow {
  id: string;
  oldPath: string;
  newPath: string;
  statusCode: number;
  active: boolean;
  createdAt: string;
}

export type ListRedirectsResult =
  | { ok: true; redirects: ReadonlyArray<CmsRedirectRow> }
  | { ok: false; error: string };

export async function listRedirectsAction(): Promise<ListRedirectsResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data, error } = await admin
    .from("cms_redirects")
    .select("id, old_path, new_path, status_code, active, created_at")
    .eq("tenant_id", scope.tenantId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { ok: false, error: "Couldn't load redirects — try again." };

  type Row = {
    id: string;
    old_path: string;
    new_path: string;
    status_code: number;
    active: boolean;
    created_at: string;
  };
  const redirects: CmsRedirectRow[] = ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    oldPath: r.old_path,
    newPath: r.new_path,
    statusCode: r.status_code,
    active: r.active,
    createdAt: r.created_at,
  }));
  return { ok: true, redirects };
}

export type MutateRedirectResult =
  | { ok: true; redirect: CmsRedirectRow }
  | { ok: false; error: string };

export async function createRedirectAction(input: {
  oldPath: string;
  newPath: string;
  statusCode?: number;
}): Promise<MutateRedirectResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const normalized = normalizeRedirectPair(input);
  if (!normalized.ok) return { ok: false, error: normalized.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  // The table's unique index on old_path is partial (WHERE active = true) and
  // is NOT tenant-scoped, so a redirect from the same path across tenants would
  // collide. Pre-check within this tenant for a friendlier message; the DB
  // index is still the hard backstop.
  const { data: existing } = await admin
    .from("cms_redirects")
    .select("id")
    .eq("tenant_id", scope.tenantId)
    .eq("old_path", normalized.oldPath)
    .eq("active", true)
    .maybeSingle<{ id: string }>();
  if (existing) {
    return {
      ok: false,
      error: `A redirect from ${normalized.oldPath} already exists.`,
    };
  }

  const { data, error } = await admin
    .from("cms_redirects")
    .insert({
      tenant_id: scope.tenantId,
      old_path: normalized.oldPath,
      new_path: normalized.newPath,
      status_code: normalized.statusCode,
      active: true,
      created_by: auth.user.id,
    })
    .select("id, old_path, new_path, status_code, active, created_at")
    .single<{
      id: string;
      old_path: string;
      new_path: string;
      status_code: number;
      active: boolean;
      created_at: string;
    }>();
  if (error || !data) {
    if (error && /duplicate key|unique/i.test(error.message ?? "")) {
      return { ok: false, error: "A redirect from that path already exists." };
    }
    return { ok: false, error: GENERIC_ERROR };
  }

  updateTag(tagFor(scope.tenantId, "storefront"));
  return {
    ok: true,
    redirect: {
      id: data.id,
      oldPath: data.old_path,
      newPath: data.new_path,
      statusCode: data.status_code,
      active: data.active,
      createdAt: data.created_at,
    },
  };
}

export type SimpleRedirectResult = { ok: true } | { ok: false; error: string };

export async function setRedirectActiveAction(input: {
  id: string;
  active: boolean;
}): Promise<SimpleRedirectResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { error } = await admin
    .from("cms_redirects")
    .update({ active: input.active, updated_at: new Date().toISOString() })
    .eq("id", input.id)
    .eq("tenant_id", scope.tenantId);
  if (error) {
    if (/duplicate key|unique/i.test(error.message ?? "")) {
      return {
        ok: false,
        error: "Re-enabling collides with another active redirect from that path.",
      };
    }
    return { ok: false, error: GENERIC_ERROR };
  }

  updateTag(tagFor(scope.tenantId, "storefront"));
  return { ok: true };
}

export async function deleteRedirectAction(input: {
  id: string;
}): Promise<SimpleRedirectResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { error } = await admin
    .from("cms_redirects")
    .delete()
    .eq("id", input.id)
    .eq("tenant_id", scope.tenantId);
  if (error) return { ok: false, error: GENERIC_ERROR };

  updateTag(tagFor(scope.tenantId, "storefront"));
  return { ok: true };
}
