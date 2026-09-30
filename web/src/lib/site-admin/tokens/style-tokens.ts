/**
 * SITE STYLE TOKENS: every visual value a Design used to hard-code in a
 * slug-keyed stylesheet (type roles, buttons, shape, spacing), as ordinary
 * editable theme tokens.
 *
 * Owner rule (binding): a Design only sets DEFAULTS. Each key here
 *   - is a registry token (spread into TOKEN_REGISTRY), so the theme drawer
 *     edits it site-wide and the patch validator accepts it;
 *   - projects to one CSS custom property (`--token-<key with dashes>`), read by
 *     the editorial type-system stylesheet with `fallback` as the last resort;
 *   - defaults to "" in the registry, which means "not set, fall through to the
 *     Design default" (see `resolveEffectiveSiteTokens`). A site without a
 *     Design default and without an override renders exactly as before.
 *
 * Per block, the block style controls (font, size, weight, radius, padding)
 * still win, because node styles are inline; the radius / spacing / font-size
 * keys below are also bindable (`token:<key>`) from those controls.
 *
 * Pure and client-safe: no server imports, no hex values.
 */
import { z } from "zod";

export type StyleTokenGroup = "typography" | "buttons" | "shape" | "spacing";

/** How the drawer edits a key and how a block may bind to it. */
export type StyleTokenControl = "length" | "number" | "enum";

export interface StyleTokenDef {
  key: string;
  group: StyleTokenGroup;
  label: { en: string; es: string };
  control: StyleTokenControl;
  /** Closed values for `enum` keys ("" = Design default is always allowed). */
  options?: ReadonlyArray<{ value: string; en: string; es: string }>;
  /** The editorial type system's baseline, used as the CSS `var()` fallback. */
  fallback: string;
  /** Hidden under "Advanced" in the drawer (presets and main keys first). */
  advanced?: boolean;
  /** Offered to a block style control as a `token:<key>` binding. */
  bind?: "radius" | "spacing" | "font-size";
}

const L = (en: string, es: string) => ({ en, es });

export const STYLE_TOKEN_DEFS: ReadonlyArray<StyleTokenDef> = [
  // ── Typography: display (headings), body, label (eyebrows) roles ─────────
  {
    key: "type.system",
    group: "typography",
    label: L("Type system", "Sistema tipográfico"),
    control: "enum",
    options: [
      { value: "editorial", en: "Editorial", es: "Editorial" },
      { value: "magazine", en: "Magazine", es: "Revista" },
      { value: "off", en: "Plain", es: "Simple" },
    ],
    fallback: "",
    advanced: true,
  },
  { key: "type.display-weight", group: "typography", label: L("Heading weight", "Peso de títulos"), control: "number", fallback: "450" },
  {
    key: "type.accent-style",
    group: "typography",
    label: L("Accent words", "Palabras de acento"),
    control: "enum",
    options: [
      { value: "italic", en: "Italic", es: "Cursiva" },
      { value: "normal", en: "Upright", es: "Recta" },
    ],
    fallback: "italic",
  },
  { key: "type.hero-size", group: "typography", label: L("Hero title, phone", "Título principal, móvil"), control: "length", fallback: "47px", bind: "font-size" },
  { key: "type.hero-size-desktop", group: "typography", label: L("Hero title, desktop", "Título principal, escritorio"), control: "length", fallback: "96px", bind: "font-size" },
  { key: "type.section-title-size", group: "typography", label: L("Section titles, phone", "Títulos de sección, móvil"), control: "length", fallback: "34px", bind: "font-size" },
  { key: "type.section-title-size-desktop", group: "typography", label: L("Section titles, desktop", "Títulos de sección, escritorio"), control: "length", fallback: "58px", bind: "font-size" },
  { key: "type.body-size", group: "typography", label: L("Body text size", "Tamaño del texto"), control: "length", fallback: "15px", bind: "font-size" },
  { key: "type.label-size", group: "typography", label: L("Small labels size", "Tamaño de etiquetas"), control: "length", fallback: "11px", bind: "font-size" },
  { key: "type.label-weight", group: "typography", label: L("Small labels weight", "Peso de etiquetas"), control: "number", fallback: "600", advanced: true },
  { key: "type.label-tracking", group: "typography", label: L("Small labels spacing", "Espaciado de etiquetas"), control: "length", fallback: "0.18em", advanced: true },
  { key: "type.display-tracking", group: "typography", label: L("Heading letter spacing", "Espaciado de títulos"), control: "length", fallback: "-0.01em", advanced: true },
  { key: "type.display-line-height", group: "typography", label: L("Heading line height", "Interlineado de títulos"), control: "number", fallback: "1.02", advanced: true },
  { key: "type.accent-weight", group: "typography", label: L("Accent words weight", "Peso de acentos"), control: "number", fallback: "400", advanced: true },
  { key: "type.body-line-height", group: "typography", label: L("Body line height", "Interlineado del texto"), control: "number", fallback: "1.5", advanced: true },
  { key: "type.hero-line-height", group: "typography", label: L("Hero line height, phone", "Interlineado principal, móvil"), control: "number", fallback: ".98", advanced: true },
  { key: "type.hero-line-height-desktop", group: "typography", label: L("Hero line height, desktop", "Interlineado principal, escritorio"), control: "number", fallback: ".93", advanced: true },
  { key: "type.lede-size", group: "typography", label: L("Intro text, phone", "Texto de entrada, móvil"), control: "length", fallback: "15.5px", advanced: true },
  { key: "type.lede-size-desktop", group: "typography", label: L("Intro text, desktop", "Texto de entrada, escritorio"), control: "length", fallback: "18px", advanced: true },
  { key: "type.logo-size", group: "typography", label: L("Logo text, phone", "Logo, móvil"), control: "length", fallback: "24px", advanced: true },
  { key: "type.logo-size-desktop", group: "typography", label: L("Logo text, desktop", "Logo, escritorio"), control: "length", fallback: "28px", advanced: true },
  { key: "type.nav-size", group: "typography", label: L("Menu links size", "Tamaño del menú"), control: "length", fallback: "13.5px", advanced: true },
  { key: "type.quote-size", group: "typography", label: L("Review quotes size", "Tamaño de reseñas"), control: "length", fallback: "19px", advanced: true },
  { key: "type.group-title-size", group: "typography", label: L("Menu group titles, phone", "Grupos del menú, móvil"), control: "length", fallback: "22px", advanced: true },
  { key: "type.group-title-size-desktop", group: "typography", label: L("Menu group titles, desktop", "Grupos del menú, escritorio"), control: "length", fallback: "28px", advanced: true },
  { key: "type.about-title-size", group: "typography", label: L("About title", "Título de Sobre mí"), control: "length", fallback: "clamp(32px,4vw,56px)", advanced: true },
  { key: "type.about-body-size-desktop", group: "typography", label: L("About text, desktop", "Texto de Sobre mí, escritorio"), control: "length", fallback: "17px", advanced: true },
  { key: "type.footer-title-size", group: "typography", label: L("Footer title, phone", "Título del pie, móvil"), control: "length", fallback: "44px", advanced: true },
  { key: "type.footer-title-size-desktop", group: "typography", label: L("Footer title, desktop", "Título del pie, escritorio"), control: "length", fallback: "88px", advanced: true },

  // ── Buttons ───────────────────────────────────────────────────────────────
  {
    key: "button.variant",
    group: "buttons",
    label: L("Main button style", "Estilo del botón principal"),
    control: "enum",
    options: [
      { value: "fill", en: "Filled", es: "Relleno" },
      { value: "outline", en: "Outline", es: "Contorno" },
    ],
    fallback: "fill",
  },
  { key: "button.radius", group: "buttons", label: L("Button corners", "Esquinas del botón"), control: "length", fallback: "999px", bind: "radius" },
  { key: "button.height", group: "buttons", label: L("Button height", "Alto del botón"), control: "length", fallback: "48px" },
  { key: "button.padding-x", group: "buttons", label: L("Button side padding", "Relleno lateral"), control: "length", fallback: "22px", bind: "spacing" },
  { key: "button.font-size", group: "buttons", label: L("Button text size", "Texto del botón"), control: "length", fallback: "15px", advanced: true, bind: "font-size" },
  { key: "button.font-weight", group: "buttons", label: L("Button text weight", "Peso del texto"), control: "number", fallback: "600", advanced: true },
  { key: "button.compact-height", group: "buttons", label: L("Header button height", "Alto del botón del encabezado"), control: "length", fallback: "36px", advanced: true },
  { key: "button.compact-padding-x", group: "buttons", label: L("Header button padding", "Relleno del botón del encabezado"), control: "length", fallback: "16px", advanced: true },
  { key: "button.chip-height", group: "buttons", label: L("Small buttons and chips height", "Alto de botones pequeños"), control: "length", fallback: "34px", advanced: true },

  // ── Shape ────────────────────────────────────────────────────────────────
  { key: "shape.card-radius", group: "shape", label: L("Card corners", "Esquinas de tarjetas"), control: "length", fallback: "22px", bind: "radius" },
  { key: "shape.image-radius", group: "shape", label: L("Photo corners, phone", "Esquinas de fotos, móvil"), control: "length", fallback: "26px", bind: "radius" },
  { key: "shape.image-radius-desktop", group: "shape", label: L("Photo corners, desktop", "Esquinas de fotos, escritorio"), control: "length", fallback: "34px", bind: "radius" },
  { key: "shape.media-radius", group: "shape", label: L("Tile corners", "Esquinas de bloques"), control: "length", fallback: "20px", bind: "radius" },
  { key: "shape.rule-width", group: "shape", label: L("Line thickness", "Grosor de líneas"), control: "length", fallback: "1px" },
  { key: "shape.thumb-radius", group: "shape", label: L("Thumbnail corners", "Esquinas de miniaturas"), control: "length", fallback: "14px", advanced: true, bind: "radius" },
  { key: "shape.chip-radius", group: "shape", label: L("Chip corners", "Esquinas de etiquetas"), control: "length", fallback: "99px", advanced: true, bind: "radius" },
  { key: "shape.rail-radius", group: "shape", label: L("Menu rail corners", "Esquinas del menú lateral"), control: "length", fallback: "12px", advanced: true, bind: "radius" },
  { key: "shape.feature-radius", group: "shape", label: L("Portrait arch", "Arco del retrato"), control: "length", fallback: "140px", advanced: true, bind: "radius" },

  // ── Spacing ──────────────────────────────────────────────────────────────
  { key: "layout.section-pad-top", group: "spacing", label: L("Space above sections, desktop", "Espacio sobre secciones, escritorio"), control: "length", fallback: "84px", bind: "spacing" },
  { key: "layout.section-pad-top-phone", group: "spacing", label: L("Space above sections, phone", "Espacio sobre secciones, móvil"), control: "length", fallback: "40px", bind: "spacing" },
  { key: "layout.section-pad-bottom", group: "spacing", label: L("Space below sections, desktop", "Espacio bajo secciones, escritorio"), control: "length", fallback: "10px", advanced: true, bind: "spacing" },
  { key: "layout.section-pad-bottom-phone", group: "spacing", label: L("Space below sections, phone", "Espacio bajo secciones, móvil"), control: "length", fallback: "8px", advanced: true, bind: "spacing" },
  { key: "layout.gutter", group: "spacing", label: L("Side margins, desktop", "Márgenes laterales, escritorio"), control: "length", fallback: "48px", bind: "spacing" },
  { key: "layout.gutter-phone", group: "spacing", label: L("Side margins, phone", "Márgenes laterales, móvil"), control: "length", fallback: "18px", bind: "spacing" },
  { key: "layout.content-max-width", group: "spacing", label: L("Content max width", "Ancho máximo del contenido"), control: "length", fallback: "none", advanced: true },
  { key: "layout.header-pad-y", group: "spacing", label: L("Header height padding, desktop", "Relleno del encabezado, escritorio"), control: "length", fallback: "14px", advanced: true },
  { key: "layout.header-pad-y-phone", group: "spacing", label: L("Header height padding, phone", "Relleno del encabezado, móvil"), control: "length", fallback: "10px", advanced: true },
  { key: "layout.menu-rail-width", group: "spacing", label: L("Menu rail width", "Ancho del menú lateral"), control: "length", fallback: "240px", advanced: true },
  { key: "layout.menu-row-gap", group: "spacing", label: L("Menu row spacing", "Espacio entre filas del menú"), control: "length", fallback: "13px", advanced: true },
];

export const STYLE_TOKEN_KEYS: ReadonlySet<string> = new Set(STYLE_TOKEN_DEFS.map((d) => d.key));

export const STYLE_TOKEN_BY_KEY: ReadonlyMap<string, StyleTokenDef> = new Map(
  STYLE_TOKEN_DEFS.map((d) => [d.key, d]),
);

export function isStyleTokenKey(key: string): boolean {
  return STYLE_TOKEN_KEYS.has(key);
}

/** `type.hero-size` → `--token-type-hero-size`. */
export function styleTokenCssVar(key: string): string {
  return `--token-${key.replace(/\./g, "-")}`;
}

/**
 * Enum keys that also project as a `data-token-*` attribute, so the
 * stylesheet can switch whole rule sets (the type system, the button variant).
 */
export const STYLE_TOKEN_DATA_ATTRS: Readonly<Record<string, string>> = {
  "type.system": "data-token-type-system",
  "button.variant": "data-token-button-variant",
};

/** Keys projected as CSS vars (every non-attribute key). */
export const STYLE_TOKEN_VAR_NAMES: Readonly<Record<string, string>> = Object.fromEntries(
  STYLE_TOKEN_DEFS.filter((d) => !(d.key in STYLE_TOKEN_DATA_ATTRS)).map((d) => [d.key, styleTokenCssVar(d.key)]),
);

/** A CSS length / number / keyword / clamp(). No url(), no semicolons, no braces. */
const cssValue = z
  .string()
  .max(80)
  .regex(/^$|^[a-zA-Z0-9.,()\s%+-]+$/, "Invalid CSS value");

export function styleTokenValidator(def: StyleTokenDef): z.ZodType<string> {
  if (def.control === "enum") {
    const values = (def.options ?? []).map((o) => o.value);
    return z.string().refine((v) => v === "" || values.includes(v), "Invalid option");
  }
  return cssValue;
}

/** Group keys, in drawer order. */
export function styleTokensInGroup(group: StyleTokenGroup): ReadonlyArray<StyleTokenDef> {
  return STYLE_TOKEN_DEFS.filter((d) => d.group === group);
}

/**
 * One-tap presets per group (talent-facing: presets first, advanced collapsed).
 * A preset writes explicit values; "Design default" clears the group instead.
 */
export interface StyleTokenPreset {
  id: string;
  label: { en: string; es: string };
  tokens: Readonly<Record<string, string>>;
}

export const STYLE_TOKEN_PRESETS: Readonly<Record<StyleTokenGroup, ReadonlyArray<StyleTokenPreset>>> = {
  typography: [
    {
      id: "large",
      label: L("Bigger titles", "Títulos grandes"),
      tokens: { "type.hero-size": "54px", "type.hero-size-desktop": "112px", "type.section-title-size": "38px", "type.section-title-size-desktop": "66px" },
    },
    {
      id: "small",
      label: L("Quieter titles", "Títulos discretos"),
      tokens: { "type.hero-size": "40px", "type.hero-size-desktop": "72px", "type.section-title-size": "30px", "type.section-title-size-desktop": "44px" },
    },
  ],
  buttons: [
    { id: "pill", label: L("Pill", "Píldora"), tokens: { "button.radius": "999px" } },
    { id: "rounded", label: L("Rounded", "Redondeado"), tokens: { "button.radius": "12px" } },
    { id: "square", label: L("Square", "Cuadrado"), tokens: { "button.radius": "0px" } },
  ],
  shape: [
    {
      id: "round",
      label: L("Rounder", "Más redondo"),
      tokens: { "shape.card-radius": "32px", "shape.image-radius": "36px", "shape.image-radius-desktop": "48px", "shape.media-radius": "28px" },
    },
    {
      id: "sharp",
      label: L("Sharp", "Recto"),
      tokens: { "shape.card-radius": "0px", "shape.image-radius": "0px", "shape.image-radius-desktop": "0px", "shape.media-radius": "0px", "shape.thumb-radius": "0px", "shape.feature-radius": "0px" },
    },
  ],
  spacing: [
    {
      id: "airy",
      label: L("Airy", "Amplio"),
      tokens: { "layout.section-pad-top": "112px", "layout.section-pad-top-phone": "56px" },
    },
    {
      id: "compact",
      label: L("Compact", "Compacto"),
      tokens: { "layout.section-pad-top": "56px", "layout.section-pad-top-phone": "28px" },
    },
  ],
};

/**
 * "Reset to design default" for a group: every key in the group set to "",
 * which the resolver treats as not set, so the Design default shows again.
 */
export function resetStyleTokenGroup(
  draft: Readonly<Record<string, string>>,
  group: StyleTokenGroup,
): Record<string, string> {
  const out = { ...draft };
  for (const def of styleTokensInGroup(group)) out[def.key] = "";
  return out;
}

/** Apply a preset over the draft (only the preset's keys change). */
export function applyStyleTokenPreset(
  draft: Readonly<Record<string, string>>,
  preset: StyleTokenPreset,
): Record<string, string> {
  return { ...draft, ...preset.tokens };
}
