import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { activateClientSignup } from "./guest-activate.server";

type Row = { app_role: string; account_status: string } | null;

function fake(profile: Row) {
  const upserts: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  const admin = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({ data: profile, error: null });
      chain.upsert = async (row: Record<string, unknown>) => {
        upserts.push({ table, ...row });
        return { error: null };
      };
      chain.update = (row: Record<string, unknown>) => {
        updates.push({ table, ...row });
        const u: Record<string, unknown> = {};
        u.eq = () => u;
        (u as { then: unknown }).then = (res: (v: { error: null }) => void) => res({ error: null });
        return u;
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { admin, upserts, updates };
}

test("TUL-771: a fresh client sign-up gets a client_profiles row and becomes active", async () => {
  const f = fake({ app_role: "client", account_status: "onboarding" });
  assert.equal(await activateClientSignup(f.admin, { userId: "u1", emailProven: true }), true);
  assert.deepEqual(f.upserts.map((u) => [u.table, u.user_id]), [["client_profiles", "u1"]]);
  assert.equal(f.updates[0]?.account_status, "active");
});

test("talent, staff, active or unproven accounts are never touched", async () => {
  for (const row of [
    { app_role: "talent", account_status: "onboarding" },
    { app_role: "agency_staff", account_status: "onboarding" },
    { app_role: "client", account_status: "active" },
    null,
  ]) {
    const f = fake(row);
    assert.equal(await activateClientSignup(f.admin, { userId: "u1", emailProven: true }), false);
    assert.equal(f.upserts.length + f.updates.length, 0);
  }
  const f = fake({ app_role: "client", account_status: "onboarding" });
  assert.equal(await activateClientSignup(f.admin, { userId: "u1", emailProven: false }), false);
});

test("verify activates only on the client sign-up path (create=1 + signup_as=client)", () => {
  const a = readFileSync(join(process.cwd(), "src/app/auth/otp-actions.ts"), "utf8");
  assert.match(a, /formData\.get\("signup_as"\) \?\? ""\) === "client"\)/);
  assert.ok(a.indexOf("activateClientSignup(admin") < a.indexOf("loadAccessProfile(supabase, user.id)"));
  const form = readFileSync(join(process.cwd(), "src/components/auth/email-code-form.tsx"), "utf8");
  assert.match(form, /askName \? <input type="hidden" name="signup_as" value="client" \/>/);
});
