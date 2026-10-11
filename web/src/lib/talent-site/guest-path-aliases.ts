/**
 * GRK-028 / TUL-547 — Spanish (and English) guest URLs visitors type when the
 * CTA says "Agendar visita" / "Ver servicios" / "Contacto".
 *
 * These are not authored page slugs. They must land on the home page anchors
 * that already open booking / services / chat — never a generic English 404.
 * Pure map; the talent-site host page redirects before render.
 */

/** Guest path segment → in-site home hash (host-root grammar). */
export const TALENT_GUEST_PATH_ALIASES: Readonly<Record<string, string>> = {
  agendar: "/#book",
  book: "/#book",
  booking: "/#book",
  servicios: "/#services",
  services: "/#services",
  contacto: "/#talent-ask",
  contact: "/#talent-ask",
};

/** Locale-aware home + hash when the visitor is under `/en` (or another secondary). */
export function talentGuestAliasTarget(
  segment: string | null | undefined,
  opts?: { localePrefix?: string | null },
): string | null {
  const key = (segment ?? "").trim().toLowerCase();
  if (!key) return null;
  const hashPath = TALENT_GUEST_PATH_ALIASES[key];
  if (!hashPath) return null;
  const prefix = (opts?.localePrefix ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (!prefix) return hashPath;
  // `/en` + `#book` → `/en#book` (not `/en/#book` — matches homeAnchorHref style).
  const hash = hashPath.startsWith("/#") ? hashPath.slice(1) : hashPath;
  return `/${prefix}${hash}`;
}
