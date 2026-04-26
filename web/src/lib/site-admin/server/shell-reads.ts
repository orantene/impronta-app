/**
 * Phase B.1 — public reader for the tenant site shell.
 *
 * The shell is a system-owned `cms_pages` row with `system_template_key =
 * 'site_shell'` and `slug = '__site_shell__'`. Section composition lives in
 * `cms_page_sections` keyed by `page_id` = shell-row-id, with slot keys
 * `header` and `footer`. The published JSONB snapshot lives in
 * `cms_pages.published_page_snapshot` (reusing the existing column shape).
 *
 * Returns null when:
 *   - the tenant has no shell row at all (default state pre-B.2 backfill)
 *   - the shell row exists but has never been published
 *   - the snapshot is empty (no header AND no footer slot)
 *
 * Callers MUST treat null as "fall through to the hard-coded PublicHeader",
 * not as an error. Phase B.1 does not change any rendering — the wrapper
 * component that consumes this reader is feature-flag-gated and OFF by
 * default.
 */

import { unstable_cache } from "next/cache";

import type { Locale } from "@/i18n/config";
import { tagFor } from "@/lib/site-admin/cache-tags";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import type { HomepageSnapshot } from "./homepage";

export interface PublishedShell {
  pageId: string;
  locale: string;
  publishedAt: string | null;
  /** The snapshot's slot list. Header slot keys = "header"; footer = "footer". */
  snapshot: HomepageSnapshot;
}

interface ShellRow {
  id: string;
  locale: string;
  status: string;
  published_at: string | null;
  published_page_snapshot: HomepageSnapshot | null;
}

const SELECT = `
  id, locale, status, published_at, published_page_snapshot
`;

export function loadPublishedShell(
  tenantId: string,
  locale: Locale,
): Promise<PublishedShell | null> {
  if (!tenantId) return Promise.resolve(null);
  return unstable_cache(
    async (): Promise<PublishedShell | null> => {
      const supabase = createPublicSupabaseClient();
      if (!supabase) return null;
      // Phase B.2.A fix (2026-04-26): direct SELECT on cms_pages is blocked
      // by anon RLS; the public read path goes through the SECURITY INVOKER
      // RPC `cms_public_pages_for_tenant` which sets the tenant GUC so the
      // tenant-aware policy permits the row. Same pattern as loadPublicPage.
      const { data, error } = await supabase
        .rpc("cms_public_pages_for_tenant", { p_tenant_id: tenantId })
        .select(SELECT)
        .eq("locale", locale)
        .eq("system_template_key", "site_shell")
        .maybeSingle<ShellRow>();
      if (error) {
        console.warn("[site-admin/shell-reads] shell load failed", {
          tenantId,
          locale,
          error: error.message,
        });
        return null;
      }
      if (!data) return null;
      if (data.status !== "published") return null;
      const snap = data.published_page_snapshot;
      if (!snap || !Array.isArray(snap.slots) || snap.slots.length === 0) {
        return null;
      }
      return {
        pageId: data.id,
        locale: data.locale,
        publishedAt: data.published_at,
        snapshot: snap,
      };
    },
    ["site-admin:published-shell", tenantId, locale],
    {
      // Tag-bust on any pages-all event — shell publishes route through the
      // same publishPageSnapshot path that already busts pages-all (see
      // page-composer-action.ts). Per-shell narrow tagging would require a
      // server-side shell-id resolution before the read; deferred.
      tags: [tagFor(tenantId, "pages-all")],
    },
  )();
}
