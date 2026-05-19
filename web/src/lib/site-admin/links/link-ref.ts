/**
 * Phase 6C — Link / Route System (the LinkRef model).
 *
 * Problem (route-safety "Finding B"): section CTAs/nav persist a flat
 * `href` string. At render `prefixPublicHrefsDeep` blindly tenant-
 * prefixes every internal `/…` href — so `/login` (a ROOT `(auth)`
 * route, NOT tenant-scoped) becomes `/impronta/login` → 404, and there
 * is no way to express "this goes to platform auth" vs "this is a
 * tenant page". The flat string loses the operator's intent.
 *
 * Fix: persist a structured `LinkRef { kind, value?, … }`. A single
 * `resolveLinkRef` (see ./resolve-link-ref) turns it into a correct href
 * for the current host/path/domain/auth context — one source of truth,
 * replacing ad-hoc per-section `prefixPublicHref`.
 *
 * Backward compatibility (the plan's mandated migration path): schemas
 * accept BOTH a `LinkRef` object AND a legacy plain string, the string
 * being coerced via `coerceLegacyHref`. Existing compositions keep
 * working untouched; coercion also auto-upgrades legacy auth hrefs to
 * the safe `platform-auth-*` kinds (structurally fixing Finding B for
 * data already in the wild). New editor writes persist `LinkRef`.
 *
 * Reusable + deployment-agnostic: no hardcoded hosts/tenants. The app
 * host for `app-dashboard` is supplied by the caller (resolved from
 * `getCanonicalAppHostOrigin()`), never baked in.
 */

import { z } from "zod";

/** Per plan §7. Ordered roughly by frequency. */
export const LINK_KINDS = [
  "tenant-page", // value = path/slug — tenant-prefix-aware
  "tenant-directory", // value = optional querystring filter
  "talent-profile", // value = profile code/slug
  "inquiry-start", // value = optional prefill querystring
  "platform-auth-login", // value? = specific (auth) path; default /login — ROOT, never tenant-prefixed
  "platform-auth-register", // value? = role (talent|client) — ROOT
  "app-dashboard", // value = path on the canonical app host (absolute)
  "external-url", // value = absolute URL
  "mailto", // value = email address
  "tel", // value = phone number
  "whatsapp", // value = number or wa.me URL
  "anchor", // value = #id (same page)
  "media", // value = asset URL (download)
] as const;

export type LinkKind = (typeof LINK_KINDS)[number];

export const linkRefSchema = z.object({
  kind: z.enum(LINK_KINDS),
  /** Kind-specific payload (path / slug / email / role / url / #id…). */
  value: z.string().max(2048).optional(),
  /** Optional display label (the section decides whether to use it). */
  label: z.string().max(120).optional(),
  /** Force external semantics (rel=noopener). Usually derived from kind. */
  external: z.boolean().optional(),
  /** Open in a new tab. Usually derived from kind. */
  openInNew: z.boolean().optional(),
});

export type LinkRef = z.infer<typeof linkRefSchema>;

/**
 * Root `(auth)` routes — NOT tenant-scoped (mirrors
 * `surface-allow-list.ts` AUTH_PREFIXES). Kept as a local constant so
 * this pure module has no cross-package import; the set is small +
 * stable. Coercing any of these to a `platform-auth-*` kind is exactly
 * what fixes Finding B for legacy data.
 */
const AUTH_LOGIN_PATHS = ["/login", "/forgot-password", "/update-password", "/auth"];
const AUTH_REGISTER_PATHS = ["/register", "/join", "/talent/register", "/client/register"];

function pathStartsWith(pathname: string, list: readonly string[]): string | null {
  for (const p of list) {
    if (pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(`${p}?`)) {
      return p;
    }
  }
  return null;
}

/**
 * True when an internal href targets a ROOT `(auth)` route — these are
 * NEVER tenant-scoped (a tenant page cannot live at `/login`). Single
 * source of truth for auth-root detection, shared by `coerceLegacyHref`
 * here AND `prefixPublicHref` (so the deep tenant-prefixer can't 404
 * `/login` → `/impronta/login`). Scheme/external/anchor are not auth.
 */
export function isPlatformAuthPath(hrefRaw: string | null | undefined): boolean {
  const href = (hrefRaw ?? "").trim();
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  const pathname = href.split(/[?#]/)[0] || "/";
  return (
    pathStartsWith(pathname, AUTH_LOGIN_PATHS) !== null ||
    pathStartsWith(pathname, AUTH_REGISTER_PATHS) !== null
  );
}

/**
 * Legacy plain-string href → structured LinkRef. Minimal + predictable:
 * scheme/anchor/external/talent/AUTH routes are special-cased; every
 * other internal path stays a `tenant-page` (unchanged behavior). The
 * AUTH special-casing is the structural Finding-B fix for existing data.
 */
export function coerceLegacyHref(hrefRaw: string | null | undefined): LinkRef {
  const href = (hrefRaw ?? "").trim();
  if (!href) return { kind: "tenant-page", value: "/" };

  if (/^mailto:/i.test(href)) {
    return { kind: "mailto", value: href.replace(/^mailto:/i, "") };
  }
  if (/^tel:/i.test(href)) {
    return { kind: "tel", value: href.replace(/^tel:/i, "") };
  }
  if (href.startsWith("#")) return { kind: "anchor", value: href };
  if (/^(https?:)?\/\/(wa\.me|api\.whatsapp\.com)\//i.test(href) || /^whatsapp:/i.test(href)) {
    return { kind: "whatsapp", value: href };
  }
  if (/^https?:\/\//i.test(href)) {
    return { kind: "external-url", value: href, external: true, openInNew: true };
  }
  if (href.startsWith("/t/")) {
    return { kind: "talent-profile", value: href.slice("/t/".length) };
  }

  // Internal path — split off query/hash for AUTH detection.
  const pathname = href.split(/[?#]/)[0] || "/";

  if (pathStartsWith(pathname, AUTH_LOGIN_PATHS)) {
    // Preserve the exact auth path (login / forgot-password / …) as the
    // value so the resolver emits it root-absolute, never tenant-prefixed.
    return { kind: "platform-auth-login", value: href };
  }
  if (pathStartsWith(pathname, AUTH_REGISTER_PATHS)) {
    const role =
      /(^|\/)talent(\/|$)/.test(pathname) || pathname.startsWith("/join")
        ? "talent"
        : /(^|\/)client(\/|$)/.test(pathname)
          ? "client"
          : "";
    // Also honor an explicit ?role= in the legacy string.
    const qs = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
    const explicitRole = new URLSearchParams(qs).get("role") ?? "";
    return { kind: "platform-auth-register", value: explicitRole || role };
  }

  return { kind: "tenant-page", value: href };
}

/**
 * Schema fragment for section schemas: accept a structured LinkRef OR a
 * legacy string (auto-coerced). Drop-in replacement for `z.string()`
 * href fields — existing data validates + upgrades transparently.
 */
export const linkRefOrLegacy = z
  .union([linkRefSchema, z.string()])
  .transform((v): LinkRef => (typeof v === "string" ? coerceLegacyHref(v) : v))
  // 6C — `@linkref` marker so the auto-bound `ZodSchemaForm` inspector
  // (zod-introspect) renders a structured `LinkKindPicker` for this
  // field instead of the legacy string `LinkPicker`. Inert for
  // hand-written editors + parsing; metadata only. Mirrors the existing
  // `@rich` describe-marker convention.
  .describe("@linkref");

/** Same, but optional (for optional CTA fields). */
export const optionalLinkRefOrLegacy = linkRefOrLegacy.optional();
