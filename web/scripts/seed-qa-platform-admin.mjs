/**
 * Seed a QA platform-admin account for browser proof of /platform/admin.
 * NOT RUN BY DEFAULT. From web/:
 *   node --env-file=.env.local scripts/seed-qa-platform-admin.mjs --yes
 *
 * Creates (or finds) qa-platform-admin@impronta.test and grants
 * profiles.app_role = 'super_admin' (what isPlatformAdmin reads). The
 * password is generated here and appended to web/.env.local as
 * QA_PLATFORM_ADMIN_PASSWORD; it is never printed. If the variable already
 * exists it is reused (and set on the account).
 *
 * NOTE: create-test-admin.mjs keeps QA accounts away from super_admin on
 * purpose. This account holds platform-wide power on whatever database
 * .env.local points at, so revoke it after the proof:
 *   node --env-file=.env.local scripts/seed-qa-platform-admin.mjs --revoke
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";

const EMAIL = "qa-platform-admin@impronta.test";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const revoke = process.argv.includes("--revoke");
if (!revoke && !process.argv.includes("--yes")) {
  console.error("Refusing without --yes (grants platform super_admin).");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function findUser() {
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === EMAIL);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
}

let user = await findUser();
if (revoke) {
  if (!user) process.exit(0);
  const { error } = await supabase.from("profiles").update({ app_role: "agency_staff" }).eq("id", user.id);
  if (error) throw error;
  console.log("revoked super_admin");
  process.exit(0);
}

let password = process.env.QA_PLATFORM_ADMIN_PASSWORD?.trim();
const fresh = !password;
if (!password) password = randomBytes(18).toString("base64url");
if (!user) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password,
    email_confirm: true,
    user_metadata: { full_name: "QA Platform Admin" },
  });
  if (error) throw error;
  user = data.user;
} else {
  const { error } = await supabase.auth.admin.updateUserById(user.id, { password });
  if (error) throw error;
}
// The profile row is normally created by the auth trigger; upsert covers a miss.
const { error: pErr } = await supabase
  .from("profiles")
  .upsert({ id: user.id, display_name: "QA Platform Admin", app_role: "super_admin" }, { onConflict: "id" });
if (pErr) throw pErr;
if (fresh) appendFileSync(new URL("../.env.local", import.meta.url), `\nQA_PLATFORM_ADMIN_PASSWORD="${password}"\n`);
console.log(`ok: ${EMAIL} is super_admin${fresh ? "; password written to .env.local (QA_PLATFORM_ADMIN_PASSWORD)" : ""}`);
