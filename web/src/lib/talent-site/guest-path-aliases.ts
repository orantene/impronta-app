/**
 * GRK-028 / TUL-547 — Spanish (and English) guest URLs visitors type when the
 * CTA says "Agendar visita" / "Ver servicios" / "Contacto".
 *
 * These are not authored page slugs. They must land on the home page anchors
 * that already open booking / services / chat — never a generic English 404.
 * Pure map; the talent-site host page redirects before render.
 */

import { parseServiceSlug } from "./service-page";

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

export type TalentGuestServiceAlias =
  | { kind: "redirect"; path: string }
  | { kind: "miss" };

/**
 * TUL-586: `/servicios/<slug>` and `/services/<slug>` (with or without a
 * locale prefix) are guessed twins of the canonical service URL
 * `/servicio-<title>-<id8>`. A valid slug redirects there (308); anything else
 * under those segments is a miss (normal 404), never a silent landing on home.
 * `innerPath` is the locale-stripped path. Bare `/servicios` returns null so
 * the generic `/#services` alias still applies.
 */
export function talentGuestServiceAlias(
  innerPath: string,
  opts?: { localePrefix?: string | null },
): TalentGuestServiceAlias | null {
  const segs = innerPath.split("/").filter(Boolean);
  const head = (segs[0] ?? "").toLowerCase();
  if ((head !== "servicios" && head !== "services") || segs.length < 2) return null;
  if (segs.length > 2 || !parseServiceSlug(segs[1])) return { kind: "miss" };
  const prefix = (opts?.localePrefix ?? "").trim().replace(/^\/+|\/+$/g, "");
  return { kind: "redirect", path: `${prefix ? `/${prefix}` : ""}/${segs[1].toLowerCase()}` };
}
