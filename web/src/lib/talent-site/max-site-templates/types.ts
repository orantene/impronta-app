/**
 * Talent Max SITE — starter-template GALLERY types (PURE, no server imports).
 *
 * A "Max-site starter template" is a named FREEFORM starter the talent can pick
 * when setting up their site (beyond the single auto-hydrated default). Each one
 * produces TWO builder-node trees:
 *
 *   - a SITE SHELL (header logo/wordmark slot + nav + footer) → `talent_sites.shell_tree`
 *   - a HOME page tree (hero / about / services / gallery / contact) → `talent_pages.blocks`
 *
 * Both are built from the SAME shared section/node builders the platform default
 * uses (`default-talent-tree.ts` / `default-max-site-trees.ts`), varying layout,
 * emphasis and tokens — NOT hand-authored from scratch. Per-talent content is
 * carried as `{{token}}` placeholders that `hydrateTalentTree()` fills with the
 * talent's real profile data (name / photo / bio / services / gallery) at apply
 * time, so every template comes pre-filled with the talent's own data (no lorem).
 *
 * Pure data + pure functions (no server imports, injectable id factory) so the
 * registry is unit-testable and importable by both the provisioning helper and
 * the apply-template server action.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

/** Injectable id factory — defaults to crypto.randomUUID (matches the tree builders). */
export type MaxSiteTemplateIdFactory = () => string;

/** Stable keys for the starter templates (also the DB-stored "applied template" marker). */
export type MaxSiteTemplateKey =
  | "default"
  | "editorial"
  | "minimal"
  | "portfolio"
  | "bold";

/**
 * Context handed to a template's tree builders. `displayName` is always present
 * (the shell wordmark + footer fall back to it); `logoUrl` styles the header.
 * The home tree is `{{token}}`-driven and hydrated by the caller AFTER the
 * builder runs, so the builders themselves only need the chrome inputs.
 */
export interface MaxSiteTemplateContext {
  displayName: string;
  logoUrl?: string | null;
  /** Home path the shell brand links to (default "/"). */
  homeHref?: string;
}

export interface MaxSiteTemplateDef {
  key: MaxSiteTemplateKey;
  label: string;
  /** One-line gallery card description. */
  description: string;
  /**
   * Short tag describing the layout emphasis (shown under the label in the
   * gallery card, e.g. "Magazine-style split hero").
   */
  emphasis: string;
  /**
   * Build the SITE SHELL tree (header + footer). Returns valid `BuilderNode[]`
   * for `talent_sites.shell_tree`.
   */
  buildShellTree: (
    ctx: MaxSiteTemplateContext,
    makeId?: MaxSiteTemplateIdFactory,
  ) => BuilderNode[];
  /**
   * Build the HOME-page tree (un-hydrated — carries `{{token}}` placeholders the
   * caller hydrates with the talent's real data). Returns valid `BuilderNode[]`
   * for `talent_pages.blocks`.
   */
  buildHomeTree: (
    ctx: MaxSiteTemplateContext,
    makeId?: MaxSiteTemplateIdFactory,
  ) => BuilderNode[];
}
