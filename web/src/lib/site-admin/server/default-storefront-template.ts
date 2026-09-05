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
import {
  personaliseStarterBuilderTree,
  type StarterPersonalisation,
} from "@/lib/site-admin/builder-node/starter-personalisation";
import type { BuilderTemplateRow } from "@/lib/site-admin/builder-core/templates/registry-rows";
import { loadPlatformDefaultTemplatePointers } from "@/lib/platform/default-templates";
import { resolveDefaultTemplateTree } from "@/lib/platform/default-template-chain";
import { PLATFORM_DEFAULT_STOREFRONT_SLUG } from "./default-storefront-tree";
import { pruneStarterRosterForAudience } from "./starter-roster-prune";
import { loadTenantWords } from "@/lib/words/server";
import { getPageDesign } from "@/lib/site-admin/builder-node/page-designs";

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
  // Filter target_context (workspace/both) like the reserved-slug loader — so a
  // pointer mistakenly set to a talent/platform-context template can never
  // render as the storefront; it yields null and the chain falls back to the slug.
  const { data, error } = await supabase
    .from("builder_templates")
    .select("builder_tree, status, target_context")
    .eq("id", templateId)
    .eq("status", "published")
    .in("target_context", ["workspace", "both"])
    .maybeSingle<
      Pick<BuilderTemplateRow, "builder_tree" | "status" | "target_context">
    >();
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
 *
 * PERSONALISATION (required, deliberately). The Lab template is authored once
 * for every tenant, so it is stamped through
 * {@link personaliseStarterBuilderTree} before it leaves this function: the
 * tenant's name replaces `{{business.name}}`, audience switches collapse to the
 * matching case, and unknown placeholders are stripped so no `{{…}}` can reach
 * a published page. `personalisation` is a REQUIRED parameter precisely so the
 * pass cannot be dropped by a future caller without a type error — the failure
 * mode we are guarding against is a personaliser that is alive in its unit test
 * and dead at its real call site. Pass `{}` only when nothing is known.
 */
/**
 * The tenant's own default design, from `preset.designId`, or null.
 *
 * Deliberately swallows every failure: this sits on the page-less fallback
 * path for a live storefront, so a words-table hiccup must degrade to the
 * platform default rather than 500 a visitor.
 */
async function resolvePresetDesignTree(
  tenantId: string,
): Promise<BuilderNodeTree | null> {
  try {
    const words = await loadTenantWords(tenantId, "en");
    const designId = words.preset?.designId;
    if (!designId) return null;
    const design = getPageDesign(designId);
    if (!design || design.tree.length === 0) return null;
    return design.tree as BuilderNodeTree;
  } catch {
    return null;
  }
}

export async function resolvePlatformDefaultStorefrontTree(
  supabase: SupabaseClient,
  personalisation: StarterPersonalisation,
  tenantId?: string,
): Promise<ResolvedDefaultStorefront | null> {
  try {
    // ── The tenant's OWN design comes first ─────────────────────────────────
    //
    // Everything below this block resolves ONE platform-wide tree for every
    // page-less tenant, personalised only by name. The comment on the caller
    // admits it: `workspace_type` "cannot reconstruct the four cases". The
    // visible cost was a restaurant whose live homepage was titled
    // "Represented talent", with fourteen mentions of it and four
    // APPLY AS TALENT buttons — measured on a real tenant, not hypothetical.
    //
    // `preset.designId` is the SINGLE SOURCE of a tenant's default design
    // (ruled). It is already loaded and cached by `loadTenantWords` on the
    // `storefront` tag and invalidated on publish, so this adds no new read
    // path and no second matcher.
    //
    // Guarded three ways, because this fires on a LIVE site:
    //   - only when the caller passes a tenantId (the fallback path does);
    //   - only when the preset names a design — `custom` carries a null
    //     designId and falls through to the audience default, as ruled;
    //   - only when that design resolves to a non-empty tree.
    // Any failure falls through to the existing chain rather than throwing,
    // so the worst case is exactly today's behaviour.
    if (tenantId) {
      const presetTree = await resolvePresetDesignTree(tenantId);
      if (presetTree && presetTree.length > 0) {
        const stampedPreset = personaliseStarterBuilderTree(
          presetTree,
          personalisation,
        );
        return {
          builderTree: pruneStarterRosterForAudience(
            stampedPreset,
            personalisation.audience,
          ),
        };
      }
    }

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
    const stamped = personaliseStarterBuilderTree(
      builderTree as BuilderNodeTree,
      personalisation,
    );
    return {
      builderTree: pruneStarterRosterForAudience(
        stamped,
        personalisation.audience,
      ),
    };
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
