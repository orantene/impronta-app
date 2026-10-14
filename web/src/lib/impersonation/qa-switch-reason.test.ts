import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { qaSwitchFailureReason, QA_SWITCH_REASONS } from "./validate";

const WEB = join(new URL(".", import.meta.url).pathname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

test("TUL-669: an inactive QA persona is named inactive, not a generic failure", () => {
  assert.equal(qaSwitchFailureReason({ ok: false, reason: "inactive" }, "client"), "inactive");
});

test("TUL-669: every validator reason maps to a specific super-admin reason", () => {
  assert.equal(qaSwitchFailureReason({ ok: false, reason: "no_profile" }, "client"), "no_profile");
  assert.equal(qaSwitchFailureReason({ ok: false, reason: "not_allowlisted" }, "client"), "not_allowlisted");
  assert.equal(qaSwitchFailureReason({ ok: false, reason: "role" }, "client"), "wrong_role");
  assert.equal(qaSwitchFailureReason({ ok: false, reason: "staff_target" }, "client"), "wrong_role");
  assert.equal(qaSwitchFailureReason({ ok: false, reason: "self" }, "client"), "wrong_role");
  assert.equal(qaSwitchFailureReason({ ok: false, reason: "not_super_admin" }, "client"), "not_authorized");
});

test("TUL-669: a valid profile of the wrong workspace role is wrong_role", () => {
  assert.equal(qaSwitchFailureReason({ ok: true }, "client", { appRole: "talent" }), "wrong_role");
  assert.equal(qaSwitchFailureReason({ ok: true }, "client", { appRole: "client" }), null);
});

test("TUL-669: reasons exist in en and es without em dashes", () => {
  for (const locale of ["en", "es"]) {
    const m = JSON.parse(read(`messages/${locale}.json`)) as { dashboard: { workspaceQaReason?: Record<string, string> } };
    for (const r of QA_SWITCH_REASONS) {
      const v = m.dashboard.workspaceQaReason?.[r];
      assert.ok(v, `${locale} ${r}`);
      assert.ok(!/[—–]/.test(v), v);
    }
  }
});

test("TUL-669: the client switch never sets the cookie or lands on bare /client without a relationship", () => {
  const src = read("src/lib/server-actions/admin-impersonation.ts");
  const fn = src.slice(src.indexOf("export async function startImpersonationAsQaClient"), src.indexOf("export async function endImpersonationToAdmin"));
  assert.doesNotMatch(fn, /redirect\([^)]*"\/client"\)/);
  assert.ok(fn.indexOf("loadClientPrimaryTenantSlug") < fn.indexOf("jar.set("), "slug resolved before the cookie is set");
  assert.match(fn, /no_relationship/);
});
