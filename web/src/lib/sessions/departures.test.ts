import { test } from "node:test";
import assert from "node:assert/strict";
import { isPerformerFee, loadDeparture, remainingDepartureSeats } from "./departures";
import type { CapacityAllocation, CapacityPool } from "@/lib/capacity/types";

test("an eight-seat vehicle refuses the ninth passenger", () => {
  const pool: CapacityPool = {
    id: "vehicle-1",
    tenantId: "t1",
    subjectKind: "space",
    subjectId: "van-1",
    poolKey: "default",
    parentPoolId: null,
    poolPath: ["vehicle-1"],
    unitsTotal: 8,
    overbookUnits: 0,
    holdTtlSeconds: 900,
    unitLabel: "seat",
    isActive: true,
  };
  const allocations: CapacityAllocation[] = [
    {
      id: "a1",
      poolId: "vehicle-1",
      poolPath: ["vehicle-1"],
      orderLineId: null,
      startsAt: "2026-09-08T09:00:00.000Z",
      endsAt: "2026-09-08T17:00:00.000Z",
      units: 8,
      state: "committed",
      expiresAt: null,
    },
  ];
  assert.equal(
    remainingDepartureSeats(pool, allocations, {
      startsAt: "2026-09-08T09:00:00.000Z",
      endsAt: "2026-09-08T17:00:00.000Z",
    }),
    0,
  );
});

test("the manifest is admissions; a performer fee is not a passenger", async () => {
  assert.equal(isPerformerFee("performer_fee"), true);
  assert.equal(isPerformerFee("admission"), false);
  const admin = {
    from: (table: string) => {
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        neq: () => api,
        maybeSingle: async () => {
          if (table === "sessions") {
            return {
              data: {
                id: "sess-1",
                tenant_id: "t1",
                title: "Morning reef",
                starts_at: "2026-09-08T09:00:00.000Z",
                ends_at: "2026-09-08T17:00:00.000Z",
                venue_id: "v1",
                offering_id: "off-1",
              },
              error: null,
            };
          }
          if (table === "venues") return { data: { name: "Dock A" }, error: null };
          if (table === "talent_offerings") return { data: { talent_profile_id: "guide-1" }, error: null };
          return { data: null, error: null };
        },
        then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
          if (table === "admissions") {
            return Promise.resolve({
              data: [
                { id: "adm-1", holder_name: "Ana", party_size: 1, admitted_count: 0, status: "valid" },
              ],
              error: null,
            }).then(resolve);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return api;
    },
  };
  const r = await loadDeparture(admin, { tenantId: "t1", sessionId: "sess-1" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.departure.meetingPoint, "Dock A");
  assert.equal(r.departure.passengers.length, 1);
  assert.equal(r.departure.performerTalentId, "guide-1");
  assert.ok(!r.departure.passengers.some((p) => p.admissionId === "guide-1"));
});
