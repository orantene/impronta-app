/**
 * Shared, surface-agnostic template descriptor — TMPL-1.
 *
 * All THREE template registries (page-designs, max-site-templates, and the
 * slot-based talent-site templates) conform to this shape via `toUnifiedTemplateDef`
 * so every picker renders the SAME card anatomy: label, blurb, emphasisTag, and
 * a thumbnailUrl (with an archetype-gradient or CSS-wireframe fallback when no
 * screenshot exists yet).
 *
 * The adapter `toUnifiedTemplateDef` is the only place that knows each
 * registry's native field names; the pickers consume this ONE type.
 *
 * Per-surface builder fns (buildShellTree, buildHomeTree, buildSlots) live
 * in their respective registries and are NOT part of this descriptor — keeping
 * this module pure and importable on both client and server without pulling
 * large tree builders into the browser bundle.
 */

// ---------------------------------------------------------------------------
// Tier + target vocabulary (mirrors the two registry-specific types without
// depending on them so this module stays free of circular imports)
// ---------------------------------------------------------------------------

/** Which builder surfaces a full-page design starter targets. */
export type TemplateSurfaceTarget = "talent" | "workspace" | "both";

/**
 * Minimum subscription tier required to SELECT this template.
 * Mirrors TalentPlanTier from lib/access/talent-membership.
 */
export type TemplateTier = "free" | "pro" | "max";

/**
 * Which of the three registries the descriptor came from. Consumed by
 * pickers that need to route the "apply" action to the correct server action.
 */
export type TemplateRegistryKind =
  | "page-design"   // PAGE_DESIGN_SUMMARIES (freeform full-page designs)
  | "max-site"      // MAX_SITE_TEMPLATES (Max-site freeform shell+home starters)
  | "talent-site";  // TALENT_SITE_TEMPLATES (slot-based profile templates)

// ---------------------------------------------------------------------------
// Unified descriptor
// ---------------------------------------------------------------------------

export interface UnifiedTemplateDef {
  /** Stable key used to look up and apply the template. */
  key: string;
  /** Short human-readable card label, e.g. "Editorial portfolio". */
  label: string;
  /**
   * Plain-language 1-2 sentence description shown on the card. Always
   * complete sentences, no em dashes, no jargon. Required — every registry
   * entry must supply a non-empty blurb.
   */
  blurb: string;
  /**
   * Short layout-emphasis tag shown under the label, e.g. "Split hero · masonry gallery".
   * Optional — may be absent for registries that do not have this concept.
   */
  emphasisTag?: string;
  /**
   * Root-relative URL for a template thumbnail image.
   * Absent = use the gradient / CSS-wireframe fallback in the picker.
   * Present but empty string is treated the same as absent.
   */
  thumbnailUrl?: string;
  /** Which registry this came from (for routing "apply" actions). */
  registryKind: TemplateRegistryKind;
  /**
   * Minimum tier required. Absent = no tier gate (always available).
   * Used by talent-site picker to grey-out locked templates.
   */
  tier?: TemplateTier;
  /**
   * Which builder surface(s) this design targets. Present for page-design
   * starters; absent for surface-specific registries.
   */
  target?: TemplateSurfaceTarget;
}

// ---------------------------------------------------------------------------
// Per-registry adapter types (minimal shapes — only the fields we read here)
// ---------------------------------------------------------------------------

interface PageDesignLike {
  id: string;
  label: string;
  description: string;
  archetype: string;
  target?: "talent" | "workspace" | "both";
  thumbnailUrl?: string;
}

interface MaxSiteTemplateLike {
  key: string;
  label: string;
  description: string;
  emphasis: string;
  thumbnailUrl?: string;
}

interface TalentSiteTemplateLike {
  key: string;
  label: string;
  blurb: string;
  availableAt?: TemplateTier;
  thumbnailUrl?: string;
}

// ---------------------------------------------------------------------------
// Adapter — convert any registry's native shape into UnifiedTemplateDef
// ---------------------------------------------------------------------------

/**
 * Convert a native registry entry into the shared `UnifiedTemplateDef` shape
 * so any picker can render identical card anatomy regardless of registry.
 *
 * The three overloads let TypeScript narrow by `kind` literal at the call site.
 */
export function toUnifiedTemplateDef(
  def: PageDesignLike,
  kind: "page-design",
): UnifiedTemplateDef;
export function toUnifiedTemplateDef(
  def: MaxSiteTemplateLike,
  kind: "max-site",
): UnifiedTemplateDef;
export function toUnifiedTemplateDef(
  def: TalentSiteTemplateLike,
  kind: "talent-site",
): UnifiedTemplateDef;
export function toUnifiedTemplateDef(
  def: PageDesignLike | MaxSiteTemplateLike | TalentSiteTemplateLike,
  kind: TemplateRegistryKind,
): UnifiedTemplateDef {
  switch (kind) {
    case "page-design": {
      const d = def as PageDesignLike;
      return {
        key: d.id,
        label: d.label,
        blurb: d.description,
        registryKind: "page-design",
        thumbnailUrl: d.thumbnailUrl || undefined,
        target: d.target,
      };
    }
    case "max-site": {
      const d = def as MaxSiteTemplateLike;
      return {
        key: d.key,
        label: d.label,
        blurb: d.description,
        emphasisTag: d.emphasis,
        registryKind: "max-site",
        thumbnailUrl: d.thumbnailUrl || undefined,
      };
    }
    case "talent-site": {
      const d = def as TalentSiteTemplateLike;
      return {
        key: d.key,
        label: d.label,
        blurb: d.blurb,
        registryKind: "talent-site",
        thumbnailUrl: d.thumbnailUrl || undefined,
        tier: d.availableAt,
      };
    }
  }
}
