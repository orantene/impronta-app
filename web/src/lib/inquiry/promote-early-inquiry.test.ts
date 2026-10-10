import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { hasRealGuestContact, selectedTalentIds } from "./promote-early-inquiry-pure";

const read = (f: string) => readFileSync(join(process.cwd(), "src/lib/inquiry", f), "utf8");
const PROMOTE = read("promote-early-inquiry.ts");
const SEAT = read("seat-participants.ts");
const SRC = `${PROMOTE}\n${SEAT}`;

test("the talent a guest opened the chat for is read from the lineup spine", () => {
  assert.deepEqual(selectedTalentIds({ talent: { selected_ids: ["t1", " t2 ", "t1", "", 5] } }), ["t1", "t2"]);
  assert.deepEqual(selectedTalentIds({ talent: { selected_ids: [], selection_mode: "agency_recommends" } }), []);
  assert.deepEqual(selectedTalentIds(null), []);
  assert.deepEqual(selectedTalentIds({}), []);
});

test("the synthetic early-row contact is not a real guest contact", () => {
  assert.equal(hasRealGuestContact("pending-abc@guest.impronta", "Guest"), false);
  assert.equal(hasRealGuestContact("", "Ana"), false);
  assert.equal(hasRealGuestContact("not-an-email", "Ana"), false);
  assert.equal(hasRealGuestContact("ana@example.com", ""), false);
  assert.equal(hasRealGuestContact(" Ana@Example.com ", "Ana"), true);
});

test("promotion seats the talent AND the guest client, not just a coordinator (orphan hub inquiries)", () => {
  // Before: promoteEarlyInquiryToSubmitted seated only the coordinator, so a hub guest chat
  // reached `submitted` with zero participants (23 of 34 directory_guest inquiries on production).
  assert.match(SEAT, /role: "talent"/);
  assert.match(SEAT, /talent_profile_id: tid/);
  assert.match(SEAT, /role: "client"/);
  assert.match(PROMOTE, /selectedTalentIds\(inq\.interpreted_query\)/);
  assert.match(PROMOTE, /seatParticipants\(write/);
  assert.match(PROMOTE, /ensureGuestClient\(/);
  assert.match(SEAT, /selfCoordPrimaryUserId/);
  // The requirement group must exist BEFORE the first participant insert (NOT NULL via trigger).
  assert.ok(SEAT.indexOf("inquiry_requirement_groups") < SEAT.indexOf('seat(write, "client"'));
  assert.ok(SEAT.indexOf("inquiry_requirement_groups") < SEAT.indexOf('seat(write, "coordinator"'));
});

test("promotion notifies the talent and the workspace", () => {
  assert.match(PROMOTE, /audiences: \["talent"\]/);
  assert.match(PROMOTE, /audiences: \["workspaceAdmins"\]/);
  assert.match(PROMOTE, /talentCount: talentIds\.length/);
  assert.match(PROMOTE, /INQUIRY_SUBMITTED/);
});

test("promotion stays idempotent: only a draft promotes, and the update is guarded on draft", () => {
  assert.match(PROMOTE, /\.eq\("status", "draft"\)/);
  assert.match(PROMOTE, /already: true/);
});
