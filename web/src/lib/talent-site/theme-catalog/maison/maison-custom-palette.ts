/**
 * Maison custom colors (W60–W66 / A10).
 * Four editable fields → derived rule + on_accent → look tokens.
 * Contrast advisory only — never blocks save/publish.
 */
import { contrastRatio } from "@/lib/site-admin/tokens/contrast-pair";
import { MAISON_SEED } from "./seed";

export const MAISON_CUSTOM_CONTRAST_TEXT = 4.5;
export const MAISON_CUSTOM_CONTRAST_BUTTON = 4.5;
export const MAISON_CUSTOM_CONTRAST_LARGE = 3;

export type MaisonCustomColorFields = {
  page: string;
  text: string;
  accent: string;
  section: string;
};

export type MaisonCustomPaletteStored = {
  name: { en: string; es: string };
  fields: MaisonCustomColorFields;
  derived: { rule: string; on_accent: string };
};

export type MaisonContrastAdvisory = {
  /** True when both text-on-page and button pass thresholds. */
  ok: boolean;
  textOnPage: number | null;
  buttonContrast: number | null;
  /** Primary advisory when button fails (chef journey). */
  messageKey: "adjust_button_contrast" | "adjust_text_contrast" | null;
  messageEn: string | null;
  messageEs: string | null;
  suggestionAccent: string | null;
};

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function normalizeMaisonHex(raw: string): string | null {
  const t = raw.trim();
  if (!HEX_RE.test(t)) return null;
  const hex = t.replace(/^#/, "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  return `#${full.toUpperCase()}`;
}

export function isCompleteCustomFields(
  fields: Partial<MaisonCustomColorFields> | null | undefined,
): fields is MaisonCustomColorFields {
  if (!fields) return false;
  return (
    normalizeMaisonHex(fields.page ?? "") !== null &&
    normalizeMaisonHex(fields.text ?? "") !== null &&
    normalizeMaisonHex(fields.accent ?? "") !== null &&
    normalizeMaisonHex(fields.section ?? "") !== null
  );
}

/** rule = section darkened 6% (seed derived_tokens_rule). */
export function deriveRuleFromSection(section: string): string {
  const rgb = hexToRgb(section);
  if (!rgb) return section;
  const factor = 0.94; // darkened 6%
  return rgbToHex(
    Math.round(rgb[0] * factor),
    Math.round(rgb[1] * factor),
    Math.round(rgb[2] * factor),
  );
}

/** on_accent = #FFFFFF or text, whichever passes 4.5:1 (prefer white). */
export function deriveOnAccent(accent: string, text: string): string {
  const white = "#FFFFFF";
  const whiteRatio = contrastRatio(white, accent);
  if (whiteRatio !== null && whiteRatio >= MAISON_CUSTOM_CONTRAST_BUTTON) {
    return white;
  }
  const textRatio = contrastRatio(text, accent);
  if (textRatio !== null && textRatio >= MAISON_CUSTOM_CONTRAST_BUTTON) {
    return text;
  }
  // Neither passes — keep white so the advisory still describes button labels.
  return white;
}

export function buildMaisonCustomPalette(
  fields: MaisonCustomColorFields,
  name?: { en: string; es: string },
): MaisonCustomPaletteStored {
  const page = normalizeMaisonHex(fields.page)!;
  const text = normalizeMaisonHex(fields.text)!;
  const accent = normalizeMaisonHex(fields.accent)!;
  const section = normalizeMaisonHex(fields.section)!;
  const normalized = { page, text, accent, section };
  return {
    name: name ?? {
      en: MAISON_SEED.custom_colors_example_chef.saved_name.en,
      es: MAISON_SEED.custom_colors_example_chef.saved_name.es,
    },
    fields: normalized,
    derived: {
      rule: deriveRuleFromSection(section),
      on_accent: deriveOnAccent(accent, text),
    },
  };
}

export function maisonCustomLookTokens(
  palette: MaisonCustomPaletteStored,
): Record<string, string> {
  return {
    "color.background": palette.fields.page,
    "color.surface-raised": palette.fields.section,
    "color.line": palette.derived.rule,
    "color.ink": palette.fields.text,
    "color.primary": palette.fields.accent,
    "color.accent": palette.fields.accent,
  };
}

/**
 * Darken accent (same hue) until white-on-accent ≥ 4.5:1.
 * Matches chef fixture direction (#C8643B → deeper terracotta).
 */
export function suggestAccentForButtonContrast(accent: string): string | null {
  const start = normalizeMaisonHex(accent);
  if (!start) return null;
  const white = "#FFFFFF";
  const current = contrastRatio(white, start);
  if (current !== null && current >= MAISON_CUSTOM_CONTRAST_BUTTON) return null;

  let hsl = hexToHsl(start);
  if (!hsl) return null;
  // Step lightness down until white passes, or floor at 8%.
  for (let i = 0; i < 40; i++) {
    hsl = { ...hsl, l: Math.max(0.08, hsl.l - 0.02) };
    const candidate = hslToHex(hsl.h, hsl.s, hsl.l);
    const ratio = contrastRatio(white, candidate);
    if (ratio !== null && ratio >= MAISON_CUSTOM_CONTRAST_BUTTON) {
      return candidate;
    }
  }
  return hslToHex(hsl.h, hsl.s, 0.08);
}

export function evaluateMaisonCustomContrast(
  fields: MaisonCustomColorFields,
): MaisonContrastAdvisory {
  const page = normalizeMaisonHex(fields.page);
  const text = normalizeMaisonHex(fields.text);
  const accent = normalizeMaisonHex(fields.accent);
  if (!page || !text || !accent) {
    return {
      ok: false,
      textOnPage: null,
      buttonContrast: null,
      messageKey: null,
      messageEn: null,
      messageEs: null,
      suggestionAccent: null,
    };
  }
  // Spec §9 measures button labels as white-on-accent (chef 3.93:1).
  const textOnPage = contrastRatio(text, page);
  const buttonContrast = contrastRatio("#FFFFFF", accent);

  const textFails =
    textOnPage === null || textOnPage < MAISON_CUSTOM_CONTRAST_TEXT;
  const buttonFails =
    buttonContrast === null || buttonContrast < MAISON_CUSTOM_CONTRAST_BUTTON;

  if (!textFails && !buttonFails) {
    return {
      ok: true,
      textOnPage,
      buttonContrast,
      messageKey: null,
      messageEn: null,
      messageEs: null,
      suggestionAccent: null,
    };
  }

  if (buttonFails) {
    const suggestion = suggestAccentForButtonContrast(accent);
    return {
      ok: false,
      textOnPage,
      buttonContrast,
      messageKey: "adjust_button_contrast",
      messageEn:
        "White text on this terracotta is hard to read. A slightly deeper terracotta keeps the look and reads clearly.",
      messageEs:
        "El texto blanco sobre este terracota cuesta leer. Un terracota un poco más profundo mantiene el look y se lee bien.",
      suggestionAccent: suggestion,
    };
  }

  return {
    ok: false,
    textOnPage,
    buttonContrast,
    messageKey: "adjust_text_contrast",
    messageEn:
      "This text color is hard to read on the page background. Try a darker text or a lighter page.",
    messageEs:
      "Este color de texto cuesta leer sobre el fondo de la página. Prueba un texto más oscuro o una página más clara.",
    suggestionAccent: null,
  };
}

export function parseMaisonCustomPaletteStored(
  raw: unknown,
): MaisonCustomPaletteStored | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const fields = o.fields;
  if (!fields || typeof fields !== "object") return null;
  const f = fields as Record<string, unknown>;
  if (
    typeof f.page !== "string" ||
    typeof f.text !== "string" ||
    typeof f.accent !== "string" ||
    typeof f.section !== "string"
  ) {
    return null;
  }
  if (!isCompleteCustomFields(f as MaisonCustomColorFields)) return null;
  const nameObj = o.name;
  let name = {
    en: MAISON_SEED.custom_colors_example_chef.saved_name.en,
    es: MAISON_SEED.custom_colors_example_chef.saved_name.es,
  };
  if (nameObj && typeof nameObj === "object") {
    const n = nameObj as Record<string, unknown>;
    if (typeof n.en === "string" && n.en.trim()) name = { ...name, en: n.en.trim() };
    if (typeof n.es === "string" && n.es.trim()) name = { ...name, es: n.es.trim() };
  } else if (typeof o.name === "string" && o.name.trim()) {
    name = { en: o.name.trim(), es: o.name.trim() };
  }
  return buildMaisonCustomPalette(
    {
      page: f.page,
      text: f.text,
      accent: f.accent,
      section: f.section,
    },
    name,
  );
}

export function defaultCustomFieldsFromPalette(pageSectionAccentText: {
  page: string;
  section: string;
  accent: string;
  text: string;
}): MaisonCustomColorFields {
  return {
    page: pageSectionAccentText.page,
    text: pageSectionAccentText.text,
    accent: pageSectionAccentText.accent,
    section: pageSectionAccentText.section,
  };
}

function hexToRgb(hex: string): [number, number, number] | null {
  const n = normalizeMaisonHex(hex);
  if (!n) return null;
  const h = n.slice(1);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return rgbToHex(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
}
