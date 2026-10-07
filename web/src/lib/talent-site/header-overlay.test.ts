import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { headerOverlayAllowed, settleHeaderTone } from "./header-overlay";

const n = (o: unknown) => o as BuilderNode;
const COVER = "linear-gradient(180deg, rgba(0,0,0,.1), rgba(0,0,0,.7)), url({{headshotUrl}})";
const noirCover = n({ id: "h", kind: "container", props: { layerLabel: "Hero", style: { maxWidth: "full", minHeight: "82vh", backgroundImage: COVER } }, children: [] });
const noirCarousel = n({ id: "c", kind: "carousel", props: { variant: "hero", heightMode: "viewport", overlay: { scrim: true, tone: "dark" } } });
const maisonV1Split = n({ id: "s", kind: "split", props: { layerLabel: "Hero", style: { maxWidth: "wide", minHeight: "70vh" } }, children: [n({ id: "a", kind: "container", props: {} }), n({ id: "b", kind: "image", props: { src: "x" } })] });
const centered = n({ id: "z", kind: "container", props: { style: { maxWidth: "reading" } }, children: [n({ id: "y", kind: "heading", props: {} }), n({ id: "w", kind: "paragraph", props: {} })] });
const header = (tone: string) => n({ id: "hd", kind: "section", props: { sectionTypeKey: "site_header", sectionProps: { tone, sticky: true } } });
const toneOf = (t: BuilderNode[]) => ((t[0] as unknown as { props: { sectionProps: { tone: string } } }).props.sectionProps.tone);

describe("headerOverlayAllowed", () => {
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

describe("settleHeaderTone", () => {
  it("flips transparent to surface for a Maison-v1-like tree", () => {
    assert.equal(toneOf(settleHeaderTone([header("transparent")], [maisonV1Split])), "surface");
  });
  it("keeps transparent for a Noir-like tree", () => {
    assert.equal(toneOf(settleHeaderTone([header("transparent")], [noirCover])), "transparent");
  });
  it("flips for an empty body (policy pages) and leaves other tones alone", () => {
    assert.equal(toneOf(settleHeaderTone([header("transparent")], [])), "surface");
    assert.equal(toneOf(settleHeaderTone([header("solid")], [maisonV1Split])), "solid");
  });
  it("does not mutate its input", () => {
    const h = [header("transparent")];
    settleHeaderTone(h, [maisonV1Split]);
    assert.equal(toneOf(h), "transparent");
  });
});
