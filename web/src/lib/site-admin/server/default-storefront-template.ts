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
import { loadPlatformDefaultTemplatePointers } from "@/lib/platform/default-templates";
import { resolveDefaultTemplateTree } from "@/lib/platform/default-template-chain";
import { PLATFORM_DEFAULT_STOREFRONT_SLUG } from "./default-storefront-tree";

export interface ResolvedDefaultStorefront {
  builderTree: BuilderNodeTree;
}

/**
 * Load a published `builder_templates` row's tree by id (service-role). Used as
 * the POINTER link in the default-storefront chain. Returns `null` on any error
 * / not-published / empty tree so the chain falls back to the reserved slug.
 */
async function loadPublishedStorefrontTemplateById(
  supabase: SupabaseClient,
  templateId: string,
): Promise<BuilderNodeTree | null> {
  const { data, error } = await supabase
    .from("builder_templates")
    .select("builder_tree, status")
    .eq("id", templateId)
    .eq("status", "published")
    .maybeSingle<Pick<BuilderTemplateRow, "builder_tree" | "status">>();
  if (error) {
    void improntaLog("site_admin_default_storefront.warn", {
      message: "[default-storefront] pointer template read failed",
      templateId,
      error: error.message,
    });
    return null;
  }
  const tree = data?.builder_tree;
  return Array.isArray(tree) && tree.length > 0
    ? (tree as BuilderNodeTree)
    : null;
}

/**
 * Load the reserved-slug default-storefront tree (service-role). Returns `null`
 * when the reserved row is absent / not published / empty.
 */
async function loadReservedStorefrontSlugTree(
  supabase: SupabaseClient,
): Promise<BuilderNodeTree | null> {
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
  const tree = data?.builder_tree;
  return Array.isArray(tree) && tree.length > 0
    ? (tree as BuilderNodeTree)
    : null;
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
    // Fallback chain: Lab pointer → reserved slug → null (caller keeps
    // DefaultStorefrontBody). With no pointer + no reserved row this returns
    // null — byte-identical to the pre-pointer behaviour.
    const { storefrontTemplateId } =
      await loadPlatformDefaultTemplatePointers();

    const builderTree = await resolveDefaultTemplateTree<
      BuilderNodeTree[number]
    >({
      pointerId: storefrontTemplateId,
      loadPointer: storefrontTemplateId
        ? () =>
            loadPublishedStorefrontTemplateById(supabase, storefrontTemplateId)
        : null,
      loadSlug: () => loadReservedStorefrontSlugTree(supabase),
      builtIn: null,
    });

    if (!builderTree || builderTree.length === 0) return null;
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
