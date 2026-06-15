/**
 * BuilderContextConfig — the single config object that specialises ONE Page
 * Builder Core for a surface. Injected (optionally) into `EditProvider`; when
 * absent the provider defaults to the homepage config so every existing
 * storefront call path behaves byte-identically.
 *
 * A surface is fully described by:
 *   - `surface`           — the adapter (kind + load/save/publish/restore).
 *   - `permissions`       — what the operator may do on this surface.
 *   - `galleryPolicy`     — which Add Gallery tabs/targets are offered.
 *   - `dataSources`       — which connected data sources this surface may bind.
 *   - `previewSubjectKind`— whom connected nodes hydrate against in-canvas.
 *   - `capabilities`      — feature flags (motion / custom CSS / responsive…).
 *
 * WS4 (gallery + preview), WS5 (platform lab), and WS6 (workspace/talent
 * surfaces) fill these in for their surfaces. WS1 ships the type + the homepage
 * default so the seam exists and the homepage stays unchanged.
 */

import type { AddGalleryTab } from "@/lib/site-admin/add-gallery/types";
import type { BuilderDataSourceKey } from "@/lib/site-admin/builder-node/data-bindings";

import type { BuilderSurfaceAdapter } from "./surface-adapter";
import type { BuilderSurfaceKind } from "./surface-kind";

/** Subject a connected/data-bound node hydrates against in the editor canvas.
 *  `null` → render against the active tenant (the published-storefront default,
 *  i.e. homepage behaviour). WS4 wires the talent/workspace preview subjects. */
export type BuilderPreviewSubjectKind = "talent" | "workspace" | null;

/**
 * Operator permissions on a surface. Conservative defaults: the homepage
 * config enables everything it does today; new surfaces opt in.
 */
export interface BuilderSurfacePermissions {
  /** May persist drafts (save / save-draft). */
  canEditDraft: boolean;
  /** May publish the draft to the surface's live target. */
  canPublish: boolean;
  /** May restore a prior revision. */
  canRestoreRevision: boolean;
  /** May edit the shared site header/footer shell. Homepage-only today. */
  canEditShell: boolean;
  /** May insert raw-HTML `code` elements (super_admin only). */
  canInsertRawHtmlElements: boolean;
}

/**
 * Which Add Gallery surfaces this builder exposes. WS4 merges the code catalog
 * with published DB templates filtered by this policy.
 */
export interface BuilderGalleryPolicy {
  /** Gallery tabs offered on this surface. Empty → gallery suppressed. */
  allowedTabs: readonly AddGalleryTab[];
  /** When true the (WS2/WS4) DB-backed "Page Templates" tab is offered. */
  allowDbTemplates: boolean;
  /**
   * Catalog audience for §E `target_context` gating + the Builder Lab's
   * per-surface overlay toggles (`talent_enabled` / `workspace_enabled`).
   *
   * This is DELIBERATELY separate from `previewSubjectKind`. The latter only
   * governs whom connected nodes hydrate against in-canvas; a surface can
   * preview against the tenant default (`previewSubjectKind: null`) while still
   * declaring a definite gallery audience. The workspace freeform (`cms_page`)
   * surface is exactly this case: it renders connected sections against the
   * tenant (null preview subject) but its gallery audience is `workspace`, so
   * the Lab's Workspace activate/deactivate toggle and `workspace`/`both`
   * target gating actually apply on the live builder.
   *
   * Omitted → derive from `previewSubjectKind` (talent_page → `talent`;
   * homepage → `null`, i.e. unscoped). Set it explicitly only when the gallery
   * audience differs from the preview subject.
   */
  surfaceTarget?: "talent" | "workspace" | "platform";
}

/**
 * Connected/data-bound source policy. WS4's preview-context work uses this to
 * decide which resolvers are allowed + how they scope data.
 */
export interface BuilderDataSourcePolicy {
  /** Data sources a connected node may bind on this surface. */
  allowed: readonly BuilderDataSourceKey[];
}

/**
 * Surface capability flags. These mirror the existing builder capability gates
 * (motion, theme tokens, custom CSS, per-breakpoint responsive). Homepage
 * config enables exactly what the storefront editor enables today.
 */
export interface BuilderSurfaceCapabilities {
  motion: boolean;
  themeTokens: boolean;
  customCss: boolean;
  responsiveBreakpoints: boolean;
}

export interface BuilderContextConfig {
  surface: BuilderSurfaceAdapter;
  permissions: BuilderSurfacePermissions;
  galleryPolicy: BuilderGalleryPolicy;
  dataSources: BuilderDataSourcePolicy;
  previewSubjectKind: BuilderPreviewSubjectKind;
  capabilities: BuilderSurfaceCapabilities;
  /**
   * Talent tier of the surface subject (talent_page surfaces only) — used for
   * §E gallery gating (`required_talent_tier`). Null/undefined on non-talent
   * surfaces (homepage / workspace / platform_lab). Stored here so the live
   * Add Gallery fetch (`fetchSurfaceGalleryItems`) can describe the surface
   * entirely from `surfaceConfig`.
   */
  surfaceTalentTier?: string | null;
}

/** Every data source the storefront homepage editor can bind today. */
const HOMEPAGE_DATA_SOURCES: readonly BuilderDataSourceKey[] = [
  "workspace_profile",
  "featured_talent_profiles",
  "tenant_directory_search",
  "talent_locations",
  "inquiry_path",
  "cms_page",
  "asset",
  "custom_field",
];

/**
 * The homepage config — the default the EditProvider falls back to when no
 * `surfaceConfig` prop is passed. Built as a factory (not a frozen singleton)
 * so the boundary always hands the provider a fresh object, and so future
 * per-tenant homepage overrides (e.g. shell-edit gating by plan) can be layered
 * here without touching the provider.
 *
 * The homepage `surface` adapter is passed IN (rather than imported here) to
 * keep `config.ts` free of a static edge to `homepage-adapter.ts` — that edge
 * would close an import cycle through `edit-context.tsx` and trip a top-level
 * TDZ. Consumers (edit-context, edit-chrome) already hold `homepageAdapter` and
 * thread it in.
 *
 * IMPORTANT: this MUST describe the homepage exactly as it behaves today —
 * the parity test proves the wrapped adapter is a pure pass-through, and the
 * storefront mount keeps building this same config (see edit-chrome-mount).
 */
export function buildHomepageBuilderConfig(
  homepageSurfaceAdapter: BuilderSurfaceAdapter,
  overrides?: Partial<{
    canEditShell: boolean;
    canInsertRawHtmlElements: boolean;
  }>,
): BuilderContextConfig {
  return {
    surface: homepageSurfaceAdapter,
    permissions: {
      canEditDraft: true,
      canPublish: true,
      canRestoreRevision: true,
      // Shell edit + raw-HTML are gated by plan / role at the existing
      // call-sites; the homepage default mirrors "allowed unless gated", and
      // the storefront mount threads the real resolved values through.
      canEditShell: overrides?.canEditShell ?? true,
      canInsertRawHtmlElements: overrides?.canInsertRawHtmlElements ?? false,
    },
    galleryPolicy: {
      allowedTabs: ["layout", "elements", "sections", "connected"],
      // DB "Page Templates" tab lands with WS2/WS4; off on the frozen homepage
      // surface until then so behaviour is unchanged.
      allowDbTemplates: false,
    },
    dataSources: { allowed: HOMEPAGE_DATA_SOURCES },
    previewSubjectKind: null,
    capabilities: {
      motion: true,
      themeTokens: true,
      customCss: true,
      responsiveBreakpoints: true,
    },
  };
}

/** Every data source the Platform Builder Lab may bind. The Lab authors
 *  templates for ALL consumer surfaces, so it can preview every connected
 *  source against the chosen subject. (Same set the homepage editor binds.) */
const PLATFORM_LAB_DATA_SOURCES: readonly BuilderDataSourceKey[] =
  HOMEPAGE_DATA_SOURCES;

// ── Agency-page data sources ──────────────────────────────────────────────────

/** Data sources available on the cms_page (agency freeform) surface. Agency
 *  pages can bind the workspace profile + featured talent data (same as the
 *  homepage), but not talent-personal sources. */
const AGENCY_PAGE_DATA_SOURCES: readonly BuilderDataSourceKey[] = [
  "workspace_profile",
  "featured_talent_profiles",
  "tenant_directory_search",
  "talent_locations",
  "inquiry_path",
  "cms_page",
  "asset",
  "custom_field",
];

// ── Talent-page data sources ──────────────────────────────────────────────────

/** Data sources available on the talent_page surface. Talent pages bind
 *  talent-personal data (the talent's own profile / services). */
const TALENT_PAGE_DATA_SOURCES: readonly BuilderDataSourceKey[] = [
  "workspace_profile",
  "asset",
  "custom_field",
  // talent_profile and talent_services are implied by the previewSubjectKind
  // "talent" set on this surface's config — the connected resolvers scope
  // to the talent when previewSubject.kind === "talent".
];

/**
 * The cms_page FREEFORM config (Wave 4.1) — specialises the ONE Page Builder
 * Core for an agency STOREFRONT page (`cms_pages` with `is_freeform=true`),
 * edited in place via the front-end `?edit=1` editor.
 *
 * Essentially the workspace-page config (same agency data sources + full
 * capabilities) but keyed to the `cms_page` surface kind and rendered on the
 * public storefront, so `previewSubjectKind` is `null` (tenant default — connected
 * sections hydrate against the tenant, exactly like the homepage). `canEditShell`
 * stays false: a page doesn't own the shared site shell. Only `is_freeform` pages
 * are ever routed here; homepage + system + slot pages keep the homepage config.
 */
export function buildCmsPageBuilderConfig(
  cmsPageSurfaceAdapter: BuilderSurfaceAdapter,
  opts?: {
    /** Allow raw HTML code elements (super_admin only). Defaults to false. */
    canInsertRawHtmlElements?: boolean;
  },
): BuilderContextConfig {
  const kind: BuilderSurfaceKind = cmsPageSurfaceAdapter.kind;
  if (kind !== "cms_page") {
    throw new Error(
      `buildCmsPageBuilderConfig requires a cms_page adapter, got "${kind}".`,
    );
  }
  return {
    surface: cmsPageSurfaceAdapter,
    permissions: {
      canEditDraft: true,
      canPublish: true,
      canRestoreRevision: true,
      canEditShell: false,
      canInsertRawHtmlElements: opts?.canInsertRawHtmlElements ?? false,
    },
    galleryPolicy: {
      allowedTabs: ["layout", "elements", "sections", "connected", "page_templates"],
      allowDbTemplates: true,
      // Workspace freeform pages preview against the tenant default
      // (previewSubjectKind: null) but their gallery audience is `workspace` —
      // so the Lab's per-surface Workspace toggle + workspace/both target
      // gating bite on the live builder. Without this the surface target would
      // collapse to null and deactivation from the Lab would be a no-op here.
      surfaceTarget: "workspace",
    },
    dataSources: { allowed: AGENCY_PAGE_DATA_SOURCES },
    previewSubjectKind: null,
    capabilities: {
      motion: true,
      themeTokens: true,
      customCss: true,
      responsiveBreakpoints: true,
    },
  };
}

/**
 * The talent_page config (WS6) — specialises the ONE Page Builder Core for the
 * Talent Max page builder surface. Built as a factory.
 *
 * Differences from homepage:
 *   - `previewSubjectKind: "talent"` — connected nodes hydrate against the
 *     talent's own data in-canvas (WS4 render plumbing).
 *   - `allowDbTemplates: true` + `"page_templates"` tab — talent Max can
 *     apply DB-backed page templates.
 *   - `canEditShell: false` — talent pages don't own the shared site shell.
 *   - `canInsertRawHtmlElements: false` — raw HTML off for talent tier.
 *   - Capability gating by `talentTier` (e.g. custom CSS only on Max):
 *     pass `opts.tier` to reduce capabilities for lower tiers.
 *
 * The adapter is passed IN to keep `config.ts` free of server-action edges.
 */
export function buildTalentPageBuilderConfig(
  talentPageSurfaceAdapter: BuilderSurfaceAdapter,
  opts?: {
    /** Talent tier — reduces capabilities for lower tiers. */
    talentTier?: string | null;
  },
): BuilderContextConfig {
  const kind: BuilderSurfaceKind = talentPageSurfaceAdapter.kind;
  if (kind !== "talent_page") {
    throw new Error(
      `buildTalentPageBuilderConfig requires a talent_page adapter, got "${kind}".`,
    );
  }
  // Capability gating: Max (talent_portfolio) gets all; lower tiers may be
  // restricted in future. For now all tiers get the same capabilities —
  // the plan intent is that only Max can reach this builder surface at all.
  const isMaxTier =
    !opts?.talentTier || opts.talentTier === "talent_portfolio";

  return {
    surface: talentPageSurfaceAdapter,
    permissions: {
      canEditDraft: true,
      canPublish: true,
      canRestoreRevision: true,
      canEditShell: false,
      canInsertRawHtmlElements: false,
    },
    galleryPolicy: {
      allowedTabs: ["layout", "elements", "sections", "connected", "page_templates"],
      allowDbTemplates: true,
    },
    dataSources: { allowed: TALENT_PAGE_DATA_SOURCES },
    previewSubjectKind: "talent",
    surfaceTalentTier: opts?.talentTier ?? null,
    capabilities: {
      motion: isMaxTier,
      themeTokens: isMaxTier,
      customCss: isMaxTier,
      responsiveBreakpoints: true,
    },
  };
}

/**
 * True for every NON-homepage surface (cms_page / talent_page /
 * platform_lab). These surfaces mount the editor via `BuilderEditorMount`
 * over a chrome-only shell — they have no server-rendered storefront body that
 * paints the freeform tree. They therefore mount an in-editor
 * `ClientBuilderCanvas` (see `in-editor-canvas-region.tsx`) so the saved tree
 * actually renders on canvas. The homepage is the sole exception: its
 * storefront body already mounts the canvas, so it must NOT double-mount.
 */
export function builderConfigUsesInEditorCanvas(
  cfg: BuilderContextConfig,
): boolean {
  return cfg.surface.kind !== "homepage";
}

/**
 * The platform_lab config (WS5) — specialises the ONE Page Builder Core for the
 * Platform Builder Lab. Built as a factory (mirrors `buildHomepageBuilderConfig`)
 * so the Lab mount always hands the provider a fresh object and can swap the
 * preview subject per area (Talent Lab → "talent"; Workspace Lab → "workspace").
 *
 * The platform_lab `surface` adapter is passed IN (rather than imported here),
 * for the same reason the homepage adapter is: keeping `config.ts` free of a
 * static edge to an adapter module that pulls the server-action graph. The Lab
 * mount holds `platformLabAdapter` and threads it in.
 *
 * Differences from homepage:
 *   - `previewSubjectKind` is the chosen area (talent / workspace) so connected
 *     nodes hydrate against the picked subject in-canvas (WS4 render plumbing).
 *   - `allowDbTemplates` + the "Page Templates" gallery tab are ON — the Lab is
 *     where templates are authored, so it both consumes and produces them.
 *   - `canPublish` is true: the editor's Publish promotes the open draft to a
 *     published TEMPLATE via the draft-bound adapter's publish() →
 *     publishTemplate(draftId) (Phase 3). It never touches a live page.
 *   - `canEditShell` is false: the Lab edits template bodies, not the shared
 *     site header/footer shell.
 *   - raw-HTML `code` insertion is allowed (super_admin-only surface).
 */
export function buildPlatformLabBuilderConfig(
  platformLabSurfaceAdapter: BuilderSurfaceAdapter,
  previewSubjectKind: BuilderPreviewSubjectKind,
): BuilderContextConfig {
  // Defensive: this factory must only ever wrap the platform_lab surface.
  const kind: BuilderSurfaceKind = platformLabSurfaceAdapter.kind;
  if (kind !== "platform_lab") {
    throw new Error(
      `buildPlatformLabBuilderConfig requires a platform_lab adapter, got "${kind}".`,
    );
  }
  return {
    surface: platformLabSurfaceAdapter,
    permissions: {
      canEditDraft: true,
      // Publish promotes the open draft to a published TEMPLATE via the
      // draft-bound adapter's publish() → publishTemplate(draftId) (Phase 3).
      // It never publishes a live page.
      canPublish: true,
      // Revision restore isn't wired for the lab draft surface yet.
      canRestoreRevision: false,
      // The Lab edits template bodies, not the shared site shell.
      canEditShell: false,
      // super_admin-only surface → raw-HTML elements allowed.
      canInsertRawHtmlElements: true,
    },
    galleryPolicy: {
      allowedTabs: [
        "layout",
        "elements",
        "sections",
        "connected",
        "page_templates",
      ],
      // The Lab both authors and consumes DB templates.
      allowDbTemplates: true,
    },
    dataSources: { allowed: PLATFORM_LAB_DATA_SOURCES },
    previewSubjectKind,
    // The Lab author is a super-admin authoring/previewing across ALL tiers, so
    // present the gallery as the top tier — otherwise tier-gated templates
    // (required_talent_tier) would be hidden from the very surface that authors
    // them. gallerySurfaceTier (edit-context.tsx) is the only reader.
    surfaceTalentTier: "talent_portfolio",
    capabilities: {
      motion: true,
      themeTokens: true,
      customCss: true,
      responsiveBreakpoints: true,
    },
  };
}

