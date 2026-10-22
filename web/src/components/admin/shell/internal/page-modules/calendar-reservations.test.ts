import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { reservationsOnDay } from "./calendar-reservations";

const ev = (over: Record<string, unknown>) => ({ id: "a", contact_name: "Sofia QA · 2", event_date: "2026-10-22", starts_at: "2026-10-23T00:30:00Z", kind: "reservation", ...over });

test("TUL-1841: a 19:30 Cancun reservation (00:30Z next day) is on its local day, not the UTC one", () => {
  assert.equal(reservationsOnDay([ev({})], "2026-10-22").length, 1);
  assert.equal(reservationsOnDay([ev({})], "2026-10-23").length, 0);
});

test("TUL-1841: only reservations, and only with a time", () => {
  assert.equal(reservationsOnDay([ev({ kind: "hold" }), ev({ starts_at: null })], "2026-10-22").length, 0);
});

test("TUL-1841: the Resources view (the desktop default) draws them", () => {
  const src = readFileSync(new URL("./CalendarResources.tsx", import.meta.url), "utf8");
  assert.match(src, /reservationsOnDay\(holds, day\)/);
});
