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

test("phones still hide only via the mobile-hidden attribute", () => {
  const hideRule =
    ".site-builder-node[data-builder-style-tablet-hidden]{display:none!important}";
  const first = SOURCE.indexOf(hideRule);
  assert.ok(first > 0, "tablet-hidden hide rule must exist");
  assert.equal(
    SOURCE.indexOf(hideRule, first + 1),
    -1,
    "tablet-hidden must have exactly one CSS hide rule (the 641–900px band)",
  );
  assert.ok(
    SOURCE.includes(
      "@media (min-width:641px) and (max-width:900px){\n  " + hideRule,
    ),
  );
});
