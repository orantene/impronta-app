/**
 * Talent-by-discipline — decomposed freeform section (container + text layers +
 * grid-only `talent_type_grid` embed). Header copy is heading/paragraph/button
 * nodes; the Tulala embed renders category cards only.
 */
import {
  v11TalentTypeGridItems,
  v11TalentTypeGridPreset,
} from "@/lib/site-admin/sections/talent_type_grid/presets";

import type { BuilderNode, BuilderNodeTree, BuilderNodeKind } from "./types";
import type { SectionEmbedSubjectKind } from "./section-embed-preview-subject";

/** Local id minting — avoids importing `create` (circular via page-designs → impronta). */
function makeNodeId(kind: BuilderNodeKind): string {
  return `builder-${kind}-${crypto.randomUUID()}`;
}

/**
 * WS4 §D — preview-subject binding for this connected resolver. The embedded
 * `talent_type_grid` section reads the WORKSPACE discipline taxonomy from
 * request context, so a `workspace` preview subject rescopes it to the chosen
 * workspace (registered in section-embed-preview-subject.ts). Published renders
 * pass no subject → unchanged.
 */
export const TALENT_TYPE_GRID_EMBED_KEY = "talent_type_grid" as const;
export const TALENT_TYPE_GRID_PREVIEW_SUBJECT_KIND: SectionEmbedSubjectKind =
  "workspace";

export interface TalentDisciplineDecomposedInput {
  /** Stable root id (migration / page-design presets). */
  rootId?: string;
  eyebrow?: string;
  headline?: string;
  subheadline?: string;
  seeAllLabel?: string;
  seeAllHref?: string;
  /** Grid-only embed config (header keys should be empty). */
  embedConfig?: Record<string, unknown>;
}

export function gridOnlyTalentTypeGridConfig(
  baseConfig?: Record<string, unknown>,
): Record<string, unknown> {
  const items =
    (baseConfig?.items as typeof v11TalentTypeGridItems | undefined) ??
    v11TalentTypeGridItems.map((item) => ({
      ...item,
      href: "/directory",
    }));
  const { eyebrow: _e, headline: _h, subheadline: _s, seeAllLabel: _l, ...rest } = {
    ...v11TalentTypeGridPreset,
    ...baseConfig,
    items,
  };
  return {
    ...rest,
    items,
    eyebrow: "",
    headline: "",
    subheadline: "",
    seeAllLabel: "",
  };
}

/** True when the embed still owns header copy (monolithic Tulala block). */
export function isMonolithicTalentTypeGridEmbed(
  node: BuilderNode,
): node is Extract<BuilderNode, { kind: "section_embed" }> {
  if (node.kind !== "section_embed") return false;
  if (node.props.sectionTypeKey !== "talent_type_grid") return false;
  const config = (node.props.config ?? {}) as Record<string, unknown>;
  const eyebrow = typeof config.eyebrow === "string" ? config.eyebrow.trim() : "";
  const headline =
    typeof config.headline === "string" ? config.headline.trim() : "";
  const seeAll =
    typeof config.seeAllLabel === "string" ? config.seeAllLabel.trim() : "";
  return eyebrow.length > 0 || headline.length > 0 || seeAll.length > 0;
}

export function buildTalentDisciplineDecomposedSection(
  input: TalentDisciplineDecomposedInput = {},
): BuilderNode {
  const eyebrow = input.eyebrow ?? "The roster";
  const headline = input.headline ?? "Talent, by discipline";
  const subheadline = input.subheadline ?? "";
  const seeAllLabel = input.seeAllLabel ?? "See all";
  const seeAllHref = input.seeAllHref ?? "/directory";
  const embedConfig = gridOnlyTalentTypeGridConfig(input.embedConfig);

  return {
    id: input.rootId ?? makeNodeId("container"),
    kind: "container",
    props: {
      layerLabel: "Talent by Discipline Section",
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
              sectionTypeKey: "talent_type_grid",
              layerLabel: "Discipline Grid",
              config: embedConfig,
            },
          },
        ],
      },
    ],
  };
}

function resolveSeeAllHref(config: Record<string, unknown>): string {
  const href = config.seeAllHref;
  if (typeof href === "string" && href.trim()) return href;
  if (
    href &&
    typeof href === "object" &&
    "value" in href &&
    typeof (href as { value?: unknown }).value === "string"
  ) {
    return (href as { value: string }).value;
  }
  return "/directory";
}

function decomposeMonolithicTalentTypeGridEmbed(
  node: Extract<BuilderNode, { kind: "section_embed" }>,
): BuilderNode {
  const config = (node.props.config ?? {}) as Record<string, unknown>;
  return buildTalentDisciplineDecomposedSection({
    rootId: node.id,
    eyebrow: typeof config.eyebrow === "string" ? config.eyebrow : "",
    headline:
      typeof config.headline === "string"
        ? config.headline
        : "Talent, by discipline",
    subheadline:
      typeof config.subheadline === "string" ? config.subheadline : "",
    seeAllLabel:
      typeof config.seeAllLabel === "string" ? config.seeAllLabel : "",
    seeAllHref: resolveSeeAllHref(config),
    embedConfig: gridOnlyTalentTypeGridConfig(config),
  });
}

function migrateTalentTypeGridEmbedsInNode(node: BuilderNode): {
  node: BuilderNode;
  changed: boolean;
} {
  if (isMonolithicTalentTypeGridEmbed(node)) {
    return { node: decomposeMonolithicTalentTypeGridEmbed(node), changed: true };
  }
  if (!("children" in node) || !Array.isArray(node.children)) {
    return { node, changed: false };
  }
  let changed = false;
  const children = node.children.map((child) => {
    const next = migrateTalentTypeGridEmbedsInNode(child);
    if (next.changed) changed = true;
    return next.node;
  });
  if (!changed) return { node, changed: false };
  return { node: { ...node, children } as BuilderNode, changed: true };
}

/** Split legacy monolithic `talent_type_grid` embeds into container + text layers. */
export function migrateMonolithicTalentTypeGridEmbeds(
  tree: BuilderNodeTree,
): BuilderNodeTree {
  let changed = false;
  const next = tree.map((node) => {
    const result = migrateTalentTypeGridEmbedsInNode(node);
    if (result.changed) changed = true;
    return result.node;
  });
  return changed ? next : tree;
}
