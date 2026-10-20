import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { insertPatch, updatePatch } from "./import-patch";

const base = { title: "Burger", amount_cents: 12000, status: "draft", tenant_id: "t1" };

describe("menu re-import keeps the status of existing dishes (TUL-1331)", () => {
  test("a new dish starts as draft", () => {
    assert.equal(insertPatch(base).status, "draft");
  });

  test("an update never carries a status, so a published dish stays published", () => {
    const patch = updatePatch(base);
    assert.equal("status" in patch, false);
    assert.equal(patch.title, "Burger");
    assert.equal(patch.amount_cents, 12000);
  });

  test("import-actions routes both writes through the helpers", () => {
    const src = readFileSync(new URL("./import-actions.ts", import.meta.url), "utf8");
    assert.match(src, /\.update\(updatePatch\(patch\)\)/);
    assert.match(src, /\.insert\(insertPatch\(patch\)\)/);
  });
});
