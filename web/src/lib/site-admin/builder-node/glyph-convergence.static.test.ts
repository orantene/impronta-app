import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { socialPlatformIconName } from "./social-platform-icons";
import { BUILDER_ICON_NAMES } from "./icon-registry";

/**
 * Four places drew the same brand paths from their own copies. These assert
 * they are views onto ONE table, because a duplicated path set fails silently:
 * the glyph still renders, it is just the stale one.
 */
const RENDER = readFileSync(new URL("./render.tsx", import.meta.url), "utf8");
const CLUSTER = readFileSync(
  new URL("../sections/site_header/header-cluster-icon.tsx", import.meta.url),
  "utf8",
);
const FOOTER = readFileSync(
  new URL("../sections/site_footer/Component.tsx", import.meta.url),
  "utf8",
);

test("every platform the map knows resolves to a real registry glyph", () => {
  for (const platform of [
    "instagram", "tiktok", "facebook", "youtube", "linkedin", "x", "twitter",
    "whatsapp", "pinterest", "vimeo", "spotify", "github", "email", "phone",
    "inquiry", "saved",
  ]) {
    const name = socialPlatformIconName(platform);
    assert.ok(
      (BUILDER_ICON_NAMES as ReadonlyArray<string>).includes(name),
      `"${platform}" maps to "${name}", which is not in the registry`,
    );
  }
});

test("the two spellings of the same network draw the same mark", () => {
  // The node's enum says `x`; the footer's said `twitter`. Neither surface may
  // show a blank where the other shows a logo.
  assert.equal(socialPlatformIconName("twitter"), socialPlatformIconName("x"));
});

test("an unknown platform falls back to a link mark, not nothing", () => {
  assert.equal(socialPlatformIconName("myspace"), "web_link");
});

test("no brand path data survives outside the registry", () => {
  // The tell is a long `d` string in a file that should only be mapping names.
  for (const [label, source] of [
    ["render.tsx SocialGlyph", RENDER.slice(RENDER.indexOf("function SocialGlyph"), RENDER.indexOf("function SocialGlyph") + 900)],
    ["header-cluster-icon.tsx", CLUSTER],
  ] as const) {
    assert.ok(
      !/d="M[\d.]/.test(source),
      `${label} still carries its own path data instead of using the registry`,
    );
  }
  assert.match(CLUSTER, /BuilderIconSvg/);
});

test("the curated footer draws a glyph, not the platform's name", () => {
  assert.match(FOOTER, /<BuilderIconSvg name=\{socialPlatformIconName\(s\.platform\)\}/);
  assert.ok(
    !/>\s*\{s\.platform\}\s*<\/a>/.test(FOOTER),
    "the footer printed the literal platform string as its link text",
  );
});
