import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { siteFaviconFor, siteInitials } from "./site-favicon";

function svgOf(url: string): string {
  assert.ok(url.startsWith("data:image/svg+xml,"));
  return decodeURIComponent(url.slice("data:image/svg+xml,".length));
}

describe("siteInitials", () => {
  it("takes one or two initials", () => {
    assert.equal(siteInitials("Jorg Beauty"), "JB");
    assert.equal(siteInitials("Jorg Beauty Studio"), "JB");
    assert.equal(siteInitials("maison"), "M");
    assert.equal(siteInitials("  álvaro   ñandú "), "ÁÑ");
  });
  it("is empty for nothing usable", () => {
    assert.equal(siteInitials(""), "");
    assert.equal(siteInitials(null), "");
    assert.equal(siteInitials("!!! ???"), "");
  });
});

describe("siteFaviconFor", () => {
  it("prefers the logo, then the avatar", () => {
    assert.equal(siteFaviconFor({ logoUrl: "https://cdn.x/logo.png", avatarUrl: "https://cdn.x/a.png", displayName: "A B" }), "https://cdn.x/logo.png");
    assert.equal(siteFaviconFor({ logoUrl: " ", avatarUrl: "/media/a.png", displayName: "A B" }), "/media/a.png");
  });
  it("rejects unsafe image urls and falls back to initials", () => {
    const out = siteFaviconFor({ logoUrl: "javascript:alert(1)", avatarUrl: "//evil.example/x.png", displayName: "Jorg Beauty" });
    assert.match(svgOf(out!), />JB</);
  });
  it("escapes the name in the SVG", () => {
    const out = siteFaviconFor({ displayName: "<b> &" });
    const svg = svgOf(out!);
    assert.ok(!svg.includes("<b>"));
    assert.match(svg, /<text[^>]*>B<\/text>/);
  });
  it("uses a valid accent only", () => {
    assert.ok(svgOf(siteFaviconFor({ displayName: "A B", accentColor: "#ff00aa" })!).includes('fill="#ff00aa"'));
    assert.ok(svgOf(siteFaviconFor({ displayName: "A B", accentColor: "red\" onload=\"x" })!).includes('fill="#111111"'));
  });
  it("returns null with no logo, avatar or name (platform icon stays)", () => {
    assert.equal(siteFaviconFor({}), null);
    assert.equal(siteFaviconFor({ displayName: "?" }), null);
  });
});
