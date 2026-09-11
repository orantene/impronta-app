import { test } from "node:test";
import assert from "node:assert/strict";
import { visitFitsServiceArea } from "./service-visit";

function fakeAreas(rows: Array<{ location_id: string | null; service_kind: string }>) {
  return {
    from: () => {
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(resolve),
      };
      return api;
    },
  };
}

test("a chef visit inside a travel_to city is allowed", async () => {
  const r = await visitFitsServiceArea(fakeAreas([
    { location_id: "loc-cdmx", service_kind: "travel_to" },
    { location_id: "loc-home", service_kind: "home_base" },
  ]) as never, { talentProfileId: "chef-1", locationId: "loc-cdmx" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.mode, "at_location");
});

test("a visit outside the area is refused", async () => {
  const r = await visitFitsServiceArea(fakeAreas([
    { location_id: "loc-home", service_kind: "home_base" },
  ]) as never, { talentProfileId: "chef-1", locationId: "loc-other" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "out_of_area");
});

test("remote-only work does not require a visit address", async () => {
  const r = await visitFitsServiceArea(fakeAreas([
    { location_id: null, service_kind: "remote_only" },
  ]) as never, { talentProfileId: "voice-1" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.mode, "remote");
});
