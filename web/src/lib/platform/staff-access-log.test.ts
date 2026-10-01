import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The helper writes through logPlatformAdminAction -> service-role client. With
// no service-role env the writer logs and returns, so these assert behaviour
// through the return value and the wiring, not a DB row.
import { logStaffInquiryRead, STAFF_ACCESS_ACTIONS } from "./staff-access-log";

test("non super_admin is never logged as staff access", async () => {
  const logged = await logStaffInquiryRead({
    actorUserId: "u",
    actorAppRole: "talent",
    tenantId: "t",
    inquiryId: "i",
    surface: "x",
    isParticipant: async () => false,
  });
  assert.equal(logged, false);
});

test("a participant reading their own thread is not logged", async () => {
  const logged = await logStaffInquiryRead({
    actorUserId: "u",
    actorAppRole: "super_admin",
    tenantId: "t",
    inquiryId: "i",
    surface: "x",
    isParticipant: async () => true,
  });
  assert.equal(logged, false);
});

test("a non-participant super_admin read is logged, including when the lookup throws", async () => {
  for (const lookup of [async () => false, async () => { throw new Error("db"); }]) {
    const logged = await logStaffInquiryRead({
      actorUserId: "u",
      actorAppRole: "super_admin",
      tenantId: "t",
      inquiryId: "i",
      surface: "x",
      isParticipant: lookup,
    });
    assert.equal(logged, true);
  }
});

test("action strings are the new stable values", () => {
  assert.deepEqual(STAFF_ACCESS_ACTIONS, {
    inquiryRead: "staff.inquiry_thread.read",
    impersonationStart: "staff.impersonation.start",
    impersonationStop: "staff.impersonation.stop",
  });
});

test("impersonation start and stop and the admin thread page call the logger", () => {
  const root = join(process.cwd(), "src");
  const imp = readFileSync(join(root, "lib/server-actions/admin-impersonation.ts"), "utf8");
  assert.equal((imp.match(/logImpersonation\(/g) ?? []).length, 3);
  assert.match(imp, /phase: "stop"/);
  const page = readFileSync(
    join(root, "app/(workspace)/[tenantSlug]/admin/messages/[inquiryId]/page.tsx"),
    "utf8",
  );
  assert.match(page, /logStaffInquiryRead\(/);
});
