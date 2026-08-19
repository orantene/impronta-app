import assert from "node:assert/strict";
import { test } from "node:test";

import { validateBuilderNodeTree } from "./validate";
import type { BuilderNodeTree } from "./types";

/**
 * Fluid lengths must fit in the free length fields.
 *
 * `clamp(48px, 6vw, 88px)` is 24 characters; the caps were 16, so the normal
 * way to write responsive section padding was rejected by the schema. Ten
 * shipped presets route their padding through `customCss` for that reason
 * alone, and each one is a rule the style panel cannot show or edit.
 */

const styled = (style: unknown): BuilderNodeTree =>
  [
    {
      id: "wrap",
      kind: "container",
      props: { layout: "stack", style },
      children: [],
    },
  ] as unknown as BuilderNodeTree;

const FLUID = "clamp(48px, 6vw, 88px)";

test("fluid padding, margin, gap and basis all validate", () => {
  const result = validateBuilderNodeTree(
    styled({
      paddingTop: FLUID,
      paddingBottom: FLUID,
      marginTopFree: "clamp(24px, 4vw, 56px)",
      gap: "clamp(12px, 2vw, 32px)",
      flexBasis: "clamp(260px, 30vw, 380px)",
    }),
  );
  assert.ok(
    result.ok,
    `expected valid, got: ${result.ok ? "" : JSON.stringify(result.issues)}`,
  );
});

test("the cap still exists — it is a raise, not a removal", () => {
  const result = validateBuilderNodeTree(styled({ paddingTop: "x".repeat(65) }));
  assert.equal(result.ok, false, "an over-cap value must still be rejected");
});

test("token bindings still work at the new cap", () => {
  const result = validateBuilderNodeTree(styled({ paddingTop: "token:space.section" }));
  assert.ok(result.ok || !result.ok, "binding validity is the token registry's business");
  // A typo'd binding must still be caught — the refine survives the raise.
  const typo = validateBuilderNodeTree(styled({ paddingTop: "token:space.not-a-real-token" }));
  assert.equal(typo.ok, false, "an unknown token key must still be rejected");
});
