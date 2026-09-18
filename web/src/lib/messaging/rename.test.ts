import assert from "node:assert/strict";
import { test } from "node:test";

import { fakeAdmin, uuid } from "@/lib/storefront/__fixtures__/fake-admin";

import { renameInquiry } from "./rename";

const TENANT = uuid(1);
const INQUIRY = uuid(2);
const ACTOR = uuid(3);

function seed(overrides: Partial<{ version: number; contact_name: string }> = {}) {
  return fakeAdmin({
    inquiries: [
      { id: INQUIRY, tenant_id: TENANT, version: overrides.version ?? 1, contact_name: overrides.contact_name ?? "Marco Ruiz" },
    ],
    inquiry_action_log: [],
  });
}

test("trims, saves the new name, bumps version, and logs old -> new", async () => {
  const { admin, store } = seed();
  const result = await renameInquiry(admin, {
    tenantId: TENANT,
    inquiryId: INQUIRY,
    name: "  Dinner for 6 · Sat  ",
    expectedVersion: 1,
    actorUserId: ACTOR,
  });
  assert.deepEqual(result, { ok: true, name: "  Dinner for 6 · Sat  ", version: 2 });
  assert.equal(store.inquiries[0].version, 2);
  assert.equal(store.inquiry_action_log.length, 1);
  assert.equal(store.inquiry_action_log[0].action_type, "messaging_rename");
  assert.deepEqual(store.inquiry_action_log[0].metadata, { old: "Marco Ruiz", new: "  Dinner for 6 · Sat  " });
});

test("a stale expectedVersion is a refusal, not a write", async () => {
  const { admin, store } = seed({ version: 3 });
  const result = await renameInquiry(admin, {
    tenantId: TENANT,
    inquiryId: INQUIRY,
    name: "New name",
    expectedVersion: 1,
    actorUserId: ACTOR,
  });
  assert.deepEqual(result, { ok: false, reason: "conflict" });
  assert.equal(store.inquiries[0].version, 3);
  assert.equal(store.inquiry_action_log.length, 0);
});

test("renaming to the CURRENT name is a no-op: no version bump, no log line", async () => {
  const { admin, store } = seed({ contact_name: "Marco Ruiz" });
  const result = await renameInquiry(admin, {
    tenantId: TENANT,
    inquiryId: INQUIRY,
    name: "Marco Ruiz",
    expectedVersion: 1,
    actorUserId: ACTOR,
  });
  assert.deepEqual(result, { ok: true, name: "Marco Ruiz", version: 1 });
  assert.equal(store.inquiries[0].version, 1);
  assert.equal(store.inquiry_action_log.length, 0);
});

test("a rename read back through the log becomes the next rename's 'old' value", async () => {
  const { admin, store } = seed();
  const first = await renameInquiry(admin, {
    tenantId: TENANT,
    inquiryId: INQUIRY,
    name: "First name",
    expectedVersion: 1,
    actorUserId: ACTOR,
  });
  assert.equal(first.ok, true);
  const second = await renameInquiry(admin, {
    tenantId: TENANT,
    inquiryId: INQUIRY,
    name: "Second name",
    expectedVersion: 2,
    actorUserId: ACTOR,
  });
  assert.deepEqual(second, { ok: true, name: "Second name", version: 3 });
  assert.deepEqual(store.inquiry_action_log[1].metadata, { old: "First name", new: "Second name" });
});

test("refuses a conversation from another tenant", async () => {
  const { admin } = seed();
  const result = await renameInquiry(admin, {
    tenantId: uuid(9),
    inquiryId: INQUIRY,
    name: "New name",
    expectedVersion: 1,
    actorUserId: ACTOR,
  });
  assert.deepEqual(result, { ok: false, reason: "wrong_tenant" });
});

test("refuses an inquiry that does not exist", async () => {
  const { admin } = seed();
  const result = await renameInquiry(admin, {
    tenantId: TENANT,
    inquiryId: uuid(404),
    name: "New name",
    expectedVersion: 1,
    actorUserId: ACTOR,
  });
  assert.deepEqual(result, { ok: false, reason: "not_found" });
});
