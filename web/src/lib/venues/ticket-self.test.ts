import { test } from "node:test";
import assert from "node:assert/strict";
import { ticketLookup, ticketTransfer } from "./ticket-self";

test("ticketTransfer refuses a nameless destination", async () => {
  const result = await ticketTransfer(
    { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }), rpc: async () => ({ data: null, error: null }) },
    { tenantId: "t1", code: "adm1.x.y", toName: "  ", toEmail: "a@b.com" },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "invalid");
});

test("ticketLookup refuses a short receipt tail", async () => {
  const result = await ticketLookup(
    { from: () => { throw new Error("no"); }, rpc: async () => ({ data: null, error: null }) },
    { tenantId: "t1", email: "a@b.com", last4OfReceipt: "12" },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "invalid");
});
