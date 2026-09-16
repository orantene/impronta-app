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

test("the writer compares instants, not strings: '+00:00' and 'Z' spellings of one window", async () => {
  // As strings "2026-10-01T00:00:00+00:00" > "2026-10-01T00:00:00.000Z" (the
  // '+' sorts after '.'), so the old compare refused a window whose end is
  // eleven hours AFTER its start (D-120 on the writer side).
  const written: Record<string, unknown>[] = [];
  const admin = {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        written.push(row);
        return { select: () => ({ maybeSingle: async () => ({ data: { id: "ph-1" }, error: null }) }) };
      },
    }),
  };
  const result = await setOfferingPricePhase(admin, {
    tenantId: "t1",
    offeringId: "off-1",
    label: "Early",
    startsAt: "2026-10-01T00:00:00.000Z",
    endsAt: "2026-10-01T11:00:00+00:00",
    priceCents: 1000,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(written.length, 1);

  const equal = await setOfferingPricePhase(admin, {
    tenantId: "t1",
    offeringId: "off-1",
    label: "Early",
    startsAt: "2026-10-01T00:00:00.000Z",
    endsAt: "2026-10-01T00:00:00+00:00",
    priceCents: 1000,
  });
  assert.equal(equal.ok, false);
  if (!equal.ok) assert.equal(equal.reason, "overlap");

  const junk = await setOfferingPricePhase(admin, {
    tenantId: "t1",
    offeringId: "off-1",
    label: "Early",
    startsAt: "not a date",
    endsAt: null,
    priceCents: 1000,
  });
  assert.equal(junk.ok, false);
  if (!junk.ok) assert.equal(junk.reason, "invalid");
});

test("repriceAndValidate reads livePhasePrice only for unstamped lines", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/pos/draft.ts"), "utf8");
  assert.match(src, /livePhasePrice/);
  assert.match(src, /price_phase_id/);
  assert.match(src, /A stamped phase is the price that sold/);
});
