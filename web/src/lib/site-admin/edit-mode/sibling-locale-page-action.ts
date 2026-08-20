"use server";

/**
 * Translation status — read the SIBLING locale's freeform page row.
 *
 * Freeform stores one `cms_pages` row per (locale, slug). The builder's
 * translation-status panel compares the current draft tree against the other
 * locale's row, so it needs that row's `blocks` — read-only, tenant-scoped,
 * no schema changes. Mirrors the auth pattern of `cms-pages-list-action.ts`.
 *
 * `.limit(2)` instead of `maybeSingle()`: a duplicate (locale, slug) pair has
 * happened before (the freeform probe incident), and maybeSingle() on 2 rows
 * ERRORS the whole query. Two rows here degrade to "use the first, flag it".
 */

import { requireSession } from "@/lib/server/action-guards";
import { requireEditSurfaceTenantScope } from "@/lib/saas";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

export type SiblingLocalePageResult =
  | {
      ok: true;
      exists: true;
      status: string;
      title: string | null;
      blocks: ReadonlyArray<BuilderNode>;
      /** True when more than one row matched (data problem worth surfacing). */
      duplicateRows: boolean;
    }
  | { ok: true; exists: false }
  | { ok: false; error: string };

export async function loadSiblingLocalePageAction(input: {
  slug: string;
  locale: string;
}): Promise<SiblingLocalePageResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const slug = input.slug?.trim();
  const locale = input.locale?.trim();
  if (!slug || !locale) return { ok: false, error: "Missing slug or locale." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server is missing service-role credentials." };

  const { data, error } = await admin
    .from("cms_pages")
    .select("id, slug, locale, status, title, blocks, is_freeform")
    .eq("tenant_id", scope.tenantId)
    .eq("slug", slug)
    .eq("locale", locale)
    .eq("is_freeform", true)
    .limit(2);
  if (error) {
    return { ok: false, error: "Couldn't load the sibling page. Try again." };
  }
  const rows = data ?? [];
  if (rows.length === 0) return { ok: true, exists: false };

  const row = rows[0]! as {
    status: string;
    title: string | null;
    blocks: unknown;
  };
  const blocks = Array.isArray(row.blocks) ? (row.blocks as BuilderNode[]) : [];
  return {
    ok: true,
    exists: true,
    status: row.status,
    title: row.title,
    blocks,
    duplicateRows: rows.length > 1,
  };
}
