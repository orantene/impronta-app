/**
 * Legal 2.1 / 2.2: hashing, versioning and the signup age checkbox.
 * Pure logic, no DB.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  decideVersion,
  hashPolicyText,
  isAgeAndTermsConfirmed,
  isLegalAcceptanceEnabled,
  isMissingSchemaError,
  renderBookingPolicyText,
} from "./policy-versions.core";

test("hash ignores line-ending and trailing-space noise but not wording", () => {
  const a = hashPolicyText("Booking policy\nDeposit: 20%");
  assert.equal(a, hashPolicyText("Booking policy  \r\nDeposit: 20%\n"));
  assert.notEqual(a, hashPolicyText("Booking policy\nDeposit: 30%"));
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("first version is 1; same hash reuses; changed hash bumps", () => {
  assert.deepEqual(decideVersion(null, "h1"), { action: "insert", version: 1 });
  const latest = { id: "v3", version: 3, content_hash: "h1" };
  assert.deepEqual(decideVersion(latest, "h1"), { action: "reuse", id: "v3", version: 3 });
  assert.deepEqual(decideVersion(latest, "h2"), { action: "insert", version: 4 });
});

test("booking text is driven by settings: refund preset or deposit change cuts a new hash", () => {
  const base = renderBookingPolicyText({ depositPct: 0, refundPolicy: "tiered" });
  assert.match(base, /Deposit: none required/);
  const withDeposit = renderBookingPolicyText({ depositPct: 25, refundPolicy: "tiered" });
  assert.match(withDeposit, /Deposit: 25%/);
  const flexible = renderBookingPolicyText({ depositPct: 0, refundPolicy: "flexible" });
  const hashes = new Set([base, withDeposit, flexible].map(hashPolicyText));
  assert.equal(hashes.size, 3);
  assert.equal(hashPolicyText(base), hashPolicyText(renderBookingPolicyText({ depositPct: 0, refundPolicy: "tiered" })));
});

test("booking text has no em dashes", () => {
  for (const r of ["tiered", "flexible", "strict", "manual"] as const) {
    assert.ok(!renderBookingPolicyText({ depositPct: 10, refundPolicy: r }).includes("—"));
  }
});

test("age + terms checkbox: only an explicit tick passes", () => {
  assert.equal(isAgeAndTermsConfirmed("on"), true);
  assert.equal(isAgeAndTermsConfirmed("true"), true);
  assert.equal(isAgeAndTermsConfirmed(null), false);
  assert.equal(isAgeAndTermsConfirmed(undefined), false);
  assert.equal(isAgeAndTermsConfirmed(""), false);
  assert.equal(isAgeAndTermsConfirmed("off"), false);
  assert.equal(isAgeAndTermsConfirmed("false"), false);
});

test("signUpWithEmail validates age_terms before calling Supabase", () => {
  const src = readFileSync(path.join(process.cwd(), "src/app/auth/actions.ts"), "utf8");
  const fn = src.slice(src.indexOf("export async function signUpWithEmail"));
  const gate = fn.indexOf('isAgeAndTermsConfirmed(formData.get("age_terms"))');
  const call = fn.indexOf("supabase.auth.signUp(");
  assert.ok(gate > 0 && call > 0 && gate < call, "age gate must run before signUp");
  const form = readFileSync(path.join(process.cwd(), "src/app/(auth)/register/register-form.tsx"), "utf8");
  assert.match(form, /name="age_terms"[\s\S]{0,40}required/);
});

test("flag: on unless explicitly 'false'", () => {
  assert.equal(isLegalAcceptanceEnabled({}), true);
  assert.equal(isLegalAcceptanceEnabled({ LEGAL_ACCEPTANCE_ENABLED: "true" }), true);
  assert.equal(isLegalAcceptanceEnabled({ LEGAL_ACCEPTANCE_ENABLED: "false" }), false);
});

test("missing-table errors are recognised so code can ship before the migration", () => {
  assert.equal(isMissingSchemaError({ code: "42P01" }), true);
  assert.equal(isMissingSchemaError({ code: "PGRST205" }), true);
  assert.equal(isMissingSchemaError({ code: "23505" }), false);
  assert.equal(isMissingSchemaError(null), false);
});

test("migration: RLS on, no anon/authenticated write policy, no WITH CHECK (true)", () => {
  const sql = readFileSync(
    path.join(process.cwd(), "../supabase/migrations/20261231299600_policy_versions_and_acceptances.sql"),
    "utf8",
  )
    .toLowerCase()
    .replace(/--[^\n]*/g, "");
  assert.match(sql, /alter table public\.terms_acceptances enable row level security/);
  assert.match(sql, /alter table public\.policy_versions enable row level security/);
  assert.ok(!/with check\s*\(\s*true\s*\)/.test(sql));
  assert.ok(!/for (insert|update|delete|all)/.test(sql));
});
