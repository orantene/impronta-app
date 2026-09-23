import assert from "node:assert/strict";
import { test } from "node:test";

import { fakeAdmin, uuid } from "@/lib/storefront/__fixtures__/fake-admin";

import { loadMessagingInbox } from "./inbox";
import {
  inquiryIsHers,
  keepOwnConversations,
  messagesForTalent,
  talentIdsOnInquiry,
  projectTalentLines,
  projectTalentMoney,
  talentDecisionCopy,
  talentIsSeller,
  talentPaymentRefusal,
  talentReplyThread,
} from "./talent-pov";

const HUB = "hub-tenant";
const AGENCY = "agency-tenant";
const HER = "talent-her";
const OTHER = "talent-other";

test("she is the seller only when the inquiry tenant is the hub", () => {
  assert.equal(talentIsSeller(HUB, HUB), true);
  assert.equal(talentIsSeller(AGENCY, HUB), false);
  assert.equal(talentIsSeller(HUB, null), false);
  assert.equal(talentIsSeller("", HUB), false);
});

test("request payment on an agency sale is not_her_sale", () => {
  assert.equal(talentPaymentRefusal(false), "not_her_sale");
  assert.equal(talentPaymentRefusal(true), null);
});

test("the inbox keeps only her conversations", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(keepOwnConversations(rows, new Set(["b"])).map((row) => row.id), ["b"]);
});

test("a guest chat that names only her is hers, a shared lineup is not", () => {
  assert.equal(inquiryIsHers({ profileId: HER, participant: false, talentIds: [HER] }), true);
  assert.equal(inquiryIsHers({ profileId: HER, participant: false, talentIds: [HER, OTHER] }), false);
  assert.equal(inquiryIsHers({ profileId: HER, participant: true, talentIds: [HER, OTHER] }), true);
  assert.deepEqual(
    talentIdsOnInquiry({ talent_ids: [HER, 3] }, { talent: { selected_ids: [HER] } }),
    [HER],
  );
});

test("a rostered talent sees her net, not the client total or the other talent", () => {
  const lines = [
    { id: "hers", label: "Soft Gel", units: 1, unitCents: 80_000, talentProfileId: HER, talentCostCents: 80_000 },
    { id: "other", label: "Hair", units: 1, unitCents: 40_000, talentProfileId: OTHER, talentCostCents: 40_000 },
  ];
  const shown = projectTalentLines(lines, HER, false, 70_000);
  assert.deepEqual(shown.map((line) => line.id), ["hers"]);
  assert.equal(shown[0].unitCents, 70_000);
  assert.equal(shown.some((line) => line.unitCents === 40_000), false);
  const money = projectTalentMoney({
    isSeller: false,
    currency: "mxn",
    clientTotalCents: 103_000,
    paidCents: 0,
    herNetCents: 70_000,
  });
  assert.deepEqual(money, { totalCents: 70_000, paidCents: 0, balanceCents: 70_000, currency: "MXN" });
});

test("a paid agency sale marks her net paid and still hides the client total", () => {
  const money = projectTalentMoney({
    isSeller: false,
    currency: "USD",
    clientTotalCents: 103_000,
    paidCents: 103_000,
    herNetCents: 70_000,
  });
  assert.equal(money?.totalCents, 70_000);
  assert.equal(money?.paidCents, 70_000);
  assert.equal(money?.balanceCents, 0);
});

test("on her hub sale she sees the full client total", () => {
  const lines = [
    { id: "hers", label: "Soft Gel #3", units: 1, unitCents: 55_000, talentProfileId: HER, talentCostCents: 55_000 },
  ];
  const shown = projectTalentLines(lines, HER, true, 55_000);
  assert.equal(shown[0].unitCents, 55_000);
  const money = projectTalentMoney({
    isSeller: true,
    currency: "MXN",
    clientTotalCents: 65_000,
    paidCents: 0,
    herNetCents: 55_000,
  });
  assert.equal(money?.totalCents, 65_000);
  assert.equal(money?.currency, "MXN");
});

test("without a net, an agency conversation shows no money", () => {
  assert.equal(
    projectTalentMoney({ isSeller: false, currency: "USD", clientTotalCents: 10_000, paidCents: 0, herNetCents: null }),
    null,
  );
});

test("a rostered talent reads the group thread only, with money stripped", () => {
  const messages = messagesForTalent(
    [
      { thread: "private" as const, payload: { totalCents: 103_000 }, body: "client total" },
      { thread: "group" as const, payload: { label: "Soft Gel", totalCents: 103_000 }, body: "see you there" },
    ],
    false,
  );
  assert.equal(messages.length, 1);
  assert.equal(messages[0].thread, "group");
  assert.deepEqual(messages[0].payload, { label: "Soft Gel" });
});

test("the seller keeps the private thread", () => {
  const messages = messagesForTalent(
    [{ thread: "private" as const, payload: { totalCents: 65_000 } }],
    true,
  );
  assert.equal(messages.length, 1);
  assert.equal((messages[0].payload as { totalCents: number }).totalCents, 65_000);
});

test("she replies on the client thread only when she is the seller", () => {
  assert.equal(talentReplyThread(true), "private");
  assert.equal(talentReplyThread(false), "group");
});

test("approve and decline copy is en es fr", () => {
  assert.equal(talentDecisionCopy("en").approve, "Approve");
  assert.equal(talentDecisionCopy("es-MX").decline, "Rechazar");
  assert.equal(talentDecisionCopy("fr").approve, "Accepter");
  for (const locale of ["en", "es", "fr"]) {
    const copy = talentDecisionCopy(locale);
    assert.doesNotMatch(`${copy.approve} ${copy.decline}`, /\u2014|customer/i);
  }
});

test("onlyInquiryIds hides every other conversation, including another tenant", async () => {
  const hers = uuid(2);
  const other = uuid(3);
  const { admin } = fakeAdmin({
    inquiries: [
      inquiry(hers, AGENCY),
      inquiry(other, HUB),
    ],
    inquiry_message_reads: [],
    inquiry_messages: [],
    profiles: [],
    conversation_records: [],
  });
  const result = await loadMessagingInbox(admin, {
    tenantId: HUB,
    locationSlug: "all",
    filter: "all",
    actorUserId: "user-1",
    onlyInquiryIds: [hers],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.rows.map((row) => row.id), [hers]);
});

function inquiry(id: string, tenantId: string) {
  return {
    id,
    tenant_id: tenantId,
    location_slug: "studio",
    contact_name: "Ana",
    contact_phone: null,
    contact_email: null,
    conversation_state: "needs_reply",
    opportunity_state: null,
    channel: "web_chat",
    owner_user_id: null,
    last_customer_message_at: null,
    last_staff_message_at: null,
    resolved_at: null,
    lost_reason: null,
    status: "new",
    current_offer_id: null,
    message: "Hola",
    updated_at: "2026-09-23T10:00:00Z",
    version: 1,
  };
}
