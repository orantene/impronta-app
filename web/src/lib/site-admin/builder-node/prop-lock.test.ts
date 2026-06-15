import assert from "node:assert/strict";
import test from "node:test";

import {
  enforceLockedProps,
  enforceLockedPropsOnTree,
  isPropLocked,
  stripLockedKeysFromPatch,
} from "./prop-lock";

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

test("stripLockedKeysFromPatch drops the lockedProps carrier on a locked node (no self-unlock)", () => {
  // A tenant tries to clear the locks via the inspector chokepoint.
  const out = stripLockedKeysFromPatch(
    { lockedProps: [], tone: "primary" },
    { tone: "secondary" },
    ["tone"],
  );
  assert.equal("lockedProps" in out, false);
  assert.equal("tone" in out, false);
});

// ── enforceLockedProps (full-replacement, server-side) ───────────────────────

test("enforceLockedProps forces a locked top-level key to current, keeps unlocked", () => {
  const out = enforceLockedProps(
    { tone: "evil", label: "My copy" },
    { tone: "primary", label: "Old copy" },
    ["tone"],
  );
  assert.deepEqual(out, { tone: "primary", label: "My copy" });
});

test("enforceLockedProps forces a locked nested leaf, keeps sibling leaves", () => {
  const out = enforceLockedProps(
    { style: { textColor: "#evil", fontSize: "lg" } },
    { style: { textColor: "#brand", fontSize: "sm" } },
    ["style.textColor"],
  );
  assert.deepEqual(out, { style: { textColor: "#brand", fontSize: "lg" } });
});

test("enforceLockedProps deletes a locked key absent from current", () => {
  const out = enforceLockedProps({ tone: "evil" }, {}, ["tone"]);
  assert.equal("tone" in out, false);
});

test("enforceLockedProps is a no-op without locks", () => {
  const incoming = { tone: "x" };
  assert.equal(enforceLockedProps(incoming, {}, undefined), incoming);
  assert.equal(enforceLockedProps(incoming, {}, []), incoming);
});

// ── enforceLockedPropsOnTree (the server save backstop) ──────────────────────

test("enforceLockedPropsOnTree reverts a tampered locked prop on an existing node", () => {
  const current = [
    { id: "n1", kind: "button", props: { tone: "primary", label: "Old" }, lockedProps: ["tone"] },
  ];
  const incoming = [
    { id: "n1", kind: "button", props: { tone: "evil", label: "New copy" }, lockedProps: ["tone"] },
  ];
  const out = enforceLockedPropsOnTree(incoming, current) as Array<{
    props: Record<string, unknown>;
  }>;
  // Locked tone reverts to the DB value; unlocked label keeps the tenant's edit.
  assert.equal(out[0].props.tone, "primary");
  assert.equal(out[0].props.label, "New copy");
});

test("enforceLockedPropsOnTree re-asserts a DROPPED carrier from the DB node", () => {
  // The client stripped lockedProps entirely AND changed the locked prop.
  const current = [
    { id: "n1", kind: "button", props: { tone: "primary", lockedProps: ["tone"] }, lockedProps: ["tone"] },
  ];
  const incoming = [{ id: "n1", kind: "button", props: { tone: "evil" } }];
  const out = enforceLockedPropsOnTree(incoming, current) as Array<{
    props: Record<string, unknown>;
    lockedProps?: string[];
  }>;
  assert.equal(out[0].props.tone, "primary"); // value enforced
  assert.deepEqual(out[0].lockedProps, ["tone"]); // base carrier re-stamped
  assert.deepEqual(out[0].props.lockedProps, ["tone"]); // props carrier re-stamped
});

test("enforceLockedPropsOnTree enforces nested children", () => {
  const current = [
    {
      id: "root",
      kind: "container",
      props: {},
      children: [
        { id: "c1", kind: "button", props: { tone: "primary" }, lockedProps: ["tone"] },
      ],
    },
  ];
  const incoming = [
    {
      id: "root",
      kind: "container",
      props: {},
      children: [{ id: "c1", kind: "button", props: { tone: "evil" }, lockedProps: ["tone"] }],
    },
  ];
  const out = enforceLockedPropsOnTree(incoming, current) as Array<{
    children: Array<{ props: Record<string, unknown> }>;
  }>;
  assert.equal(out[0].children[0].props.tone, "primary");
});

test("enforceLockedPropsOnTree keeps a brand-new locked node's self-declared carrier", () => {
  const incoming = [
    { id: "new1", kind: "button", props: { tone: "primary", lockedProps: ["tone"] }, lockedProps: ["tone"] },
  ];
  const out = enforceLockedPropsOnTree(incoming, []) as Array<{ lockedProps?: string[] }>;
  assert.deepEqual(out[0].lockedProps, ["tone"]);
});

test("enforceLockedPropsOnTree returns a non-array input unchanged (safe degrade)", () => {
  assert.equal(enforceLockedPropsOnTree(null, []), null);
  assert.equal(enforceLockedPropsOnTree(undefined, []), undefined);
});

test("enforceLockedPropsOnTree leaves an unlocked node fully editable", () => {
  const current = [{ id: "n1", kind: "button", props: { tone: "primary" } }];
  const incoming = [{ id: "n1", kind: "button", props: { tone: "secondary", label: "Hi" } }];
  const out = enforceLockedPropsOnTree(incoming, current) as Array<{
    props: Record<string, unknown>;
  }>;
  assert.deepEqual(out[0].props, { tone: "secondary", label: "Hi" });
});
