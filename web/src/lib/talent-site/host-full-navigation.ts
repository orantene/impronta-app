/**
 * TUL-516 / TUL-322 — talent_site hosts share the `/_talent-site` App Router
 * path. A soft navigation that lands on a different hostname can paint the
 * previous talent under the new URL until a hard reload. Host changes must
 * force a full document navigation.
 *
 * Pure helpers only — no DOM, no Next router. The client guard and static
 * tests pin the contract.
 */

import { absoluteHttpHost } from "./canonical-own-host";

/** Lower-cased hostname, empty string when blank. */
export function normalizeHostname(host: string | null | undefined): string {
  return (host ?? "").trim().toLowerCase();
}

/**
 * True when `href` names a different http(s) host than `currentHost`.
 * Relative paths, hashes, mailto/tel, and unparseable values stay soft-safe
 * (same host). Protocol-relative `//host/...` counts as a host change.
 */
export function hrefRequiresFullNavigation(
  currentHost: string,
  href: string | null | undefined,
): boolean {
  const here = normalizeHostname(currentHost);
  if (!here || !href) return false;
  const raw = href.trim();
  if (!raw || raw.startsWith("#") || raw.startsWith("?") || raw.startsWith("/")) {
    // Same-origin relative: soft nav is fine (same talent_site host).
    if (!raw.startsWith("//")) return false;
  }
  const absolute = raw.startsWith("//") ? `https:${raw}` : raw;
  const target = absoluteHttpHost(absolute);
  if (!target) return false;
  return target !== here;
}

/**
 * True when the proxy-served host stamped into the RSC tree does not match
 * the browser location — the soft-nav stale-talent symptom. Caller reloads.
 */
export function servedHostMismatch(
  servedHost: string | null | undefined,
  browserHost: string | null | undefined,
): boolean {
  const served = normalizeHostname(servedHost);
  const browser = normalizeHostname(browserHost);
  if (!served || !browser) return false;
  return served !== browser;
}
