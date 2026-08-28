/**
 * tenant-fonts.ts — the pure model for TENANT-UPLOADED brand fonts.
 *
 * A licensed brand face (woff2/woff) is uploaded by workspace staff, stored in
 * the tenant's own storage prefix (`tenant/<id>/fonts/…` in `media-public` —
 * the reaper-protected tenant-assets lane), and described by a metadata list
 * kept in `agency_branding.theme_json.custom_fonts`. That row is already the
 * public-readable, cache-tagged source the storefront <head> reads for every
 * other branding concern, so custom fonts ride the same read (no migration, no
 * second query, busted by the same `branding` tag on every write).
 *
 * This module is PURE (no network, no React): parsing/serializing the
 * theme_json shape, the validation rules the upload action enforces (magic
 * bytes, size, count), and the `@font-face` CSS the storefront emits. The I/O
 * lives in `lib/server-actions/admin-tenant-fonts.ts`; the render side in
 * `app/tenant-font-faces.tsx`.
 *
 * ABUSE POSTURE (uploads are public binary files)
 * ───────────────────────────────────────────────
 *   • only woff2/woff, proven by MAGIC BYTES + a plausible sfnt flavor, never
 *     by extension or client MIME;
 *   • 2 MB per file and 12 files per tenant — storage cannot become a CDN;
 *   • stored under a server-minted UUID name with a font content-type, so an
 *     uploaded file can never be replayed as HTML/JS from our origin.
 */

import type { BuilderFontCategory } from "./fonts-registry";
import { fallbackForBuilderFontCategory } from "./fonts-registry";

export const TENANT_FONT_MAX_BYTES = 2 * 1024 * 1024;
export const TENANT_FONT_MAX_FILES = 12;
export const THEME_JSON_CUSTOM_FONTS_KEY = "custom_fonts";

export type TenantFontFormat = "woff2" | "woff";
export type TenantFontStyle = "normal" | "italic";

export interface TenantFontFile {
  /** Storage object key inside the media-public bucket. */
  path: string;
  /** Fully-qualified public URL the @font-face src points at. */
  url: string;
  format: TenantFontFormat;
  /** 1–1000. A range like [300, 800] marks a variable file. */
  weight: number | [number, number];
  style: TenantFontStyle;
  bytes: number;
}

export interface TenantFontFamily {
  family: string;
  category: BuilderFontCategory;
  files: TenantFontFile[];
}

// ── Validation ─────────────────────────────────────────────────────────────

/** Display-name rule: letters/digits/spaces/hyphens, 1–64 chars, no quotes. */
export function sanitizeTenantFontFamilyName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 64) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} \-]*$/u.test(name)) return null;
  return name;
}

const VALID_CATEGORIES: ReadonlySet<string> = new Set([
  "sans",
  "serif",
  "display",
  "script",
  "mono",
]);

export function isTenantFontCategory(value: unknown): value is BuilderFontCategory {
  return typeof value === "string" && VALID_CATEGORIES.has(value);
}

export function isValidTenantFontWeight(weight: number): boolean {
  return Number.isInteger(weight) && weight >= 1 && weight <= 1000;
}

/**
 * Prove the bytes ARE a web font. woff2 opens `wOF2`, woff opens `wOFF`; both
 * carry the wrapped sfnt flavor at bytes 4–8, which must be TrueType
 * (0x00010000), CFF (`OTTO`) or the legacy Apple `true` tag. Anything else —
 * whatever the filename says — is refused.
 */
export function sniffTenantFontFormat(bytes: Uint8Array): TenantFontFormat | null {
  if (bytes.length < 8) return null;
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (tag !== "wOF2" && tag !== "wOFF") return null;
  const flavor = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  const validFlavor =
    flavor === "OTTO" || flavor === "true" || (bytes[4] === 0 && bytes[5] === 1 && bytes[6] === 0 && bytes[7] === 0);
  if (!validFlavor) return null;
  return tag === "wOF2" ? "woff2" : "woff";
}

// ── theme_json (de)serialization — defensive, never throws ─────────────────

function parseWeight(value: unknown): TenantFontFile["weight"] | null {
  if (typeof value === "number" && isValidTenantFontWeight(value)) return value;
  if (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    isValidTenantFontWeight(value[0]) &&
    isValidTenantFontWeight(value[1]) &&
    value[0] < value[1]
  ) {
    return [value[0], value[1]];
  }
  return null;
}

function parseFile(value: unknown): TenantFontFile | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const weight = parseWeight(record.weight);
  if (
    typeof record.path !== "string" ||
    typeof record.url !== "string" ||
    (record.format !== "woff2" && record.format !== "woff") ||
    (record.style !== "normal" && record.style !== "italic") ||
    weight === null
  ) {
    return null;
  }
  return {
    path: record.path,
    url: record.url,
    format: record.format,
    weight,
    style: record.style,
    bytes: typeof record.bytes === "number" ? record.bytes : 0,
  };
}

/** Read `theme_json.custom_fonts`. Malformed entries are dropped, not thrown. */
export function parseTenantFonts(
  themeJson: Record<string, unknown> | null | undefined,
): TenantFontFamily[] {
  const raw = themeJson?.[THEME_JSON_CUSTOM_FONTS_KEY];
  if (!Array.isArray(raw)) return [];
  const families: TenantFontFamily[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const family =
      typeof record.family === "string" ? sanitizeTenantFontFamilyName(record.family) : null;
    if (!family) continue;
    const category = isTenantFontCategory(record.category) ? record.category : "sans";
    const files = Array.isArray(record.files)
      ? record.files.map(parseFile).filter((f): f is TenantFontFile => f !== null)
      : [];
    if (files.length === 0) continue;
    families.push({ family, category, files });
  }
  return families;
}

/** The value to write back to `theme_json.custom_fonts`. */
export function serializeTenantFonts(families: ReadonlyArray<TenantFontFamily>): unknown {
  return families.map((f) => ({
    family: f.family,
    category: f.category,
    files: f.files.map((file) => ({ ...file })),
  }));
}

export function countTenantFontFiles(families: ReadonlyArray<TenantFontFamily>): number {
  return families.reduce((sum, f) => sum + f.files.length, 0);
}

// ── Render side ────────────────────────────────────────────────────────────

/** The stored font-family value for a custom family: real fallback included. */
export function tenantFontCssFamily(family: TenantFontFamily): string {
  return `"${family.family}", ${fallbackForBuilderFontCategory(family.category)}`;
}

function cssEscapeFamily(name: string): string {
  return name.replace(/\\/g, "").replace(/"/g, "");
}

/**
 * The `@font-face` block for every uploaded face. `font-display: swap` keeps
 * text visible on a slow load; a `[min, max]` weight emits the variable-font
 * range descriptor so one file serves every weight between.
 */
export function tenantFontFacesCss(families: ReadonlyArray<TenantFontFamily>): string {
  const rules: string[] = [];
  for (const family of families) {
    const name = cssEscapeFamily(family.family);
    for (const file of family.files) {
      const weight = Array.isArray(file.weight)
        ? `${file.weight[0]} ${file.weight[1]}`
        : `${file.weight}`;
      rules.push(
        `@font-face{font-family:"${name}";src:url("${file.url}") format("${file.format}");` +
          `font-weight:${weight};font-style:${file.style};font-display:swap;}`,
      );
    }
  }
  return rules.join("\n");
}

/**
 * The files worth preloading: the faces of families bound to the theme's
 * heading/body tokens (those always paint above the fold), regular upright
 * first, woff2 only. Everything else loads via the stylesheet when used.
 */
export function tenantFontPreloadUrls(
  families: ReadonlyArray<TenantFontFamily>,
  tokens: Readonly<Record<string, string>> | null | undefined,
): string[] {
  if (!tokens) return [];
  const bound = new Set<string>();
  for (const key of ["typography.heading-font-family", "typography.body-font-family"]) {
    const value = tokens[key];
    if (!value) continue;
    const match = value.match(/^"?([^",]+)"?/);
    if (match) bound.add(match[1].trim().toLowerCase());
  }
  if (bound.size === 0) return [];
  const urls: string[] = [];
  for (const family of families) {
    if (!bound.has(family.family.toLowerCase())) continue;
    const upright = family.files.filter((f) => f.style === "normal" && f.format === "woff2");
    const best =
      upright.find((f) => Array.isArray(f.weight) || f.weight === 400) ?? upright[0];
    if (best) urls.push(best.url);
  }
  return urls;
}
