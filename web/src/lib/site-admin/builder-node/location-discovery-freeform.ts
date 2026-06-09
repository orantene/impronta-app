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

/** Local id minting — avoids importing `create` (circular via page-designs → impronta). */
function makeNodeId(kind: BuilderNodeKind): string {
  return `builder-${kind}-${crypto.randomUUID()}`;
}

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
