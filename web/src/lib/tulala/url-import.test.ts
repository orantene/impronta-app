/**
 * url-import.test.ts
 *
 * The interesting assertions here are the NEGATIVE ones. A stripper that keeps
 * too much is a cost problem; a handle extractor that keeps too much is a
 * correctness problem the visitor sees, because it asks them to confirm an
 * Instagram account that does not exist.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_IMPORT_CHARS,
  extractHandles,
  extractPageText,
  isWorthExtracting,
  readMeta,
  type ImportedPage,
} from "./url-import";

function page(over: Partial<ImportedPage> = {}): ImportedPage {
  return {
    url: "https://glowstudio.mx/",
    host: "glowstudio.mx",
    title: null,
    description: null,
    siteName: null,
    handles: { instagram: null, tiktok: null, facebook: null },
    text: "",
    ...over,
  };
}

// ─── Stripping ────────────────────────────────────────────────────────────────

test("script and style bodies never reach the model", () => {
  const html = `
    <html><head><style>.a{color:red}</style></head>
    <body>
      <script>var secret = "do not send this to anthropic";</script>
      <p>We are a massage studio in Playa del Carmen.</p>
    </body></html>`;
  const text = extractPageText(html);
  assert.ok(text.includes("massage studio"));
  assert.ok(!text.includes("secret"), "script body leaked");
  assert.ok(!text.includes("color:red"), "style body leaked");
});

test("nav, header and footer are dropped as boilerplate", () => {
  const html = `
    <nav><a href="/">Home</a><a href="/prices">Prices</a></nav>
    <header>Glow Studio</header>
    <p>Deep tissue and prenatal massage.</p>
    <footer>Copyright 2026 Glow Studio. All rights reserved.</footer>`;
  const text = extractPageText(html);
  assert.ok(text.includes("Deep tissue"));
  assert.ok(!text.includes("All rights reserved"), "footer leaked");
  assert.ok(!text.includes("Prices"), "nav leaked");
});

test("block tags become line breaks so sentences do not fuse", () => {
  const html = "<h1>Glow Studio</h1><p>Massage in Playa.</p>";
  const text = extractPageText(html);
  assert.ok(
    !/Glow StudioMassage/.test(text),
    "headline fused into the paragraph under it",
  );
  assert.equal(text, "Glow Studio\nMassage in Playa.");
});

test("unclosed dropped tags do not swallow the page", () => {
  // An unclosed <nav> with the greedy [\s\S]*? pattern could otherwise eat
  // everything after it.
  const html = "<nav><p>We do nails from a home studio in Tulum.</p>";
  assert.ok(extractPageText(html).includes("home studio"));
});

test("entities are decoded, including numeric ones", () => {
  const html = "<p>Caf&eacute;? No &mdash; Ma&#241;ana &amp; Co. &quot;the best&quot;</p>";
  const text = extractPageText(html);
  assert.ok(text.includes("&"), "ampersand not decoded");
  assert.ok(text.includes("Mañana"), "numeric entity not decoded");
});

test("single-word UI leftovers are dropped but real short phrases survive", () => {
  const html = "<li>Menu</li><li>ES</li><li>Deep Tissue</li>";
  const text = extractPageText(html);
  assert.ok(text.includes("Deep Tissue"), "a real service was dropped");
  assert.ok(!/^ES$/m.test(text), "language switcher kept");
});

test("output is capped", () => {
  const html = `<p>${"massage ".repeat(4000)}</p>`;
  assert.ok(extractPageText(html).length <= MAX_IMPORT_CHARS);
});

test("comments are stripped", () => {
  const html = "<!-- TODO: internal note --><p>Nails and lashes.</p>";
  const text = extractPageText(html);
  assert.ok(!text.includes("internal note"));
});

// ─── Handles ──────────────────────────────────────────────────────────────────

test("an instagram profile link is read as a handle", () => {
  const html = '<a href="https://www.instagram.com/glowstudio/">Follow us</a>';
  assert.equal(extractHandles(html).instagram, "glowstudio");
});

test("platform furniture is never mistaken for a handle", () => {
  // The single most likely false positive: a share button on every page.
  const html = `
    <a href="https://www.facebook.com/sharer/sharer.php?u=x">Share</a>
    <a href="https://www.instagram.com/p/CabcDefGh/">Our latest post</a>
    <a href="https://www.instagram.com/explore/tags/massage/">tags</a>`;
  const handles = extractHandles(html);
  assert.equal(handles.facebook, null, "sharer read as a handle");
  assert.equal(handles.instagram, null, "a post permalink read as a handle");
});

test("a numeric profile id is not a username", () => {
  const html = '<a href="https://facebook.com/100093847362">us</a>';
  assert.equal(extractHandles(html).facebook, null);
});

test("tiktok requires the @ so a topic page is not a handle", () => {
  assert.equal(
    extractHandles('<a href="https://tiktok.com/@glowstudio">tt</a>').tiktok,
    "glowstudio",
  );
  assert.equal(
    extractHandles('<a href="https://tiktok.com/discover/massage">x</a>').tiktok,
    null,
  );
});

test("a trailing dot from prose is not part of the handle", () => {
  const html = "<p>Find us at instagram.com/glowstudio.</p>";
  assert.equal(extractHandles(html).instagram, "glowstudio");
});

// ─── Meta ─────────────────────────────────────────────────────────────────────

test("og tags beat the title tag", () => {
  const html = `<head>
    <title>Glow Studio | Home | Massage Playa del Carmen | Book Now</title>
    <meta property="og:title" content="Glow Studio">
    <meta property="og:site_name" content="Glow">
    <meta name="description" content="Deep tissue massage in Playa del Carmen.">
  </head><body><p>hi</p></body>`;
  const meta = readMeta(html);
  assert.equal(meta.title, "Glow Studio");
  assert.equal(meta.siteName, "Glow");
  assert.ok(meta.description?.includes("Deep tissue"));
});

test("the title tag is the fallback", () => {
  const meta = readMeta("<head><title>Ana Nails Tulum</title></head>");
  assert.equal(meta.title, "Ana Nails Tulum");
});

test("meta attribute order does not matter", () => {
  const html = '<head><meta content="Glow Studio" property="og:title"></head>';
  assert.equal(readMeta(html).title, "Glow Studio");
});

test("meta reading does not fall for a similarly named property", () => {
  const html = '<head><meta property="og:title:alt" content="Wrong"><title>Right</title></head>';
  assert.equal(readMeta(html).title, "Right");
});

// ─── Worth extracting ─────────────────────────────────────────────────────────

test("a login wall is not worth an extraction call", () => {
  // The real shape of the failure: Instagram served to a bot is a shell.
  assert.equal(isWorthExtracting(page({ text: "Log in\nSign up" })), false);
});

test("a page with only good metadata IS worth extracting", () => {
  // Single-page apps render nothing server-side but still ship og tags, and
  // those tags are frequently the best sentence on the site.
  const p = page({
    title: "Glow Studio, massage in Playa del Carmen",
    description:
      "Deep tissue, prenatal and sports massage from our studio on 5th Avenue. Open seven days.",
  });
  assert.equal(isWorthExtracting(p), true);
});
