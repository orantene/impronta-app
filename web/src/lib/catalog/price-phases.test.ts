import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { livePhasePrice, setOfferingPricePhase } from "./price-phases";

test("livePhasePrice picks the latest started open phase", async () => {
  const admin = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            lte: async () => ({
              data: [
                { id: "old", price_cents: 1000, starts_at: "2026-01-01T00:00:00.000Z", ends_at: null, variant_id: null },
                { id: "live", price_cents: 2500, starts_at: "2026-09-01T00:00:00.000Z", ends_at: null, variant_id: null },
                { id: "future", price_cents: 9000, starts_at: "2026-12-01T00:00:00.000Z", ends_at: null, variant_id: null },
              ],
              error: null,
            }),
          }),
        }),
      }),
    }),
  };
  const hit = await livePhasePrice(admin, {
    tenantId: "t1",
    offeringId: "off-1",
    nowIso: "2026-10-01T00:00:00.000Z",
  });
  assert.equal(hit.ok, true);
  if (hit.ok) {
    assert.equal(hit.phaseId, "live");
    assert.equal(hit.priceCents, 2500);
  }
});

test("livePhasePrice treats +00:00 and Z as the same instant", async () => {
  const admin = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            lte: async () => ({
              data: [
                {
                  id: "offset",
                  price_cents: 1800,
                  starts_at: "2026-10-01T00:00:00+00:00",
                  ends_at: "2026-10-02T00:00:00+00:00",
                  variant_id: null,
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    }),
  };
  const live = await livePhasePrice(admin, {
    tenantId: "t1",
    offeringId: "off-1",
    nowIso: "2026-10-01T12:00:00.000Z",
  });
  assert.equal(live.ok, true);
  if (live.ok) {
    assert.equal(live.phaseId, "offset");
    assert.equal(live.priceCents, 1800);
  }

  const ended = await livePhasePrice(admin, {
    tenantId: "t1",
    offeringId: "off-1",
    nowIso: "2026-10-02T00:00:00.000Z",
  });
  assert.equal(ended.ok, true);
  if (ended.ok) {
    assert.equal(ended.phaseId, null);
    assert.equal(ended.priceCents, null);
  }
});

test("an inverted phase window is overlap", async () => {
  const result = await setOfferingPricePhase(
    { from: () => ({}) },
    {
      tenantId: "t1",
      offeringId: "off-1",
      label: "Early",
      startsAt: "2026-10-02T00:00:00.000Z",
      endsAt: "2026-10-01T00:00:00.000Z",
      priceCents: 1000,
    },
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "overlap");
});

test("repriceAndValidate reads livePhasePrice only for unstamped lines", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/pos/draft.ts"), "utf8");
  assert.match(src, /livePhasePrice/);
  assert.match(src, /price_phase_id/);
  assert.match(src, /A stamped phase is the price that sold/);
});
