import { test } from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { fetchFreshMasterSubtreeJson } from "./component-master-sync";

function subtree(text: string): BuilderNode {
  return {
    id: "root",
    kind: "container",
    props: { layout: "stack" },
    children: [{ id: "h", kind: "heading", props: { text, level: 2 } }],
  } as BuilderNode;
}

test("resolves the CURRENT server row, not any cached copy", async () => {
  // Simulates the update-master flow: the server now holds v2 while panel
  // state still holds v1. The helper must come back with v2.
  const json = await fetchFreshMasterSubtreeJson("cmp-1", async () => ({
    ok: true as const,
    components: [
      { id: "cmp-0", subtree: subtree("other") },
      { id: "cmp-1", subtree: subtree("v2 — freshly pushed") },
    ],
  }));
  assert.ok(json);
  assert.ok(json.includes("v2"));
  assert.ok(!json.includes("v1"));
});

test("returns null when the component is gone (archived meanwhile)", async () => {
  const json = await fetchFreshMasterSubtreeJson("cmp-1", async () => ({
    ok: true as const,
    components: [],
  }));
  assert.equal(json, null);
});

test("returns null when the list fails — callers must NOT fall back to a stale copy", async () => {
  const failed = await fetchFreshMasterSubtreeJson("cmp-1", async () => ({
    ok: false as const,
    error: "nope",
  }));
  assert.equal(failed, null);
  const threw = await fetchFreshMasterSubtreeJson("cmp-1", async () => {
    throw new Error("network");
  });
  assert.equal(threw, null);
});
