import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_TENANT_ID,
  checkTarget,
  parseArgs,
  seedIds,
  splitAmounts,
  stableId,
} from "./paid-guest-seed.mjs";

const good = {
  NEXT_PUBLIC_SUPABASE_URL: "https://fxlankepwnvelxjrahwk.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "x",
  STRIPE_SECRET_KEY: "sk_test_abc",
};

test("guard accepts staging + test key", () => {
  assert.equal(checkTarget(good).ok, true);
});
test("guard refuses the production project", () => {
  const r = checkTarget({ ...good, NEXT_PUBLIC_SUPABASE_URL: "https://pluhdapdnuiulvxmyspd.supabase.co" });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join(" "), /PRODUCTION/);
});
test("guard refuses any other host, including look-alikes", () => {
  for (const u of ["https://other.supabase.co", "https://fxlankepwnvelxjrahwk.supabase.co.evil.com", "", "not a url"]) {
    assert.equal(checkTarget({ ...good, NEXT_PUBLIC_SUPABASE_URL: u }).ok, false, u);
  }
});
test("guard refuses live and restricted Stripe keys and a missing key", () => {
  for (const k of ["sk_live_abc", "rk_test_abc", "pk_test_abc", ""]) {
    assert.equal(checkTarget({ ...good, STRIPE_SECRET_KEY: k }).ok, false, k);
  }
});
test("STRIPE_FORCE_TEST_MODE reads the _TEST sibling and never the live value", () => {
  const env = { ...good, STRIPE_SECRET_KEY: "sk_live_abc", STRIPE_FORCE_TEST_MODE: "1" };
  assert.equal(checkTarget(env).ok, false);
  assert.equal(checkTarget({ ...env, STRIPE_SECRET_KEY_TEST: "sk_test_z" }).ok, true);
});
test("guard refuses a production DATABASE_URL even with a staging URL", () => {
  assert.equal(checkTarget({ ...good, DATABASE_URL: "postgres://x@db.pluhdapdnuiulvxmyspd.supabase.co/postgres" }).ok, false);
});
test("guard output never contains secret values", () => {
  const r = checkTarget({ ...good, STRIPE_SECRET_KEY: "sk_live_SECRETVALUE" });
  assert.ok(!JSON.stringify(r).includes("SECRETVALUE"));
});

test("parseArgs defaults and flags", () => {
  const a = parseArgs([]);
  assert.deepEqual([a.rollback, a.dryRun, a.tenantId, a.amountCents, a.currency, a.errors.length], [false, false, DEFAULT_TENANT_ID, 15000, "usd", 0]);
  assert.equal(parseArgs(["--rollback"]).rollback, true);
  assert.equal(parseArgs(["--amount-cents", "2500", "--currency", "MXN"]).currency, "mxn");
});
test("parseArgs rejects bad input", () => {
  assert.ok(parseArgs(["--bogus"]).errors.length);
  assert.ok(parseArgs(["--amount-cents", "5"]).errors.length);
  assert.ok(parseArgs(["--tenant-id", "nope"]).errors.length);
  assert.ok(parseArgs(["--tenant-id"]).errors.length);
  assert.ok(parseArgs(["--rollback", "--dry-run"]).errors.length);
});

test("ids are stable, distinct and uuid-shaped", () => {
  const a = seedIds();
  assert.deepEqual(a, seedIds());
  assert.equal(new Set(Object.values(a)).size, 3);
  for (const v of Object.values(a)) assert.match(v, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(stableId("a"), stableId("b"));
});
test("split satisfies the fee + net = gross constraint", () => {
  const s = splitAmounts(15000);
  assert.equal(s.feeCents + s.netCents, s.grossCents);
  assert.equal(s.feeCents, 900);
});
