import assert from "node:assert/strict";
import { test } from "node:test";

import { findPrunableSystemRowIds, type PrunableRow } from "./prune-duplicate-system-notes";

const sys = (id: string, body: string, createdAt: string): PrunableRow => ({ id, authorRole: "system", body, createdAt });
const msg = (id: string): PrunableRow => ({ id, authorRole: "guest", body: "hi", createdAt: "2026" });

test("a run of identical system notes keeps only the newest", () => {
  const rows = [
    sys("1", "Added 9 talent to your inquiry.", "t1"),
    sys("2", "Added 9 talent to your inquiry.", "t2"),
    sys("3", "Added 9 talent to your inquiry.", "t3"),
    sys("4", "Added 9 talent to your inquiry.", "t4"),
  ];
  assert.deepEqual(findPrunableSystemRowIds(rows), ["1", "2", "3"]);
});

test("different bodies in a burst are NOT pruned (distinct signals)", () => {
  const rows = [
    sys("a", "Location set to Tulum.", "t1"),
    sys("b", "Budget: USD 6,000.", "t2"),
    sys("c", "Headcount set to 3 talent.", "t3"),
  ];
  assert.deepEqual(findPrunableSystemRowIds(rows), []);
});

test("identical notes separated by a human message are kept (distinct moments)", () => {
  const rows = [
    sys("1", "The agency replied.", "t1"),
    msg("m"),
    sys("2", "The agency replied.", "t3"),
  ];
  assert.deepEqual(findPrunableSystemRowIds(rows), []);
});

test("mixed: prunes each adjacent same-body run independently", () => {
  const rows = [
    sys("1", "Added talent.", "t1"),
    sys("2", "Added talent.", "t2"),
    sys("3", "Lineup · 2 talent", "t3"),
    sys("4", "Contact details updated.", "t4"),
    sys("5", "Contact details updated.", "t5"),
    sys("6", "Contact details updated.", "t6"),
  ];
  assert.deepEqual(findPrunableSystemRowIds(rows), ["1", "4", "5"]);
});

test("never targets human messages or singletons", () => {
  assert.deepEqual(findPrunableSystemRowIds([msg("a"), sys("b", "x", "t"), msg("c")]), []);
});
