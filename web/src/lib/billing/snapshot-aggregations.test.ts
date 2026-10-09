import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveWorkDateIso } from "./snapshot-aggregations";

// resolveWorkDateIso only reads the three date fields; cast a minimal shape.
const mk = (b: {
  event_date?: string | null;
  starts_at?: string | null;
  created_at?: string | null;
}) =>
  ({
    event_date: b.event_date ?? null,
    starts_at: b.starts_at ?? null,
    created_at: b.created_at ?? null,
  }) as unknown as Parameters<typeof resolveWorkDateIso>[0];

test("resolveWorkDateIso prefers the explicit shoot event_date", () => {
  assert.equal(
    resolveWorkDateIso(
      mk({ event_date: "2026-08-15", starts_at: "2026-09-01T10:00:00Z", created_at: "2026-06-02T00:00:00Z" }),
    ),
    "2026-08-15",
  );
});

test("resolveWorkDateIso falls back to starts_at (date part) when no event_date", () => {
  assert.equal(
    resolveWorkDateIso(mk({ starts_at: "2026-09-01T10:00:00Z", created_at: "2026-06-02T00:00:00Z" })),
    "2026-09-01",
  );
});

test("Finding E: falls back to created_at when a booking has no shoot date — so a PAID 'date TBC' booking is NOT dropped from the talent's earnings", () => {
  assert.equal(
    resolveWorkDateIso(mk({ event_date: null, starts_at: null, created_at: "2026-06-02T10:06:16Z" })),
    "2026-06-02",
  );
});

test("resolveWorkDateIso returns null only when the booking has no date at all", () => {
  assert.equal(resolveWorkDateIso(mk({})), null);
});

// ── Talent Money shows HER collected money, not the client's card charge (paid run #2, 2026-10-09) ──
import { sellerCollectedCents as _sellerCollected } from "./snapshot-aggregations";
import assert2 from "node:assert/strict";
import { test as test2 } from "node:test";

test2("sellerCollectedCents: a full MX$913.50 charge on a MX$900 sale reads as MX$900", () => {
  assert2.equal(_sellerCollected(91_350, { gross_cents: 90_000, gross_charged_cents: 91_350 }), 90_000);
});

test2("sellerCollectedCents: a 40% deposit carries 40% of the fee, so it reads as 40% of her price", () => {
  assert2.equal(_sellerCollected(36_540, { gross_cents: 90_000, gross_charged_cents: 91_350 }), 36_000);
});

test2("sellerCollectedCents: no surcharge, unknown charged, or no ledger money passes through unchanged", () => {
  assert2.equal(_sellerCollected(90_000, { gross_cents: 90_000, gross_charged_cents: 90_000 }), 90_000);
  assert2.equal(_sellerCollected(90_000, { gross_cents: 90_000, gross_charged_cents: null }), 90_000);
  assert2.equal(_sellerCollected(null, { gross_cents: 90_000, gross_charged_cents: 91_350 }), null);
});

test2("sellerCollectedCents never reports more than the ledger collected", () => {
  assert2.equal(_sellerCollected(1_000, { gross_cents: 90_000, gross_charged_cents: 91_350 }), 985);
});
