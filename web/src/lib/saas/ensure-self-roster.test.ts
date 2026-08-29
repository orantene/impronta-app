import { strict as assert } from "node:assert";
import { test } from "node:test";

import { planSelfRosterRow } from "./ensure-self-roster";

test("missing row → insert site_visible self roster", () => {
  assert.deepEqual(planSelfRosterRow(null), { action: "insert" });
});

test("historical self-link roster_only upgrades to site_visible + booking flag", () => {
  const plan = planSelfRosterRow({
    status: "active",
    agency_visibility: "roster_only",
    is_primary: false,
    direct_booking_enabled: false,
  });
  assert.equal(plan.action, "update");
  if (plan.action === "update") {
    assert.equal(plan.patch.agency_visibility, "site_visible");
    assert.equal(plan.patch.direct_booking_enabled, true);
    assert.equal(plan.patch.is_primary, undefined);
  }
});

test("does not flip the display switch on an already-public row", () => {
  assert.equal(
    planSelfRosterRow({
      status: "active",
      agency_visibility: "featured",
      is_primary: false,
      direct_booking_enabled: false,
    }).action,
    "noop",
  );
});

test("never flips agency-authored featured or site_visible", () => {
  assert.equal(
    planSelfRosterRow({
      status: "active",
      agency_visibility: "featured",
      is_primary: false,
      direct_booking_enabled: true,
    }).action,
    "noop",
  );
  assert.equal(
    planSelfRosterRow({
      status: "active",
      agency_visibility: "site_visible",
      is_primary: false,
      direct_booking_enabled: true,
    }).action,
    "noop",
  );
});

test("reactivates a removed/inactive self row without touching featured", () => {
  const plan = planSelfRosterRow({
    status: "inactive",
    agency_visibility: "featured",
    is_primary: false,
    direct_booking_enabled: true,
  });
  assert.equal(plan.action, "update");
  if (plan.action === "update") {
    assert.equal(plan.patch.status, "active");
    assert.equal(plan.patch.agency_visibility, undefined);
  }
});
