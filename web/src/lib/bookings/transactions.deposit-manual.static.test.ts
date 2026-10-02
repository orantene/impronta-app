import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Track D4: manual cash/transfer parts reuse checkout_type='deposit'. The
 * online deposit mint must ignore provider='manual' or a cash part blocks the
 * real deposit payment link.
 */
describe("online deposit dup check ignores manual parts", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "transactions.ts"), "utf8");

  it("paid-deposit lookup excludes provider=manual", () => {
    assert.match(src, /exclude provider='manual'/);
    assert.match(
      src,
      /\.eq\("checkout_type", "deposit"\)[\s\S]{0,200}?\.neq\("provider", "manual"\)/,
    );
  });
});
