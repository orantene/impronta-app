import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { inquiryIsHers, talentIdsOnInquiry } from "@/lib/messaging/talent-pov";

import { talentSelfInquiryAllowed } from "./talent-self-inquiry";

const HUB = "hub-tenant";
const ME = "talent-me";

test("a talent may open a conversation for herself on the hub", () => {
  assert.equal(talentSelfInquiryAllowed({ actorTalentProfileId: ME, talentProfileIds: [ME], tenantId: HUB, hubTenantId: HUB }), true);
});

test("tenant isolation: never for another talent, a lineup, another tenant or without a hub", () => {
  const base = { actorTalentProfileId: ME, tenantId: HUB, hubTenantId: HUB };
  assert.equal(talentSelfInquiryAllowed({ ...base, talentProfileIds: ["talent-other"] }), false);
  assert.equal(talentSelfInquiryAllowed({ ...base, talentProfileIds: [ME, "talent-other"] }), false);
  assert.equal(talentSelfInquiryAllowed({ ...base, talentProfileIds: [] }), false);
  assert.equal(talentSelfInquiryAllowed({ ...base, talentProfileIds: [ME], tenantId: "agency-tenant" }), false);
  assert.equal(talentSelfInquiryAllowed({ ...base, talentProfileIds: [ME], hubTenantId: null }), false);
  assert.equal(talentSelfInquiryAllowed({ ...base, actorTalentProfileId: null, talentProfileIds: [ME] }), false);
});

const dir = dirname(fileURLToPath(import.meta.url));

test("the gate is wired: submit passes selfInquiry only for a talent initiator; permissions check it", () => {
  const submit = readFileSync(join(dir, "inquiry-engine-submit.ts"), "utf8");
  assert.match(submit, /input\.initiator_role === "talent" && input\.talent_profile_ids\.length === 1/);
  assert.match(submit, /validateActorPermission\(supabase, "", input\.actorUserId, "submit_inquiry", \{ selfInquiry \}\)/);
  const perms = readFileSync(join(dir, "inquiry-permissions.ts"), "utf8");
  assert.match(perms, /talentSelfInquiryAllowed\(\{/);
});

test("talent startConversation goes through the funnel, not a direct insert", () => {
  const src = readFileSync(join(dir, "..", "server-actions", "messaging-talent-writes.ts"), "utf8");
  const start = src.slice(src.indexOf("export async function messagingTalentStartConversation"), src.indexOf("export async function messagingTalentPrivateNote"));
  assert.match(start, /createInquiryFromIntent\(/);
  assert.match(start, /talent_self: true/);
  assert.doesNotMatch(start, /"inquiries"\)\s*\.insert/);
  assert.doesNotMatch(start, /inquiry_requirement_groups/);
});

test("F54: a talent_self inquiry is listed in her inbox (seat and named lineup both count)", () => {
  // Shape of a64db5b5 as the funnel wrote it.
  const sourceContext = { channel: "counter", started_by: "talent", talent_ids: [ME] };
  const interpreted = { talent: { selected_ids: [ME] } };
  const named = talentIdsOnInquiry(sourceContext, interpreted);
  assert.deepEqual(named, [ME]);
  assert.equal(inquiryIsHers({ profileId: ME, participant: true, talentIds: named }), true);
  assert.equal(inquiryIsHers({ profileId: ME, participant: false, talentIds: named }), true);
  assert.equal(inquiryIsHers({ profileId: "talent-other", participant: false, talentIds: named }), false);
});

test("F54: after Start the shell opens the thread and lists it under All", () => {
  const shell = readFileSync(join(dir, "..", "..", "components", "messages-v5", "shell", "MessagesV5Shell.tsx"), "utf8");
  assert.match(shell, /openThread\(r\.inquiryId\);[^\n]*\n\s*if \(segment === "all"\) await reloadInbox\(\); else setSegment\("all"\);/);
});
