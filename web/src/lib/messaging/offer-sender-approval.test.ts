import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { splitDirectAcceptApprovals, type PendingApproval } from "./offer-sender-approval";

const SENDER = "user-valeria";
const client: PendingApproval = { id: "a-client", role: "client", participantUserId: null, talentProfileId: null };
const sender: PendingApproval = { id: "a-sender", role: "talent", participantUserId: null, talentProfileId: "tp-valeria" };
const owners = new Map<string, string | null>([["tp-valeria", SENDER], ["tp-other", "user-other"]]);

test("e2e P0: the sender's own pending approval no longer blocks the client's accept", () => {
  const out = splitDirectAcceptApprovals([client, sender], SENDER, owners);
  assert.deepEqual(out.blocking, []);
  assert.deepEqual(out.settle.sort(), ["a-client", "a-sender"]);
});

test("the sender is recognised by the participant's own user id too", () => {
  const byUser: PendingApproval = { id: "a-user", role: "talent", participantUserId: SENDER, talentProfileId: null };
  assert.deepEqual(splitDirectAcceptApprovals([client, byUser], SENDER, new Map()).blocking, []);
});

test("another talent's approval on a multi-talent offer still blocks a direct accept", () => {
  const other: PendingApproval = { id: "a-other", role: "talent", participantUserId: null, talentProfileId: "tp-other" };
  const out = splitDirectAcceptApprovals([client, sender, other], SENDER, owners);
  assert.deepEqual(out.blocking, ["a-other"]);
});

test("staff approvals still block, and an unknown sender settles only the client", () => {
  const staff: PendingApproval = { id: "a-staff", role: "staff", participantUserId: "u", talentProfileId: null };
  assert.deepEqual(splitDirectAcceptApprovals([client, staff], SENDER, owners).blocking, ["a-staff"]);
  const anon = splitDirectAcceptApprovals([client, sender], null, owners);
  assert.deepEqual(anon.settle, ["a-client"]);
  assert.deepEqual(anon.blocking, ["a-sender"]);
});

test("acceptDirect uses the split and reads the offer's sender", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "../server-actions/messaging-client.ts"), "utf8");
  assert.match(src, /splitDirectAcceptApprovals\(/);
  assert.match(src, /created_by_user_id/);
  assert.doesNotMatch(src, /rows\.some\(\(r\) => roleOf\(r\) !== "client"\)/);
});
