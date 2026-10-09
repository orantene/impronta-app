import assert from "node:assert/strict";
import test from "node:test";

import {
  EMPTY_HOURS_MESSAGES,
  formatWeeklyHoursLines,
  planMyselfBothCopy,
  planOfferingRehome,
  replaceEmptyHoursInJson,
} from "./myself-both-workspace-copy";

const weekly = {
  "0": [],
  "1": [{ startMin: 540, endMin: 1140 }],
  "2": [{ startMin: 540, endMin: 1140 }],
  "3": [{ startMin: 540, endMin: 1140 }],
  "4": [{ startMin: 540, endMin: 1140 }],
  "5": [{ startMin: 540, endMin: 1140 }],
  "6": [{ startMin: 540, endMin: 1140 }],
};

test("planOfferingRehome moves hub talent rows and skips workspace / house", () => {
  const plan = planOfferingRehome(
    [
      { id: "a", tenant_id: "hub", owner_kind: "talent" },
      { id: "b", tenant_id: "ws", owner_kind: "talent" },
      { id: "c", tenant_id: "hub", owner_kind: "workspace" },
      { id: "d", tenant_id: null, owner_kind: "talent" },
    ],
    "ws",
  );
  assert.deepEqual(plan.offeringIds, ["a"]);
  assert.deepEqual(plan.sourceTenantIds, ["hub"]);
});

test("planMyselfBothCopy: full myself→both gap", () => {
  const plan = planMyselfBothCopy({
    workspaceTenantId: "ws",
    offerings: [
      { id: "a", tenant_id: "hub", owner_kind: "talent" },
      { id: "b", tenant_id: "hub", owner_kind: "talent" },
    ],
    hoursWeekly: weekly,
    hoursTenantId: "hub",
    workspaceOpeningHours: null,
    appointmentsEnabled: false,
  });
  assert.deepEqual(plan.offeringIds, ["a", "b"]);
  assert.equal(plan.writeOpeningHours, true);
  assert.equal(plan.enableAppointments, true);
  assert.equal(plan.rehomeHoursTenant, true);
});

test("planMyselfBothCopy: idempotent when already on workspace", () => {
  const plan = planMyselfBothCopy({
    workspaceTenantId: "ws",
    offerings: [{ id: "a", tenant_id: "ws", owner_kind: "talent" }],
    hoursWeekly: weekly,
    hoursTenantId: "ws",
    workspaceOpeningHours: weekly,
    appointmentsEnabled: true,
  });
  assert.deepEqual(plan.offeringIds, []);
  assert.equal(plan.writeOpeningHours, false);
  assert.equal(plan.enableAppointments, false);
  assert.equal(plan.rehomeHoursTenant, false);
});

test("formatWeeklyHoursLines skips closed days", () => {
  const es = formatWeeklyHoursLines(weekly, "es");
  assert.equal(es.length, 6);
  assert.match(es[0]!, /^Lun 09:00-19:00$/);
  const en = formatWeeklyHoursLines(weekly, "en");
  assert.match(en[0]!, /^Mon 09:00-19:00$/);
});

test("replaceEmptyHoursInJson swaps baked empty hours copy", () => {
  const tree = {
    props: { text: EMPTY_HOURS_MESSAGES[0] },
    children: [{ props: { emptyStateText: EMPTY_HOURS_MESSAGES[1] } }],
  };
  const { value, changed } = replaceEmptyHoursInJson(tree, ["Lun 09:00-19:00", "Mar 09:00-19:00"]);
  assert.equal(changed, true);
  assert.equal(value.props.text, "Lun 09:00-19:00 · Mar 09:00-19:00");
  assert.equal(value.children[0]!.props.emptyStateText, "Lun 09:00-19:00 · Mar 09:00-19:00");
});

test("replaceEmptyHoursInJson leaves unrelated trees alone", () => {
  const tree = { props: { text: "Hello" } };
  const { value, changed } = replaceEmptyHoursInJson(tree, ["Lun 09:00-19:00"]);
  assert.equal(changed, false);
  assert.deepEqual(value, tree);
});
