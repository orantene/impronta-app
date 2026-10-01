import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * Legal 2.2 static checks: the acceptance migration grants no anon write, and
 * every signup surface carries the 18+ / Terms checkbox validated server side.
 */
const read = (p: string) => readFileSync(p, "utf8");
const MIGRATION = "../supabase/migrations/20261231299910_terms_acceptances.sql";
/** SQL with -- comments removed, lowercased. */
const migrationSql = () => read(MIGRATION).replace(/--[^\n]*/g, "").toLowerCase();

test("migration: RLS on, no write policy, no open predicate, no anon grant beyond select", () => {
  const sql = migrationSql();
  assert.match(sql, /alter table public\.terms_acceptances enable row level security/);
  assert.match(sql, /alter table public\.platform_policy_versions enable row level security/);
  assert.doesNotMatch(sql, /with check\s*\(\s*true\s*\)/);
  assert.doesNotMatch(sql, /for\s+(insert|update|delete|all)\b/);
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete|all)[^;]*to[^;]*\banon\b/);
  assert.doesNotMatch(sql, /grant[^;]*on table public\.terms_acceptances to[^;]*\banon\b/);
  assert.match(sql, /platform_policy_version_id is not null or talent_policy_version_id is not null/);
  assert.match(sql, /references public\.talent_policy_versions\(id\) on delete set null/);
});

test("migration does not touch the canonical talent policy tables", () => {
  const sql = migrationSql();
  assert.doesNotMatch(sql, /(create|alter) table (if not exists )?public\.talent_policy_/);
  assert.doesNotMatch(sql, /alter table public\.(inquiries|inquiry_offers|agency_bookings|orders)\b/);
});

test("signup forms render the checkbox", () => {
  for (const f of [
    "src/app/(auth)/register/register-form.tsx",
    "src/components/marketing/talent-register-modal.tsx",
    "src/components/auth/email-code-form.tsx",
    "src/app/(auth)/register/accept-terms/accept-terms-form.tsx",
  ]) {
    assert.match(read(f), /<AgeTermsCheckbox\b/, f);
  }
});

test("server actions validate the checkbox", () => {
  const actions = read("src/app/auth/actions.ts");
  const signUp = actions.slice(actions.indexOf("export async function signUpWithEmail"), actions.indexOf("export async function signUpTalentInPlace"));
  assert.match(signUp, /isAgeAndTermsConfirmed\(formData\.get\("age_terms"\)\)/);
  assert.ok(signUp.indexOf("isAgeAndTermsConfirmed") < signUp.indexOf("supabase.auth.signUp"), "checked before the account is created");
  const otp = read("src/app/auth/otp-actions.ts");
  assert.ok(otp.indexOf("isAgeAndTermsConfirmed") < otp.indexOf("signInWithOtp({"), "checked before the code is sent");
  assert.match(read("src/app/(auth)/register/accept-terms/actions.ts"), /isAgeAndTermsConfirmed\(formData\.get\("age_terms"\)\)/);
});

test("es copy: tú form, no voseo, no em dashes", () => {
  const es = JSON.parse(read("messages/es.json"));
  const strings = [
    ...Object.values(es.public.auth.acceptTerms as Record<string, string>),
    es.public.auth.actions.ageTermsRequired,
    es.public.auth.register.ageTermsPrefix,
    es.dashboard.clientOffer.termsUpdatedTitle,
    es.dashboard.clientOffer.termsUpdatedBody,
  ] as string[];
  for (const s of strings) {
    assert.doesNotMatch(s, /—/, s);
    assert.doesNotMatch(s, /\b(tenés|aceptás|confirmá|revisá|podés|sos)\b/i, s);
  }
});
