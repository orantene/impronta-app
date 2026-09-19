import assert from "node:assert/strict";
import { test } from "node:test";

import { fakeAdmin, uuid } from "@/lib/storefront/__fixtures__/fake-admin";

import { renameClientContact } from "./client-rename";
import { signThreadToken, verifyThreadToken } from "./thread-token";

const TENANT = uuid(1);
const INQUIRY = uuid(2);
const USER = uuid(3);
const CUSTOMER = uuid(4);

function seed(over: { name?: string; email?: string; clientUserId?: string | null } = {}) {
  return fakeAdmin({
    inquiries: [
      {
        id: INQUIRY,
        tenant_id: TENANT,
        version: 1,
        contact_name: over.name ?? "Guest",
        contact_email: over.email ?? "ana@example.com",
        contact_phone: "+15555550100",
        client_user_id: over.clientUserId === undefined ? USER : over.clientUserId,
      },
    ],
    profiles: [{ id: USER, display_name: over.name ?? "Guest" }],
    customers: [{ id: CUSTOMER, tenant_id: TENANT, email: over.email ?? "ana@example.com", display_name: over.name ?? "Guest", phone_e164: "+15555550100" }],
    inquiry_action_log: [],
  });
}

test("rename writes contact_name, bumps version, logs client_edit; email and phone stay", async () => {
  const { admin, store } = seed();
  const result = await renameClientContact(admin, { tenantId: TENANT, inquiryId: INQUIRY, name: " Ana Ruiz " });
  assert.deepEqual(result, { ok: true, name: "Ana Ruiz", email: "ana@example.com", previousName: "Guest" });
  assert.equal(store.inquiries[0].contact_name, "Ana Ruiz");
  assert.equal(store.inquiries[0].contact_email, "ana@example.com");
  assert.equal(store.inquiries[0].contact_phone, "+15555550100");
  assert.equal(store.inquiries[0].version, 2);
  assert.equal(store.profiles[0].display_name, "Ana Ruiz");
  assert.equal(store.customers[0].display_name, "Ana Ruiz");
  assert.equal(store.customers[0].email, "ana@example.com");
  assert.equal(store.inquiry_action_log[0].action_type, "messaging_client_edit");
  assert.deepEqual(store.inquiry_action_log[0].metadata, { fields: ["name"] });
  assert.equal(store.inquiry_action_log[0].tenant_id, TENANT);
});

test("a guest (no client user) renames without a log row: actor_user_id is NOT NULL in production", async () => {
  const { admin, store } = seed({ clientUserId: null });
  const result = await renameClientContact(admin, { tenantId: TENANT, inquiryId: INQUIRY, name: "Ana Ruiz" });
  assert.equal(result.ok, true);
  assert.equal(store.inquiries[0].contact_name, "Ana Ruiz");
  assert.equal(store.inquiry_action_log.length, 0);
});

test("same name is a no-op: no version bump, no log, email untouched", async () => {
  const { admin, store } = seed({ name: "Ana Ruiz" });
  const result = await renameClientContact(admin, { tenantId: TENANT, inquiryId: INQUIRY, name: "Ana Ruiz" });
  assert.deepEqual(result, { ok: true, name: "Ana Ruiz", email: "ana@example.com", previousName: "Ana Ruiz" });
  assert.equal(store.inquiries[0].version, 1);
  assert.equal(store.inquiry_action_log.length, 0);
});

test("blank name is invalid; nothing writes", async () => {
  const { admin, store } = seed();
  const result = await renameClientContact(admin, { tenantId: TENANT, inquiryId: INQUIRY, name: "   " });
  assert.deepEqual(result, { ok: false, reason: "invalid" });
  assert.equal(store.inquiries[0].contact_name, "Guest");
  assert.equal(store.inquiries[0].contact_email, "ana@example.com");
});

test("no linked profile still updates the customer display name; email and phone stay", async () => {
  const { admin, store } = seed({ clientUserId: null });
  const result = await renameClientContact(admin, { tenantId: TENANT, inquiryId: INQUIRY, name: "Ana Ruiz" });
  assert.equal(result.ok, true);
  assert.equal(store.profiles[0].display_name, "Guest");
  assert.equal(store.customers[0].display_name, "Ana Ruiz");
  assert.equal(store.customers[0].email, "ana@example.com");
  assert.equal(store.customers[0].phone_e164, "+15555550100");
});

test("expired thread token is refused before any contact write", () => {
  const prev = process.env.GUEST_COOKIE_SECRET;
  process.env.GUEST_COOKIE_SECRET = "test-secret-for-pos-messages";
  const now = Date.now();
  const token = signThreadToken(INQUIRY, TENANT, now - 10_000, now - 1_000);
  assert.ok(token);
  const verified = verifyThreadToken(token);
  assert.equal(verified.ok, false);
  if (!verified.ok) assert.equal(verified.reason, "expired");
  process.env.GUEST_COOKIE_SECRET = prev;
});
