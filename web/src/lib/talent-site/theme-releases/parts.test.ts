import test from "node:test";
import assert from "node:assert/strict";

import { countParts, partOf } from "./parts";

test("F82: many node and prop entries in one section count as one part", () => {
  const entries = [
    { key: "hero/heading", change: "props" },
    { key: "hero/subheading", change: "props" },
    { key: "hero", change: "props" },
    { key: "menu/services_catalog", change: "props" },
  ] as const;
  assert.equal(countParts(entries), 2);
});

test("F82: every token entry is one colours part", () => {
  const entries = [
    { key: "space.row", change: "token" },
    { key: "color.accent", change: "token" },
  ] as const;
  assert.equal(partOf(entries[0]), "colours");
  assert.equal(countParts(entries), 1);
  assert.equal(countParts([]), 0);
});
