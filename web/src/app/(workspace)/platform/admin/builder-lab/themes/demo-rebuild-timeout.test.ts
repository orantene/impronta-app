import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { withTimeout } from "./demo-rebuild-panel";

describe("withTimeout", () => {
  it("returns the fallback when the action is slower than the limit", async () => {
    const slow = new Promise<string>((r) => setTimeout(() => r("late"), 200));
    assert.equal(await withTimeout(slow, 20, "timeout"), "timeout");
  });
  it("returns the result when fast", async () => {
    assert.equal(await withTimeout(Promise.resolve("ok"), 200, "timeout"), "ok");
  });
});
