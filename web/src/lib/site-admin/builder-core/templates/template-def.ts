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

// ---------------------------------------------------------------------------
// Shared preview-URL builder (TMPL-2)
// ---------------------------------------------------------------------------

/** Base path for the shared, owner-gated hydrated template-preview route. */
export const TEMPLATE_PREVIEW_BASE_PATH = "/template-preview";

/**
 * Which template family a preview key belongs to. The preview route uses this
 * to choose the correct render path: slot-based snapshots vs Max-site freeform
 * builder trees. Passed as the `?kind` searchParam so the single route serves
 * both families without a second endpoint.
 */
export type TemplatePreviewFamily = "talent-site" | "max-site";

/**
 * Map a registry kind to the preview family the route understands. `page-design`
 * previews are not hydrated with a single talent's data (they target storefront
 * OR talent and have no per-talent token model), so they fall back to the
 * Max-site freeform path which renders the tree structurally with demo tokens.
 */
export function previewFamilyForRegistry(
  kind: TemplateRegistryKind,
): TemplatePreviewFamily {
  return kind === "talent-site" ? "talent-site" : "max-site";
}

/**
 * Build the URL every picker uses to open the SHARED hydrated preview iframe.
 *
 * When `talentProfileId` is supplied the route attempts owner-gated hydration:
 * if the *current session* owns that talent profile, the preview renders the
 * talent's REAL name / photo / bio; otherwise the route silently falls back to
 * demo data (never leaks a non-owner's profile). Building the URL is the same on
 * every surface, so all pickers share one contract and a fifth surface inherits
 * it for free.
 *
 * @param key      template key (slot-template key or Max-site key)
 * @param family   which template family `key` belongs to (defaults talent-site)
 */
export function getTemplatePreviewUrl(
  key: string,
  opts: {
    talentProfileId?: string | null;
    family?: TemplatePreviewFamily;
  } = {},
): string {
  const family = opts.family ?? "talent-site";
  const params = new URLSearchParams();
  params.set("kind", family);
  const talentProfileId = opts.talentProfileId?.trim();
  if (talentProfileId) params.set("talent", talentProfileId);
  return `${TEMPLATE_PREVIEW_BASE_PATH}/${encodeURIComponent(key)}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Demo fixture (shared between the dev harness and the public preview route)
// ---------------------------------------------------------------------------

/**
 * The demo persona the preview route hydrates with when there is no owner-gated
 * `?talent` (anonymous / non-owner request). Public-safe synthetic data — never
 * a real talent. Exported so the dev harness and the public route render the
 * IDENTICAL fallback instead of each hand-rolling its own fixture.
 */
export interface TemplatePreviewDemoFixture {
  displayName: string;
  profileCode: string;
  primaryTypeLabel: string;
  publicBio: string;
  homeCity: string;
  serviceNames: string[];
  headshotUrl: string;
  galleryUrls: string[];
}

export const TEMPLATE_PREVIEW_DEMO_FIXTURE: TemplatePreviewDemoFixture = {
  displayName: "Maya Reyes",
  profileCode: "TAL-00000",
  primaryTypeLabel: "Editorial Model",
  publicBio:
    "Editorial and commercial model with 8 years of experience across fashion, beauty, and lifestyle campaigns. Known for strong conceptual range and precise direction-taking.",
  homeCity: "Mexico City",
  serviceNames: ["Editorial", "Commercial", "Beauty & Skincare"],
  headshotUrl: "https://picsum.photos/seed/talent-hero/800/1000",
  galleryUrls: [
    "https://picsum.photos/seed/gal1/800/1000",
    "https://picsum.photos/seed/gal2/900/600",
    "https://picsum.photos/seed/gal3/700/900",
    "https://picsum.photos/seed/gal4/800/800",
    "https://picsum.photos/seed/gal5/900/700",
    "https://picsum.photos/seed/gal6/750/950",
  ],
};
