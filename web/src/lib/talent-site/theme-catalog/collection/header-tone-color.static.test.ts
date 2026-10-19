/**
 * Header control colour follows the header tone (QA of #4075: Frame/Mono got a flat light header and the
 * burger, account icon and wordmark kept the over-hero white, so the phone nav was unreachable).
 * A unit test cannot compute contrast, so this pins the CSS rules that make it hold, and which designs
 * ask for which tone. Browser contrast is checked in the localhost QA pass.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { COLLECTION_DESIGNS } from "./designs";

const css = readFileSync(join(process.cwd(), "src", "app", "token-presets.css"), "utf8");

describe("header tone colour", () => {
  it("solid and surface headers set the ink colour (not white) for every control that inherits", () => {
    const m = /\.site-header\[data-tone="solid"\],\s*\.site-header\[data-tone="surface"\]\s*\{([^}]*)\}/.exec(css);
    assert.ok(m, "rule exists");
    assert.match(m![1]!, /color:\s*var\(--token-color-ink/);
    assert.doesNotMatch(m![1]!, /#fff|white/i);
  });
  it("the burger and header items inherit colour from the header", () => {
    assert.match(css, /\.site-header\[data-variant="freeform"\] \.site-header__burger \{[^}]*color: inherit/);
    assert.match(css, /\.site-header\[data-variant="freeform"\] \.site-header__ritem:not\(\.site-btn\) \{ color: inherit; \}/);
  });
  it("an unscrolled transparent header paints nav links and wordmark white over the scrim", () => {
    assert.match(css, /data-tone="transparent"\]:not\(\[data-scrolled="true"\]\) \.site-header__nav-link[\s\S]*?\{ color: #ffffff; \}/);
  });
  it("Frame and Mono ask for a flat solid header", () => {
    for (const slug of ["frame", "mono"]) {
      const d = COLLECTION_DESIGNS.find((x) => x.slug === slug)!;
      assert.match(JSON.stringify(d.buildPayload().shellTree), /"tone":"solid"/, slug);
    }
  });
});
