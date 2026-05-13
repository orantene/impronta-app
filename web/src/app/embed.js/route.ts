/**
 * Tulala embed loader — Phase G PR 2.
 *
 * Served at `/embed.js`. Partners drop this on their site:
 *
 *   <div data-tulala-embed="roster" data-tenant="impronta" data-theme="light"></div>
 *   <script async src="https://app.tulala.digital/embed.js"></script>
 *
 * The loader finds matching elements, replaces each with an <iframe>
 * pointing at /embed/roster/<tenant> and listens for postMessage
 * resize events so the embed feels native (no inner scrollbar).
 *
 * Returns plain JS (text/javascript). Cache-friendly with a stable URL
 * so partners can hash-pin if they want.
 */

import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic"; // baseHref depends on request host
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  const baseHref = ((): string => {
    const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
    if (fromEnv) return fromEnv.replace(/\/$/, "");
    const u = new URL(request.url);
    return `${u.protocol}//${u.host}`;
  })();

  const js = renderLoaderJs(baseHref);

  return new Response(js, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      // The script itself doesn't need framing protections — it's executed
      // inline on partner pages.
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function renderLoaderJs(baseHref: string): string {
  // Single-quote / escape everything carefully — this is a JS string that
  // becomes JS source on the wire.
  const baseLiteral = JSON.stringify(baseHref);
  return `/* Tulala embed loader — generated. Do not edit. */
(function () {
  "use strict";
  var BASE = ${baseLiteral};
  var SAFE_SLUG = /^[a-z0-9-]+$/;
  var SAFE_THEME = /^(light|dark)$/;
  var INSTANCES = new Map(); // iframeEl -> { slug }

  function buildIframeSrc(slug, theme, limit) {
    var qs = [];
    if (theme && SAFE_THEME.test(theme)) qs.push("theme=" + encodeURIComponent(theme));
    if (limit && /^[0-9]+$/.test(String(limit))) qs.push("limit=" + encodeURIComponent(limit));
    var suffix = qs.length ? "?" + qs.join("&") : "";
    return BASE + "/embed/roster/" + encodeURIComponent(slug) + suffix;
  }

  function mountOne(host) {
    if (host.getAttribute("data-tulala-embed-mounted") === "1") return;
    var kind = host.getAttribute("data-tulala-embed") || "roster";
    if (kind !== "roster") return; // future: events, pitches, etc.

    var slug = (host.getAttribute("data-tenant") || "").toLowerCase().trim();
    if (!SAFE_SLUG.test(slug)) {
      host.setAttribute("data-tulala-embed-error", "bad-slug");
      return;
    }

    var theme = (host.getAttribute("data-theme") || "light").toLowerCase().trim();
    var limit = host.getAttribute("data-limit") || "";
    var height = parseInt(host.getAttribute("data-initial-height") || "", 10);
    if (!height || height < 100) height = 480;

    var iframe = document.createElement("iframe");
    iframe.src = buildIframeSrc(slug, theme, limit);
    iframe.setAttribute("title", "Talent roster");
    iframe.setAttribute("loading", "lazy");
    iframe.setAttribute("scrolling", "no");
    iframe.setAttribute("frameborder", "0");
    // Sandbox: scripts (we own the embed page) + same-origin (we ARE same-
    // origin relative to ourselves, doesn't help partners) + top navigation
    // (so clicks open the talent page in the parent window via target=_top).
    iframe.setAttribute("sandbox", "allow-scripts allow-popups allow-top-navigation-by-user-activation");
    iframe.referrerPolicy = "no-referrer-when-downgrade";
    iframe.style.width = "100%";
    iframe.style.minHeight = height + "px";
    iframe.style.height = height + "px";
    iframe.style.border = "0";
    iframe.style.borderRadius = "12px";
    iframe.style.display = "block";
    iframe.style.background = "transparent";

    // Reset the host before mounting so re-init doesn't double-mount.
    while (host.firstChild) host.removeChild(host.firstChild);
    host.appendChild(iframe);
    host.setAttribute("data-tulala-embed-mounted", "1");
    INSTANCES.set(iframe, { slug: slug });
  }

  function mountAll() {
    var hosts = document.querySelectorAll("[data-tulala-embed]");
    for (var i = 0; i < hosts.length; i++) mountOne(hosts[i]);
  }

  // postMessage protocol — the iframe page sends
  // { type: "tulala-embed-resize", height, slug } whenever its content
  // grows or shrinks. Match by source frame so we don't honour spoofed
  // messages from other iframes.
  window.addEventListener("message", function (e) {
    var data = e && e.data;
    if (!data || typeof data !== "object") return;
    if (data.type !== "tulala-embed-resize") return;
    if (typeof data.height !== "number" || data.height < 80 || data.height > 5000) return;

    INSTANCES.forEach(function (info, iframe) {
      if (iframe.contentWindow === e.source) {
        iframe.style.height = data.height + "px";
        iframe.style.minHeight = data.height + "px";
      }
    });
  }, false);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountAll);
  } else {
    mountAll();
  }

  // Expose a tiny API so partners can manually trigger re-mount after
  // DOM mutations (SPA navigation, lazy content, etc.).
  window.tulalaEmbed = {
    mount: mountAll,
    version: "1.0.0",
  };
})();
`;
}
