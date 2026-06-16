import test from "node:test";
import assert from "node:assert/strict";

import { resolveDefaultTemplateTree } from "./default-template-chain";

// A "tree" is just a non-empty array; the chain only cares about non-emptiness.
const POINTER_TREE = [{ id: "pointer" }];
const SLUG_TREE = [{ id: "slug" }];
const BUILTIN_TREE = [{ id: "builtin" }];

test("pointer wins when set and non-empty (pointer → slug → built-in)", async () => {
  const result = await resolveDefaultTemplateTree({
    pointerId: "tmpl-1",
    loadPointer: async () => POINTER_TREE,
    loadSlug: async () => SLUG_TREE,
    builtIn: BUILTIN_TREE,
  });
  assert.deepEqual(result, POINTER_TREE);
});

test("no pointer id → starts at the reserved slug", async () => {
  let pointerCalled = false;
  const result = await resolveDefaultTemplateTree({
    pointerId: null,
    loadPointer: async () => {
      pointerCalled = true;
      return POINTER_TREE;
    },
    loadSlug: async () => SLUG_TREE,
    builtIn: BUILTIN_TREE,
  });
  assert.deepEqual(result, SLUG_TREE);
  assert.equal(pointerCalled, false, "pointer loader must NOT run without an id");
});

test("pointer id set but pointer empty → falls through to slug", async () => {
  const result = await resolveDefaultTemplateTree({
    pointerId: "tmpl-1",
    loadPointer: async () => [],
    loadSlug: async () => SLUG_TREE,
    builtIn: BUILTIN_TREE,
  });
  assert.deepEqual(result, SLUG_TREE);
});

test("pointer + slug both absent → built-in fallback", async () => {
  const result = await resolveDefaultTemplateTree({
    pointerId: "tmpl-1",
    loadPointer: async () => null,
    loadSlug: async () => null,
    builtIn: BUILTIN_TREE,
  });
  assert.deepEqual(result, BUILTIN_TREE);
});

test("everything absent + null built-in → null (storefront keeps DefaultStorefrontBody)", async () => {
  const result = await resolveDefaultTemplateTree({
    pointerId: null,
    loadPointer: null,
    loadSlug: async () => null,
    builtIn: null,
  });
  assert.equal(result, null);
});

test("a throwing loader is treated as absent — the chain never throws", async () => {
  const result = await resolveDefaultTemplateTree({
    pointerId: "tmpl-1",
    loadPointer: async () => {
      throw new Error("db blew up");
    },
    loadSlug: async () => {
      throw new Error("db blew up again");
    },
    builtIn: BUILTIN_TREE,
  });
  assert.deepEqual(result, BUILTIN_TREE);
});

test("OFF/no-pointer path is byte-identical to slug-only resolution", async () => {
  // With no pointer set, the chain must produce EXACTLY what reading the
  // reserved slug alone would — proving the pointer feature is additive.
  const slugOnly = await resolveDefaultTemplateTree({
    pointerId: null,
    loadPointer: null,
    loadSlug: async () => SLUG_TREE,
    builtIn: BUILTIN_TREE,
  });
  assert.deepEqual(slugOnly, SLUG_TREE);

  // And when the reserved slug is also absent, it lands on the built-in — the
  // pre-pointer behaviour for the talent surface.
  const slugAbsent = await resolveDefaultTemplateTree({
    pointerId: null,
    loadPointer: null,
    loadSlug: async () => null,
    builtIn: BUILTIN_TREE,
  });
  assert.deepEqual(slugAbsent, BUILTIN_TREE);
});
