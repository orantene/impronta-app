import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FXLANK_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  JORGELINA_TALENT_PROFILE_ID,
  isQaOnbChoiceEmail,
  assertFxlankProjectRef,
  projectRefFromSupabaseUrl,
  closureSafetyViolations,
  deleteStatementsChildrenFirst,
} from "./cleanup-qa-onb-choice-users.lib.mjs";

test("isQaOnbChoiceEmail accepts only impronta.test qa-onb-choice* locals", () => {
  for (const ok of [
    "qa-onb-choice@impronta.test",
    "qa-onb-choice-myself@impronta.test",
    "qa-onb-choice.studio.1@impronta.test",
    "QA-ONB-CHOICE-both+run@impronta.test",
  ]) {
    assert.equal(isQaOnbChoiceEmail(ok), true, ok);
  }
  for (const bad of [
    "qa-onb-choices@impronta.test",
    "qa-onb-admin@impronta.test",
    "qa-onb-build-1@impronta.test",
    "qa-onb-choice@gmail.com",
    "qa-onb-choice@pluhdapdnuiulvxmyspd.supabase.co",
    "not-choice@impronta.test",
    "",
    null,
  ]) {
    assert.equal(isQaOnbChoiceEmail(bad), false, String(bad));
  }
});

test("assertFxlankProjectRef refuses production and other refs", () => {
  assert.deepEqual(assertFxlankProjectRef(FXLANK_PROJECT_REF), { ok: true, ref: FXLANK_PROJECT_REF });
  assert.equal(assertFxlankProjectRef(PRODUCTION_PROJECT_REF).ok, false);
  assert.equal(assertFxlankProjectRef(PRODUCTION_PROJECT_REF).reason, "production_ref");
  assert.equal(assertFxlankProjectRef("otherref").ok, false);
  assert.equal(assertFxlankProjectRef("").ok, false);
});

test("projectRefFromSupabaseUrl reads the first hostname label", () => {
  assert.equal(
    projectRefFromSupabaseUrl(`https://${FXLANK_PROJECT_REF}.supabase.co`),
    FXLANK_PROJECT_REF,
  );
  assert.equal(
    projectRefFromSupabaseUrl(`https://${PRODUCTION_PROJECT_REF}.supabase.co`),
    PRODUCTION_PROJECT_REF,
  );
  assert.equal(projectRefFromSupabaseUrl("not-a-url"), "");
});

test("closureSafetyViolations catches strays and Jorgelina", () => {
  const uid = "11111111-1111-4111-8111-111111111111";
  const tid = "22222222-2222-4222-8222-222222222222";
  const aid = "33333333-3333-4333-8333-333333333333";
  assert.deepEqual(
    closureSafetyViolations({
      targetUserIds: [uid],
      targetTalentIds: [tid],
      targetAgencyIds: [aid],
      foundUserIds: [uid],
      foundTalentIds: [tid],
      foundAgencyIds: [aid],
    }),
    [],
  );
  const stray = closureSafetyViolations({
    targetUserIds: [uid],
    targetTalentIds: [tid],
    targetAgencyIds: [aid],
    foundUserIds: [uid, "99999999-9999-4999-8999-999999999999"],
    foundTalentIds: [tid, JORGELINA_TALENT_PROFILE_ID],
    foundAgencyIds: [aid],
  });
  assert.ok(stray.some((s) => s.includes("auth.users")));
  assert.ok(stray.some((s) => /Jorgelina/i.test(s)));
});

test("deleteStatementsChildrenFirst reverses discovery order", () => {
  const order = ["auth.users", "public.talent_profiles", "public.talent_sites"];
  const found = new Map([
    ["auth.users", new Set(["u1"])],
    ["public.talent_profiles", new Set(["t1"])],
    ["public.talent_sites", new Set(["s1"])],
  ]);
  const stmts = deleteStatementsChildrenFirst(
    order,
    found,
    (tbl, alias) => `${alias}.id::text`,
    (name) => name,
    (ids) => `array[${ids.map((i) => `'${i}'`).join(",")}]`,
  );
  assert.equal(stmts[0], "begin;");
  assert.equal(stmts.at(-1), "commit;");
  assert.match(stmts[1], /talent_sites/);
  assert.match(stmts[2], /talent_profiles/);
  assert.match(stmts[3], /auth\.users/);
});
