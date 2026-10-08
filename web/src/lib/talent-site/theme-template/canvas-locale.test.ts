import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canvasLocaleChain, canvasLocaleFor } from "./canvas.server";

describe("canvas locale follows the editor language", () => {
  it("lang wins over the talent locale; fallback otherwise", () => {
    assert.equal(canvasLocaleFor("en", "es"), "en");
    assert.equal(canvasLocaleFor("es", "en"), "es");
    assert.equal(canvasLocaleFor(null, "es"), "es");
  });
  it("chain leads with the canvas locale without duplicates", () => {
    assert.deepEqual(canvasLocaleChain("en", ["es", "en"]), ["en", "es"]);
  });
});
