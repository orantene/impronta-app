import assert from "node:assert/strict";
import { test } from "node:test";

import { fakeAdmin, uuid } from "@/lib/storefront/__fixtures__/fake-admin";

import { loadMessagingEssentials } from "./essentials";

const TENANT = uuid(1);
const INQUIRY = uuid(2);

function seed(overrides: { renameLog?: Array<Record<string, unknown>> } = {}) {
  return fakeAdmin({
    inquiries: [
      {
        id: INQUIRY,
        tenant_id: TENANT,
        contact_name: "Marco Ruiz",
        contact_email: null,
        contact_phone: null,
        message: null,
        source_page: null,
        version: 4,
      },
    ],
    conversation_identity: [],
    conversation_records: [],
    inquiry_messages: [],
    inquiry_action_log: overrides.renameLog ?? [],
  });
}

test("name defaults to contact_name and carries the inquiry's version, additively", async () => {
  const { admin } = seed();
  const result = await loadMessagingEssentials(admin, { tenantId: TENANT, inquiryId: INQUIRY });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.essentials.name, "Marco Ruiz");
  assert.equal(result.essentials.version, 4);
});

test("name reflects the latest successful rename, not contact_name", async () => {
  const { admin } = seed({
    renameLog: [
      {
        inquiry_id: INQUIRY,
        actor_user_id: uuid(3),
        action_type: "messaging_rename",
        result: "success",
        created_at: "2026-09-10T10:00:00Z",
        metadata: { old: "Marco Ruiz", new: "Dinner for 6" },
      },
    ],
  });
  const result = await loadMessagingEssentials(admin, { tenantId: TENANT, inquiryId: INQUIRY });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.essentials.name, "Dinner for 6");
});
