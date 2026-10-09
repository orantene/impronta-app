import assert from "node:assert/strict";
import { test } from "node:test";

import {
  inquiriesToHideFromAgencyInbox,
  laneIsOwnedByTenant,
  type OwningPartyLane,
} from "./agency-inbox-visibility";

const T = "tenant-A";
const OTHER = "tenant-B";

const workspaceLane = (id = T): OwningPartyLane => ({ owningPartyType: "workspace", owningPartyId: id });
const agencyLane = (id = T): OwningPartyLane => ({ owningPartyType: "agency", owningPartyId: id });
const talentLane = (id = "talent-1"): OwningPartyLane => ({ owningPartyType: "talent", owningPartyId: id });
const legacyLane = (): OwningPartyLane => ({ owningPartyType: null, owningPartyId: null });

test("laneIsOwnedByTenant: workspace/agency lane matching tenant is owned", () => {
  assert.equal(laneIsOwnedByTenant(workspaceLane(T), T), true);
  assert.equal(laneIsOwnedByTenant(agencyLane(T), T), true);
});

test("laneIsOwnedByTenant: roster talent lane is never tenant-owned", () => {
  assert.equal(laneIsOwnedByTenant(talentLane(), T), false);
});

test("laneIsOwnedByTenant: owner-talent lane counts as tenant-owned", () => {
  const owners = new Set(["owner-talent"]);
  assert.equal(laneIsOwnedByTenant(talentLane("owner-talent"), T, owners), true);
  assert.equal(laneIsOwnedByTenant(talentLane("roster-talent"), T, owners), false);
});

test("laneIsOwnedByTenant: legacy null lane defaults to tenant-owned", () => {
  assert.equal(laneIsOwnedByTenant(legacyLane(), T), true);
});

test("laneIsOwnedByTenant: workspace lane pointing at a different tenant is NOT owned", () => {
  assert.equal(laneIsOwnedByTenant(workspaceLane(OTHER), T), false);
});

test("no talent lanes (submitted/coordination stage) → never hidden", () => {
  const hide = inquiriesToHideFromAgencyInbox(new Map([["i1", []]]), T);
  assert.equal(hide.has("i1"), false);
  // also: an inquiry absent from the map entirely is never hidden (caller keeps it)
});

test("all lanes owned by this tenant → shown", () => {
  const hide = inquiriesToHideFromAgencyInbox(
    new Map([["i1", [workspaceLane(T), agencyLane(T)]]]),
    T,
  );
  assert.equal(hide.has("i1"), false);
});

test("all lanes self-coordinated (talent) → HIDDEN", () => {
  const hide = inquiriesToHideFromAgencyInbox(
    new Map([["i1", [talentLane("t1"), talentLane("t2")]]]),
    T,
  );
  assert.equal(hide.has("i1"), true);
});

test("TUL-318: all lanes self-coord but owning party is workspace owner → shown", () => {
  const owners = new Set(["owner-talent"]);
  const hide = inquiriesToHideFromAgencyInbox(
    new Map([["i1", [talentLane("owner-talent")]]]),
    T,
    owners,
  );
  assert.equal(hide.has("i1"), false);
});

test("TUL-318: non-owner roster talent self-coord stays hidden", () => {
  const owners = new Set(["owner-talent"]);
  const hide = inquiriesToHideFromAgencyInbox(
    new Map([["i1", [talentLane("roster-talent")]]]),
    T,
    owners,
  );
  assert.equal(hide.has("i1"), true);
});

test("mixed: one tenant-owned lane + one self-coordinated → shown (agency owns part)", () => {
  const hide = inquiriesToHideFromAgencyInbox(
    new Map([["i1", [workspaceLane(T), talentLane("t1")]]]),
    T,
  );
  assert.equal(hide.has("i1"), false);
});

test("legacy null lane → shown", () => {
  const hide = inquiriesToHideFromAgencyInbox(new Map([["i1", [legacyLane()]]]), T);
  assert.equal(hide.has("i1"), false);
});

test("all lanes owned by a DIFFERENT tenant → HIDDEN", () => {
  const hide = inquiriesToHideFromAgencyInbox(
    new Map([["i1", [workspaceLane(OTHER)]]]),
    T,
  );
  assert.equal(hide.has("i1"), true);
});

test("multiple inquiries partition correctly", () => {
  const hide = inquiriesToHideFromAgencyInbox(
    new Map([
      ["own", [workspaceLane(T)]],
      ["self", [talentLane("t1")]],
      ["mixed", [workspaceLane(T), talentLane("t2")]],
      ["empty", []],
      ["foreign", [agencyLane(OTHER)]],
    ]),
    T,
  );
  assert.deepEqual([...hide].sort(), ["foreign", "self"]);
});

test("TUL-318: owner-talent threads stay visible among roster self-coord hides", () => {
  const owners = new Set(["owner-talent"]);
  const hide = inquiriesToHideFromAgencyInbox(
    new Map([
      ["owner-thread", [talentLane("owner-talent")]],
      ["roster-thread", [talentLane("roster-talent")]],
      ["workspace", [workspaceLane(T)]],
    ]),
    T,
    owners,
  );
  assert.deepEqual([...hide].sort(), ["roster-thread"]);
});
