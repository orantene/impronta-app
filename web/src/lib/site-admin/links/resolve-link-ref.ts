/**
 * Phase 6C — the ONE source of truth that turns a `LinkRef` into a
 * correct, context-aware href. Replaces ad-hoc per-section
 * `prefixPublicHref` calls.
 *
 * Pure + synchronous + deployment-agnostic. The canonical app host
 * (for `app-dashboard`) is passed in via `ctx.appHostOrigin` — callers
 * resolve it from `getCanonicalAppHostOrigin()` and hand it in, so this
 * resolver stays pure/testable and nothing is hardcoded.
 *
 * The Finding-B fix lives here: `platform-auth-*` kinds resolve to the
 * ROOT `(auth)` path and are NEVER tenant-prefixed, regardless of
 * whether the storefront is path-based (`/impronta`) or host-based.
 */

import { prefixPublicHref } from "@/lib/saas/public-hrefs";
import type { LinkRef } from "./link-ref";
import { coerceLegacyHref } from "./link-ref";

export interface LinkResolveCtx {
  /** Tenant public path prefix: `/impronta` (path-based) or `""`
   *  (host-based custom domain / subdomain). */
  pathPrefix: string;
  tenantId?: string | null;
  /** Canonical app-host origin (e.g. https://app.tulala.digital) from
   *  `getCanonicalAppHostOrigin()`. Null → app links degrade to a
   *  root-absolute path rather than a broken URL. */
  appHostOrigin?: string | null;
}

export interface ResolvedLink {
  href: string;
  external: boolean;
  openInNew: boolean;
  /** Set when openInNew/external so callers can spread it onto <a>. */
  rel?: string;
}

function withQuery(base: string, raw?: string): string {
  const q = (raw ?? "").trim();
  if (!q) return base;
  const qs = q.startsWith("?") ? q.slice(1) : q;
  if (!qs) return base;
  return `${base}${base.includes("?") ? "&" : "?"}${qs}`;
}

function finalize(
  href: string,
  ref: LinkRef,
  kindExternal: boolean,
  kindOpenInNew: boolean,
): ResolvedLink {
  const external = ref.external ?? kindExternal;
  const openInNew = ref.openInNew ?? kindOpenInNew;
  const out: ResolvedLink = { href, external, openInNew };
  if (external || openInNew) out.rel = "noopener noreferrer";
  return out;
}

export function resolveLinkRef(ref: LinkRef, ctx: LinkResolveCtx): ResolvedLink {
  const prefix = ctx.pathPrefix ?? "";
  const v = (ref.value ?? "").trim();

  switch (ref.kind) {
    case "tenant-page": {
      const path = v || "/";
      return finalize(prefixPublicHref(path, prefix), ref, false, false);
    }
    case "tenant-directory": {
      return finalize(prefixPublicHref(withQuery("/directory", v), prefix), ref, false, false);
    }
    case "talent-profile": {
      const code = v.replace(/^\/t\//, "").replace(/^\/+/, "");
      return finalize(prefixPublicHref(`/t/${code}`, prefix), ref, false, false);
    }
    case "inquiry-start": {
      return finalize(prefixPublicHref(withQuery("/contact", v), prefix), ref, false, false);
    }
    case "platform-auth-login": {
      // ROOT (auth) route — NEVER tenant-prefixed. The Finding-B fix.
      const path = v.startsWith("/") ? v : "/login";
      return finalize(path, ref, false, false);
    }
    case "platform-auth-register": {
      // value (if any) = role. ROOT route, never tenant-prefixed.
      const role = v && !v.startsWith("/") ? v : "";
      return finalize(withQuery("/register", role ? `role=${encodeURIComponent(role)}` : ""), ref, false, false);
    }
    case "app-dashboard": {
      const path = v.startsWith("/") ? v : `/${v || ""}` || "/";
      const origin = (ctx.appHostOrigin ?? "").replace(/\/+$/, "");
      // No origin → degrade to a root-absolute path (never a broken URL).
      return finalize(origin ? `${origin}${path}` : path, ref, true, true);
    }
    case "external-url": {
      return finalize(v, ref, true, true);
    }
    case "mailto": {
      return finalize(`mailto:${v.replace(/^mailto:/i, "")}`, ref, false, false);
    }
    case "tel": {
      return finalize(`tel:${v.replace(/^tel:/i, "").replace(/\s+/g, "")}`, ref, false, false);
    }
    case "whatsapp": {
      const isUrl = /^(https?:)?\/\//i.test(v) || /^whatsapp:/i.test(v);
      const href = isUrl ? v : `https://wa.me/${v.replace(/[^\d]/g, "")}`;
      return finalize(href, ref, true, true);
    }
    case "anchor": {
      return finalize(v.startsWith("#") ? v : `#${v}`, ref, false, false);
    }
    case "media": {
      return finalize(v, ref, false, true);
    }
    default: {
      // Exhaustiveness guard — unknown kind degrades safely to a
      // tenant-prefixed path rather than throwing in a render path.
      const _exhaustive: never = ref.kind;
      void _exhaustive;
      return finalize(prefixPublicHref(v || "/", prefix), ref, false, false);
    }
  }
}

/** Convenience: accept a LinkRef OR a legacy string, then resolve. */
export function resolveLinkLike(
  value: LinkRef | string | null | undefined,
  ctx: LinkResolveCtx,
): ResolvedLink {
  const ref: LinkRef =
    value && typeof value === "object" ? value : coerceLegacyHref(value ?? "");
  return resolveLinkRef(ref, ctx);
}
