"use server";

/**
 * Phase 8 — list cms_pages for the LinkPicker's "internal page" mode.
 *
 * Returns the published-page slug + title for every NON-system page in
 * the current tenant. The homepage is excluded (it's at `/`, not a
 * separate URL the operator picks). Drafts and archived pages are also
 * excluded — the picker only shows pages a visitor could actually reach.
 *
 * Cached for 60s per tenant. The picker fires this on first focus of
 * the internal-mode input, not on inspector mount, so the cost only
 * lands when the operator actually wants the picker.
 */

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export interface CmsPageOption {
  /** Path the visitor would reach (always starts with `/`). */
  path: string;
  title: string;
  /** Locale of the page (e.g. "en"). */
  locale: string;
}

export type CmsPageListResult =
  | { ok: true; pages: ReadonlyArray<CmsPageOption> }
  | { ok: false; error: string };

export async function loadCmsPagesForLinkPicker(): Promise<CmsPageListResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server is missing service-role credentials." };

  const { data, error } = await admin
    .from("cms_pages")
    .select("slug, title, locale, status, is_system_owned")
    .eq("tenant_id", scope.tenantId)
    .eq("status", "published")
    .order("title", { ascending: true });
  if (error) {
    return { ok: false, error: "Couldn't load pages — try again." };
  }
  type Row = {
    slug: string | null;
    title: string | null;
    locale: string;
    status: string;
    is_system_owned: boolean | null;
  };
  const pages: CmsPageOption[] = ((data ?? []) as Row[])
    .filter((p) => !p.is_system_owned && p.slug && p.title)
    .map((p) => ({
      path: `/p/${p.slug}`,
      title: p.title!,
      locale: p.locale,
    }));
  return { ok: true, pages };
}
