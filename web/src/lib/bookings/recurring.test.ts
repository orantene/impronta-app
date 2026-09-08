import { test } from "node:test";
import assert from "node:assert/strict";
import { occurrencesForAgreement, skipOccurrence, type RecurringAgreement } from "./recurring";

const agreement: RecurringAgreement = {
  seriesId: "s1",
  tenantId: "t1",
  title: "Weekly clean",
  isActive: true,
  spec: {
    localTime: "10:00",
    timeZone: "America/Mexico_City",
    weekdays: [2],
    durationMinutes: 90,
    startsOn: "2026-09-01",
    endsOn: null,
  },
};

test("dated occurrences come from the agreement without ending it", () => {
  const occ = occurrencesForAgreement(agreement, "2026-09-01", "2026-09-30");
  assert.ok(occ.length >= 4);
  assert.equal(agreement.isActive, true);
});

test("skipping one visit does not deactivate the series", async () => {
  let seriesTouched = false;
  const store = { sessions: [{ id: "sess-1", series_id: "s1", tenant_id: "t1", status: "scheduled" }] };
  const admin = {
    from: (table: string) => {
      if (table === "session_series") seriesTouched = true;
      let patch: Record<string, unknown> = {};
      const eqs: Array<[string, unknown]> = [];
      const api: Record<string, unknown> = {
        update: (p: Record<string, unknown>) => {
          patch = p;
          return api;
        },
        eq: (k: string, v: unknown) => {
          eqs.push([k, v]);
          return api;
        },
        select: () => api,
        maybeSingle: async () => {
          const row = store.sessions.find((s) => eqs.every(([k, v]) => (s as Record<string, unknown>)[k] === v));
          if (row) Object.assign(row, patch);
          return { data: row ? { id: row.id } : null, error: null };
        },
      };
      return api;
    },
  };
  const r = await skipOccurrence(admin, { tenantId: "t1", seriesId: "s1", sessionId: "sess-1" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.seriesStillActive, true);
  assert.equal(store.sessions[0]?.status, "cancelled");
  assert.equal(seriesTouched, false);
});
