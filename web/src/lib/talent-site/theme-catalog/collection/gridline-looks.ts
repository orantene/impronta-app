/**
 * Gridline palettes (TH16): Default, Light neutral, Dark contrast, Field green,
 * Safety orange. Each is a Look scoped to the Gridline Design. Values are the
 * mockup's (`palettes` in `web/design-references/gridline/index.html`).
 *
 * The mockup's `on` (text on the accent fill) and `at` (accent as text) are NOT
 * stored: `accent-on` and `accent-text` are derived from the accent and the
 * surface (`tokens/resolve.ts`), so contrast is checked rather than trusted
 * (`gridline-looks.test.ts`). `tint` is the soft accent wash (`color.blush`).
 *
 * A custom start colour works through the same Look layer: `gridlineCustomLook`
 * builds a Look from one accent over the Default ground (mockup start #0E7C66).
 */
import type { BuiltinLookEntry } from "../builtins/types";
import type { LookPayload } from "../types";
import { GRIDLINE_LOOK_TYPE_DEFAULTS } from "./gridline-defaults";

export type GridlinePaletteKey = "default" | "light" | "dark" | "green" | "orange";

type GridlineColors = {
  bg: string;
  surface: string;
  ink: string;
  mute: string;
  line: string;
  accent: string;
  tint: string;
};

type GridlinePalette = GridlineColors & {
  key: GridlinePaletteKey;
  en: string;
  es: string;
};

export const GRIDLINE_PALETTES: readonly GridlinePalette[] = [
  { key: "default", en: "Default", es: "Predeterminado", bg: "#EEEFEC", surface: "#FFFFFF", ink: "#0C0E11", mute: "#5A5F66", line: "#D5D8D3", accent: "#FFC21A", tint: "#FFF1C7" },
  { key: "light", en: "Light neutral", es: "Claro neutro", bg: "#FFFFFF", surface: "#F7F7F6", ink: "#141414", mute: "#686868", line: "#E3E3E1", accent: "#141414", tint: "#EDEDEB" },
  { key: "dark", en: "Dark contrast", es: "Contraste oscuro", bg: "#0C0E11", surface: "#171A1F", ink: "#F1F2F0", mute: "#9CA2AA", line: "#2B3038", accent: "#FFC21A", tint: "#3A3114" },
  { key: "green", en: "Field green", es: "Verde campo", bg: "#EEF0EB", surface: "#FFFFFF", ink: "#0F1A14", mute: "#56615A", line: "#D3D9D1", accent: "#1F8A4C", tint: "#DDEFE3" },
  { key: "orange", en: "Safety orange", es: "Naranja seguridad", bg: "#F3F2F0", surface: "#FFFFFF", ink: "#121212", mute: "#5E5B57", line: "#DAD6D0", accent: "#FF5A00", tint: "#FFE2CF" },
];

/** The mockup's custom start colour (an accent the talent edits from). */
export const GRIDLINE_CUSTOM_START = "#0E7C66";

function gridlineLookTokens(p: GridlineColors): LookPayload {
  // Look layer only (color.* + typography.* + background.mode). Shape lives in Gridline design defaults.
  return {
    tokens: {
      "color.background": p.bg,
      "color.surface-raised": p.surface,
      "color.line": p.line,
      "color.ink": p.ink,
      "color.muted": p.mute,
      "color.primary": p.ink,
      "color.accent": p.accent,
      "color.blush": p.tint,
      ...GRIDLINE_LOOK_TYPE_DEFAULTS,
      "background.mode": "plain",
    },
  };
}

export type GridlineBuiltinLookEntry = BuiltinLookEntry & { for_design: "gridline" };

export const GRIDLINE_BUILTIN_LOOKS: readonly GridlineBuiltinLookEntry[] = GRIDLINE_PALETTES.map(
  (p, index) => ({
    kind: "look" as const,
    slug: `gridline-${p.key}`,
    title: p.en,
    summary: p.es,
    category: null,
    tags: ["gridline", p.key],
    required_talent_tier: "talent_basic" as const,
    sort_order: 300 + index,
    is_new_until: null,
    for_design: "gridline" as const,
    preview: {
      swatch: { primary: p.accent, secondary: p.surface, accent: p.accent, background: p.bg, ink: p.ink },
      fontPreview: { heading: "Archivo", body: "Archivo" },
    },
    buildPayload: () => gridlineLookTokens(p),
  }),
);

/** The Look Gridline opens in when the preview names none. */
export const GRIDLINE_DEFAULT_LOOK = "gridline-default";

/** `#RRGGBB` mixed toward white by `amount` (0..1); the custom palette's soft wash. */
function washHex(hex: string, amount: number): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount) + 255 * amount);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** A Look from one start colour (`#RRGGBB`) over the Default ground. */
export function gridlineCustomLook(accent: string = GRIDLINE_CUSTOM_START): LookPayload {
  const base = GRIDLINE_PALETTES[0];
  return gridlineLookTokens({ ...base, accent, tint: washHex(accent, 0.84) });
}

/** Resolve a Gridline Look from code (never DB). Accepts `gridline-green` or the bare key. */
export function gridlineLookTokensFromCode(slug: string | null | undefined): Record<string, string> | null {
  if (!slug) return null;
  const raw = slug.trim().toLowerCase();
  const full = raw.startsWith("gridline-") ? raw : `gridline-${raw}`;
  const entry = GRIDLINE_BUILTIN_LOOKS.find((l) => l.slug === full);
  return entry ? { ...entry.buildPayload().tokens } : null;
}
