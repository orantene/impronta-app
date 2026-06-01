import type { BuilderNode, BuilderNodeStyle } from "./types";

export type BuilderFontCategory = "sans" | "serif" | "display" | "mono";
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
  const families: string[] = [];
  const seen = new Set<string>();
  const add = (value: string | undefined) => {
    const family = firstFontFamily(value);
    if (!family) return;
    const normalized = normalizeFontFamily(family);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    families.push(value ?? family);
  };
  const addStyle = (style: BuilderNodeStyle | undefined) => {
    add(style?.fontFamily);
    add(style?.responsive?.tablet?.fontFamily);
    add(style?.responsive?.mobile?.fontFamily);
  };
  const visit = (node: BuilderNode) => {
    addStyle((node.props as { style?: BuilderNodeStyle }).style);
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  };

  for (const node of nodes) visit(node);
  for (const component of Object.values(components ?? {})) visit(component);
  return families;
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
