import "server-only";

/**
 * verb-destination.server.ts — where the header's preset verb actually goes.
 *
 * THE DEFECT THIS FIXES, found by clicking it rather than by reading it.
 * `public-header.tsx` took its LABEL from the industry preset and hardcoded its
 * HREF to `?inquiry=open` for every verb. So on a restaurant the button said
 * **Reserve** and opened the talent inquiry: "tell us about your event and
 * we'll line up the right talent." A diner trying to book a table was asked to
 * describe a casting call.
 *
 * `headerVerbHref()` in `./header-verb-options` has mapped `reserve → /book`
 * since F1e, and nothing that renders has ever called it — only a test and an
 * inspector row. That is this area's recurring failure, a third time: an engine
 * with no door. It is also why `/book` is NOT what this returns. `/book` is
 * appointments-only and has no `reserve_table`, so a restaurant sent there
 * reads "No open times in the next two weeks" — a different wrong answer.
 *
 * WHAT IT RESOLVES TO INSTEAD: the tenant's own page that actually carries the
 * booking block. Not a hardcoded `/reserve`, because the slug is the
 * operator's to choose and they may rename or translate it. The question this
 * asks is the real one — "which of this tenant's pages can take a
 * reservation?" — and the answer is whichever page has the block on it.
 *
 * FALLS BACK TO `?inquiry=open`, NEVER TO A 404. A workspace that has not been
 * given a booking page yet keeps exactly today's behaviour. That was the point
 * of the hardcoded chat cue and it is preserved: this only ever UPGRADES a
 * destination when a real page exists to upgrade it to.
 */

import { unstable_cache } from "next/cache";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { improntaLog } from "@/lib/server/structured-log";
import { tagFor } from "@/lib/site-admin";

import { VERB_BLOCK_KINDS, pageCarriesBlock } from "./verb-destination";


type PageRow = { slug: string; locale: string | null; blocks: unknown };

function loadVerbSlug(tenantId: string, verb: string): Promise<string | null> {
  const kinds = VERB_BLOCK_KINDS[verb];
  if (!tenantId || !kinds || kinds.length === 0) return Promise.resolve(null);

  return unstable_cache(
    async (): Promise<string | null> => {
      const admin = createServiceRoleClient();
      if (!admin) return null;
      const { data, error } = await admin
        .from("cms_pages")
        .select("slug, locale, blocks")
        .eq("tenant_id", tenantId)
        .eq("status", "published")
        .order("slug", { ascending: true });
      if (error) {
        void improntaLog("words.warn", {
          message: "[words/verb-destination] page load failed",
          tenantId,
          verb,
          error: error.message,
        });
        return null;
      }
      const rows = (data ?? []) as PageRow[];
      const carriers = rows.filter((row) => pageCarriesBlock(row.blocks, kinds));
      if (carriers.length === 0) return null;
      // Deliberately NOT filtered by locale in the query. A tenant whose reserve
      // page exists only in English must still get a working button on its
      // Spanish header: a real page in the wrong language beats the chat cue.
      // Ordering by slug makes the pick stable when several pages qualify.
      return carriers[0]?.slug ?? null;
    },
    ["words:verb-destination", tenantId, verb],
    {
      // Same tag as the words read: placing the block is a storefront change,
      // so the button starts working as soon as the page is published.
      tags: [tagFor(tenantId, "storefront")],
      revalidate: 300,
    },
  )();
}

/**
 * The header CTA's destination for a preset verb.
 *
 * Returns a tenant-relative path when a page can genuinely answer the verb, and
 * `?inquiry=open` otherwise. Never returns null and never returns a path that
 * has not been proven to exist, so the caller cannot render a 404.
 */
export async function resolveHeaderVerbDestination(
  tenantId: string,
  verb: string,
): Promise<string> {
  const slug = await loadVerbSlug(tenantId, verb);
  return slug ? `/${slug}` : "?inquiry=open";
}
