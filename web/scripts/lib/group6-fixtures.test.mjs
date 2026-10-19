import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PREFIX,
  cancunInstant,
  checkDbTarget,
  checkStripeKey,
  ownedRootIds,
  parseArgs,
  parseEnvText,
  stableId,
} from "./group6-fixtures.mjs";

const OK_ENV = {
  DATABASE_URL: "postgresql://postgres.fxlankepwnvelxjrahwk:pw@aws-0-us-east-2.pooler.supabase.com:6543/postgres",
  NEXT_PUBLIC_SUPABASE_URL: "https://fxlankepwnvelxjrahwk.supabase.co",
};

test("accepts the staging pooler login and the direct host", () => {
  assert.equal(checkDbTarget(OK_ENV).ok, true);
  assert.equal(
    checkDbTarget({ DATABASE_URL: "postgresql://postgres:pw@db.fxlankepwnvelxjrahwk.supabase.co:5432/postgres" }).ok,
    true,
  );
});

test("refuses production in any variable, a wrong login, or a missing url", () => {
  const prod = "postgresql://postgres.pluhdapdnuiulvxmyspd:pw@aws-0-us-east-2.pooler.supabase.com:6543/postgres";
  assert.equal(checkDbTarget({ DATABASE_URL: prod }).ok, false);
  assert.equal(checkDbTarget({ ...OK_ENV, SUPABASE_PROJECT_REF: "pluhdapdnuiulvxmyspd" }).ok, false);
  assert.equal(checkDbTarget({ ...OK_ENV, NEXT_PUBLIC_SUPABASE_URL: "https://pluhdapdnuiulvxmyspd.supabase.co" }).ok, false);
  assert.equal(checkDbTarget({ DATABASE_URL: "postgresql://postgres.other:pw@aws-0-us-east-2.pooler.supabase.com:6543/postgres" }).ok, false);
  assert.equal(checkDbTarget({ DATABASE_URL: "postgresql://postgres.fxlankepwnvelxjrahwk:pw@evil.example.com:6543/postgres" }).ok, false);
  assert.equal(checkDbTarget({}).ok, false);
});

test("failure reasons never echo a secret", () => {
  const r = checkDbTarget({ DATABASE_URL: "postgresql://postgres.other:supersecret@host.example.com/postgres" });
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(r).includes("supersecret"), false);
});

test("only sk_test_ stripe keys pass", () => {
  assert.equal(checkStripeKey("sk_test_abc").ok, true);
  assert.equal(checkStripeKey("sk_live_abc").ok, false);
  assert.equal(checkStripeKey("").ok, false);
});

test("ids are deterministic, uuid-shaped and unique per key", () => {
  assert.equal(stableId("a"), stableId("a"));
  assert.notEqual(stableId("a"), stableId("b"));
  assert.match(stableId("a"), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("default is a dry run; flags parse; combinations are rejected", () => {
  const d = parseArgs([]);
  assert.equal(d.apply, false);
  assert.equal(d.cleanup, false);
  assert.equal(parseArgs(["--apply"]).apply, true);
  assert.equal(parseArgs(["--cleanup", "--apply"]).cleanup, true);
  assert.ok(parseArgs(["--selftest", "--apply"]).errors.length > 0);
  assert.ok(parseArgs(["--nope"]).errors.length > 0);
  assert.ok(parseArgs(["--env-file"]).errors.length > 0);
});

test("env text parser handles quotes and ignores comments", () => {
  const e = parseEnvText('# c\nA="x y"\nB=z\n');
  assert.equal(e.A, "x y");
  assert.equal(e.B, "z");
});

test("cancunInstant is UTC-5 wall clock", () => {
  assert.equal(cancunInstant(new Date("2026-10-18T20:00:00Z"), 0, 15), "2026-10-18T20:00:00.000Z");
  assert.equal(cancunInstant(new Date("2026-10-18T20:00:00Z"), 1, 10), "2026-10-19T15:00:00.000Z");
});

test("every owned root id is a deterministic fixture id", () => {
  const roots = ownedRootIds();
  const all = Object.values(roots).flat();
  assert.ok(all.length > 10);
  assert.equal(new Set(all).size, all.length);
  assert.ok(all.every((x) => x === stableId(x) || /^[0-9a-f-]{36}$/.test(x)));
  assert.equal(PREFIX, "qa-fixture-g6");
});
