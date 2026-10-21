import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { pickSoloRosterTalentId } from "./solo-roster-talent";

test("TUL-662: exactly one active roster talent is the assistant's talent", () => {
  assert.equal(pickSoloRosterTalentId([{ talent_profile_id: "t1", status: "active" }]), "t1");
  assert.equal(
    pickSoloRosterTalentId([{ talent_profile_id: "t1", status: "active" }, { talent_profile_id: "t2", status: "removed" }]),
    "t1",
  );
  assert.equal(pickSoloRosterTalentId([{ talent_profile_id: "t1" }, { talent_profile_id: "t1" }]), "t1");
});

test("TUL-662: an agency with several talents, none, or bad rows stays talent-less", () => {
  assert.equal(pickSoloRosterTalentId([{ talent_profile_id: "t1" }, { talent_profile_id: "t2" }]), null);
  assert.equal(pickSoloRosterTalentId([]), null);
  assert.equal(pickSoloRosterTalentId(null), null);
  assert.equal(pickSoloRosterTalentId([{ talent_profile_id: null }, { talent_profile_id: "  " }]), null);
  assert.equal(pickSoloRosterTalentId([{ talent_profile_id: "t1", status: "removed" }]), null);
});

test("TUL-662: the turn falls back to the solo roster talent before skipping", () => {
  const src = readFileSync(join(__dirname, "turn.server.ts"), "utf8");
  assert.match(src, /pickSoloRosterTalentId/);
  assert.match(src, /agency_talent_roster/);
  assert.match(src, /soloRosterTalentId\(inputArgs\.tenantId\)/);
});
