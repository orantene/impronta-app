/**
 * Talent site PUBLIC URL helpers (PURE, unit-tested, no runtime imports).
 *
 * A talent's site has two addresses:
 *   - the PATH address `/t/site/<slug>`, which is what exists today and stays
 *     the dev address and the redirect source, and
 *   - the HOST address `<slug>.tulala.digital`, which is what the site becomes
 *     once `TALENT_SITE_SUBDOMAINS_ENABLED` is on.
 *
 * Everything here is a pure string function so the host parser can be tested
 * against hostile input without a request. The parser is deliberately STRICT:
 * it accepts exactly ONE label under a known root and nothing else. A
 * multi-label host (`a.b.tulala.digital`) is rejected rather than silently
 * reduced, because reducing it would let `admin.acme.tulala.digital` resolve as
 * the talent site `admin`. Uppercase is rejected too: every caller normalizes
 * the host before it gets here (middleware lowercases in `normalize()`), so an
 * uppercase host at this boundary means an un-normalized caller, which is a bug
 * worth failing on rather than papering over.
 */

/** DNS label: 1..63 chars, alphanumeric ends, hyphens allowed inside. */
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Roots under which a single label addresses a talent site.
 * `lvh.me` resolves to 127.0.0.1 for every subdomain, which is how local dev and
 * the Playwright journeys reach `<slug>.lvh.me:3000` with no hosts-file edit.
 */
export const TALENT_SITE_SUBDOMAIN_ROOTS = ["tulala.digital", "lvh.me"] as const;

export type TalentSiteSubdomainRoot = (typeof TALENT_SITE_SUBDOMAIN_ROOTS)[number];

/** The production root — the one public URLs are built with. */
export const TALENT_SITE_PRIMARY_ROOT: TalentSiteSubdomainRoot =
  TALENT_SITE_SUBDOMAIN_ROOTS[0];

/** A parsed talent host: exactly one label under exactly one known root. */
export interface TalentSiteHostParts {
  label: string;
  root: TalentSiteSubdomainRoot;
}

/** Is `value` usable as a hostname label (and therefore as a site slug)? */
export function isTalentSiteLabel(value: string | null | undefined): boolean {
  const candidate = (value ?? "").trim();
  return candidate.length > 0 && candidate.length <= 63 && DNS_LABEL.test(candidate);
}

/**
 * The host a slug is served at, e.g. `sofia-mendez.tulala.digital`.
 * Returns null when the slug is not a usable label.
 */
export function talentSiteHost(
  slug: string | null | undefined,
  root: TalentSiteSubdomainRoot = TALENT_SITE_PRIMARY_ROOT,
): string | null {
  const label = (slug ?? "").trim();
  if (!isTalentSiteLabel(label)) return null;
  return `${label}.${root}`;
}

/**
 * The absolute public URL of a talent site, e.g.
 * `https://sofia-mendez.tulala.digital`. `pageSlug` appends an inner page.
 * Returns null when the slug is not a usable label, so a caller can fall back to
 * {@link talentSitePathUrl} rather than emitting a broken link.
 */
export function talentSitePublicUrl(
  slug: string | null | undefined,
  opts: {
    pageSlug?: string | null;
    root?: TalentSiteSubdomainRoot;
    /** Defaults to https; local journeys pass "http". */
    protocol?: "http" | "https";
    /** Local dev port, appended to the host when set. */
    port?: number | null;
  } = {},
): string | null {
  const host = talentSiteHost(slug, opts.root ?? TALENT_SITE_PRIMARY_ROOT);
  if (!host) return null;
  const protocol = opts.protocol ?? "https";
  const authority = opts.port ? `${host}:${opts.port}` : host;
  const page = (opts.pageSlug ?? "").trim();
  const path = page ? `/${encodeURIComponent(page)}` : "";
  return `${protocol}://${authority}${path}`;
}

/**
 * Today's PATH address of a talent site — `/t/site/<slug>` (plus `/<pageSlug>`).
 * This is what every URL emitter falls back to while the subdomain switch is
 * off, and what the subdomain redirects away from when it is on.
 */
export function talentSitePathUrl(
  slug: string | null | undefined,
  pageSlug?: string | null,
): string | null {
  const label = (slug ?? "").trim();
  if (!label) return null;
  const base = `/t/site/${encodeURIComponent(label)}`;
  const page = (pageSlug ?? "").trim();
  return page ? `${base}/${encodeURIComponent(page)}` : base;
}

/**
 * Parse a request host into `{ label, root }`, or null when it is not a talent
 * site host. Ports are stripped; a trailing dot (an absolute FQDN) is stripped.
 * Everything else must match exactly: one label, one known root, lowercase.
 */
export function splitTalentSiteHost(
  host: string | null | undefined,
): TalentSiteHostParts | null {
  const raw = (host ?? "").trim();
  if (!raw) return null;
  // Uppercase means an un-normalized caller — see the module note.
  if (raw !== raw.toLowerCase()) return null;

  // Strip the port. An IPv6 literal has no labels under our roots, so the
  // bracket form can be rejected outright.
  if (raw.startsWith("[")) return null;
  const withoutPort = raw.split(":")[0] ?? "";
  const hostname = withoutPort.endsWith(".")
    ? withoutPort.slice(0, -1)
    : withoutPort;
  if (!hostname) return null;

  for (const root of TALENT_SITE_SUBDOMAIN_ROOTS) {
    const suffix = `.${root}`;
    if (!hostname.endsWith(suffix)) continue;
    const label = hostname.slice(0, -suffix.length);
    // Exactly ONE label: no dots, and a real DNS label.
    if (label.includes(".")) return null;
    if (!isTalentSiteLabel(label)) return null;
    return { label, root };
  }
  return null;
}

/**
 * Should a `/t/site/<slug>` request be redirected to the subdomain?
 *
 * Pure so the decision is testable without a request: the route passes the two
 * environment facts in. Returns the absolute target, or null to keep serving the
 * path (switch off, not production, or an unusable slug). `preview` is carried
 * across so an owner's `?preview=draft` link keeps previewing after the hop.
 */
export function talentSitePathRedirectTarget(input: {
  slug: string | null | undefined;
  pageSlug?: string | null;
  /** The raw `preview` search param, if any. */
  preview?: string | null;
  enabled: boolean;
  isProduction: boolean;
  root?: TalentSiteSubdomainRoot;
}): string | null {
  if (!input.enabled || !input.isProduction) return null;
  const url = talentSitePublicUrl(input.slug, {
    pageSlug: input.pageSlug,
    root: input.root,
  });
  if (!url) return null;
  const preview = (input.preview ?? "").trim();
  return preview ? `${url}?preview=${encodeURIComponent(preview)}` : url;
}
