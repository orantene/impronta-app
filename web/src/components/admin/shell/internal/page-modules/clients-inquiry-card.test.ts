import assert from "node:assert/strict";
import { test } from "node:test";

import { clientsInquiryCard } from "./clients-inquiry-card";

test("empty inbox never reads as 'one inquiry' (TUL-733)", () => {
  assert.deepEqual(clientsInquiryCard([]), { kind: "none" });
});

test("one and many follow the inbox list", () => {
  assert.deepEqual(clientsInquiryCard([{ id: "a" }]), { kind: "one", id: "a" });
  assert.deepEqual(clientsInquiryCard([{ id: "a" }, { id: "b" }]), { kind: "many", count: 2, firstId: "a" });
});
