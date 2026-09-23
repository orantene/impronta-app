import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import { bustTalentSiteCache } from "../cache-tags";
import { hydrateTalentTree, type TalentProfileTokens } from "../default-talent-tree";
import { mergeLookIntoTokens } from "../theme-catalog/look-layer";
import type {
  DesignPayload,
  TalentThemeDesignRow,
  TalentThemeLookRow,
} from "../theme-catalog/types";
import { validateDesign, validateLook } from "../theme-catalog/validate";
import { loadTemplateHydrationTokens } from "./apply-template-core";

/**
 * Talent theme gallery: APPLY CORE (server-only, NOT "use server").
 *
 * Three writers the gallery actions delegate to, plus the pure decisions they
 * are built from (exported for unit tests):
 *
 *   applyDesign       build + hydrate + validate a Design's shell + home and
 *                     write them to the DRAFT (`talent_sites.shell_tree`, the
 *                     home `talent_pages.blocks`), pinning slug + version.
 *   applyLook         layer-scoped merge of a Look into
 *                     `talent_sites.design_tokens_draft`; content untouched.
 *   publishSiteTheme  draft tokens → `design_tokens`, `theme_version + 1` with
 *                     compare-and-swap, then bust the site cache.
 *
 * Hydration reuses `apply-template-core.ts` (`loadTemplateHydrationTokens`:
 * `loadDefaultTalentFreeformContext` + `talentProfileTokens`, the Max badge
 * pruned) so a Design fills with exactly the data a starter template does.
 * Callers own auth: every writer trusts `siteId` / `talentProfileId`, which the
 * action layer resolves from the signed-in owner (site-action-gate).
 */

export { isLookOwnedTokenKey, mergeLookIntoTokens } from "../theme-catalog/look-layer";

export type ThemeApplyErrorCode =
  | "invalid_theme"
  | "site_not_found"
  | "page_not_found"
  | "conflict"
  | "server_error";

export type ThemeApplyResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ThemeApplyErrorCode; error: string };

// ── Pure decisions ───────────────────────────────────────────────────────────

/** Deep-replace `{{year}}` (the shell copyright) before talent hydration. */
export function resolveYearToken(tree: ReadonlyArray<BuilderNode>, year: number): BuilderNode[] {
  const swap = (value: unknown): unknown => {
    if (typeof value === "string") return value.split("{{year}}").join(String(year));
    if (Array.isArray(value)) return value.map(swap);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, swap(v)]),
      );
    }
    return value;
  };
  return swap(tree) as BuilderNode[];
}

/** Tokens for a talent with no loadable profile: name only, everything else "". */
export function fallbackHydrationTokens(displayName: string): TalentProfileTokens {
  return {
    displayName: displayName.trim() || "Talent",
    primaryTypeLabel: "",
    secondaryType1: "",
    secondaryType2: "",
    secondaryType3: "",
    disciplinesLine: "",
    tagline: "",
    bio: "",
    richBio: "",
    locationLine: "",
    languagesLine: "",
    headshotUrl: "",
    profilePath: "",
    inquireHref: "",
    service1: "",
    service2: "",
    service3: "",
    gallery: [],
    maxSiteUrl: "",
  };
}

/**
 * Drop text nodes whose content hydrated to "" (and CTAs whose href did), so a
 * sparse profile (no bio, no tagline, no discipline) still yields a valid,
 * clean tree instead of failing the schema's non-empty `text` rule. Pure.
 */
export function pruneEmptyHydratedNodes(tree: ReadonlyArray<BuilderNode>): BuilderNode[] {
  const isEmpty = (node: BuilderNode): boolean => {
    const props = (node.props ?? {}) as Record<string, unknown>;
    if (node.kind === "heading" || node.kind === "paragraph") {
      return typeof props.text === "string" && props.text.trim() === "";
    }
    if (node.kind === "button") {
      return typeof props.href === "string" && props.href.trim() === "";
    }
    return false;
  };
  const prune = (nodes: ReadonlyArray<BuilderNode>): BuilderNode[] =>
    nodes
      .filter((node) => !isEmpty(node))
      .map((node) =>
        "children" in node && Array.isArray(node.children)
          ? ({ ...node, children: prune(node.children) } as BuilderNode)
          : node,
      );
  return prune(tree);
}

export type BuildDesignTreesResult =
  | { ok: true; shellTree: BuilderNode[]; homeTree: BuilderNode[] }
  | { ok: false; errors: string[] };

/**
 * Pure: resolve `{{year}}`, hydrate both trees with the talent's tokens, prune
 * nodes that hydrated empty, and validate them. Returns the validator's
 * schema-clean trees, ready to persist.
 */
export function buildDesignTrees(
  design: DesignPayload,
  tokens: TalentProfileTokens,
  year: number = new Date().getFullYear(),
): BuildDesignTreesResult {
  const shell = pruneEmptyHydratedNodes(
    hydrateTalentTree(resolveYearToken(design.shellTree, year), tokens),
  );
  const home = pruneEmptyHydratedNodes(
    hydrateTalentTree(resolveYearToken(design.homeTree, year), tokens),
  );
  const shellCheck = validateBuilderNodeTree(shell);
  const homeCheck = validateBuilderNodeTree(home);
  if (!shellCheck.ok || !homeCheck.ok) {
    return {
      ok: false,
      errors: [
        ...(shellCheck.ok ? [] : shellCheck.issues.map((i) => `shellTree.${i.path}: ${i.message}`)),
        ...(homeCheck.ok ? [] : homeCheck.issues.map((i) => `homeTree.${i.path}: ${i.message}`)),
      ],
    };
  }
  return { ok: true, shellTree: shellCheck.tree, homeTree: homeCheck.tree };
}

/** Coerce a jsonb token column to a string map (junk entries dropped). */
export function coerceTokenMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[key] = v;
  }
  return out;
}

// ── Writers ──────────────────────────────────────────────────────────────────

export interface ApplyDesignInput {
  talentProfileId: string;
  siteId: string;
  design: TalentThemeDesignRow;
  /** Fallback wordmark when the profile cannot be loaded. */
  displayName: string;
  userId?: string | null;
}

export async function applyDesign(
  admin: SupabaseClient,
  input: ApplyDesignInput,
): Promise<ThemeApplyResult<{ designSlug: string; designVersion: number }>> {
  const { design } = input;
  const check = validateDesign(design.payload);
  if (!check.ok) {
    logServerError("talentTheme.applyDesign.invalidDesign", { slug: design.slug, errors: check.errors });
    return { ok: false, code: "invalid_theme", error: "That design is not available." };
  }

  const tokens =
    (await loadTemplateHydrationTokens(input.talentProfileId)) ??
    fallbackHydrationTokens(input.displayName);
  const built = buildDesignTrees(design.payload, tokens);
  if (!built.ok) {
    logServerError("talentTheme.applyDesign.invalidTree", { slug: design.slug, errors: built.errors });
    return { ok: false, code: "server_error", error: "Could not build that design." };
  }

  const now = new Date().toISOString();
  const { error: siteErr, count: siteCount } = await admin
    .from("talent_sites")
    .update(
      {
        shell_tree: built.shellTree,
        theme_design_slug: design.slug,
        theme_design_version: design.version,
        draft_updated_at: now,
        updated_at: now,
        ...(input.userId ? { updated_by: input.userId } : {}),
      },
      { count: "exact" },
    )
    .eq("id", input.siteId)
    .eq("talent_profile_id", input.talentProfileId);
  if (siteErr) {
    logServerError("talentTheme.applyDesign.shell", siteErr);
    return { ok: false, code: "server_error", error: "Could not apply the design." };
  }
  if (!siteCount) return { ok: false, code: "site_not_found", error: "Site not found." };

  const { error: homeErr, count: homeCount } = await admin
    .from("talent_pages")
    .update({ blocks: built.homeTree, updated_at: now }, { count: "exact" })
    .eq("talent_profile_id", input.talentProfileId)
    .eq("is_home", true);
  if (homeErr) {
    logServerError("talentTheme.applyDesign.home", homeErr);
    return { ok: false, code: "server_error", error: "Could not apply the design home page." };
  }
  if (!homeCount) return { ok: false, code: "page_not_found", error: "Home page not found." };

  return { ok: true, data: { designSlug: design.slug, designVersion: design.version } };
}

export interface ApplyLookInput {
  siteId: string;
  look: TalentThemeLookRow;
  userId?: string | null;
}

export async function applyLook(
  admin: SupabaseClient,
  input: ApplyLookInput,
): Promise<ThemeApplyResult<{ lookSlug: string; draftTokens: Record<string, string> }>> {
  const { look } = input;
  const check = validateLook(look.payload);
  if (!check.ok) {
    logServerError("talentTheme.applyLook.invalidLook", { slug: look.slug, errors: check.errors });
    return { ok: false, code: "invalid_theme", error: "That look is not available." };
  }

  const { data, error } = await admin
    .from("talent_sites")
    .select("design_tokens_draft")
    .eq("id", input.siteId)
    .maybeSingle();
  if (error) {
    logServerError("talentTheme.applyLook.read", error);
    return { ok: false, code: "server_error", error: "Could not apply the look." };
  }
  if (!data) return { ok: false, code: "site_not_found", error: "Site not found." };

  const draftTokens = mergeLookIntoTokens(
    coerceTokenMap((data as { design_tokens_draft?: unknown }).design_tokens_draft),
    look.payload.tokens,
  );
  const now = new Date().toISOString();
  const { error: writeErr, count } = await admin
    .from("talent_sites")
    .update(
      {
        design_tokens_draft: draftTokens,
        theme_look_slug: look.slug,
        draft_updated_at: now,
        updated_at: now,
        ...(input.userId ? { updated_by: input.userId } : {}),
      },
      { count: "exact" },
    )
    .eq("id", input.siteId);
  if (writeErr) {
    logServerError("talentTheme.applyLook.write", writeErr);
    return { ok: false, code: "server_error", error: "Could not apply the look." };
  }
  if (!count) return { ok: false, code: "site_not_found", error: "Site not found." };

  return { ok: true, data: { lookSlug: look.slug, draftTokens } };
}

export interface PublishSiteThemeInput {
  siteId: string;
  /** For the `/t/<code>` path revalidation; the site tag is busted regardless. */
  profileCode?: string | null;
}

export async function publishSiteTheme(
  admin: SupabaseClient,
  input: PublishSiteThemeInput,
): Promise<ThemeApplyResult<{ themeVersion: number }>> {
  const { data, error } = await admin
    .from("talent_sites")
    .select("talent_profile_id, design_tokens_draft, theme_version")
    .eq("id", input.siteId)
    .maybeSingle();
  if (error) {
    logServerError("talentTheme.publish.read", error);
    return { ok: false, code: "server_error", error: "Could not publish the theme." };
  }
  if (!data) return { ok: false, code: "site_not_found", error: "Site not found." };

  const row = data as {
    talent_profile_id: string;
    design_tokens_draft: unknown;
    theme_version: number | null;
  };
  const current = typeof row.theme_version === "number" ? row.theme_version : 0;
  const next = current + 1;

  // Compare-and-swap on theme_version: a concurrent publish (second tab) that
  // already bumped the version makes this update match zero rows.
  const { error: writeErr, count } = await admin
    .from("talent_sites")
    .update(
      {
        design_tokens: coerceTokenMap(row.design_tokens_draft),
        theme_version: next,
        updated_at: new Date().toISOString(),
      },
      { count: "exact" },
    )
    .eq("id", input.siteId)
    .eq("theme_version", current);
  if (writeErr) {
    logServerError("talentTheme.publish.write", writeErr);
    return { ok: false, code: "server_error", error: "Could not publish the theme." };
  }
  if (!count) {
    return { ok: false, code: "conflict", error: "The theme changed in another tab. Reload and try again." };
  }

  try {
    bustTalentSiteCache(row.talent_profile_id, input.profileCode ?? null);
  } catch (err) {
    // Outside a request scope (scripts / tests) revalidation is unavailable;
    // the write already landed, so this is not a failure of the publish.
    logServerError("talentTheme.publish.bust", err);
  }
  return { ok: true, data: { themeVersion: next } };
}
