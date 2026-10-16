import type { ShareLang } from "./captions";

/** Pure model behind the share images and the printable card. */
export type ShareFormat = "story" | "post";
export type ShareStyle = "theme" | "bold" | "photo";

export const SHARE_SIZES: Record<ShareFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  post: { width: 1080, height: 1080 },
};

export type ShareColors = { bg: string; ink: string; accent: string };

/** Fallback when the site theme is not available: neutral ink on warm paper. */
export const DEFAULT_SHARE_COLORS: ShareColors = { bg: "#FAF7F2", ink: "#1B1B1B", accent: "#1E3A2D" };

const HEX = /^#[0-9a-f]{6}$/i;
export function safeHex(v: unknown, fallback: string): string {
  const s = typeof v === "string" ? (v.startsWith("#") ? v : `#${v}`) : "";
  return HEX.test(s) ? s.toLowerCase() : fallback;
}

export function sanitizeColors(c: Partial<Record<keyof ShareColors, unknown>> | null | undefined): ShareColors {
  return {
    bg: safeHex(c?.bg, DEFAULT_SHARE_COLORS.bg),
    ink: safeHex(c?.ink, DEFAULT_SHARE_COLORS.ink),
    accent: safeHex(c?.accent, DEFAULT_SHARE_COLORS.accent),
  };
}

export function parseFormat(v: unknown): ShareFormat | null {
  return v === "story" || v === "post" ? v : null;
}
export function parseStyle(v: unknown): ShareStyle {
  return v === "bold" || v === "photo" ? v : "theme";
}
export function parseLang(v: unknown, fallback: ShareLang = "es"): ShareLang {
  return v === "en" || v === "es" ? v : fallback;
}

/** Only https images are painted; anything else falls back to the bold style. */
export function resolveStyle(style: ShareStyle, photoUrl: string | null | undefined): ShareStyle {
  return style === "photo" && !/^https:\/\//i.test(photoUrl ?? "") ? "bold" : style;
}

/** Per-style palette actually painted. */
export function stylePalette(style: ShareStyle, c: ShareColors): { bg: string; fg: string; accent: string; accentFg: string } {
  if (style === "bold") return { bg: c.accent, fg: "#ffffff", accent: "#ffffff", accentFg: c.accent };
  if (style === "photo") return { bg: "#000000", fg: "#ffffff", accent: c.bg, accentFg: c.ink };
  return { bg: c.bg, fg: c.ink, accent: c.accent, accentFg: "#ffffff" };
}

export const SHARE_COPY: Record<ShareLang, { cta: string; scan: string; printTitle: string; printSub: string }> = {
  es: { cta: "Reserva aquí", scan: "Escanea y reserva", printTitle: "Escanea y reserva", printSub: "con tu descuento" },
  en: { cta: "Book here", scan: "Scan to book", printTitle: "Scan and book", printSub: "with your discount" },
};

/** Display handle for the footer: the URL without scheme and query. */
export function displayUrl(link: string): string {
  try {
    const u = new URL(link);
    return `${u.host}${u.pathname}`.replace(/\/$/, "");
  } catch {
    return link;
  }
}

/** pdf-lib's standard fonts are WinAnsi: drop what they cannot encode (emoji, dashes). */
export function pdfSafe(text: string): string {
  return text
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E¡-ÿ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
