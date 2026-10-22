import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeDockPrefill } from "./dock-prefill-merge";

const viewer = { name: "Andrea Client", email: "andrea@example.com" };

test("TUL-965: a draft row with the placeholder contact does not hide the signed-in client", () => {
  const out = mergeDockPrefill({ name: "Guest", email: "pending-abc@guest.impronta", phone: null }, viewer);
  assert.equal(out?.name, "Andrea Client");
  assert.equal(out?.email, "andrea@example.com");
});

test("a real contact on the row wins over the viewer", () => {
  const out = mergeDockPrefill({ name: "Ana Perez", email: "ana@x.test", phone: "1" }, viewer);
  assert.equal(out?.name, "Ana Perez");
  assert.equal(out?.email, "ana@x.test");
  assert.equal(out?.phone, "1");
});

test("no row: the viewer; no viewer: the row untouched", () => {
  assert.deepEqual(mergeDockPrefill(null, viewer), { name: "Andrea Client", firstName: undefined, lastName: undefined, email: "andrea@example.com", phone: null });
  const row = { name: "Guest", email: null, phone: null };
  assert.equal(mergeDockPrefill(row, null), row);
  assert.equal(mergeDockPrefill(null, null), null);
});
