/**
 * Ticket #201 — an explicit `talent_pages.canonical_url` may only name the
 * site's OWN host. A cloned page row once carried another talent's real URL
 * and the QA site canonicalised to it. Pure: no I/O, no server graph.
 */

import { talentSiteHost } from "./site-public-url";

export interface OwnCanonicalHosts {
  /** The origin the built canonical uses (its host is always own). */
  origin: string;
  /** The site's other hosts: custom domains, platform subdomain. */
  hosts: readonly string[];
}

/** Lower-cased hostname (port ignored, `www.` kept) of an absolute http(s) URL, else null. */
export function absoluteHttpHost(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

function bareHost(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return absoluteHttpHost(/^https?:\/\//i.test(v) ? v : `https://${v}`);
}

export function isOwnCanonical(explicit: string, own: OwnCanonicalHosts): boolean {
  const host = absoluteHttpHost(explicit);
  if (!host) return false;
  const allowed = new Set<string>();
  for (const h of [own.origin, ...own.hosts]) {
    const b = bareHost(h);
    if (b) allowed.add(b);
  }
  return allowed.has(host);
}

/**
 * The platform subdomain a talent site is served at (`<site_slug>.tulala.digital`,
 * `<site_slug>-demo.tulala.digital` for demos), built by the SAME helper the
 * public URL uses so the root is the project's real config. Empty when the slug
 * is not a usable host label.
 */
export function platformSiteHosts(
  siteSlug: string | null | undefined,
  opts: { isDemo?: boolean } = {},
): string[] {
  const host = talentSiteHost(siteSlug, undefined, { isDemo: opts.isDemo === true });
  return host ? [host] : [];
}
