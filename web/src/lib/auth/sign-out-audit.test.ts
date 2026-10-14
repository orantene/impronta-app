/**
 * TUL-616 (option 1): sign-out writes a workspace audit event, fire-and-forget.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { signOutAuditEvent } from "./sign-out-audit";

const T = "11111111-2222-3333-4444-555555555555";

test("builds an auth.signed_out event for a known tenant and user", () => {
  const ev = signOutAuditEvent(T, { id: "u1", email: "a@b.co" });
  assert.equal(ev?.tenantId, T);
  assert.equal(ev?.category, "auth");
  assert.equal(ev?.action, "auth.signed_out");
  assert.equal(ev?.actorUserId, "u1");
  assert.equal(ev?.actorLabel, "a@b.co");
});

test("no tenant or no verified user: no event (never guesses a workspace)", () => {
  assert.equal(signOutAuditEvent(null, { id: "u1", email: null }), null);
  assert.equal(signOutAuditEvent("", { id: "u1", email: null }), null);
  assert.equal(signOutAuditEvent(T, null), null);
});

test("route schedules the audit (never awaits it) before revoking the session", () => {
  const src = readFileSync(join(process.cwd(), "src/app/auth/sign-out/route.ts"), "utf8");
  const sched = src.indexOf("scheduleWorkspaceAudit(");
  const revoke = src.indexOf("auth.signOut(");
  assert.ok(sched > 0, "route must call scheduleWorkspaceAudit");
  assert.ok(sched < revoke, "audit must be scheduled before signOut revokes the session");
  assert.ok(!/await\s+scheduleWorkspaceAudit/.test(src), "audit must not block sign-out");
  assert.ok(src.includes("TENANT_HEADER_NAME"), "workspace comes from the proxy-set tenant header only");
});
