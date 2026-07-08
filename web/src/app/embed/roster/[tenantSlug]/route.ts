/**
 * Embeddable roster — Phase G PR 2.
 *
 * Returns a complete HTML document for iframe embedding on third-party
 * sites (an agency's own marketing site, a hub partner, a blog post).
 * Route handler instead of a page so we control the CSP headers and
 * skip the app shell entirely — no PublicHeader, no analytics, no
 * client-side hydration weight.
 *
 * URL: /embed/roster/<tenantSlug>
 * Headers: `Content-Security-Policy: frame-ancestors *` (allow any
 *          third-party site to embed) + cache-friendly.
 *
 * The companion `/embed.js` loader (in `app/embed.js/route.ts`) creates
 * the iframe with the right sandbox + listens for resize messages.
 */

import type { NextRequest } from "next/server";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { loadEmbedRoster } from "@/lib/embed/roster-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SAFE_NAME = /^[a-z0-9-]+$/;

/**
 * Letter-free line-art bust for the no-photo roster avatar. Inline so the embed
 * stays a single self-contained document. `currentColor` inherits the muted ink
 * set on `.avatar`, so it themes with light/dark automatically.
 */
const SILHOUETTE_SVG =
  '<svg class="avatar-silhouette" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
  '<circle cx="12" cy="8.2" r="3.6"/>' +
  '<path d="M4.6 19.4c0-3.7 3.2-6.2 7.4-6.2s7.4 2.5 7.4 6.2c0 .5-.4.8-.9.8H5.5c-.5 0-.9-.3-.9-.8Z"/>' +
  "</svg>";

interface RouteContext {
  params: Promise<{ tenantSlug: string }>;
}

export async function GET(request: NextRequest, ctx: RouteContext) {
  const { tenantSlug: rawSlug } = await ctx.params;
  const slug = String(rawSlug).toLowerCase().trim();
  if (!SAFE_NAME.test(slug)) {
    return new Response("Bad tenant slug", { status: 400 });
  }

  const scope = await getTenantPortalScopeBySlug(slug);
  if (!scope) {
    return new Response(notFoundHtml("Unknown workspace"), {
      status: 404,
      headers: htmlHeaders(),
    });
  }

  // Theme override via query — `?theme=dark` for dark embedders.
  const theme = request.nextUrl.searchParams.get("theme") === "dark" ? "dark" : "light";

  // Cap via query — host can request a smaller grid.
  const limit = (() => {
    const raw = Number(request.nextUrl.searchParams.get("limit"));
    if (!Number.isFinite(raw) || raw <= 0) return 24;
    return Math.min(48, Math.max(1, Math.trunc(raw)));
  })();

  const roster = await loadEmbedRoster(scope.tenantId, scope.displayName, slug, { limit });
  if (!roster) {
    return new Response(notFoundHtml("Could not load roster"), {
      status: 500,
      headers: htmlHeaders(),
    });
  }

  const baseHref = baseOrigin(request);
  return new Response(renderEmbedHtml({ roster, theme, baseHref }), {
    status: 200,
    headers: htmlHeaders(),
  });
}

/* ─── HTML response headers — allow embedding anywhere ──────────────── */

function htmlHeaders(): HeadersInit {
  return {
    "Content-Type": "text/html; charset=utf-8",
    // Allow being embedded by any third-party. CSP's frame-ancestors is
    // the modern way (X-Frame-Options is deprecated but still respected).
    "Content-Security-Policy": "frame-ancestors *;",
    "X-Frame-Options": "ALLOWALL",
    // Cache aggressively — roster doesn't change minute-to-minute.
    // CDN can cache 5 min; browser revalidates on focus.
    "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
  };
}

function baseOrigin(request: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
}

/* ─── HTML render ───────────────────────────────────────────────────── */

interface RenderArgs {
  roster: {
    tenantSlug: string;
    tenantName: string;
    entries: Array<{
      profileCode: string;
      displayName: string;
      imageUrl: string | null;
      publicRole: string | null;
      locality: string | null;
    }>;
    suggestedHeightPx: number;
  };
  theme: "light" | "dark";
  baseHref: string;
}

function renderEmbedHtml({ roster, theme, baseHref }: RenderArgs): string {
  const bg = theme === "dark" ? "#0B0B0D" : "#FCFBF7";
  const ink = theme === "dark" ? "#F5F4F0" : "#0B0B0D";
  const inkMuted = theme === "dark" ? "rgba(245,244,240,0.62)" : "rgba(11,11,13,0.62)";
  const cardBg = theme === "dark" ? "rgba(255,255,255,0.04)" : "#FFFFFF";
  const cardBorder = theme === "dark" ? "rgba(255,255,255,0.10)" : "rgba(11,11,13,0.08)";

  const cards = roster.entries.map((e) => {
    const profileUrl = `${baseHref}/t/${encodeURIComponent(e.profileCode)}`;
    // Real portrait when present; otherwise a letter-free line-art silhouette
    // (never initials-in-a-box). currentColor tints the mark to the muted ink.
    const avatarInner = e.imageUrl
      ? `<img class="avatar-img" src="${escapeAttr(e.imageUrl)}" alt="" loading="lazy" decoding="async">`
      : SILHOUETTE_SVG;
    return `<a class="card" href="${escapeAttr(profileUrl)}" target="_top" rel="noopener">
      <div class="avatar" aria-hidden>${avatarInner}</div>
      <div class="meta">
        <div class="name">${escapeHtml(e.displayName)}</div>
        ${e.publicRole ? `<div class="role">${escapeHtml(e.publicRole)}</div>` : ""}
        ${e.locality ? `<div class="loc">${escapeHtml(e.locality)}</div>` : ""}
      </div>
    </a>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(roster.tenantName)} roster</title>
<base target="_top">
<style>
  :root { color-scheme: ${theme}; }
  html, body { margin: 0; padding: 0; background: ${bg}; color: ${ink};
    font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif; }
  body { padding: 14px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
  .card { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 12px;
    background: ${cardBg}; border: 1px solid ${cardBorder}; color: inherit; text-decoration: none;
    transition: transform 120ms ease, border-color 120ms ease; }
  .card:hover { transform: translateY(-1px); border-color: ${ink}; }
  .avatar { width: 64px; height: 64px; border-radius: 999px; overflow: hidden;
    background: ${cardBg}; border: 1px solid ${cardBorder};
    display: inline-flex; align-items: center; justify-content: center;
    color: ${inkMuted}; }
  .avatar-img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 25%; display: block; }
  .avatar-silhouette { width: 42%; height: 42%; opacity: 0.55; }
  .meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .name { font-size: 14px; font-weight: 600; color: ${ink};
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .role { font-size: 12px; color: ${inkMuted}; text-transform: capitalize; }
  .loc { font-size: 11.5px; color: ${inkMuted}; }
  footer { margin-top: 20px; display: flex; flex-direction: column; align-items: center; gap: 8px;
    text-align: center; }
  .see-more { font-size: 13px; font-weight: 600; color: ${ink}; text-decoration: none;
    padding: 8px 14px; border-radius: 999px; border: 1px solid ${cardBorder};
    background: ${cardBg}; transition: border-color 120ms ease; }
  .see-more:hover { border-color: ${ink}; }
  .byline { font-size: 10.5px; color: ${inkMuted}; letter-spacing: 0.3px; }
  .byline a { color: inherit; text-decoration: underline; text-underline-offset: 2px; opacity: 0.85; }
  .byline a:hover { opacity: 1; }
  .empty { padding: 32px 12px; text-align: center; color: ${inkMuted}; font-size: 13px; }
</style>
</head>
<body data-embed-host>
  ${roster.entries.length === 0
    ? `<div class="empty">No talents are publicly listed yet.</div>`
    : `<div class="grid">${cards}</div>`}
  <footer>
    <a href="${escapeAttr(`${baseHref}/directory`)}" target="_top" rel="noopener" class="see-more">
      See the full ${escapeHtml(roster.tenantName)} roster &rarr;
    </a>
    <div class="byline">Powered by <a href="${escapeAttr(baseHref)}" target="_top" rel="noopener">Tulala</a></div>
  </footer>
<script>
(function () {
  // Phase G PR 2 — postMessage protocol with the host loader script.
  // The loader subscribes for 'tulala-embed-resize' messages and updates
  // the iframe height so the embed feels native (no inner scrollbar).
  function postSize() {
    var h = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    try {
      window.parent.postMessage({ type: "tulala-embed-resize", height: h, slug: ${JSON.stringify(roster.tenantSlug)} }, "*");
    } catch (e) { /* ignore */ }
  }
  window.addEventListener("load", postSize);
  window.addEventListener("resize", postSize);
  // Observe DOM changes — images load, fonts settle, content reflows.
  if (typeof ResizeObserver !== "undefined") {
    var ro = new ResizeObserver(postSize);
    ro.observe(document.body);
  }
})();
</script>
</body>
</html>`;
}

function notFoundHtml(message: string): string {
  return `<!doctype html><meta charset="utf-8"><title>${escapeHtml(message)}</title>
<style>body{font-family:Inter,system-ui;padding:24px;color:#666}</style>
<body><p>${escapeHtml(message)}</p></body>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]!);
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
