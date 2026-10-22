import assert from "node:assert/strict";
import { test } from "node:test";

import { fakeAdmin, uuid } from "@/lib/storefront/__fixtures__/fake-admin";

import { loadMessagingEssentials } from "./essentials";

const TENANT = uuid(1);
const INQUIRY = uuid(2);

function seed(clientUserId: string | null, identity: Array<Record<string, unknown>> = []) {
  return fakeAdmin({
    inquiries: [{ id: INQUIRY, tenant_id: TENANT, contact_name: "qa-fixture Cliente", contact_email: null, contact_phone: null, message: null, source_page: null, version: 1, client_user_id: clientUserId }],
    conversation_identity: identity,
    conversation_records: [],
    inquiry_messages: [],
    inquiry_action_log: [],
  });
}

async function level(clientUserId: string | null, identity: Array<Record<string, unknown>> = []) {
  const { admin } = seed(clientUserId, identity);
  const r = await loadMessagingEssentials(admin, { tenantId: TENANT, inquiryId: INQUIRY });
  assert.equal(r.ok, true);
  return r.ok ? r.essentials.customer.identityLevel : null;
}

test("TUL-1887: a signed-in client with no identity row is linked, not 'no identity yet'", async () => {
  assert.equal(await level(uuid(9)), "linked");
});

test("TUL-1887: a guest with no account and no identity row stays none", async () => {
  assert.equal(await level(null), "none");
});

test("TUL-1887: a recorded identity level always wins", async () => {
  assert.equal(await level(uuid(9), [{ inquiry_id: INQUIRY, level: "confirmed", method: "sms_code" }]), "confirmed");
});
