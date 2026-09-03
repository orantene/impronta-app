/**
 * Featured Talent — decomposed freeform section (container + text layers +
 * grid-only `featured_talent` embed). Header copy is heading/paragraph/button
 * nodes; the Tulala embed renders talent cards only (no section head).
 *
 * Mirrors the talent-discipline-freeform pattern exactly.
 */

import type { BuilderNode, BuilderNodeKind } from "./types";
import type { SectionEmbedSubjectKind } from "./section-embed-preview-subject";
import { randomUuid } from "./make-id";

/** Local id minting — `make-id` is dependency-light (types-only imports), so it
 * sidesteps the `create` → page-designs → impronta circular chain while sharing
 * the secure-context-safe uuid generator. */
function makeNodeId(kind: BuilderNodeKind): string {
  return `builder-${kind}-${randomUuid()}`;
}

/**
 * WS4 §D — preview-subject binding for this connected resolver. The embedded
 * `featured_talent` section reads the WORKSPACE roster from request context, so
 * a `workspace` preview subject rescopes it to the chosen workspace
 * (see `resolveSectionEmbedSubjectScope` in section-embed-preview-subject.ts;
 * keys are registered there). Published renders pass no subject → unchanged.
 */
export const FEATURED_TALENT_EMBED_KEY = "featured_talent" as const;
export const FEATURED_TALENT_PREVIEW_SUBJECT_KIND: SectionEmbedSubjectKind =
  "workspace";

export interface FeaturedTalentDecomposedInput {
  /** Stable root id (migration / page-design presets). */
  rootId?: string;
  /**
   * Stable id for the NATIVE `featured_talent` grid node.
   *
   * Worth pinning because the server resolves this node's cards into
   * `featuredTalentProfilesByNodeId` keyed BY THIS ID. A random id still works
   * (both sides read the same tree in one render), but a stable one keeps
   * re-seeds idempotent and keeps the published-snapshot diff readable.
   */
  gridNodeId?: string;
  eyebrow?: string;
  headline?: string;
  subheadline?: string;
  seeAllLabel?: string;
  seeAllHref?: string;
  /** Grid-only embed config (head fields should be empty / headless:true). */
  embedConfig?: Record<string, unknown>;
  /**
   * Style overrides merged into the eyebrow paragraph.
   *
   * The default is the component's own muted small text. A page whose other
   * sections mark their eyebrows differently — Impronta sets every one of
   * them in gold uppercase with wide tracking — would otherwise have this one
   * section quietly speaking a different language.
   */
  eyebrowStyle?: Record<string, unknown>;
  /**
   * Width of the content column that holds the roster grid.
   *
   * Defaults to the historical 1120px. It is an option because this wrapper
   * CAPS the embed inside it: a section whose own `containerWidth` says "wide"
   * (1280px) still renders at 1120 minus two levels of gutter — on the
   * Impronta homepage that left a 906px grid of 210px cards on a 1440px
   * screen, with names and cities ellipsized. Widening the wrapper is what
   * lets the section's own width setting mean anything.
   */
  contentMaxWidth?: string;
}

/**
 * Returns a `featured_talent` section embed config with all head fields
 * blanked and `headless: true` set, so the embed renders cards only.
 */
export function gridOnlyFeaturedTalentConfig(
  baseConfig?: Record<string, unknown>,
): Record<string, unknown> {
  const { eyebrow: _e, headline: _h, copy: _c, footerCta: _f, ...rest } = {
    ...baseConfig,
  };
  return {
    ...rest,
    eyebrow: "",
    headline: "",
    copy: "",
    // Suppress the section's own footer CTA — the freeform See All Link owns that role.
    footerCta: undefined,
    headless: true,
  };
}

/**
 * Project a legacy `featured_talent` section config onto the NATIVE node's
 * props.
 *
 * An ALLOW-LIST, not a spread. The legacy config carries keys the native card
 * has no equivalent for (`cardChrome`, `layoutPreset`, `imageTreatment`,
 * `requestCta`, `actionStyle`, `showBookmarkIcon`, `presentation`, `headless`),
 * and spreading them through would put unknown props on the node —
 * `validateBuilderNodeTree` rejects those, so the page could not be authored,
 * and any that slipped past would be silent dead weight in every published
 * snapshot. Dropping them is deliberate: the native block renders through
 * `FeaturedTalentCard`, the same component a bound container uses.
 *
 * The head fields stay blank on purpose — this wrapper's own heading/paragraph/
 * button nodes are the section head, and a second one inside the grid would
 * render the title twice.
 */
export function nativeFeaturedTalentProps(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const str = (key: string): string | undefined =>
    typeof config[key] === "string" && (config[key] as string).trim()
      ? (config[key] as string)
      : undefined;
  const num = (key: string): number | undefined =>
    typeof config[key] === "number" ? (config[key] as number) : undefined;
  const bool = (key: string): boolean | undefined =>
    typeof config[key] === "boolean" ? (config[key] as boolean) : undefined;
  const codes = (key: string): string[] | undefined => {
    const value = config[key];
    if (!Array.isArray(value)) return undefined;
    const list = value.filter((v): v is string => typeof v === "string" && !!v.trim());
    return list.length > 0 ? list : undefined;
  };
  const oneOf = <T extends string>(key: string, allowed: readonly T[]): T | undefined => {
    const value = config[key];
    return typeof value === "string" && (allowed as readonly string[]).includes(value)
      ? (value as T)
      : undefined;
  };

  const props: Record<string, unknown> = {};
  const put = (key: string, value: unknown): void => {
    if (value !== undefined) props[key] = value;
  };

  put("sourceMode", oneOf("sourceMode", [
    "manual_pick",
    "auto_featured_flag",
    "auto_by_service",
    "auto_by_destination",
    "auto_recent",
  ] as const));
  put("manualProfileCodes", codes("manualProfileCodes"));
  put("filterServiceSlug", str("filterServiceSlug"));
  put("filterDestinationSlug", str("filterDestinationSlug"));
  put("limit", num("limit"));
  put("columnsDesktop", num("columnsDesktop"));
  put("variant", oneOf("variant", ["grid", "carousel"] as const));
  put("headerAlign", oneOf("headerAlign", ["split", "left", "center"] as const));
  put("cardVariant", oneOf("cardVariant", [
    "editorial",
    "compact",
    "minimal",
    "profile",
  ] as const));
  put("showName", bool("showName"));
  put("showPrimaryType", bool("showPrimaryType"));
  put("showSecondaryType", bool("showSecondaryType"));
  put("showCity", bool("showCity"));
  put("showLanguages", bool("showLanguages"));
  put("showAvailability", bool("showAvailability"));
  put("showBadge", bool("showBadge"));
  put("parentCategoryDisplay", bool("parentCategoryDisplay"));
  put("emptyStateText", str("emptyStateText"));

  return props;
}

export function buildFeaturedTalentDecomposedSection(
  input: FeaturedTalentDecomposedInput = {},
): BuilderNode {
  const eyebrow = input.eyebrow ?? "Agency picks";
  const headline = input.headline ?? "Featured talent";
  const subheadline = input.subheadline ?? "";
  const seeAllLabel = input.seeAllLabel ?? "See all talent";
  const seeAllHref = input.seeAllHref ?? "/directory";
  const embedConfig = gridOnlyFeaturedTalentConfig(input.embedConfig);

  return {
    id: input.rootId ?? makeNodeId("container"),
    kind: "container",
    props: {
      layerLabel: "Featured Talent Section",
      layout: "stack",
      gap: "m",
      align: "stretch",
      // The ROOT has to be lifted too, not just the inner column. Every
      // container carries a 1120px cap from its base class, and a child
      // cannot be wider than its parent — widening the inner alone left the
      // grid at exactly the width it started (measured live: inner accepted
      // max-width:1400px and still rendered 1120 inside a 1120 root).
      ...(input.contentMaxWidth ? { style: { maxWidthFree: input.contentMaxWidth } } : {}),
    },
    children: [
      {
        id: makeNodeId("container"),
        kind: "container",
        props: {
          layerLabel: "Container",
          layout: "stack",
          gap: "l",
          align: "start",
          style: {
            maxWidthFree: input.contentMaxWidth ?? "1120px",
            marginLeftFree: "auto",
            marginRightFree: "auto",
            paddingTop: "48px",
            paddingBottom: "48px",
            paddingLeft: "40px",
            paddingRight: "40px",
            width: "100%",
            // 40px gutters are right on a desktop and absurd on a phone: on a
            // 375px screen they took 21% of the width before any content, and
            // they stacked with the section's own inset until the card rail was
            // 207px wide showing 262px cards — every card permanently clipped
            // through its Request button. Measured on the live site.
            responsive: { mobile: { paddingLeft: "16px", paddingRight: "16px" } },
          },
        },
        children: [
          {
            id: makeNodeId("paragraph"),
            kind: "paragraph",
            props: {
              text: eyebrow,
              layerLabel: "Intro Text",
              style: {
                size: "sm",
                tone: "muted",
                align: "left",
                ...(input.eyebrowStyle ?? {}),
              },
            },
          },
          {
            id: makeNodeId("container"),
            kind: "container",
            props: {
              layerLabel: "Section Head",
              layout: "row",
              align: "center",
              style: {
                width: "100%",
                gap: "16px",
                justifyContent: "space-between",
              },
            },
            children: [
              {
                id: makeNodeId("heading"),
                kind: "heading",
                props: {
                  text: headline,
                  level: 2,
                  layerLabel: "Title",
                  style: { align: "left" },
                },
              },
              {
                id: makeNodeId("button"),
                kind: "button",
                props: {
                  label: seeAllLabel,
                  href: seeAllHref,
                  layerLabel: "See All Link",
                  tone: "secondary",
                },
              },
            ],
          },
          ...(subheadline.trim()
            ? [
                {
                  id: makeNodeId("paragraph"),
                  kind: "paragraph",
                  props: {
                    text: subheadline,
                    layerLabel: "Subtitle",
                    style: { align: "left", tone: "muted" },
                  },
                } satisfies BuilderNode,
              ]
            : []),
          {
            id: input.gridNodeId ?? makeNodeId("featured_talent"),
            kind: "featured_talent",
            props: {
              ...nativeFeaturedTalentProps(embedConfig),
              layerLabel: "Talent Grid",
            },
          },
        ],
      },
    ],
  };
}
