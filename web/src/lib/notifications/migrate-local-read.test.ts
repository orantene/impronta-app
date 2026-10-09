import test from "node:test";
import assert from "node:assert/strict";

import {
  LEGACY_NOTIF_READ_KEY,
  parseLegacyReadIdSet,
  realNotificationIdsFromLegacyReadIds,
} from "./migrate-local-read";

test("LEGACY_NOTIF_READ_KEY is the historical hub key", () => {
  assert.equal(LEGACY_NOTIF_READ_KEY, "tulala_notif_read_v1");
});

test("parseLegacyReadIdSet tolerates missing and malformed storage", () => {
  assert.deepEqual([...parseLegacyReadIdSet(null)], []);
  assert.deepEqual([...parseLegacyReadIdSet(undefined)], []);
  assert.deepEqual([...parseLegacyReadIdSet("")], []);
  assert.deepEqual([...parseLegacyReadIdSet("{")], []);
  assert.deepEqual([...parseLegacyReadIdSet("null")], []);
  assert.deepEqual([...parseLegacyReadIdSet('{"a":1}')], []);
});

test("parseLegacyReadIdSet keeps only non-empty strings", () => {
  const set = parseLegacyReadIdSet(
    JSON.stringify(["notif-a", "", 3, "pending-1", "notif-a"]),
  );
  assert.deepEqual([...set].sort(), ["notif-a", "pending-1"]);
});

test("realNotificationIdsFromLegacyReadIds strips notif- and drops fixtures", () => {
  assert.deepEqual(
    realNotificationIdsFromLegacyReadIds([
      "notif-11111111-1111-4111-8111-111111111111",
      "pending-xyz",
      "rev-203",
      "plan-cap",
      "notif-22222222-2222-4222-8222-222222222222",
      "notif-11111111-1111-4111-8111-111111111111",
      "notif-",
      "bare-uuid",
    ]),
    [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ],
  );
});
