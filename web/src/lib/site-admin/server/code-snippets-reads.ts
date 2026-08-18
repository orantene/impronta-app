import "server-only";

/**
 * Published custom-code snippets for ONE tenant's storefront.
 *
 * Read shape mirrors `reads.ts` (cookie-less public client + `unstable_cache` +
 * `tagFor`), with one deliberate difference: the query goes through the
 * `cms_public_code_snippets_for_tenant` RPC rather than a bare `.from()`.
 *
 * The RPC is SECURITY INVOKER — it grants nothing. What it does is
 * `set_config('app.current_tenant_id', …)` inside its own transaction, so the
 * `cms_code_snippets_select_tenant_published` policy can match on
 * `tenant_id = current_tenant_id()`. Without it, an anon SELECT on this table
 * returns ZERO rows (the GUC is NULL), which is the intended fail-closed
 * default. It is the same wire model the CMS pages/posts/redirects public reads
 * use — see 20260608110000_saas_p4_cms_public_read_tenant_scoped.sql.
 *
 * NOTE (same rule as `reads.ts`): this function must not read `headers()` or
 * `cookies()`. The `tenantId` argument is the only per-request input, which is
 * what makes the `unstable_cache` key correct.
 */

import { unstable_cache } from "next/cache";

import { improntaLog } from "@/lib/server/structured-log";
import { tagFor } from "@/lib/site-admin/cache-tags";
import {
  CODE_SNIPPET_LIST_LIMIT,
  isCodeSnippetKind,
  isCodeSnippetPlacement,
  type OwnedCodeSnippet,
} from "@/lib/site-admin/code-snippets";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

const READ_COLUMNS =
  "id, tenant_id, name, kind, code, src_url, placement, is_published, published_at, created_at, updated_at, sort_order";

type DbRow = {
  id: string;
  tenant_id: string;
  name: string;
  kind: string;
  code: string | null;
  src_url: string | null;
  placement: string;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string | null;
  sort_order: number | null;
};

/**
 * Map a DB row, dropping anything whose kind/placement is not one this build
 * understands. A row written by a NEWER deploy (a kind added later) must not be
 * coerced into a kind this build would render — silently rendering an unknown
 * kind as JavaScript is exactly the class of mistake this surface cannot make.
 */
function toOwnedSnippet(row: DbRow): OwnedCodeSnippet | null {
  if (!isCodeSnippetKind(row.kind)) return null;
  if (!isCodeSnippetPlacement(row.placement)) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    kind: row.kind,
    code: row.code ?? "",
    srcUrl: row.src_url,
    placement: row.placement,
    isPublished: row.is_published === true,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sortOrder: row.sort_order ?? 0,
  };
}

/**
 * Cached read of a tenant's PUBLISHED snippets. Busted by the `storefront` tag,
 * which every write in `server-actions/admin-code-snippets.ts` updates — so
 * publishing a snippet is live on the next request rather than at TTL expiry.
 *
 * Returns `[]` on any failure. A storefront that cannot read its custom code
 * renders without it; it never renders an error.
 */
export function loadPublishedCodeSnippets(
  tenantId: string,
): Promise<OwnedCodeSnippet[]> {
  if (!tenantId) return Promise.resolve([]);

  return unstable_cache(
    async (): Promise<OwnedCodeSnippet[]> => {
      const supabase = createPublicSupabaseClient();
      if (!supabase) return [];
      const { data, error } = await supabase
        .rpc("cms_public_code_snippets_for_tenant", { p_tenant_id: tenantId })
        .select(READ_COLUMNS)
        .limit(CODE_SNIPPET_LIST_LIMIT);
      if (error) {
        void improntaLog("site_admin_reads.warn", {
          message: "[site-admin/code-snippets] published snippet load failed",
          tenantId,
          error: error.message,
        });
        return [];
      }
      // The RPC builder's inferred type is a union that carries postgrest's
      // "did you mean .single()?" diagnostic member, so it is narrowed here
      // rather than with `.returns<>()`, which that union rejects. Every field
      // is re-validated by `toOwnedSnippet` regardless of what the cast claims.
      const rows = (Array.isArray(data) ? data : []) as DbRow[];
      return rows.flatMap((row) => {
        const mapped = toOwnedSnippet(row);
        return mapped ? [mapped] : [];
      });
    },
    ["site-admin:code-snippets:published", tenantId],
    {
      tags: [tagFor(tenantId, "storefront")],
      // Same defensive safety-net TTL as the identity/branding readers.
      revalidate: 300,
    },
  )();
}
