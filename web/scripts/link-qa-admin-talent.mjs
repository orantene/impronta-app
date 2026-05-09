/**
 * Link qa-admin@impronta.test auth user to the "UI Save Final" talent profile.
 * This makes the admin a hybrid user who can also access the Talent dashboard.
 *
 * Run from web/:
 *   node --env-file=.env.local scripts/link-qa-admin-talent.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getAuthUserByEmail(email) {
  const target = email.toLowerCase();
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find(u => u.email?.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) return null;
    page++;
  }
}

async function main() {
  const adminEmail = process.env.TEST_ADMIN_EMAIL?.trim() || "qa-admin@impronta.test";

  // 1. Find the admin auth user
  const adminUser = await getAuthUserByEmail(adminEmail);
  if (!adminUser) {
    console.error(`Auth user not found for ${adminEmail}`);
    process.exit(1);
  }
  console.log(`Found admin user: ${adminUser.id} (${adminEmail})`);

  // 2. Find "UI Save Final" talent profile (by display_name)
  const { data: profiles, error: profileErr } = await supabase
    .from("talent_profiles")
    .select("id, display_name, user_id")
    .ilike("display_name", "%UI Save Final%");

  if (profileErr) throw profileErr;
  if (!profiles?.length) {
    // Try first_name + last_name combo
    const { data: p2 } = await supabase
      .from("talent_profiles")
      .select("id, display_name, first_name, last_name, user_id")
      .order("created_at", { ascending: false })
      .limit(10);
    console.log("Couldn't find 'UI Save Final'. Recent profiles:", p2?.map(p => `${p.display_name} [${p.id}]`));
    process.exit(1);
  }

  const profile = profiles[0];
  console.log(`Found talent profile: ${profile.id} "${profile.display_name}" (current user_id: ${profile.user_id ?? "null"})`);

  if (profile.user_id === adminUser.id) {
    console.log("Already linked — nothing to do.");
    return;
  }

  // 3. Link them
  const { error: updateErr } = await supabase
    .from("talent_profiles")
    .update({ user_id: adminUser.id })
    .eq("id", profile.id);

  if (updateErr) throw updateErr;
  console.log(`✓ Linked ${adminEmail} → talent profile "${profile.display_name}" (${profile.id})`);
  console.log("The admin is now a hybrid user. Navigate to /impronta/talent to verify.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
