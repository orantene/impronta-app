import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

/**
 * Tablet hide must not leak onto phones. The tablet bucket is 641–900px;
 * phones (max-width:640px) keep their own `data-builder-style-mobile-hidden`.
 */
const SOURCE = readFileSync(new URL("./render.tsx", import.meta.url), "utf8");

test("tablet-hidden CSS is isolated to the tablet band, not all max-width:900px", () => {
  assert.match(
    SOURCE,
    /@media \(min-width:641px\) and \(max-width:900px\)\{\s*\.site-builder-node\[data-builder-style-tablet-hidden\]\{display:none!important\}/,
  );

  const unscopedTablet = SOURCE.slice(
    SOURCE.indexOf("@media (max-width:900px){"),
    SOURCE.indexOf("@media (min-width:641px) and (max-width:900px){"),
  );
  assert.ok(
    unscopedTablet.includes("@media (max-width:900px){"),
    "expected to isolate the max-width:900px tablet-style bucket",
  );
  assert.ok(
    !unscopedTablet.includes("data-builder-style-tablet-hidden"),
    "tablet-hidden must not live in the unscoped max-width:900px query (that includes phones)",
  );
});

function cssBlockAt(src: string, from: number): string | null {
  const brace = src.indexOf("{", from);
  if (brace < 0) return null;
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(from, i + 1);
    }
  }
  return null;
}

test("phones still hide only via the mobile-hidden attribute", () => {
  const hideRule =
    ".site-builder-node[data-builder-style-tablet-hidden]{display:none!important}";
  const compact = SOURCE.replace(/\s+/g, "");
  const first = compact.indexOf(hideRule);
  assert.ok(first > 0, "tablet-hidden hide rule must exist");
  assert.equal(
    compact.indexOf(hideRule, first + 1),
    -1,
    "tablet-hidden must have exactly one CSS hide rule (the 641–900px band)",
  );

  const query = "@media (min-width:641px) and (max-width:900px)";
  const mediaAt = SOURCE.indexOf(query);
  assert.ok(mediaAt >= 0, "tablet-band media query exists");
  const block = cssBlockAt(SOURCE, mediaAt);
  assert.ok(block, "tablet-band media query is a closed block");
  assert.ok(
    block.replace(/\s+/g, "").includes(hideRule),
    "tablet-hidden hide rule sits inside the 641–900px band",
  );
});
