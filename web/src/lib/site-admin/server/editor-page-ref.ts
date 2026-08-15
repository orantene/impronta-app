/**
 * Editor page reference resolver.
 *
 * The edit chrome mounts on more than the homepage: every freeform cms page
 * opens the same topbar, the same Publish caret, the same Share button. Two
 * server surfaces used to ignore that and hard-resolve the homepage row —
 * `schedule-actions.ts` (Schedule publish) and `share-link/share-actions.ts`
 * (Share preview link). The result was silent mis-targeting: an operator
 * scheduling an inner page actually scheduled the HOMEPAGE, and a share link
 * minted from an inner page handed the recipient the HOMEPAGE draft.
 *
 * This module is the one place that turns the editor's client-side page
 * identity (`EditContext.pageId` / `EditContext.pageSlug` / `locale`) into a
 * `cms_pages` row. It mirrors the routing the revisions drawer already uses:
 * a page is "non-homepage" when the editor supplies an id or a slug; with
 * neither, the homepage row is the correct answer (the storefront homepage
 * mounts with no slug).
 *
 * Not a `"use server"` file on purpose — it exports non-action helpers and is
 * imported by the action files, the cron sweep, and the public share route.
 *
 * Tenant scoping: EVERY query filters `tenant_id`. `pageId` arrives from a
 * client component and is therefore untrusted; the tenant predicate is what
 * stops a crafted id from reaching another workspace's row.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Locale } from "@/lib/site-admin/locales";

/** Columns every caller needs to route a page to its correct publish/render path. */
export const EDITOR_PAGE_COLUMNS =
  "id, tenant_id, locale, slug, title, version, status, is_system_owned, system_template_key, is_freeform";

export interface EditorPageRefInput {
  /** `cms_pages.id` of the page being edited. Authoritative when present. */
  pageId?: string | null;
  /** `cms_pages.slug` of the page being edited. Used when no id is available. */
  pageSlug?: string | null;
  /** Locale of the surface. Also selects the homepage row in the fallback. */
  locale: Locale;
}

export interface ResolvedEditorPage {
  id: string;
  tenantId: string;
  locale: string;
  slug: string;
  title: string;
  version: number;
  status: string;
  isSystemOwned: boolean;
  systemTemplateKey: string | null;
  isFreeform: boolean;
}

interface EditorPageRow {
  id: string;
  tenant_id: string;
  locale: string;
  slug: string;
  title: string;
  version: number;
  status: string;
  is_system_owned: boolean;
  system_template_key: string | null;
  is_freeform: boolean;
}

function toResolved(row: EditorPageRow): ResolvedEditorPage {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    locale: row.locale,
    slug: row.slug,
    title: row.title,
    version: row.version,
    status: row.status,
    isSystemOwned: row.is_system_owned,
    systemTemplateKey: row.system_template_key,
    isFreeform: row.is_freeform,
  };
}

function trimmed(value: string | null | undefined): string | null {
  const v = typeof value === "string" ? value.trim() : "";
  return v.length > 0 ? v : null;
}

/**
 * Is this reference pointing at a specific (non-homepage) page? Mirrors the
 * revisions drawer's `isNonHomepage` derivation: identity comes from the id or
 * the slug, NEVER from a surfaceKind fork (a slot cms page mounts with
 * surfaceKind "homepage" and would be mis-routed by a kind check).
 */
export function hasExplicitPageRef(ref: EditorPageRefInput): boolean {
  return Boolean(trimmed(ref.pageId) || trimmed(ref.pageSlug));
}

/**
 * Resolve the `cms_pages` row the editor is pointed at.
 *
 * Order: explicit `pageId` → (`locale`, `pageSlug`) → the system homepage row
 * for `locale`. Returns `null` when nothing matches inside the tenant.
 *
 * `cms_pages` is unique on (tenant_id, locale, slug), so the slug branch needs
 * the locale predicate — without it a multi-locale tenant returns >1 row and
 * `.maybeSingle()` errors rather than resolving.
 */
export async function resolveEditorPage(
  supabase: SupabaseClient,
  tenantId: string,
  ref: EditorPageRefInput,
): Promise<ResolvedEditorPage | null> {
  const pageId = trimmed(ref.pageId);
  if (pageId) {
    const { data } = await supabase
      .from("cms_pages")
      .select(EDITOR_PAGE_COLUMNS)
      .eq("id", pageId)
      .eq("tenant_id", tenantId)
      .maybeSingle()
      .returns<EditorPageRow>();
    return data ? toResolved(data) : null;
  }

  const slug = trimmed(ref.pageSlug);
  if (slug) {
    const { data } = await supabase
      .from("cms_pages")
      .select(EDITOR_PAGE_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("locale", ref.locale)
      .eq("slug", slug)
      .maybeSingle()
      .returns<EditorPageRow>();
    return data ? toResolved(data) : null;
  }

  const { data } = await supabase
    .from("cms_pages")
    .select(EDITOR_PAGE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("locale", ref.locale)
    .eq("is_system_owned", true)
    .eq("system_template_key", "homepage")
    .maybeSingle()
    .returns<EditorPageRow>();
  return data ? toResolved(data) : null;
}
