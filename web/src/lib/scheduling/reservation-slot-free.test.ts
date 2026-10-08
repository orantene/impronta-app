import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkReservationWindowFree, isWindowFree } from "./reservation-slot-free";
import { collectBusyIntervals } from "./load-busy";

const now = new Date("2026-10-01T12:00:00Z");
// Jor booked 15:00-16:00 from her agenda; a live guest hold sits at 17:00-18:00.
const busy = collectBusyIntervals({
  bookings: [
    { starts_at: "2026-10-02T15:00:00Z", ends_at: "2026-10-02T16:00:00Z", status: "confirmed" },
    { starts_at: "2026-10-02T10:00:00Z", ends_at: "2026-10-02T11:00:00Z", status: "cancelled" },
  ],
  holds: [{ starts_at: "2026-10-02T17:00:00Z", ends_at: "2026-10-02T18:00:00Z", expires_at: "2026-10-03T12:00:00Z" }],
  now,
});
const admin = {} as SupabaseClient;
const loadBusy = (async () => busy) as never;

test("a time overlapping a confirmed agenda booking is taken", async () => {
  const r = await checkReservationWindowFree(
    admin,
    { talentProfileId: "jor", startsAt: "2026-10-02T15:30:00Z", endsAt: "2026-10-02T16:30:00Z", now },
    { loadBusy },
  );
  assert.deepEqual(r, { ok: false, code: "slot_taken" });
});

test("a time overlapping an active hold is taken", async () => {
  const r = await checkReservationWindowFree(
    admin,
    { talentProfileId: "jor", startsAt: "2026-10-02T17:00:00Z", endsAt: "2026-10-02T18:00:00Z", now },
    { loadBusy },
  );
  assert.deepEqual(r, { ok: false, code: "slot_taken" });
});

test("a free time is accepted, including over a cancelled booking and edge-adjacent", async () => {
  assert.deepEqual(
    await checkReservationWindowFree(
      admin,
      { talentProfileId: "jor", startsAt: "2026-10-02T10:00:00Z", endsAt: "2026-10-02T11:00:00Z", now },
      { loadBusy },
    ),
    { ok: true },
  );
  assert.equal(isWindowFree(busy, "2026-10-02T16:00:00Z", "2026-10-02T17:00:00Z"), true);
});

test("a busy read that fails is not a free slot", async () => {
  const r = await checkReservationWindowFree(
    admin,
    { talentProfileId: "jor", startsAt: "2026-10-02T10:00:00Z", endsAt: "2026-10-02T11:00:00Z", now },
    { loadBusy: (async () => { throw new Error("db"); }) as never },
  );
  assert.deepEqual(r, { ok: false, code: "unavailable" });
});

test("excludeHoldIds is forwarded to the busy loader (TUL-433)", async () => {
  let seen: readonly string[] | undefined;
  const r = await checkReservationWindowFree(
    admin,
    {
      talentProfileId: "jor",
      startsAt: "2026-10-02T17:00:00Z",
      endsAt: "2026-10-02T18:00:00Z",
      now,
      excludeHoldIds: ["hold-self"],
    },
    {
      loadBusy: (async (input) => {
        seen = input.excludeHoldIds;
        // Mimic loadBusyIntervals filtering out the excluded hold.
        return [];
      }) as never,
    },
  );
  assert.deepEqual(seen, ["hold-self"]);
  assert.deepEqual(r, { ok: true });
});
