/**
 * Talent-by-discipline — decomposed freeform section (container + text layers +
 * grid-only `talent_type_grid` embed). Header copy is heading/paragraph/button
 * nodes; the Tulala embed renders category cards only.
 */
import {
  v11TalentTypeGridItems,
  v11TalentTypeGridPreset,
} from "@/lib/site-admin/sections/talent_type_grid/presets";

import type { BuilderNode, BuilderNodeTree } from "./types";
import type { SectionEmbedSubjectKind } from "./section-embed-preview-subject";
import { makeId as makeNodeId } from "./make-id";

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
  /** Stable id for the NATIVE `talent_type_grid` node (keeps re-seeds idempotent). */
  gridNodeId?: string;
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

/**
 * Project a legacy `talent_type_grid` section config onto the NATIVE node's
 * props. An ALLOW-LIST — see `nativeFeaturedTalentProps` for why a spread is
 * not safe here.
 *
 * `mode` decides whether the server resolves anything at all: only
 * `mode: "dynamic"` makes `collectNativeDataBlockNeeds` record a discipline
 * need. The legacy preset ships authored `items`, so the default stays
 * `manual` and the cards are exactly the ones already on the page; a config
 * that explicitly asks for `dynamic` gets the roster-derived categories.
 */
export function nativeTalentTypeGridProps(
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
  const oneOf = <T extends string>(key: string, allowed: readonly T[]): T | undefined => {
    const value = config[key];
    return typeof value === "string" && (allowed as readonly string[]).includes(value)
      ? (value as T)
      : undefined;
  };

  const rawItems = Array.isArray(config.items) ? config.items : [];
  const items = rawItems
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => {
      const out: Record<string, unknown> = {
        label: typeof item.label === "string" ? item.label : "",
      };
      for (const key of [
        "description",
        "imageUrl",
        "imageAlt",
        "imagePosition",
        "taxonomyTermId",
        "href",
      ] as const) {
        if (typeof item[key] === "string" && (item[key] as string).trim()) {
          out[key] = item[key];
        }
      }
      if (item.featured === true) out.featured = true;
      return out;
    })
    .filter((item) => Boolean(item.label));

  const props: Record<string, unknown> = {};
  const put = (key: string, value: unknown): void => {
    if (value !== undefined) props[key] = value;
  };

  put("mode", oneOf("mode", ["manual", "dynamic"] as const) ?? "manual");
  if (items.length > 0) put("items", items);
  const termIds = Array.isArray(config.selectedTermIds)
    ? config.selectedTermIds.filter(
        (v): v is string => typeof v === "string" && !!v.trim(),
      )
    : [];
  if (termIds.length > 0) put("selectedTermIds", termIds);
  put("parentCategoryMode", bool("parentCategoryMode"));
  put("maxItems", num("maxItems"));
  put("columns", num("columns"));
  put("showCount", bool("showCount"));
  put("showImages", bool("showImages"));
  put("showDescriptions", bool("showDescriptions"));
  put("cardRatio", oneOf("cardRatio", ["1/1", "3/4", "4/3", "16/9"] as const));
  put("textPosition", oneOf("textPosition", ["overlay-bottom", "below"] as const));
  put("emptyStateText", str("emptyStateText"));

  return props;
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
            id: input.gridNodeId ?? makeNodeId("talent_type_grid"),
            kind: "talent_type_grid",
            props: {
              ...nativeTalentTypeGridProps(embedConfig),
              layerLabel: "Discipline Grid",
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
