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
  /** Stable id for the NATIVE `location_map` node (keeps re-seeds idempotent). */
  gridNodeId?: string;
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

/**
 * Project a legacy `location_discovery` section config onto the NATIVE
 * `location_map` node's props.
 *
 * An ALLOW-LIST for the same reason the featured-talent one is: unknown props
 * fail `validateBuilderNodeTree`, so a blind spread would make the page
 * unauthorable.
 *
 * `source` is the load-bearing field. The legacy section's city list came from
 * the tenant roster whenever it was not given manual `items`, so a config with
 * no `items` MUST project to `roster_cities` — defaulting to `manual` would
 * leave the node with an empty `items` array and paint an empty band where a
 * live market grid used to be. That is also what makes
 * `collectNativeDataBlockNeeds` mark `needsTalentLocations` and trigger the
 * fetch at all.
 */
export function nativeLocationMapProps(
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
      if (typeof item.region === "string" && item.region.trim()) out.region = item.region;
      if (typeof item.href === "string" && item.href.trim()) out.href = item.href;
      if (typeof item.count === "number") out.count = item.count;
      if (item.featured === true) out.featured = true;
      if (item.status === "coming_soon" || item.status === "active") {
        out.status = item.status;
      }
      return out;
    })
    .filter((item) => Boolean(item.label));

  const props: Record<string, unknown> = {};
  const put = (key: string, value: unknown): void => {
    if (value !== undefined) props[key] = value;
  };

  // Explicit authored source wins; otherwise "has manual items" decides, which
  // reproduces the legacy section's own behaviour.
  put(
    "source",
    oneOf("source", ["manual", "roster_cities"] as const) ??
      (items.length > 0 ? "manual" : "roster_cities"),
  );
  if (items.length > 0) put("items", items);
  put("maxItems", num("maxItems"));
  put("showCount", bool("showCount"));
  put("showMap", bool("showMap"));
  put("mapStyle", oneOf("mapStyle", ["editorial", "embed"] as const));
  put("mapEmbedUrl", str("mapEmbedUrl"));
  put("overlayTitle", str("overlayTitle"));
  put("overlayBody", str("overlayBody"));
  put("overlayAddress", str("overlayAddress"));
  put("overlayHours", str("overlayHours"));
  put("overlaySide", oneOf("overlaySide", [
    "card-left",
    "card-right",
    "card-bottom",
  ] as const));
  put("ratio", oneOf("ratio", ["16/9", "4/3", "1/1", "21/9"] as const));
  put("layout", oneOf("layout", ["grid", "list", "compact"] as const));
  put("emptyStateText", str("emptyStateText"));

  return props;
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
            id: input.gridNodeId ?? makeNodeId("location_map"),
            kind: "location_map",
            props: {
              ...nativeLocationMapProps(embedConfig),
              layerLabel: "Markets Grid",
            },
          },
        ],
      },
    ],
  };
}
