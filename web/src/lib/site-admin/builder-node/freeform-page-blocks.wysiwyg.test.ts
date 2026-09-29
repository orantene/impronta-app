/**
 * freeform-page-blocks: when includeRendererStyles is true, hoist ONE
 * BuilderNodeRendererStyles so the editor canvas gets display:grid for split
 * (and the rest of the renderer sheet). Nested per-block renders stay false.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "freeform-page-blocks.tsx"), "utf8");

describe("renderFreeformPageRootTree style hoist", () => {
  it("imports BuilderNodeRendererStyles + collectPresentNodeKinds", () => {
    assert.match(SRC, /BuilderNodeRendererStyles/);
    assert.match(SRC, /collectPresentNodeKinds/);
  });

  it("still forces nested per-block includeRendererStyles false", () => {
    assert.match(SRC, /includeRendererStyles:\s*false/);
  });

  it("hoists one sheet when options.includeRendererStyles is true", () => {
    assert.match(SRC, /hoistStyles = options\.includeRendererStyles === true/);
    assert.match(SRC, /<BuilderNodeRendererStyles/);
    assert.match(SRC, /kinds=\{collectPresentNodeKinds\(tree/);
  });
});
