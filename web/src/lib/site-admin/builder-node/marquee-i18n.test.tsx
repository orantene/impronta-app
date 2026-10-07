/**
 * Ticker (marquee) items per language. Overlay key convention (shared with the
 * theme seeds): item N's text for a locale lives at `items.N.text`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { isLocalizableProp } from "@/lib/i18n/builder-i18n-props";

import { normalizeNodeI18nOverlay } from "./i18n-overlay";
import { renderBuilderNodes, type BuilderNodeContentLocaleOptions } from "./render";
import type { BuilderNode } from "./types";
import { validateBuilderNodeTree } from "./validate";

const OVERLAY = {
  es: { "items.0.text": "Extensiones clásicas", "items.2.text": "Cejas" },
  en: { "items.0.text": "Classic extensions", "items.2.text": "Brows" },
};

function marquee(i18n?: Record<string, Record<string, string>>): BuilderNode {
  return {
    id: "m1",
    kind: "marquee",
    props: {
      items: [{ text: "Lash lift" }, { text: "Tinte" }, { text: "Eyebrows" }],
      ...(i18n ? { i18n } : {}),
    },
    ...(i18n ? { i18n } : {}),
  } as unknown as BuilderNode;
}

const loc = (locale: string): BuilderNodeContentLocaleOptions => ({
  locale,
  defaultLocale: "es",
  chain: [locale, "es"],
});

/** The node's own markup (the renderer may prepend a shared <style> block). */
const html = (node: BuilderNode, contentLocale?: BuilderNodeContentLocaleOptions) => {
  const out = renderToStaticMarkup(
    <>{renderBuilderNodes([node], contentLocale ? { contentLocale } : {})}</>,
  );
  return out.slice(out.indexOf("<section"));
};

/** Markup of the pre-change renderer for a 3-item, no-overlay marquee. */
function expectedBase(): string {
  const run = (hidden: boolean) =>
    `<div class="site-builder-node--marquee-run"${hidden ? ' aria-hidden="true"' : ""}>` +
    ["Lash lift", "Tinte", "Eyebrows"]
      .map(
        (t) =>
          `<span class="site-builder-node--marquee-item"><span>${t}</span><span aria-hidden="true" class="site-builder-node--marquee-sep">·</span></span>`,
      )
      .join("") +
    "</div>";
  return (
    `<section data-builder-node-id="m1" data-builder-node-kind="marquee" data-bn-marquee-speed="medium" data-bn-marquee-direction="left" data-bn-marquee-variant="text" data-bn-marquee-pause="hover" class="site-builder-node site-builder-node--marquee">` +
    `<div class="site-builder-node--marquee-track">${run(false)}${run(true)}</div></section>`
  );
}

describe("isLocalizableProp for marquee items", () => {
  it("accepts items.N.text only", () => {
    assert.equal(isLocalizableProp("marquee", "items.0.text"), true);
    assert.equal(isLocalizableProp("marquee", "items.12.text"), true);
    for (const k of ["items.0.href", "items.text", "items.x.text", "items.0.text.x", "items", "text", "speed", " items.0.text"]) {
      assert.equal(isLocalizableProp("marquee", k), false, k);
    }
  });
  it("does not leak to other kinds", () => {
    assert.equal(isLocalizableProp("heading", "items.0.text"), false);
    assert.equal(isLocalizableProp("paragraph", "items.0.text"), false);
  });
});

describe("normalizeNodeI18nOverlay keeps dotted keys", () => {
  it("trims values and keeps the key", () => {
    assert.deepEqual(
      normalizeNodeI18nOverlay({ en: { "items.0.text": "  Hi  ", "items.1.text": " " } }),
      { en: { "items.0.text": "Hi" } },
    );
  });
});

describe("marquee render per language", () => {
  it("shows each language's items; partial overlay keeps base text", () => {
    const node = marquee(OVERLAY);
    const es = html(node, loc("es"));
    const en = html(node, loc("en"));
    const fr = html(node, loc("fr"));
    assert.ok(es.includes("<span>Extensiones clásicas</span>") && es.includes("<span>Cejas</span>"));
    assert.ok(es.includes("<span>Tinte</span>"));
    assert.ok(en.includes("<span>Classic extensions</span>") && en.includes("<span>Brows</span>"));
    assert.ok(en.includes("<span>Tinte</span>"));
    assert.ok(!en.includes("Lash lift") && !en.includes("Eyebrows"));
    // fr has no overlay of its own: the chain (fr, es) lands on the es overlay.
    assert.ok(fr.includes("<span>Extensiones clásicas</span>") && fr.includes("<span>Cejas</span>"));
  });

  it("published path adds no needs-translation cue", () => {
    const en = html(marquee(OVERLAY), loc("en"));
    assert.ok(!/opacity|needs-translation|outline/i.test(en));
  });

  it("no overlay or no contentLocale is byte-identical to the previous markup", () => {
    assert.equal(html(marquee()), expectedBase());
    assert.equal(html(marquee(), loc("en")), expectedBase());
    assert.equal(html(marquee(OVERLAY)), expectedBase());
  });

  it("other dotted keys do not touch the render", () => {
    const node = marquee({ en: { "items.0.href": "/x", "items.9.text": "ghost", speed: "fast" } });
    assert.equal(html(node, loc("en")), expectedBase());
  });

  it("a non-marquee kind ignores items.N.text", () => {
    const node = {
      id: "h1",
      kind: "heading",
      props: { text: "Hello", level: 2 },
      i18n: { en: { "items.0.text": "Nope" } },
    } as unknown as BuilderNode;
    assert.ok(!html(node, loc("en")).includes("Nope"));
  });

  it("props.i18n alone renders English after validateBuilderNodeTree", () => {
    const raw = [
      { id: "m1", kind: "marquee", props: { items: [{ text: "Lash lift" }, { text: "Tinte" }], i18n: OVERLAY } },
    ];
    const res = validateBuilderNodeTree(raw);
    assert.equal(res.ok, true, JSON.stringify(res.issues));
    const out = html(res.tree[0], loc("en"));
    assert.ok(out.includes("<span>Classic extensions</span>"));
    assert.ok(out.includes("<span>Tinte</span>"));
  });
});
