/**
 * Tulala embed docs landing — Phase G PR 2.
 *
 * Served at `/embed`. Plain HTML page that documents how to use the
 * embed loader. Self-contained so partners can read it without
 * navigating away. No data fetching.
 */

import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  const baseHref = ((): string => {
    const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
    if (fromEnv) return fromEnv.replace(/\/$/, "");
    const u = new URL(request.url);
    return `${u.protocol}//${u.host}`;
  })();

  return new Response(renderDocsHtml(baseHref), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=600, s-maxage=3600",
    },
  });
}

function renderDocsHtml(baseHref: string): string {
  const example = `<div data-tulala-embed="roster" data-tenant="YOUR-WORKSPACE-SLUG"></div>
<script async src="${baseHref}/embed.js"></script>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tulala embed — drop your roster on any site</title>
<style>
  :root { color-scheme: light; }
  html, body { margin: 0; padding: 0; background: #FCFBF7; color: #0B0B0D;
    font-family: Inter, system-ui, -apple-system, sans-serif; line-height: 1.55; }
  main { max-width: 720px; margin: 0 auto; padding: 48px 24px 64px; }
  h1 { font-size: 28px; letter-spacing: -0.01em; margin: 0 0 12px; }
  h2 { font-size: 18px; margin: 32px 0 8px; }
  p { color: rgba(11,11,13,0.7); margin: 6px 0; }
  pre { background: #fff; border: 1px solid rgba(11,11,13,0.08); border-radius: 10px;
    padding: 14px 16px; font-size: 13px; overflow-x: auto;
    font-family: "JetBrains Mono", Menlo, monospace; }
  code { font-family: inherit; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; margin: 12px 0; }
  td, th { text-align: left; padding: 8px 10px; border-bottom: 1px solid rgba(11,11,13,0.08); }
  th { font-weight: 600; }
  td code { background: rgba(11,11,13,0.04); padding: 1px 6px; border-radius: 4px; font-size: 12.5px; }
  footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid rgba(11,11,13,0.08);
    font-size: 12px; color: rgba(11,11,13,0.5); }
  footer a { color: inherit; }
</style>
</head>
<body>
<main>
  <h1>Tulala embed</h1>
  <p>Drop your roster on any website with two lines of HTML. The widget is responsive,
  click-throughs open the talent's full Tulala profile in the user's main window, and
  resizes itself to fit the content — no inner scrollbar.</p>

  <h2>Quick start</h2>
  <pre><code>${escapeHtml(example)}</code></pre>
  <p>Replace <code>YOUR-WORKSPACE-SLUG</code> with your Tulala workspace slug
  (the one in <code>${escapeHtml(baseHref)}/&lt;slug&gt;/admin</code>).</p>

  <h2>Options</h2>
  <table>
    <thead><tr><th>Attribute</th><th>What it does</th><th>Default</th></tr></thead>
    <tbody>
      <tr><td><code>data-tulala-embed</code></td><td>Embed kind. Today: <code>roster</code>.</td><td>—</td></tr>
      <tr><td><code>data-tenant</code></td><td>Your workspace slug.</td><td>required</td></tr>
      <tr><td><code>data-theme</code></td><td><code>light</code> or <code>dark</code>.</td><td>light</td></tr>
      <tr><td><code>data-limit</code></td><td>Max talents shown. Max 48.</td><td>24</td></tr>
      <tr><td><code>data-initial-height</code></td><td>Iframe height before content loads.</td><td>480</td></tr>
    </tbody>
  </table>

  <h2>What's included</h2>
  <ul>
    <li>Your published, public-listed roster — same filter as the storefront directory.</li>
    <li>Click a card → opens the talent's full profile in the user's main window.</li>
    <li>"See full roster" CTA at the bottom links back to your Tulala directory.</li>
    <li>Auto-resize via <code>postMessage</code> — no scrollbar inside the embed.</li>
  </ul>

  <h2>What's coming</h2>
  <ul>
    <li>Filters inside the embed (city, skill, availability).</li>
    <li>Events embed (<code>data-tulala-embed="events"</code>) — upcoming talent appearances.</li>
    <li>Pitches embed — surface a curated talent suggestion as a public landing.</li>
  </ul>

  <footer>
    Tulala — <a href="${escapeHtml(baseHref)}">${escapeHtml(baseHref.replace(/^https?:\/\//, ""))}</a>
  </footer>
</main>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]!);
}
