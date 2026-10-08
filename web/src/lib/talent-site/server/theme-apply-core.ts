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
import { placeMaisonTradeApps, tradesFromTypeLabels } from "../demos/app-placement";
import {
  refreshOriginFingerprints,
  stampDesignOrigin,
  tokenOriginMap,
  type StampSource,
} from "../theme-releases/origin";
import { stripDesignKeys } from "../theme-releases/design-keys";
import { designApplySummary, lookSummary } from "../history/copy";
import type { HistoryActor } from "../history/types";
import { writeSiteDraft } from "../history/writer";
import { ensureSiteThemeUpdates } from "../theme-releases/lazy-fan-out.server";

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
 * When tokens cannot load, `applyDesign` HARD-ERRORS: it never falls back to
 * `fallbackHydrationTokens` (that empty bake left stock/blank heroes on LIVE).
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
      // A live line (follows her profile at render time) stays even with no data yet:
      // it fills in the day she adds it (`liveText` keeps a zero-width placeholder).
      if (props.liveText) return false;
      return typeof props.text === "string" && props.text.trim() === "";
    }
    if (node.kind === "button") {
      return typeof props.href === "string" && props.href.trim() === "";
    }
    return false;
  };
  // A ticker word that hydrated to "" (no third service...) drops out; a ticker
  // left with no words drops out entirely.
  const dropEmptyItems = (node: BuilderNode): BuilderNode => {
    const live = node.props as { liveText?: unknown; text?: unknown };
    if ((node.kind === "heading" || node.kind === "paragraph") && live.liveText && typeof live.text === "string" && live.text.trim() === "") {
      return { ...node, props: { ...(node.props as object), text: "​" } } as BuilderNode;
    }
    if (node.kind !== "marquee") return node;
    const items = ((node.props ?? {}) as { items?: Array<{ text?: unknown }> }).items;
    if (!Array.isArray(items)) return node;
    const kept = items.filter((it) => typeof it?.text === "string" && it.text.trim() !== "");
    return kept.length === items.length
      ? node
      : ({ ...node, props: { ...(node.props as object), items: kept } } as BuilderNode);
  };
  const emptyTicker = (node: BuilderNode): boolean =>
    node.kind === "marquee" &&
    // A services ticker fills at render time, so it survives even with no words yet.
    (node.props as { source?: unknown }).source !== "services" &&
    Array.isArray((node.props as { items?: unknown[] }).items) &&
    ((node.props as { items: unknown[] }).items.length === 0);
  const prune = (nodes: ReadonlyArray<BuilderNode>): BuilderNode[] =>
    nodes
      .filter((node) => !isEmpty(node))
      .map(dropEmptyItems)
      .filter((node) => !emptyTicker(node))
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
  origin?: StampSource,
): BuildDesignTreesResult {
  // Theme releases: stamp the RAW design (tokens intact, so content-owned
  // props are known), then re-fingerprint after validation (below).
  // Template editor pins (`props.designKey`) shape the stamped keys, then are
  // stripped: talent site trees never carry them.
  const stamp = (tree: BuilderNode[]) => stripDesignKeys(origin ? stampDesignOrigin(tree, origin) : tree);
  const shell = pruneEmptyHydratedNodes(
    hydrateTalentTree(resolveYearToken(stamp(design.shellTree), year), tokens),
  );
  const home = pruneEmptyHydratedNodes(
    hydrateTalentTree(resolveYearToken(stamp(design.homeTree), year), tokens),
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
  if (!origin) return { ok: true, shellTree: shellCheck.tree, homeTree: homeCheck.tree };
  return {
    ok: true,
    shellTree: refreshOriginFingerprints(shellCheck.tree),
    homeTree: refreshOriginFingerprints(homeCheck.tree),
  };
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
  /** Theme releases Phase 2 — CAS on talent_sites.draft_rev (omit = no race check). */
  expectedDraftRev?: number | null;
  /** History actor (a Tulala-run demo rebuild passes "tulala"). */
  actor?: HistoryActor;
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

  const tokens = await loadTemplateHydrationTokens(input.talentProfileId);
  if (!tokens) {
    // Never silently bake an empty profile into a Design (stock/blank hero,
    // pruned bands). Callers must fix the profile load, not fall back.
    logServerError("talentTheme.applyDesign.hydrationMissing", {
      slug: design.slug,
      talentProfileId: input.talentProfileId,
    });
    return {
      ok: false,
      code: "server_error",
      error: "Could not load this talent's profile content. Try again in a moment.",
    };
  }
  const built = buildDesignTrees(design.payload, tokens, undefined, {
    design: design.slug,
    version: design.version,
  });
  if (!built.ok) {
    logServerError("talentTheme.applyDesign.invalidTree", { slug: design.slug, errors: built.errors });
    return { ok: false, code: "server_error", error: "Could not build that design." };
  }

  // Trade apps (e.g. Nail Designer) belong after Menu for Maison v2 (same as demos).
  const trades = tradesFromTypeLabels([
    tokens.primaryTypeLabel,
    tokens.secondaryType1,
    tokens.secondaryType2,
    tokens.secondaryType3,
  ]);
  const homeTree = placeMaisonTradeApps(built.homeTree, trades, { designSlug: design.slug }).tree;

  // Theme releases Phase 2 — ONE atomic write (shell + home + pin + token
  // origin + history entry), CAS on draft_rev when the caller sends it, so a
  // publish can never land between the shell and the home page.
  const summary = designApplySummary(design.title);
  const res = await writeSiteDraft(admin, {
    siteId: input.siteId,
    expectedDraftRev: input.expectedDraftRev ?? null,
    site: {
      shell_tree: built.shellTree,
      theme_design_slug: design.slug,
      theme_design_version: design.version,
      theme_token_origin: tokenOriginMap(design.payload.tokenDefaults),
      ...(input.userId ? { updated_by: input.userId } : {}),
    },
    pages: [{ home: true, patch: { blocks: homeTree } }],
    history: {
      kind: "design_apply",
      actor: input.actor ?? "talent",
      summaryEn: summary.en,
      summaryEs: summary.es,
      report: { design: design.slug, version: design.version },
      createdBy: input.userId ?? null,
    },
  });
  if (!res.ok) {
    if (res.code === "conflict") return { ok: false, code: "conflict", error: res.error };
    if (res.code === "site_not_found") return { ok: false, code: "site_not_found", error: "Site not found." };
    if (res.code === "page_not_found") return { ok: false, code: "page_not_found", error: "Home page not found." };
    logServerError("talentTheme.applyDesign.write", res.error);
    return { ok: false, code: "server_error", error: "Could not apply the design." };
  }

  // F108: a new apply can land below an open release; offer the update now.
  await ensureSiteThemeUpdates(admin, input.talentProfileId);
  return { ok: true, data: { designSlug: design.slug, designVersion: design.version } };
}

export interface ApplyLookInput {
  siteId: string;
  look: TalentThemeLookRow;
  userId?: string | null;
  /** Theme releases Phase 2 — CAS on draft_rev (omit = CAS on the rev just read). */
  expectedDraftRev?: number | null;
  actor?: HistoryActor;
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
    .select("design_tokens_draft, draft_rev")
    .eq("id", input.siteId)
    .maybeSingle();
  if (error) {
    logServerError("talentTheme.applyLook.read", error);
    return { ok: false, code: "server_error", error: "Could not apply the look." };
  }
  if (!data) return { ok: false, code: "site_not_found", error: "Site not found." };

  const row = data as { design_tokens_draft?: unknown; draft_rev?: number | null };
  const draftTokens = mergeLookIntoTokens(coerceTokenMap(row.design_tokens_draft), look.payload.tokens);
  // Read-modify-write: CAS on the rev the tokens were read at, so a colour
  // change in another tab between the read and the write is never lost.
  const expected =
    input.expectedDraftRev ?? (typeof row.draft_rev === "number" ? row.draft_rev : null);
  const summary = lookSummary(look.title);
  const res = await writeSiteDraft(admin, {
    siteId: input.siteId,
    expectedDraftRev: expected,
    site: {
      design_tokens_draft: draftTokens,
      theme_look_slug: look.slug,
      ...(input.userId ? { updated_by: input.userId } : {}),
    },
    history: {
      kind: "colors",
      actor: input.actor ?? "talent",
      summaryEn: summary.en,
      summaryEs: summary.es,
      batchSeconds: 0,
      createdBy: input.userId ?? null,
    },
  });
  if (!res.ok) {
    if (res.code === "conflict") return { ok: false, code: "conflict", error: res.error };
    if (res.code === "site_not_found") return { ok: false, code: "site_not_found", error: "Site not found." };
    logServerError("talentTheme.applyLook.write", res.error);
    return { ok: false, code: "server_error", error: "Could not apply the look." };
  }

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
