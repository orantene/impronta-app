/**
 * Idempotent: wire qa-admin@impronta.test → a talent_profile on Impronta roster.
 *
 *   1. If admin is already linked to a profile that's on Impronta's roster → done.
 *   2. Else find an Impronta-rostered profile with user_id NULL → link admin.
 *   3. Else REFUSE (won't clobber an existing link).
 *
 * Run from web/:
 *   node --env-file=.env.local scripts/wire-qa-admin-talent.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) { console.error("Missing SUPABASE env"); process.exit(1); }
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const ADMIN_EMAIL = "qa-admin@impronta.test";
const IMPRONTA_TENANT_ID = "00000000-0000-0000-0000-000000000001";

async function getUser(email) {
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (u) return u;
    if (data.users.length < 200) return null;
    page++;
  }
}

const adminUser = await getUser(ADMIN_EMAIL);
if (!adminUser) { console.error("Admin user not found"); process.exit(1); }
console.log(`admin auth user: ${adminUser.id}`);

const { data: linked } = await supabase
  .from("talent_profiles")
  .select("id, display_name")
  .eq("user_id", adminUser.id);
console.log("admin linked talent_profiles:", linked);

if (linked?.length) {
  const ids = linked.map((p) => p.id);
  const { data: roster } = await supabase
    .from("agency_talent_roster")
    .select("talent_profile_id, status")
    .in("talent_profile_id", ids)
    .eq("tenant_id", IMPRONTA_TENANT_ID)
    .neq("status", "removed");
  console.log("admin's rostered profiles on impronta:", roster);
  if (roster?.length) {
    const p = linked.find((x) => x.id === roster[0].talent_profile_id);
    console.log(`✓ Already wired: ${ADMIN_EMAIL} → ${p?.display_name} (${p?.id})`);
    process.exit(0);
  }
}

const { data: rosterRows } = await supabase
  .from("agency_talent_roster")
  .select("talent_profile_id, status, talent_profiles(id, display_name, user_id)")
  .eq("tenant_id", IMPRONTA_TENANT_ID)
  .neq("status", "removed")
  .limit(50);

const candidates = (rosterRows ?? [])
  .map((r) => r.talent_profiles)
  .filter((p) => p && p.user_id == null);

console.log(`Impronta roster — unlinked candidates: ${candidates.length}`);
candidates.slice(0, 8).forEach((p) => console.log(`  - ${p.display_name} (${p.id})`));

if (candidates.length === 0) {
  console.error("No Impronta-rostered talent_profile with user_id NULL — won't clobber an existing link.");
  process.exit(2);
}

const target = candidates[0];
console.log(`Linking ${ADMIN_EMAIL} → ${target.display_name} (${target.id})`);
const { error: upErr } = await supabase
  .from("talent_profiles")
  .update({ user_id: adminUser.id })
  .eq("id", target.id);
if (upErr) throw upErr;
console.log(`✓ Linked.`);
