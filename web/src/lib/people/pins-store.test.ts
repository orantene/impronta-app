import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { approveCustomAmount } from "@/lib/pos/approval";
import { unlockTill } from "@/lib/pos/device-session";
import { loadPinHolderIds } from "./pins-store";

const WEB = process.cwd();
const MIGRATION_FILE = "20261231423900_staff_pin_hashes_and_throttle_tul1516.sql";
// Held in _pending_pm until the PM applies it; it moves to supabase/migrations/ afterwards.
const MIGRATION = ((): string => {
  for (const dir of ["supabase/migrations/_pending_pm", "supabase/migrations"]) {
    try {
      return readFileSync(join(WEB, "..", dir, MIGRATION_FILE), "utf8");
    } catch {
      // try the next location
    }
  }
  throw new Error(`${MIGRATION_FILE} not found in _pending_pm or migrations`);
})();

function fakeAdmin(opts: {
  table?: { data: { user_id: string }[] | null; error: { code?: string; message?: string } | null };
  settings?: unknown;
}) {
  const selects: { table: string; cols: string }[] = [];
  return {
    selects,
    admin: {
      from(table: string) {
        return {
          select(cols: string) {
            selects.push({ table, cols });
            const result =
              table === "staff_pin_hashes"
                ? (opts.table ?? { data: [], error: null })
                : { data: { settings: opts.settings ?? {} }, error: null };
            const chain = {
              eq: () => chain,
              maybeSingle: async () => result,
              then: (resolve: (v: unknown) => unknown) => resolve(result),
            };
            return chain;
          },
        };
      },
    },
  };
}

test("TUL-1516: PIN holders come from the protected table and never select a hash", async () => {
  const { admin, selects } = fakeAdmin({ table: { data: [{ user_id: "u1" }, { user_id: "u2" }], error: null } });
  const holders = await loadPinHolderIds(admin, "t1");
  assert.deepEqual([...holders].sort(), ["u1", "u2"]);
  const tableRead = selects.find((s) => s.table === "staff_pin_hashes");
  assert.equal(tableRead?.cols, "user_id", "only user ids are read, never pin_hash");
});

test("TUL-1516: before the migration (table missing) the legacy blob still answers", async () => {
  const { admin } = fakeAdmin({
    table: { data: null, error: { code: "42P01", message: 'relation "staff_pin_hashes" does not exist' } },
    settings: { people: { pins: { u9: "$2a$hash", u8: "" } } },
  });
  assert.deepEqual([...(await loadPinHolderIds(admin, "t1"))], ["u9"]);
});

test("TUL-1516: a throttled reply carries throttled:true through the till and approval wrappers", async () => {
  const rpcAdmin = {
    from: () => {
      throw new Error("not used");
    },
    rpc: async () => ({ data: { ok: false, reason: "pin_invalid", throttled: true }, error: null }),
  };
  const unlock = await unlockTill(rpcAdmin, { tenantId: "t", deviceKey: "device-key-1", userId: "u", pin: "1234" });
  assert.deepEqual(unlock, { ok: false, reason: "pin_throttled", throttled: true });
  const approve = await approveCustomAmount(rpcAdmin, {
    tenantId: "t",
    orderId: "o",
    lineId: "l",
    operationKey: "op-key-0001",
    approverUserId: "u",
    pin: "1234",
  });
  assert.deepEqual(approve, { ok: false, reason: "pin_throttled", throttled: true });

  const typo = await unlockTill(
    { ...rpcAdmin, rpc: async () => ({ data: { ok: false, reason: "pin_invalid" }, error: null }) },
    { tenantId: "t", deviceKey: "device-key-1", userId: "u", pin: "1234" },
  );
  assert.deepEqual(typo, { ok: false, reason: "pin_invalid" });
});

test("TUL-1516 migration: hashes live in a service-role-only table, not in agencies.settings", () => {
  assert.match(MIGRATION, /CREATE TABLE IF NOT EXISTS public\.staff_pin_hashes/);
  assert.match(MIGRATION, /ALTER TABLE public\.staff_pin_hashes ENABLE ROW LEVEL SECURITY/);
  assert.match(MIGRATION, /REVOKE ALL ON public\.staff_pin_hashes FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(MIGRATION, /CREATE POLICY/i, "no policy: only the service role and DEFINER functions");
  assert.match(MIGRATION, /settings #- '\{people,pins\}'/, "existing hashes are removed from the blob");
  const setter = MIGRATION.slice(MIGRATION.indexOf("FUNCTION public.pos_set_staff_pin"));
  assert.match(setter, /INSERT INTO public\.staff_pin_hashes/);
  assert.doesNotMatch(setter.slice(0, setter.indexOf("REVOKE ALL")), /jsonb_set\(v_settings/, "setter no longer writes the blob");
});

test("TUL-1516 migration: five wrong PINs in five minutes lock the sixth attempt, unlock and approval both throttled", () => {
  assert.match(MIGRATION, /attempted_at > now\(\) - interval '5 minutes'/);
  assert.match(MIGRATION, /IF v_fails >= 5 THEN\s+RETURN 'pin_throttled'/);
  const check = MIGRATION.slice(MIGRATION.indexOf("FUNCTION public.pos_check_staff_pin"), MIGRATION.indexOf("-- ── PIN setter"));
  assert.ok(
    check.indexOf("'pin_throttled'") < check.indexOf("extensions.crypt"),
    "the lock is judged BEFORE the PIN is compared",
  );
  assert.match(check, /INSERT INTO public\.staff_pin_attempts/);
  assert.match(check, /pg_advisory_xact_lock/, "parallel guesses are serialised");
  assert.match(MIGRATION, /GRANT EXECUTE ON FUNCTION public\.pos_check_staff_pin\(uuid, uuid, text\) TO service_role/);
  for (const fn of ["pos_unlock_till", "pos_approve_custom_amount"]) {
    const body = MIGRATION.slice(MIGRATION.indexOf(`FUNCTION public.${fn}`));
    const end = body.indexOf("REVOKE ALL");
    assert.match(body.slice(0, end), /pos_check_staff_pin\(/, `${fn} goes through the throttle`);
    assert.match(body.slice(0, end), /'throttled', true/, `${fn} reports the lockout`);
  }
});

test("TUL-1516: the app readers no longer select the settings blob for PIN holders", () => {
  const page = readFileSync(join(WEB, "src/app/(workspace)/[tenantSlug]/admin/people/page.tsx"), "utf8");
  const staff = readFileSync(join(WEB, "src/lib/pos/staff.ts"), "utf8");
  assert.match(page, /loadPinHolderIds/);
  assert.match(staff, /loadPinHolderIds/);
  assert.doesNotMatch(page, /select\("settings"\)/);
  assert.doesNotMatch(staff, /select\("settings"\)/);
});

test("TUL-1516: a removed or inactive member's correct PIN gives pin_invalid, before any hash is compared", () => {
  const check = MIGRATION.slice(MIGRATION.indexOf("FUNCTION public.pos_check_staff_pin"), MIGRATION.indexOf("-- ── PIN setter"));
  const gate = check.search(/IF NOT EXISTS \(\s+SELECT 1 FROM public\.agency_memberships m[\s\S]*?m\.status = 'active'\s+\) THEN\s+RETURN 'pin_invalid'/);
  assert.ok(gate > 0, "an active membership is required");
  assert.ok(gate < check.indexOf("staff_pin_hashes h"), "the membership gate runs before the hash is read");
  assert.ok(gate < check.indexOf("extensions.crypt"), "and before the PIN is compared");
});

test("TUL-1516: removing a member deletes their PIN hash and legacy settings entry", () => {
  const src = readFileSync(join(WEB, "src/lib/server-actions/team-management.ts"), "utf8");
  const fn = src.slice(src.indexOf("export async function removeTeamMember"));
  assert.match(fn, /from\("staff_pin_hashes"\)\.delete\(\)\.eq\("tenant_id", tenantId\)\.eq\("user_id", profileId\)/);
  assert.match(fn, /restPins/);
});

test("TUL-1516: a throttled reply reaches the till as pin_throttled with its own copy in en, es and fr", () => {
  for (const lang of ["en", "es", "fr"]) {
    const msgs = JSON.parse(readFileSync(join(WEB, `messages/${lang}.json`), "utf8"));
    assert.equal(typeof msgs.dashboard.pos.engine.refusal.pin_throttled, "string", lang);
  }
  const es = JSON.parse(readFileSync(join(WEB, "messages/es.json"), "utf8"));
  assert.equal(es.dashboard.pos.engine.refusal.pin_throttled, "Demasiados intentos, espera 5 minutos.");
});
