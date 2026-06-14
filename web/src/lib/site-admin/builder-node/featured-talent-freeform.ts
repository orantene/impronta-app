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
            maxWidthFree: "1120px",
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
