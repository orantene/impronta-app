/**
 * Pins the HELD migration 20261231415300_definer_function_actor_guards.sql
 * (PR 0b-4: signed-in users cannot rewrite other people's data through
 * database functions). Static text pins; the behaviour was verified in a
 * rolled-back staging transaction (see the PR body).
 *
 * Run: npx tsx --test src/lib/saas/definer-function-actor-guards.static.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(
  HERE, "..", "..", "..", "..", "supabase", "migrations", "_pending_pm",
  "20261231415300_definer_function_actor_guards.sql",
);
const sql = readFileSync(FILE, "utf8");

/** Body of one CREATE OR REPLACE FUNCTION, up to its closing $function$. */
function fnBody(name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start >= 0, `${name} must be redefined`);
  const end = sql.indexOf("$function$;", sql.indexOf("$function$", start) + 10);
  assert.ok(end > start, `${name} must close`);
  return sql.slice(start, end);
}

test("replace_talent_languages re-applies the owner / roster-staff / admin guard", () => {
  const b = fnBody("replace_talent_languages");
  assert.match(b, /auth\.role\(\) = 'service_role'/);
  assert.match(b, /public\.is_talent_profile_owner\(p_talent_profile_id\)/);
  assert.match(b, /public\.is_staff_of_tenant\(p_tenant_id\)/);
  assert.match(b, /agency_talent_roster/);
  assert.match(b, /public\.is_platform_admin\(\)/);
  assert.match(b, /RAISE EXCEPTION 'replace_talent_languages: not authorized/);
  // The guard precedes the first write.
  assert.ok(b.indexOf("RAISE EXCEPTION") < b.indexOf("DELETE FROM public.talent_languages"));
});

for (const name of ["engine_send_offer", "engine_submit_approval"]) {
  test(`${name} binds the actor to auth.uid() and checks a seat`, () => {
    const b = fnBody(name);
    assert.match(b, /v_uid := auth\.uid\(\)/);
    assert.match(b, /p_actor_user_id IS DISTINCT FROM v_uid/);
    assert.match(b, /RAISE EXCEPTION 'actor_mismatch'/);
    assert.match(b, /RAISE EXCEPTION 'forbidden'/);
    assert.match(b, /public\.is_staff_of_tenant\(inq\.tenant_id\)/);
    // service role must keep working (cron, guest-client, talent-quote paths)
    assert.match(b, /auth\.role\(\) = 'service_role'/);
    // guard runs before the first write
    const firstWrite = Math.min(
      ...["UPDATE public.", "INSERT INTO public."].map((w) => {
        const i = b.indexOf(w);
        return i < 0 ? Infinity : i;
      }),
    );
    assert.ok(b.indexOf("RAISE EXCEPTION 'forbidden'") < firstWrite);
  });
}

test("engine_submit_approval only lets a caller decide for their own seat", () => {
  const b = fnBody("engine_submit_approval");
  assert.match(b, /v_part\.user_id = v_uid/);
  assert.match(b, /tp\.user_id = v_uid/);
  assert.match(b, /ip\.inquiry_id = p_inquiry_id/);
  assert.match(b, /o\.inquiry_id = p_inquiry_id/);
});

test("engine_send_offer admits tenant staff or the active coordinator seat only", () => {
  const b = fnBody("engine_send_offer");
  assert.match(b, /cp\.role\s+= 'coordinator'/);
  assert.match(b, /cp\.user_id\s+= v_uid/);
});

test("engine_emit_system_event loses authenticated, keeps service_role", () => {
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.engine_emit_system_event\(uuid, text, jsonb\) FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.engine_emit_system_event\(uuid, text, jsonb\) TO service_role;/,
  );
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.engine_emit_system_event[^;]*authenticated/,
  );
});

test("no guarded function is left anon/PUBLIC executable, and the migration asserts it", () => {
  for (const sig of [
    "replace_talent_languages(uuid, uuid, jsonb)",
    "engine_send_offer(uuid, uuid, uuid, integer, integer)",
    "engine_submit_approval(uuid, uuid, uuid, uuid, integer, text, text)",
  ]) {
    assert.ok(sql.includes(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon;`), sig);
  }
  assert.match(sql, /a guarded engine function is anon-executable/);
});

test("the only app callers of engine_emit_system_event use the service-role client", () => {
  const cron = readFileSync(
    join(HERE, "..", "..", "app", "api", "cron", "inquiry-engine", "route.ts"), "utf8",
  );
  assert.match(cron, /createServiceRoleClient\(\)/);
  const flag = readFileSync(
    join(HERE, "..", "..", "app", "api", "cron", "flag-unassigned-inquiries", "route.ts"), "utf8",
  );
  assert.match(flag, /admin\.rpc\("engine_emit_system_event"/);
});
