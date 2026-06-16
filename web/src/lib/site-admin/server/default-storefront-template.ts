/**
 * Platform DEFAULT storefront — render-time resolver.
 *
 * Loads the published `builder_templates` row reserved under the slug
 * {@link PLATFORM_DEFAULT_STOREFRONT_SLUG} and returns its `{ builderTree }` so
 * the agency-storefront fallback can render a premium freeform homepage for a
 * tenant that has NOT published its own composition.
 *
 * Activation is deliberate: until that reserved row exists AND is published
 * (seeded by `scripts/seed-default-storefront.ts`), this returns `null` and the
 * caller keeps rendering the existing `DefaultStorefrontBody`. So merging this
 * code changes nothing live.
 *
 * No I/O side effects (read-only SELECT). Never throws: on any error / missing
 * row / empty tree it returns `null`, letting the caller fall back safely.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { improntaLog } from "@/lib/server/structured-log";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import type { BuilderTemplateRow } from "@/lib/site-admin/builder-core/templates/registry-rows";
import { PLATFORM_DEFAULT_STOREFRONT_SLUG } from "./default-storefront-tree";

export interface ResolvedDefaultStorefront {
  builderTree: BuilderNodeTree;
}

/**
 * Return the published default-storefront `builderTree`, or `null` when the
 * reserved template row is absent / not published / empty / unreadable.
 *
 * `supabase` should be a SERVICE-ROLE client — the row is platform-owned
 * (`source_tenant_id = null`), and the storefront render path is anonymous, so
 * the read must bypass tenant RLS. Callers already mint a service-role client
 * for media/collection reads on the same render.
 */
export async function resolvePlatformDefaultStorefrontTree(
  supabase: SupabaseClient,
): Promise<ResolvedDefaultStorefront | null> {
  try {
    const { data, error } = await supabase
      .from("builder_templates")
      .select("builder_tree, status, target_context, kind")
      .eq("slug", PLATFORM_DEFAULT_STOREFRONT_SLUG)
      .eq("status", "published")
      .in("target_context", ["workspace", "both"])
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle<
        Pick<
          BuilderTemplateRow,
          "builder_tree" | "status" | "target_context" | "kind"
        >
      >();

    if (error) {
      void improntaLog("site_admin_default_storefront.warn", {
        message: "[default-storefront] template read failed",
        slug: PLATFORM_DEFAULT_STOREFRONT_SLUG,
        error: error.message,
      });
      return null;
    }

    const builderTree = data?.builder_tree;
    if (!Array.isArray(builderTree) || builderTree.length === 0) {
      return null;
    }

    return { builderTree: builderTree as BuilderNodeTree };
  } catch (err) {
    // Defensive — the fallback caller must never throw to the visitor.
    void improntaLog("site_admin_default_storefront.warn", {
      message: "[default-storefront] template resolve threw",
      slug: PLATFORM_DEFAULT_STOREFRONT_SLUG,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
