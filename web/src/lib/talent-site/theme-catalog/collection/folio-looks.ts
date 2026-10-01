/**
 * Folio palettes (Folio proposal): Default stone, Light neutral, Dark
 * contrast. Each is a Look scoped to the Folio Design, so the magazine
 * widgets inherit ink, rules and paper from tokens. Fonts: Instrument Serif
 * for the masthead, chapters and prices; Archivo for body (the tracked caps
 * labels use Archivo Narrow, loaded by the magazine widgets). The accent
 * stays ink so the photography carries the colour.
 */
import { GRIDLINE_DEFAULT_LOOK } from "./gridline-looks";
import type { BuiltinLookEntry } from "../builtins/types";
import type { LookPayload } from "../types";
import {
  FOLIO_BODY_FONT,
  FOLIO_HEADING_FONT,
  FOLIO_LOOK_TYPE_DEFAULTS,
} from "./folio-defaults";

export { FOLIO_BODY_FONT, FOLIO_HEADING_FONT };

type FolioPalette = {
  key: "stone" | "light" | "dark";
  en: string;
  es: string;
  bg: string;
  surface: string;
  ink: string;
  mute: string;
  line: string;
};

const FOLIO_PALETTES: readonly FolioPalette[] = [
  {
    key: "stone",
    en: "Default stone",
    es: "Piedra",
    bg: "#ECEAE5",
    surface: "#F7F6F3",
    ink: "#111111",
    mute: "#6A6760",
    line: "#D3D0C8",
  },
  {
    key: "light",
    en: "Light neutral",
    es: "Claro neutro",
    bg: "#FFFFFF",
    surface: "#F1F0ED",
    ink: "#1A1A1A",
    mute: "#77746E",
    line: "#E6E4DF",
  },
  {
    key: "dark",
    en: "Dark contrast",
    es: "Contraste oscuro",
    bg: "#0E0E0E",
    surface: "#171717",
    ink: "#F1EFEA",
    mute: "#9C9890",
    line: "#2C2B29",
  },
];

function folioLookTokens(p: FolioPalette): LookPayload {
  // Look layer only (color.* + typography.* + background.mode). Shape tokens
  // (radius / spacing / shell nav font) live in Folio design defaults.
  return {
    tokens: {
      "color.background": p.bg,
      "color.surface-raised": p.surface,
      "color.line": p.line,
      "color.ink": p.ink,
      "color.muted": p.mute,
      "color.primary": p.ink,
      "color.accent": p.ink,
      ...FOLIO_LOOK_TYPE_DEFAULTS,
      "background.mode": "plain",
    },
  };
}

export type FolioBuiltinLookEntry = BuiltinLookEntry & { for_design: "folio" };

export const FOLIO_BUILTIN_LOOKS: readonly FolioBuiltinLookEntry[] = FOLIO_PALETTES.map(
  (p, index) => ({
    kind: "look" as const,
    slug: `folio-${p.key}`,
    title: p.en,
    summary: p.es,
    category: null,
    tags: ["folio", p.key],
    required_talent_tier: "talent_basic" as const,
    sort_order: 200 + index,
    is_new_until: null,
    for_design: "folio" as const,
    preview: {
      swatch: {
        primary: p.ink,
        secondary: p.surface,
        accent: p.ink,
        background: p.bg,
        ink: p.ink,
      },
      fontPreview: { heading: "Instrument Serif", body: "Archivo" },
    },
    buildPayload: () => folioLookTokens(p),
  }),
);

/** The Look a Design opens in when the preview names none. */
export const COLLECTION_DEFAULT_LOOK: Readonly<Record<string, string>> = {
  folio: "folio-stone",
  gridline: GRIDLINE_DEFAULT_LOOK,
};

/** Resolve a Folio Look from code (never DB). Used by theme-preview. */
export function folioLookTokensFromCode(slug: string | null | undefined): Record<string, string> | null {
  if (!slug) return null;
  const entry = FOLIO_BUILTIN_LOOKS.find((l) => l.slug === slug.trim().toLowerCase());
  if (!entry) return null;
  return { ...entry.buildPayload().tokens };
}
