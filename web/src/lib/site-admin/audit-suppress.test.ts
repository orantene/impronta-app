import test from "node:test";
import assert from "node:assert/strict";

import { emitAuditEvent, withoutPlatformAudit, type Phase5AuditEvent } from "@/lib/site-admin/audit";

const event: Phase5AuditEvent = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  actorProfileId: null,
  action: "agency.site_admin.homepage.publish",
  entityType: "cms_pages",
  entityId: "22222222-2222-2222-2222-222222222222",
  diffSummary: "x",
  beforeSnapshot: null,
  afterSnapshot: null,
  correlationId: "c",
};

function fakeSupabase() {
  const calls: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = {
    rpc: async (name: string) => {
      calls.push(name);
      return { error: null };
    },
  };
  return { sb, calls };
}

test("platform audit RPC runs for normal (staff) callers", async () => {
  const { sb, calls } = fakeSupabase();
  await emitAuditEvent(sb, event);
  assert.deepEqual(calls, ["record_phase5_audit"]);
});

test("owner-initiated provisioning skips the staff-only RPC", async () => {
  const { sb, calls } = fakeSupabase();
  await withoutPlatformAudit(() => emitAuditEvent(sb, event));
  assert.deepEqual(calls, []);
});

test("suppression does not leak outside the wrapped scope", async () => {
  const { sb, calls } = fakeSupabase();
  await withoutPlatformAudit(async () => {});
  await emitAuditEvent(sb, event);
  assert.deepEqual(calls, ["record_phase5_audit"]);
});
