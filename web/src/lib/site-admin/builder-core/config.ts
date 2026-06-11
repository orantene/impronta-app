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

