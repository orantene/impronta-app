import assert from "node:assert/strict";
import test from "node:test";

import { isPropLocked, stripLockedKeysFromPatch } from "./prop-lock";

test("isPropLocked matches an exact dot-path; no locks ⇒ false", () => {
  assert.equal(isPropLocked({ lockedProps: ["tone", "style.textColor"] }, "tone"), true);
  assert.equal(isPropLocked({ lockedProps: ["tone"] }, "label"), false);
  assert.equal(isPropLocked({ lockedProps: [] }, "tone"), false);
  assert.equal(isPropLocked(null, "tone"), false);
  assert.equal(isPropLocked({}, "tone"), false);
});

test("stripLockedKeysFromPatch drops a locked top-level key (current value wins)", () => {
  const out = stripLockedKeysFromPatch(
    { tone: "primary", label: "Buy now" },
    { tone: "secondary", label: "Old" },
    ["tone"],
  );
  assert.deepEqual(out, { label: "Buy now" });
  // The locked key is gone, so the props merge keeps the current `tone`.
  assert.equal("tone" in out, false);
});

test("stripLockedKeysFromPatch restores a locked NESTED leaf, lets siblings through", () => {
  const out = stripLockedKeysFromPatch(
    { style: { textColor: "#f00", fontSize: "lg" } },
    { style: { textColor: "#222", fontSize: "sm" } },
    ["style.textColor"],
  );
  // The sibling edit (fontSize) survives; the locked leaf is restored to current.
  assert.deepEqual(out, { style: { textColor: "#222", fontSize: "lg" } });
});

test("stripLockedKeysFromPatch is a no-op without locks (same reference back)", () => {
  const patch = { tone: "primary" };
  assert.equal(stripLockedKeysFromPatch(patch, {}, undefined), patch);
  assert.equal(stripLockedKeysFromPatch(patch, {}, []), patch);
});

test("a fully-locked patch reduces to empty (the inspector can detect + warn)", () => {
  const out = stripLockedKeysFromPatch({ tone: "primary" }, { tone: "secondary" }, ["tone"]);
  assert.equal(Object.keys(out).length, 0);
});
