/**
 * Talent theme gallery: CATALOG types (pure, client-safe; no server imports).
 *
 * Two picks, Design then Look. A Design is a layout (shell variant + ordered
 * home composition from the talent section kit) that references tokens only;
 * a Look is a colour + font token map. Any Design works with any Look.
 *
 * Rows live in `talent_theme_catalog` (migration 20261231278000). The shapes
 * below are the contract between the migration, the validators
 * (`./validate.ts`), the apply core (`server/theme-apply-core.ts`), the
 * built-ins + sync + loader (0.B) and the gallery UI (0.C).
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

/** `kind` column. Look may later split into palette / typography / finish. Demo = content pack. */
export type TalentThemeKind = "design" | "look" | "demo";

/** `required_talent_tier` column, ascending. */
export type TalentThemeRequiredTier = "talent_basic" | "talent_pro" | "talent_portfolio";

export type TalentThemeStatus = "draft" | "published" | "archived";

export type TalentThemeSource = "builtin" | "authored";

/** Current payload shape version (`schema_version` column). */
export const TALENT_THEME_SCHEMA_VERSION = 1;

/**
 * Design payload. Both trees are UN-hydrated: content is `{{token}}`
 * placeholders (`{{displayName}}`, `{{headshotUrl}}`, `{{year}}`, ...) and
 * style colours are `token:` refs. Every top-level node carries
 * `props.slotKey` + `props.originRole` from the section kit.
 */
export interface DesignPayload {
  shellTree: BuilderNode[];
  homeTree: BuilderNode[];
}

/**
 * Look payload: registry token keys → values. Restricted to the Look layer
 * (`color.*`, `typography.*`, `background.mode`; see `LOOK_OWNED_TOKEN_*`).
 */
export interface LookPayload {
  tokens: Record<string, string>;
}

/**
 * Demo payload (catalog kind `demo`). Content pack + starter content for one
 * profession under a Design. Hydration shape matches the preview fixture.
 */
export interface DemoPayload {
  offering_mode: "bookings" | "quotes" | "inquiries";
  default_look: string;
  section_arrangement?: string[];
  menu_style?: "tabs" | "list" | "accordion";
  hydration: Record<string, unknown>;
  starter_content: {
    services: unknown[];
    faq_prompts: string[];
    section_text: unknown[];
  };
  image_licence: { reusable: boolean; per_image?: Record<string, unknown> };
}

export interface ThemePreviewSwatch {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  ink: string;
}

/** `preview` column: client-safe card art. Every field optional. */
export interface ThemePreview {
  swatch?: ThemePreviewSwatch;
  /** Root-relative or absolute URL of a static thumbnail. */
  thumbnailUrl?: string;
  /** Family names for the Look's font-pair chip. */
  fontPreview?: { heading: string; body: string };
}

interface TalentThemeCatalogRowBase {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string | null;
  tags: string[];
  /** Design slug this Look/Demo is scoped to; null = global. */
  for_design: string | null;
  preview: ThemePreview;
  required_talent_tier: TalentThemeRequiredTier;
  status: TalentThemeStatus;
  source: TalentThemeSource;
  version: number;
  schema_version: number;
  sort_order: number;
  is_new_until: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** A `talent_theme_catalog` row, discriminated on `kind` (snake_case = DB). */
export type TalentThemeCatalogRow =
  | (TalentThemeCatalogRowBase & { kind: "design"; payload: DesignPayload })
  | (TalentThemeCatalogRowBase & { kind: "look"; payload: LookPayload })
  | (TalentThemeCatalogRowBase & { kind: "demo"; payload: DemoPayload });

export type TalentThemeDesignRow = Extract<TalentThemeCatalogRow, { kind: "design" }>;
export type TalentThemeLookRow = Extract<TalentThemeCatalogRow, { kind: "look" }>;
export type TalentThemeDemoRow = Extract<TalentThemeCatalogRow, { kind: "demo" }>;

/**
 * Client-safe gallery entry (no payload trees). What the loader hands the
 * gallery UI; `isNew` is resolved server-side from `is_new_until`.
 */
export interface CatalogEntry {
  kind: TalentThemeKind;
  slug: string;
  title: string;
  summary: string;
  category: string | null;
  tags: string[];
  /** Present for Looks/Demos scoped to one Design (e.g. Maison palettes). */
  forDesign: string | null;
  preview: ThemePreview;
  requiredTier: TalentThemeRequiredTier;
  version: number;
  sortOrder: number;
  isNew: boolean;
}

/**
 * A `CatalogEntry` as one caller sees it: `locked` is true when that caller's
 * plan may not apply the row. Computed per call by `loadTalentThemeCatalog`
 * (never cached with the row) and rendered as-is by the gallery UI.
 */
export interface TalentThemeCatalogEntry extends CatalogEntry {
  locked: boolean;
}

/** Result shape shared by `validateDesign` / `validateLook`. */
export interface ThemeValidationResult {
  ok: boolean;
  errors: string[];
}
