import assert from "node:assert/strict";
import test from "node:test";

import {
  emergenciesOn,
  emergenciesUntilForToggle,
  endOfLocalDay,
  loadTalentLiveStatus,
  parseTalentLiveStatus,
  saveTalentEmergencies,
} from "./live-status";

test("end of local day is the next local midnight in the talent's zone", () => {
  // 2026-10-01 20:30 in Monterrey (UTC-6) -> 2026-10-02 00:00 local = 06:00Z
  const now = new Date("2026-10-02T02:30:00Z");
  assert.equal(endOfLocalDay(now, "America/Monterrey").toISOString(), "2026-10-02T06:00:00.000Z");
  // Same instant in Madrid (UTC+2): 04:30 on Oct 2 -> next midnight = Oct 2 22:00Z
  assert.equal(endOfLocalDay(now, "Europe/Madrid").toISOString(), "2026-10-02T22:00:00.000Z");
});

test("a DST change day still lands on local midnight", () => {
  // Madrid ends DST 2026-10-25. Midnight after the 25th is UTC+1.
  const now = new Date("2026-10-25T10:00:00Z");
  assert.equal(endOfLocalDay(now, "Europe/Madrid").toISOString(), "2026-10-25T23:00:00.000Z");
});

test("unknown zone falls back to UTC, never throws", () => {
  const now = new Date("2026-10-01T15:00:00Z");
  assert.equal(endOfLocalDay(now, "Not/AZone").toISOString(), "2026-10-02T00:00:00.000Z");
  assert.equal(endOfLocalDay(now, null).toISOString(), "2026-10-02T00:00:00.000Z");
});

test("the flag reads off after expiry and when never set", () => {
  const until = "2026-10-02T06:00:00.000Z";
  assert.equal(emergenciesOn({ emergenciesUntil: until }, new Date("2026-10-02T05:59:59Z")), true);
  assert.equal(emergenciesOn({ emergenciesUntil: until }, new Date("2026-10-02T06:00:00Z")), false);
  assert.equal(emergenciesOn({ emergenciesUntil: null }), false);
  assert.equal(emergenciesOn(null), false);
  assert.deepEqual(parseTalentLiveStatus({ emergencies_until: "junk" }), { emergenciesUntil: null });
  assert.deepEqual(parseTalentLiveStatus(null), { emergenciesUntil: null });
});

test("toggle off stores null; on stores end of day", () => {
  const now = new Date("2026-10-02T02:30:00Z");
  assert.equal(emergenciesUntilForToggle(false, now, "America/Monterrey"), null);
  assert.equal(emergenciesUntilForToggle(true, now, "America/Monterrey"), "2026-10-02T06:00:00.000Z");
});

function fakeClient(row: unknown, writeError: unknown = null) {
  const writes: unknown[] = [];
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      upsert: async (value: unknown) => {
        writes.push(value);
        return { error: writeError };
      },
    }),
  };
  return { client, writes };
}

test("save is an idempotent upsert keyed on the talent", async () => {
  const { client, writes } = fakeClient(null);
  const input = {
    talentProfileId: "t1",
    userId: "u1",
    on: true,
    now: new Date("2026-10-02T02:30:00Z"),
    timeZone: "America/Monterrey",
  };
  const a = await saveTalentEmergencies(client, input);
  const b = await saveTalentEmergencies(client, input);
  assert.deepEqual(a, b);
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0], writes[1]);
  assert.deepEqual(writes[0], {
    talent_profile_id: "t1",
    emergencies_until: "2026-10-02T06:00:00.000Z",
    updated_by: "u1",
  });
});

test("a write error is reported; a read returns the stored instant", async () => {
  const bad = fakeClient(null, { message: "boom" });
  const res = await saveTalentEmergencies(bad.client, {
    talentProfileId: "t1",
    userId: null,
    on: false,
    now: new Date(),
    timeZone: null,
  });
  assert.deepEqual(res, { ok: false, error: "write_failed" });
  const ok = fakeClient({ emergencies_until: "2026-10-02T06:00:00Z" });
  assert.deepEqual(await loadTalentLiveStatus(ok.client, "t1"), { emergenciesUntil: "2026-10-02T06:00:00.000Z" });
});
