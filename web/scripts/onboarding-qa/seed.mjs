// Onboarding QA seed for the ISOLATED Supabase project only.
//   JOURNEYS_ISOLATED=1 node --env-file=.env.local scripts/onboarding-qa/seed.mjs [--reset]
// Writes: global `settings` rows the onboarding module needs, a super-admin
// QA user, and (with --reset) deletes every `qa-onb-*` tenant / user / brief.
// Refuses production through the shared guard; never a bare env flag.
import { createClient } from "@supabase/supabase-js";
import { assertIsolatedJourneysTarget } from "../isolated-target-guard.mjs";

assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const reset = process.argv.includes("--reset");
const now = new Date().toISOString();

const FLAGS = [
  ["ai_master_enabled", true],
  ["ai_tulala_agent_enabled", true],
  ["onboarding_module_enabled", true],
];
for (const [key, value] of FLAGS) {
  const { error } = await admin.from("settings").upsert({ key, value, tenant_id: null, updated_at: now }, { onConflict: "key" });
  console.log(`settings.${key}=${value}`, error?.message ?? "ok");
}

const ADMIN_EMAIL = "qa-onb-admin@impronta.test";
const users = (await admin.auth.admin.listUsers({ perPage: 500 })).data?.users ?? [];
let adminUser = users.find((u) => u.email === ADMIN_EMAIL);
if (!adminUser) {
  const r = await admin.auth.admin.createUser({ email: ADMIN_EMAIL, email_confirm: true, password: process.env.JOURNEYS_FIXTURE_PASSWORD ?? undefined });
  adminUser = r.data?.user; console.log("create admin", r.error?.message ?? "ok");
}
if (adminUser) {
  const { error } = await admin.from("profiles").update({ app_role: "super_admin", account_status: "active", onboarding_completed_at: now }).eq("id", adminUser.id);
  console.log("admin role", error?.message ?? "ok");
}

if (reset) {
  const { data: tenants } = await admin.from("agencies").select("id,slug").like("slug", "qa-onb-%");
  for (const t of tenants ?? []) {
    const { error } = await admin.from("agencies").delete().eq("id", t.id);
    console.log("delete tenant", t.slug, error?.message ?? "ok");
  }
  const { error: bErr } = await admin.from("tulala_briefs").delete().in("profile_id", users.filter((u) => /^qa-onb-(?!admin)/.test(u.email ?? "")).map((u) => u.id));
  console.log("delete briefs", bErr?.message ?? "ok");
  for (const u of users) {
    if (/^qa-onb-(?!admin@)/.test(u.email ?? "")) {
      const { error } = await admin.auth.admin.deleteUser(u.id);
      console.log("delete user", u.email, error?.message ?? "ok");
    }
  }
}
