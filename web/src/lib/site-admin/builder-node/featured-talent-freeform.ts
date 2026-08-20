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
            id: makeNodeId("section_embed"),
            kind: "section_embed",
            props: {
              sectionTypeKey: "featured_talent",
              layerLabel: "Talent Grid",
              config: embedConfig,
            },
          },
        ],
      },
    ],
  };
}
