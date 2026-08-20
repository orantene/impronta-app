/**
 * Location Discovery (Markets) — decomposed freeform section (container +
 * text layers + grid-only `location_discovery` embed). Header copy is
 * heading/paragraph/button nodes; the Tulala embed renders the market grid/map
 * only (no section head).
 *
 * Mirrors the talent-discipline-freeform pattern exactly.
 *
 * Head-less strategy: `SectionHead` already returns null when eyebrow,
 * headline, and intro are all falsy (see section-primitives/index.tsx:165).
 * `gridOnlyLocationDiscoveryConfig` blanks those three fields so the embed's
 * SectionHead naturally renders nothing. The `headless: true` field is also
 * set as an explicit signal (for future use / clarity), even though the blank
 * fields already suppress the head.
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
 * `location_discovery` section reads WORKSPACE talent-location coverage from
 * request context, so a `workspace` preview subject rescopes it to the chosen
 * workspace (registered in section-embed-preview-subject.ts). Published renders
 * pass no subject → unchanged.
 */
export const LOCATION_DISCOVERY_EMBED_KEY = "location_discovery" as const;
export const LOCATION_DISCOVERY_PREVIEW_SUBJECT_KIND: SectionEmbedSubjectKind =
  "workspace";

export interface LocationDiscoveryDecomposedInput {
  /** Stable root id (migration / page-design presets). */
  rootId?: string;
  eyebrow?: string;
  headline?: string;
  subheadline?: string;
  seeAllLabel?: string;
  seeAllHref?: string;
  /** Grid-only embed config (head fields should be empty). */
  embedConfig?: Record<string, unknown>;
  /**
   * Style overrides merged into the eyebrow paragraph.
   *
   * Same reason the featured-talent builder has one: the default is this
   * component's muted grey, and a page that marks every other eyebrow
   * differently ends up with one section speaking a different language.
   */
  eyebrowStyle?: Record<string, unknown>;
}

/**
 * Returns a `location_discovery` section embed config with all SectionHead
 * fields blanked so the embed renders the grid/map only (no section head).
 * Also sets `headless: true` as an explicit signal.
 */
export function gridOnlyLocationDiscoveryConfig(
  baseConfig?: Record<string, unknown>,
): Record<string, unknown> {
  const { eyebrow: _e, headline: _h, subheadline: _s, ctaLabel: _cl, ctaHref: _ch, ...rest } = {
    ...baseConfig,
  };
  return {
    ...rest,
    eyebrow: "",
    headline: "",
    subheadline: "",
    // Suppress the section's own CTA — the freeform See All Link owns that role.
    ctaLabel: "",
    ctaHref: undefined,
    headless: true,
  };
}

export function buildLocationDiscoveryDecomposedSection(
  input: LocationDiscoveryDecomposedInput = {},
): BuilderNode {
  const eyebrow = input.eyebrow ?? "Talent network";
  const headline = input.headline ?? "Local faces, international reach.";
  const subheadline = input.subheadline ?? "";
  const seeAllLabel = input.seeAllLabel ?? "Browse the directory";
  const seeAllHref = input.seeAllHref ?? "/directory";
  const embedConfig = gridOnlyLocationDiscoveryConfig(input.embedConfig);

  return {
    id: input.rootId ?? makeNodeId("container"),
    kind: "container",
    props: {
      layerLabel: "Markets Section",
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
              sectionTypeKey: "location_discovery",
              layerLabel: "Markets Grid",
              config: embedConfig,
            },
          },
        ],
      },
    ],
  };
}
