import assert from "node:assert/strict";
import { test } from "node:test";

import { isTalentOwnedConversation, readInquiryTalentContext, talentOfferingCatalogRow } from "./talent-catalog";

test("her own site and a hub inquiry are hers; an agency inquiry stays the tenant catalog", () => {
  assert.equal(isTalentOwnedConversation({ hostKind: "talent_site", tenantId: "agency", hubTenantId: "hub" }), true);
  assert.equal(isTalentOwnedConversation({ hostKind: "hub", tenantId: "hub", hubTenantId: "hub" }), true);
  assert.equal(isTalentOwnedConversation({ hostKind: "agency", tenantId: "agency", hubTenantId: "hub" }), false);
  assert.equal(isTalentOwnedConversation({ hostKind: "hub", tenantId: "hub", hubTenantId: null }), false);
});

test("talent ids and host kind come off source_context, including a JSON string", () => {
  assert.deepEqual(readInquiryTalentContext({ host_kind: "talent_site", talent_ids: ["p1"] }), {
    hostKind: "talent_site",
    talentIds: ["p1"],
  });
  assert.deepEqual(readInquiryTalentContext(JSON.stringify({ host_kind: "hub", talent_ids: ["p2", 3] })), {
    hostKind: "hub",
    talentIds: ["p2"],
  });
});

test("a service row keeps its currency, option, and extras", () => {
  const row = talentOfferingCatalogRow({
    id: "off-1",
    title: "Soft Gel Largo",
    amountCents: 50000,
    currency: "mxn",
    kind: "service",
    durationMinutes: 90,
    soldOut: false,
    variants: [{ id: "v3", label: "Soft Gel Largo #3", amountCents: 55000 }],
    addOns: [{ id: "a1", label: "ojo de gato", amountCents: 10000 }],
  });
  assert.equal(row.category, "service");
  assert.equal(row.currency, "MXN");
  assert.equal(row.amountCents, 50000);
  assert.deepEqual(row.variants, [{ id: "v3", label: "Soft Gel Largo #3", amountCents: 55000 }]);
  assert.deepEqual(row.addOns, [{ id: "a1", label: "ojo de gato", amountCents: 10000 }]);
});
