import type { BuilderNode, BuilderNodeStyle, BuilderNodeStyleValue } from "./types";

export type BuilderFontCategory = "sans" | "serif" | "display" | "script" | "mono";
export type BuilderFontSource = "bundled" | "google";

export interface BuilderFontDefinition {
  family: string;
  label: string;
  category: BuilderFontCategory;
  source: BuilderFontSource;
  cssFamily: string;
  googleWeights?: string;
}

const FONT_WEIGHT_RANGE = "400;500;600;700";

export const BUILDER_FONT_REGISTRY: ReadonlyArray<BuilderFontDefinition> = [
  {
    family: "Geist",
    label: "Geist",
    category: "sans",
    source: "bundled",
    cssFamily: '"Geist", var(--font-geist-sans), system-ui, sans-serif',
  },
  {
    family: "Raleway",
    label: "Raleway",
    category: "sans",
    source: "bundled",
    cssFamily: '"Raleway", var(--font-body-sans), system-ui, sans-serif',
  },
  {
    family: "Inter",
    label: "Inter",
    category: "sans",
    source: "bundled",
    cssFamily: '"Inter", var(--font-inter-body), system-ui, sans-serif',
  },
  {
    family: "Geist Mono",
    label: "Geist Mono",
    category: "mono",
    source: "bundled",
    cssFamily:
      '"Geist Mono", var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace',
  },
  {
    family: "Cinzel",
    label: "Cinzel",
    category: "display",
    source: "bundled",
    cssFamily: '"Cinzel", var(--font-cinzel), Georgia, serif',
  },
  {
    family: "Playfair Display",
    label: "Playfair Display",
    category: "serif",
    source: "bundled",
    cssFamily: '"Playfair Display", var(--font-playfair-display), Georgia, serif',
  },
  {
    family: "Fraunces",
    label: "Fraunces",
    category: "serif",
    source: "bundled",
    cssFamily: '"Fraunces", var(--font-fraunces), Georgia, serif',
  },
  {
    family: "Manrope",
    label: "Manrope",
    category: "sans",
    source: "google",
    cssFamily: '"Manrope", system-ui, sans-serif',
    googleWeights: FONT_WEIGHT_RANGE,
  },
  {
    family: "DM Sans",
    label: "DM Sans",
    category: "sans",
    source: "google",
    cssFamily: '"DM Sans", system-ui, sans-serif',
    googleWeights: "400;500;700",
  },
  {
    family: "Work Sans",
    label: "Work Sans",
    category: "sans",
    source: "google",
    cssFamily: '"Work Sans", system-ui, sans-serif',
    googleWeights: "400;500;600",
  },
  {
    family: "Outfit",
    label: "Outfit",
    category: "sans",
    source: "google",
    cssFamily: '"Outfit", system-ui, sans-serif',
    googleWeights: FONT_WEIGHT_RANGE,
  },
  {
    family: "Plus Jakarta Sans",
    label: "Plus Jakarta Sans",
    category: "sans",
    source: "google",
    cssFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
    googleWeights: "400;500;600",
  },
  {
    family: "Cormorant Garamond",
    label: "Cormorant Garamond",
    category: "serif",
    source: "google",
    cssFamily: '"Cormorant Garamond", Georgia, serif',
    googleWeights: "400;500;600",
  },
  {
    family: "EB Garamond",
    label: "EB Garamond",
    category: "serif",
    source: "google",
    cssFamily: '"EB Garamond", Georgia, serif',
    googleWeights: "400;500;600",
  },
  {
    family: "Libre Caslon Text",
    label: "Libre Caslon Text",
    category: "serif",
    source: "google",
    cssFamily: '"Libre Caslon Text", Georgia, serif',
    googleWeights: "400;700",
  },
  {
    family: "Lora",
    label: "Lora",
    category: "serif",
    source: "google",
    cssFamily: '"Lora", Georgia, serif',
    googleWeights: FONT_WEIGHT_RANGE,
  },
  {
    family: "Bricolage Grotesque",
    label: "Bricolage Grotesque",
    category: "display",
    source: "google",
    cssFamily: '"Bricolage Grotesque", system-ui, sans-serif',
    googleWeights: "400;600;700",
  },
  {
    family: "Italiana",
    label: "Italiana",
    category: "display",
    source: "google",
    cssFamily: '"Italiana", Georgia, serif',
    googleWeights: "400",
  },
  {
    family: "JetBrains Mono",
    label: "JetBrains Mono",
    category: "mono",
    source: "google",
    cssFamily: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
    googleWeights: "400;500;700",
  },
  {
    family: "IBM Plex Mono",
    label: "IBM Plex Mono",
    category: "mono",
    source: "google",
    cssFamily: '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace',
    googleWeights: "400;500;700",
  },
];

const FONT_BY_NORMALIZED_FAMILY = new Map(
  BUILDER_FONT_REGISTRY.map((font) => [normalizeFontFamily(font.family), font] as const),
);

const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "inherit",
  "initial",
  "unset",
]);

export function fallbackForBuilderFontCategory(category: BuilderFontCategory): string {
  switch (category) {
    case "sans":
      return "system-ui, sans-serif";
    case "serif":
    case "display":
      return "Georgia, serif";
    case "script":
      return '"Brush Script MT", "Segoe Script", cursive';
    case "mono":
      return 'ui-monospace, "SF Mono", Menlo, monospace';
  }
}

export function firstFontFamily(value: string | undefined | null): string | null {
  if (!value) return null;
  const match = value.match(/^"?([^",]+)"?/);
  if (!match) return null;
  const family = match[1].trim();
  return family.length > 0 ? family : null;
}

export function resolveBuilderFont(
  value: string | undefined | null,
): BuilderFontDefinition | null {
  const family = firstFontFamily(value);
  if (!family) return null;
  return FONT_BY_NORMALIZED_FAMILY.get(normalizeFontFamily(family)) ?? null;
}

export function cssFamilyForBuilderFont(font: BuilderFontDefinition): string {
  return font.cssFamily;
}

export function buildGoogleFontsHrefForFamilies(
  values: ReadonlyArray<string | undefined | null>,
): string | null {
  const params: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const family = firstFontFamily(value);
    if (!family) continue;
    const normalized = normalizeFontFamily(family);
    if (seen.has(normalized) || shouldSkipGoogleFontFamily(normalized)) continue;
    const definition = FONT_BY_NORMALIZED_FAMILY.get(normalized);
    if (definition?.source === "bundled") continue;
    const weights = definition?.googleWeights ?? FONT_WEIGHT_RANGE;
    params.push(`family=${encodeGoogleFontFamily(family)}:wght@${weights}`);
    seen.add(normalized);
  }
  if (params.length === 0) return null;
  return `https://fonts.googleapis.com/css2?${params.join("&")}&display=swap`;
}

export function collectBuilderNodeFontFamilies(
  nodes: ReadonlyArray<BuilderNode>,
  components?: Readonly<Record<string, BuilderNode>>,
): string[] {
  return collectBuilderNodeFontUsage(nodes, components).map((usage) => usage.value);
}

/**
 * One family's collected usage on a page: which weights and whether genuine
 * italics appear. Feeds `buildGoogleFontsHrefFromUsage` (fonts-catalog.ts) so
 * the emitted stylesheet request carries only what the page can render.
 */
export interface BuilderNodeFontUsage {
  /** The stored font-family value (first occurrence wins). */
  value: string;
  /** Weights in use, ascending. Always includes the renderer baseline. */
  weights: number[];
  /** True when an italic fontStyle or `<em>/<i>` markup uses this family. */
  italic: boolean;
}

/**
 * Weights the renderer's own CSS can apply without an explicit per-node
 * `fontWeight` (headings, buttons, medium/semibold utility classes). Every
 * used family loads these — the same set the curated registry always
 * requested — and EXPLICIT node weights extend the set beyond it (100–300,
 * 800–900). Families that appear nowhere on the page load nothing.
 */
const BASELINE_FONT_WEIGHTS = [400, 500, 600, 700];

/**
 * Walk the tree tracking the INHERITED font-family, so a weight or italic set
 * on a child without its own family lands on the family that actually renders
 * it. Responsive/container lanes are merged into the same usage (a tablet-only
 * weight still has to load).
 */
export function collectBuilderNodeFontUsage(
  nodes: ReadonlyArray<BuilderNode>,
  components?: Readonly<Record<string, BuilderNode>>,
): BuilderNodeFontUsage[] {
  const usages = new Map<string, { value: string; weights: Set<number>; italic: boolean }>();

  const usageFor = (value: string) => {
    const family = firstFontFamily(value);
    if (!family) return null;
    const normalized = normalizeFontFamily(family);
    let usage = usages.get(normalized);
    if (!usage) {
      usage = { value, weights: new Set(BASELINE_FONT_WEIGHTS), italic: false };
      usages.set(normalized, usage);
    }
    return usage;
  };

  const lanesOf = (style: BuilderNodeStyle | undefined): BuilderNodeStyleValue[] => {
    if (!style) return [];
    const lanes: (BuilderNodeStyleValue | undefined)[] = [
      style,
      style.responsive?.tablet,
      style.responsive?.mobile,
      style.containerQueries?.tablet,
      style.containerQueries?.mobile,
    ];
    return lanes.filter((lane): lane is BuilderNodeStyleValue => Boolean(lane));
  };

  const visit = (node: BuilderNode, inherited: ReadonlyArray<string>) => {
    const props = node.props as {
      style?: BuilderNodeStyle;
      text?: unknown;
      html?: unknown;
      content?: unknown;
    };
    const style = props.style;
    const lanes = lanesOf(style);

    const ownFamilies: string[] = [];
    for (const lane of lanes) {
      if (lane.fontFamily && !ownFamilies.includes(lane.fontFamily)) {
        ownFamilies.push(lane.fontFamily);
      }
    }
    // A base-lane family overrides the inherited one for the whole subtree;
    // a breakpoint-only family adds to it (the base breakpoints still render
    // the inherited face).
    const active =
      style?.fontFamily != null && style.fontFamily !== ""
        ? ownFamilies
        : [...inherited, ...ownFamilies];

    const weights: number[] = [];
    let italic = false;
    for (const lane of lanes) {
      if (typeof lane.fontWeight === "number" && Number.isFinite(lane.fontWeight)) {
        weights.push(lane.fontWeight);
      }
      if (lane.fontStyle === "italic") italic = true;
    }
    for (const text of [props.text, props.html, props.content]) {
      if (typeof text !== "string") continue;
      if (/<(em|i)[\s>/]/i.test(text)) italic = true;
    }

    for (const value of active) {
      const usage = usageFor(value);
      if (!usage) continue;
      for (const weight of weights) usage.weights.add(weight);
      if (italic) usage.italic = true;
    }

    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child, active);
    }
  };

  for (const node of nodes) visit(node, []);
  for (const component of Object.values(components ?? {})) visit(component, []);

  return [...usages.values()].map((usage) => ({
    value: usage.value,
    weights: [...usage.weights].sort((a, b) => a - b),
    italic: usage.italic,
  }));
}

function encodeGoogleFontFamily(family: string): string {
  return encodeURIComponent(family).replace(/%20/g, "+");
}

function shouldSkipGoogleFontFamily(normalized: string): boolean {
  return (
    GENERIC_FAMILIES.has(normalized) ||
    normalized.startsWith("var(") ||
    normalized.startsWith("--")
  );
}

function normalizeFontFamily(family: string): string {
  return family.trim().replace(/^["']|["']$/g, "").toLowerCase();
}
