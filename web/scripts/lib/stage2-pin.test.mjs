import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { HUB_TENANT_ID } from "./failed-cards-ops.mjs";
import { repairTargetProblems, s2Id, summarise, triggerSideEffects, verifyS2Plan } from "./stage2-guards.mjs";
import { forwardReferences } from "./stage2-order.mjs";
import { BLOCKED_PIN_TABLE, PIN_TABLE_COLUMN, S2_FIXTURES, buildStage2Plan, resolveStage2 } from "./stage2-plan.mjs";
import { CHECKS } from "./stage2-readback.mjs";

const NOW = new Date("2026-10-21T12:00:00Z");
const HUB = { talentId: "5f0f0f0f-0000-4000-8000-000000009390", tenantId: HUB_TENANT_ID, hasPayout: false };
const GUARD = { externalTenantIds: new Set([HUB.tenantId]), existingTalentIds: new Set([HUB.talentId]) };
const plan = (has = () => true, only = null) => buildStage2Plan(resolveStage2(only), { now: NOW, has, hub: HUB });
const source = readFileSync(new URL("../seed-stage2-fixtures.mts", import.meta.url), "utf8");
const REPO = fileURLToPath(new URL("../../../", import.meta.url));

test("the plan never writes settings.people.pins: no op touches a pins key, and no agencies row is updated at all", () => {
  const { ops, rawOps } = plan();
  for (const list of [ops, rawOps]) {
    const text = JSON.stringify(list);
    assert.equal(/\bpins\b/.test(text), false, "no 'pins' key anywhere in the plan");
    assert.equal(list.some((o) => o.table === "public.agencies" && (o.kind === "update" || o.merge || o.set)), false, "no op updates an agencies row");
  }
  // the guard refuses a direct pins write if one is ever added
  const evil = [...ops, { fx: "T1", kind: "update", table: "public.agencies", key: "pins:evil", id: s2Id("workspace:t1"), set: { settings: { people: { pins: { x: "hash" } } } } }];
  assert.equal(verifyS2Plan(evil, GUARD).problems.some((p) => /settings\.people\.pins/.test(p)), true);
});

test("the manager PIN is one rpc op: pos_set_staff_pin(tenant = T1, actor = the T1 owner, user = the manager), after both memberships exist", () => {
  const { ops, rawOps } = plan();
  const pins = ops.filter((o) => o.kind === "pin");
  assert.equal(pins.length, 1);
  const pin = pins[0];
  assert.equal(pin.via, "pos_set_staff_pin");
  assert.equal(pin.table, "public.staff_pin_hashes");
  assert.deepEqual([pin.tenantId, pin.actorId, pin.userId], [s2Id("workspace:t1"), s2Id("user:t1-owner"), s2Id("user:t1-manager")]);
  assert.equal(pin.secretKey, "t1-manager");
  assert.equal(JSON.stringify(pin).match(/"(pin|password)"\s*:/), null, "the PIN value is not in the op");
  const at = (key) => ops.findIndex((o) => o.key === key);
  assert.ok(at("pin:t1-manager") > at("membership:t1-owner") && at("pin:t1-manager") > at("membership:t1-manager") && at("pin:t1-manager") > at("workspace:t1"));
  assert.deepEqual(forwardReferences(rawOps), []);
  assert.deepEqual(verifyS2Plan(ops, GUARD).problems, []);
  // guards: wrong function, foreign workspace, foreign user, wrong table
  const mutate = (patch) => verifyS2Plan(ops.map((o) => (o === pin ? { ...o, ...patch } : o)), GUARD);
  assert.equal(mutate({ via: "direct" }).ok, false);
  assert.equal(mutate({ tenantId: "00000000-0000-0000-0000-00000000dead" }).ok, false);
  assert.equal(mutate({ actorId: "00000000-0000-0000-0000-00000000dead" }).ok, false);
  assert.equal(mutate({ table: "public.agencies" }).ok, false);
  // the summary counts it as a function-made insert, listed in the side effects
  assert.equal(summarise(ops)["public.staff_pin_hashes"].insert, 1);
  assert.ok(triggerSideEffects(ops).some((t) => t.table === "public.staff_pin_hashes" && t.rows === 1 && /FUNCTION-made/.test(t.note)));
});

test("without the table (migration 20261231423900 not applied) the PIN is not planned and the dry run says exactly why", () => {
  assert.equal(PIN_TABLE_COLUMN, "staff_pin_hashes.pin_hash");
  const without = plan((c) => c !== PIN_TABLE_COLUMN);
  assert.equal(without.ops.some((o) => o.kind === "pin"), false);
  const b = without.blocked.find((x) => x.version === "20261231423900");
  assert.deepEqual(b, BLOCKED_PIN_TABLE);
  assert.equal(b.file, "supabase/migrations/_pending_pm/20261231423900_staff_pin_hashes_and_throttle_tul1516.sql");
  assert.equal(plan().blocked.some((x) => x.version === "20261231423900"), false);
  // when the migration file is present in the repo, the function really has the signature the op relies on
  const file = join(REPO, b.file);
  if (existsSync(file)) {
    const sql = readFileSync(file, "utf8");
    assert.match(sql, /FUNCTION public\.pos_set_staff_pin\(\s*p_tenant_id uuid,\s*p_actor_id uuid,\s*p_user_id uuid,\s*p_pin text/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.pos_set_staff_pin\(uuid, uuid, uuid, text\) TO service_role/);
    assert.match(sql, /PRIMARY KEY \(tenant_id, user_id\)/);
  }
});

test("the runner sets the PIN through the rpc only, idempotently, and never prints it", () => {
  const exec = source.slice(source.indexOf("async function execPin"), source.indexOf("async function runOps"));
  assert.match(exec, /select 1 from public\.staff_pin_hashes where tenant_id = \$1 and user_id = \$2/, "read-only existence check first");
  assert.ok(exec.indexOf("select 1 from public.staff_pin_hashes") < exec.indexOf("pos_set_staff_pin($1"), "the check precedes the call");
  assert.match(exec, /select public\.pos_set_staff_pin\(\$1::uuid, \$2::uuid, \$3::uuid, \$4::text\)/);
  assert.match(exec, /\[op\.tenantId, op\.actorId, op\.userId, pin\]/);
  assert.match(exec, /bump\("public\.staff_pin_hashes", "existed"\)/);
  // no direct write anywhere in the runner: no insert into staff_pin_hashes, no jsonb_set / jsonb_build_object of pins
  assert.equal(/insert into public\.staff_pin_hashes/i.test(source), false);
  assert.equal(/jsonb_set\(|jsonb_build_object\('pins'/.test(source), false);
  assert.equal(/people,pins\}'\s*\|\|/.test(source), false);
  // the PIN comes only from the generated secrets and no console line mentions it
  assert.match(exec, /secrets\.get\(pinName\(/);
  for (const l of source.split("\n").filter((x) => /console\.(log|error|warn)\(/.test(x))) assert.equal(/\bpin\b|\$\{pin|S2_PIN/i.test(l), false, l.trim());
  // it runs inside the write batch (same connection and transaction, so --selftest includes and rolls it back)
  assert.match(source, /else if \(op\.kind === "pin"\) await execPin\(op\)/);
  // tableCounts skips tables that do not exist yet, so the drift check works before the migration
  assert.match(source, /to_regclass\(\$1\) is not null e", \[t\]/);
});

test("--repair removes settings.people.pins from the seed's own workspaces only, with a pre-image, as a no-op when absent", () => {
  const ws = new Set(["w1", "w2"]);
  assert.deepEqual(repairTargetProblems([{ id: "w1", slug: "s2-cantina" }], ws), []);
  assert.equal(repairTargetProblems([{ id: "other", slug: "s2-cantina" }], ws).length, 1, "a non-fixture workspace id is refused");
  assert.equal(repairTargetProblems([{ id: "w1", slug: "impronta" }], ws).length, 1, "a non-s2 slug is refused");
  assert.equal(repairTargetProblems([{ id: "x", slug: "qa-3" }], ws).length, 2);
  const repair = source.slice(source.indexOf('if (mode === "repair-plan"'), source.indexOf('if (mode === "plan" || mode === "cleanup-plan")'));
  assert.match(repair, /where id = any\(\$1::uuid\[\]\) and settings #> '\{people,pins\}' is not null/, "selected from the fixture workspace ids only");
  assert.match(repair, /repairTargetProblems\(/);
  assert.match(repair, /backup\.updated\.push\(\{ table: "public\.agencies", id: r\.id as string, before: r\.j as Row \}\)/);
  assert.match(repair, /settings = settings #- '\{people,pins\}' where id = \$1 and settings #> '\{people,pins\}' is not null/);
  assert.match(repair, /nothing to repair: no-op/);
  assert.match(repair, /assertBatchGuards\("repair batch"/);
  assert.ok(repair.indexOf("backup.updated.push") < repair.indexOf("update public.agencies"), "pre-image before the write");
  assert.match(source, /--repair cannot be combined with --selftest, --cleanup or --stripe/);
  assert.match(source, /"--repair"\]\)/);
  assert.equal(S2_FIXTURES.includes("T1"), true);
});

test("read-back: asserts the staff_pin_hashes row by tenant + user fixture ids (skipped when the table is absent), not the settings key", () => {
  const check = CHECKS.T1.find(([label]) => /manager PIN/.test(label));
  assert.ok(check);
  const [, sql, params, want, opts] = check;
  assert.match(sql, /from public\.staff_pin_hashes where tenant_id = \$1 and user_id = \$2/);
  assert.match(sql, /from public\.staff_pin_hashes where tenant_id = \$1 and user_id = \$3/);
  assert.deepEqual(params, [s2Id("workspace:t1"), s2Id("user:t1-manager"), s2Id("user:t1-cashier")]);
  assert.equal(want, 10, "manager row = 1 (x10), cashier row = 0, no pins key = 0");
  assert.match(sql, /settings #> array\['people','pins'\] is not null\)::int \* 100/, "a leftover settings key would fail the check");
  assert.deepEqual(opts, { requires: "public.staff_pin_hashes" });
  assert.equal(CHECKS.T1.some(([l, s]) => /manager has a PIN hash/.test(l) || /a\.settings #>> array\['people','pins', \$4/.test(s)), false, "the old settings-based check is gone");
});
