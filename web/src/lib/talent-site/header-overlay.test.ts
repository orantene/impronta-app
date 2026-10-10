import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { headerOverlayAllowed } from "./header-overlay";

const n = (o: unknown) => o as BuilderNode;
const COVER = "linear-gradient(180deg, rgba(0,0,0,.1), rgba(0,0,0,.7)), url({{headshotUrl}})";
const noirCover = n({ id: "h", kind: "container", props: { layerLabel: "Hero", style: { maxWidth: "full", minHeight: "82vh", backgroundImage: COVER } }, children: [] });
const noirCarousel = n({ id: "c", kind: "carousel", props: { variant: "hero", heightMode: "viewport", overlay: { scrim: true, tone: "dark" } } });
const maisonV1Split = n({ id: "s", kind: "split", props: { layerLabel: "Hero", style: { maxWidth: "wide", minHeight: "70vh" } }, children: [n({ id: "a", kind: "container", props: {} }), n({ id: "b", kind: "image", props: { src: "x" } })] });
const centered = n({ id: "z", kind: "container", props: { style: { maxWidth: "reading" } }, children: [n({ id: "y", kind: "heading", props: {} }), n({ id: "w", kind: "paragraph", props: {} })] });

describe("headerOverlayAllowed (marker is set only over a dark full-bleed hero)", () => {
  it("true for a full-bleed photo hero under a scrim (cover) and a dark hero carousel", () => {
    assert.equal(headerOverlayAllowed([noirCover]), true);
    assert.equal(headerOverlayAllowed([noirCarousel]), true);
  });
  it("true for a moving background", () => {
    assert.equal(headerOverlayAllowed([n({ id: "m", kind: "container", props: { backgroundMedia: { source: "upload", src: "v.mp4" } }, children: [] })]), true);
  });
  it("true through a bare wrapper", () => {
    assert.equal(headerOverlayAllowed([n({ id: "w", kind: "section", props: {}, children: [noirCover] })]), true);
  });
  it("false for the Maison v1 split hero and a centred type hero", () => {
    assert.equal(headerOverlayAllowed([maisonV1Split]), false);
    assert.equal(headerOverlayAllowed([centered]), false);
  });
  it("false for a photo with no scrim, a light-toned carousel, a narrow band, and an empty tree", () => {
    assert.equal(headerOverlayAllowed([n({ id: "p", kind: "container", props: { style: { backgroundImage: "url(x.jpg)" } }, children: [] })]), false);
    assert.equal(headerOverlayAllowed([n({ id: "l", kind: "carousel", props: { variant: "hero", overlay: { tone: "light" } } })]), false);
    assert.equal(headerOverlayAllowed([n({ id: "q", kind: "container", props: { style: { maxWidth: "reading", backgroundImage: COVER } }, children: [] })]), false);
    assert.equal(headerOverlayAllowed([]), false);
  });
  it("only the FIRST band counts", () => {
    assert.equal(headerOverlayAllowed([maisonV1Split, noirCover]), false);
  });
});

describe("white-text rule is gated on the over-hero marker", () => {
  it("token-presets.css paints #fff on a transparent header only under [data-over-hero]", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/token-presets.css"), "utf8");
    assert.ok(css.includes('[data-talent-max-site-header]:where([data-over-hero="true"]) .site-header[data-tone="transparent"] { color: #fff; }'));
    assert.ok(!css.includes('[data-talent-max-site-header] .site-header[data-tone="transparent"] { color: #fff; }'));
  });
});

describe("talent sticky wrapper includes transparent tone (GRK-082)", () => {
  it("promotes sticky to [data-talent-max-site-header] for any sticky tone, including transparent", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/token-presets.css"), "utf8");
    assert.match(
      css,
      /\[data-talent-max-site-header\]:has\(\.site-header\[data-sticky="true"\]\)\s*\{\s*position:\s*sticky/,
    );
    assert.ok(
      !css.includes(
        '[data-talent-max-site-header]:has(.site-header[data-sticky="true"]:not([data-tone="transparent"]))',
      ),
      "talent path must not exclude transparent sticky (Folio header blank after scroll)",
    );
    assert.match(
      css,
      /\[data-cms-section\]\[data-section-type-key="site_header"\]:has\(> \.site-header\[data-sticky="true"\]:not\(\[data-tone="transparent"\]\)\)/,
      "agency path still excludes transparent (fixed overlay)",
    );
  });
});

describe("policy / mainOverride pages never stamp over-hero (TUL-516 H1)", () => {
  it("render-max-site gates data-over-hero on !mainOverride", () => {
    const src = readFileSync(path.join(process.cwd(), "src/lib/talent-site/server/render-max-site.tsx"), "utf8");
    assert.match(src, /!args\.mainOverride\s*&&\s*headerOverlayAllowed/);
    assert.match(src, /policyMainNode\(policyModel,\s*\{\s*homeHref:/);
  });
});
