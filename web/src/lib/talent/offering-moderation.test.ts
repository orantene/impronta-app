/**
 * TUL-1713: platform-admin moderation of services. The decision is tested with fakes; the
 * wiring (super_admin gate, impersonation guard, real deps, audit shape) is pinned below.
 * Run: cd web && npx tsx --test src/lib/talent/offering-moderation.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  MODERATION_REASON_MAX,
  setOfferingModeration,
  type ModerationAuditEntry,
  type ModerationDeps,
  type ModerationState,
  type StoredOffering,
} from "@/lib/talent/offering-moderation";

function fake(rows: StoredOffering[], opts: { failWrite?: boolean; failAudit?: boolean; failRead?: boolean } = {}) {
  const writes: Array<{ id: string; state: ModerationState }> = [];
  const audits: ModerationAuditEntry[] = [];
  const changed: string[] = [];
  const deps: ModerationDeps = {
    loadOffering: async (id) => (opts.failRead ? "error" : (rows.find((r) => r.id === id) ?? null)),
    writeState: async (id, state) => {
      if (opts.failWrite) return false;
      writes.push({ id, state });
      return true;
    },
    audit: async (entry) => {
      audits.push(entry);
      return !opts.failAudit;
    },
    afterChange: (o) => changed.push(o.id),
  };
  return { deps, writes, audits, changed };
}

const ROW: StoredOffering = {
  id: "off-1",
  title: "Deep tissue",
  tenant_id: "ws-1",
  talent_profile_id: "tal-1",
  owner_kind: "talent",
  moderation_state: "approved",
};

test("set: rejecting an approved service writes the state, one audit row with the reason, and refreshes the site", async () => {
  const f = fake([ROW]);
  const res = await setOfferingModeration(f.deps, "admin-1", { offeringId: "off-1", state: "rejected", reason: "  Misleading claims  " });
  assert.deepEqual(res, { ok: true, changed: true, state: "rejected", audited: true });
  assert.deepEqual(f.writes, [{ id: "off-1", state: "rejected" }]);
  assert.deepEqual(f.audits, [
    {
      actorId: "admin-1",
      action: "platform.offering.moderation.set",
      tenantId: "ws-1",
      offeringId: "off-1",
      before: "approved",
      after: "rejected",
      reason: "Misleading claims",
    },
  ]);
  assert.deepEqual(f.changed, ["off-1"]);
});

test("clear: approving a rejected service is audited as a clear", async () => {
  const f = fake([{ ...ROW, moderation_state: "rejected" }]);
  const res = await setOfferingModeration(f.deps, "admin-1", { offeringId: "off-1", state: "approved", reason: "Fixed after review" });
  assert.equal(res.ok && res.changed, true);
  assert.equal(f.audits[0]?.action, "platform.offering.moderation.clear");
  assert.equal(f.audits[0]?.before, "rejected");
});

test("setting the state it already has is a no-op: no write, no audit row", async () => {
  const f = fake([ROW]);
  assert.deepEqual(
    await setOfferingModeration(f.deps, "admin-1", { offeringId: "off-1", state: "approved", reason: "Still fine" }),
    { ok: true, changed: false, state: "approved", audited: false },
  );
  assert.deepEqual([f.writes, f.audits, f.changed], [[], [], []]);
});

test("a reason is required, an unknown state or service is refused, and nothing is written", async () => {
  const f = fake([ROW]);
  const bad = [
    { offeringId: "off-1", state: "rejected", reason: "" },
    { offeringId: "off-1", state: "rejected", reason: "ab" },
    { offeringId: "off-1", state: "rejected", reason: "x".repeat(MODERATION_REASON_MAX + 1) },
    { offeringId: "off-1", state: "banned", reason: "valid reason" },
    { offeringId: "off-1", state: undefined, reason: "valid reason" },
    { offeringId: "", state: "rejected", reason: "valid reason" },
    { offeringId: "missing", state: "rejected", reason: "valid reason" },
  ];
  for (const input of bad) assert.equal((await setOfferingModeration(f.deps, "admin-1", input)).ok, false, JSON.stringify(input));
  assert.deepEqual([f.writes, f.audits], [[], []]);
});

test("failures fail closed: a failed read or write is an error with no audit row; a failed audit still reports the stored change", async () => {
  assert.deepEqual(
    await setOfferingModeration(fake([ROW], { failRead: true }).deps, "a", { offeringId: "off-1", state: "rejected", reason: "valid reason" }),
    { ok: false, error: "Failed to save." },
  );
  const w = fake([ROW], { failWrite: true });
  assert.deepEqual(await setOfferingModeration(w.deps, "a", { offeringId: "off-1", state: "rejected", reason: "valid reason" }), {
    ok: false,
    error: "Failed to save.",
  });
  assert.deepEqual([w.audits, w.changed], [[], []]);
  const a = fake([ROW], { failAudit: true });
  assert.deepEqual(await setOfferingModeration(a.deps, "a", { offeringId: "off-1", state: "rejected", reason: "valid reason" }), {
    ok: true,
    changed: true,
    state: "rejected",
    audited: false,
  });
});

test("wiring: the action is super_admin only, refuses an impersonated session, and uses the real deps", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(workspace)/platform/admin/services/moderation-actions.ts"), "utf8");
  assert.match(src, /^"use server";/);
  assert.match(src, /assertNotImpersonating\(\)/);
  assert.match(src, /getPlatformRole\(session\.profile\) !== "super_admin"/);
  assert.match(src, /setOfferingModeration\(deps, session\.user\.id,/);
  assert.doesNotMatch(src, /^export (type|interface|const)/m, "a use-server module exports only async functions");
  const server = readFileSync(join(process.cwd(), "src/lib/talent/offering-moderation.server.ts"), "utf8");
  assert.match(server, /from\("platform_audit_log"\)\.insert/);
  assert.match(server, /\.update\(\{ moderation_state: state/);
  assert.match(server, /\.eq\("id", offeringId\)/);
});
