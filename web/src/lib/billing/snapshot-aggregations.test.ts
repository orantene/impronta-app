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
