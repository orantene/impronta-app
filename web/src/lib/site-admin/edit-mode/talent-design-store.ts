/**
 * talent-design-store — PURE CORE for the talent-scoped theme stored in
 * `talent_pages.theme` (jsonb). No runtime imports (only `import type`) so the
 * unit test can drive the split/merge rules without the Supabase / Next graph.
 *
 * ── Why this module exists ────────────────────────────────────────────────
 * The `talent_pages.theme` jsonb column already carries the page-scoped linked
 * **style-class registry** (`BuilderStyleClassRegistry`) — the talent-page
 * CONTENT adapter writes `theme = styleClasses` on every save, and the public
 * renderer reads it as the style-class registry. Talent-scoped THEME TOKENS
 * (the agency-branding equivalent: colors / typography / component defaults)
 * are a SEPARATE concern that lands on the SAME row.
 *
 * Rather than add a column (no migration wanted) the design slice lives under a
 * single RESERVED key, `__design`, alongside the style-class entries:
 *
 *   talent_pages.theme = {
 *     "<className>": { …style-class entry… },   // page-scoped style classes
 *     …
 *     __design: {                                // talent THEME slice
 *       tokens:               Record<string,string>,   // live design tokens
 *       tokensDraft:          Record<string,string>,   // draft design tokens
 *       componentStyles:      <ComponentStyleDefaults>, // live per-type defaults
 *       componentStylesDraft: <ComponentStyleDefaults>, // draft per-type defaults
 *       presetSlug:           string | null,
 *       publishedAt:          string | null,            // ISO; last theme publish
 *       version:              number,                    // CAS counter on the slice
 *     },
 *   }
 *
 * This mirrors the `agency_branding` shape (`theme_json` / `theme_json_draft` /
 * `component_styles_json{,_draft}` / `theme_preset_slug` / `theme_published_at`)
 * so the SAME `designTokensToCssVars` + cascade resolver consume it unchanged.
 *
 * The two writers stay isolated:
 *   - the CONTENT adapter writes the style-class entries (top-level keys) and
 *     MUST preserve `__design` (done in `talent-page-actions.savePage`);
 *   - the THEME action set writes `__design` only and MUST preserve the
 *     style-class entries (read-modify-write here).
 *
 * The reserved key is double-underscored so it can never collide with a CSS
 * class name (CSS identifiers can start with `_` but the linked-style registry
 * keys are generated class tokens, never `__design`).
 */

import type { ComponentStyleDefaults } from "@/lib/site-admin/builder-node/component-style-defaults";

/** The reserved key inside `talent_pages.theme` that holds the design slice. */
export const TALENT_DESIGN_KEY = "__design" as const;

/** The persisted talent design slice (mirror of the agency_branding columns). */
export interface TalentDesignSlice {
  /** Live design tokens (what the published page renders). */
  tokens: Record<string, string>;
  /** Draft design tokens (the editor's working copy; no public effect). */
  tokensDraft: Record<string, string>;
  /** Live per-component-type default styles. */
  componentStyles: ComponentStyleDefaults;
  /** Draft per-component-type default styles. */
  componentStylesDraft: ComponentStyleDefaults;
  /** Slug of the last-applied theme preset (null for fully custom). */
  presetSlug: string | null;
  /** ISO timestamp of the last theme publish; null until first publish. */
  publishedAt: string | null;
  /** CAS version on the design slice (bumped on every draft/publish write). */
  version: number;
}

/** An empty design slice — the seed for a row that has never been themed. */
export function emptyTalentDesignSlice(): TalentDesignSlice {
  return {
    tokens: {},
    tokensDraft: {},
    componentStyles: {},
    componentStylesDraft: {},
    presetSlug: null,
    publishedAt: null,
    version: 0,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringMap(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  return out;
}

/**
 * Read the design slice out of a persisted `talent_pages.theme` value. Anything
 * malformed degrades to an empty slice so the drawer always has a value.
 */
export function readTalentDesignSlice(theme: unknown): TalentDesignSlice {
  if (!isPlainObject(theme)) return emptyTalentDesignSlice();
  const raw = theme[TALENT_DESIGN_KEY];
  if (!isPlainObject(raw)) return emptyTalentDesignSlice();
  return {
    tokens: asStringMap(raw.tokens),
    tokensDraft: asStringMap(raw.tokensDraft),
    componentStyles: isPlainObject(raw.componentStyles)
      ? (raw.componentStyles as ComponentStyleDefaults)
      : {},
    componentStylesDraft: isPlainObject(raw.componentStylesDraft)
      ? (raw.componentStylesDraft as ComponentStyleDefaults)
      : {},
    presetSlug: typeof raw.presetSlug === "string" ? raw.presetSlug : null,
    publishedAt: typeof raw.publishedAt === "string" ? raw.publishedAt : null,
    version: typeof raw.version === "number" ? raw.version : 0,
  };
}

/**
 * Return the page-scoped style-class registry portion of a persisted
 * `talent_pages.theme` (every top-level key EXCEPT the reserved `__design`).
 * This is what the public renderer + content adapter treat as `styleClasses`.
 */
export function readTalentStyleClasses(
  theme: unknown,
): Record<string, unknown> {
  if (!isPlainObject(theme)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(theme)) {
    if (k === TALENT_DESIGN_KEY) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Write a new design slice INTO an existing `talent_pages.theme` value while
 * preserving its style-class entries. Read-modify-write used by the theme
 * action set so it never clobbers page content.
 */
export function writeTalentDesignSlice(
  theme: unknown,
  slice: TalentDesignSlice,
): Record<string, unknown> {
  return {
    ...readTalentStyleClasses(theme),
    [TALENT_DESIGN_KEY]: slice,
  };
}

/**
 * Merge a fresh style-class registry into a persisted `talent_pages.theme`
 * value while PRESERVING the `__design` slice. Used by the CONTENT adapter's
 * production save so a page-content save never wipes the talent's theme tokens.
 *
 * `styleClasses` becomes the new set of top-level entries; the design slice is
 * carried over from `existingTheme` verbatim (or dropped when absent).
 */
export function mergeStyleClassesPreservingDesign(
  existingTheme: unknown,
  styleClasses: unknown,
): Record<string, unknown> {
  const next: Record<string, unknown> = isPlainObject(styleClasses)
    ? { ...(styleClasses as Record<string, unknown>) }
    : {};
  // Never let an incoming style-class map smuggle in / overwrite the reserved
  // design key — strip it, then re-attach the authoritative existing slice.
  delete next[TALENT_DESIGN_KEY];
  if (isPlainObject(existingTheme) && isPlainObject(existingTheme[TALENT_DESIGN_KEY])) {
    next[TALENT_DESIGN_KEY] = existingTheme[TALENT_DESIGN_KEY];
  }
  return next;
}
