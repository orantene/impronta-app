import { test } from "node:test";
import assert from "node:assert/strict";
import { expandEventSeriesLines } from "./event-series";

test("expandEventSeriesLines passes through a night that already has a session", async () => {
  const result = await expandEventSeriesLines(
    { from: () => { throw new Error("no table"); }, rpc: async () => ({ data: null, error: null }) },
    { tenantId: "t1", lines: [{ offeringId: "o1", units: 1, sessionId: "s1" }] },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0]?.sessionId, "s1");
});

test("expandEventSeriesLines writes one line per scheduled night", async () => {
  const admin = {
    rpc: async () => ({ data: null, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              order: async () => ({
                data: [{ id: "n1" }, { id: "n2" }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    }),
  };
  const result = await expandEventSeriesLines(admin, {
    tenantId: "t1",
    lines: [{ offeringId: "o1", units: 2, eventSeriesId: "series-1" }],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.lines.length, 2);
  assert.equal(result.lines[0]?.sessionId, "n1");
  assert.equal(result.lines[1]?.sessionId, "n2");
  assert.equal(result.lines[0]?.units, 2);
});
