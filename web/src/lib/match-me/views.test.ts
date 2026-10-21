import assert from "node:assert/strict";
import { test } from "node:test";

import { shapeMyRequests, shapeOffers } from "./views";

const req = (id: string, over: Record<string, unknown> = {}) => ({ id, description: "Clean my flat", zone: "Tulum", status: "open", created_at: "2026-10-20T10:00:00Z", winner_talent_id: null, tenant_id: "t1", ...over });

test("my requests: newest first, status mapped, winner name only once accepted", () => {
  const out = shapeMyRequests({
    requests: [req("a"), req("b", { status: "accepted", winner_talent_id: "p1", created_at: "2026-10-21T10:00:00Z" }), req("c", { status: "weird" })],
    offeredCounts: { a: 5, b: 3 },
    winnerNames: { p1: "Ana " },
  });
  assert.deepEqual(out.map((r) => r.id), ["b", "a", "c"]);
  assert.equal(out[0]!.proName, "Ana");
  assert.equal(out[0]!.status, "accepted");
  assert.equal(out[1]!.offeredCount, 5);
  assert.equal(out[1]!.proName, null);
  assert.equal(out[2]!.status, "open");
});

test("a request that is not accepted never shows a professional's name", () => {
  const out = shapeMyRequests({ requests: [req("a", { winner_talent_id: "p1" })], offeredCounts: {}, winnerNames: { p1: "Ana" } });
  assert.equal(out[0]!.proName, null);
});

test("offers: only still-offered jobs on OPEN requests, phone and email hidden, newest first", () => {
  const out = shapeOffers({
    offers: [
      { request_id: "a", offered_at: "2026-10-20T10:00:00Z", status: "offered" },
      { request_id: "b", offered_at: "2026-10-21T10:00:00Z", status: "offered" },
      { request_id: "c", offered_at: "2026-10-22T10:00:00Z", status: "closed" },
      { request_id: "d", offered_at: "2026-10-23T10:00:00Z", status: "offered" },
    ],
    requests: [
      req("a", { description: "Call me 984 123 4567 or ana@x.com" }),
      req("b"),
      req("c"),
      req("d", { status: "accepted" }),
    ],
    workspaceNames: { t1: "Tulum Cleaners" },
  });
  assert.deepEqual(out.map((o) => o.requestId), ["b", "a"]);
  assert.equal(out[1]!.description, "Call me [phone hidden] or [email hidden]");
  assert.equal(out[0]!.workspaceName, "Tulum Cleaners");
});
