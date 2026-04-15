/**
 * Create a fixed QA super_admin account (auth + profiles).
 *
 * From `web/`:
 *   npm run create:test-admin
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * (via --env-file=.env.local).
 *
 * Email: TEST_ADMIN_EMAIL or qa-admin@impronta.test
 * Password: TEST_ADMIN_PASSWORD or Impronta-QA-Admin-2026!
 *
 * Re-running resets the password to the same default (or env) so local sign-in stays predictable.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (use web/.env.local via --env-file).",
  );
  process.exit(1);
}

const email = process.env.TEST_ADMIN_EMAIL?.trim() || "qa-admin@impronta.test";
const displayName = process.env.TEST_ADMIN_DISPLAY_NAME?.trim() || "QA Admin";

const defaultPassword =
  process.env.TEST_ADMIN_PASSWORD?.trim() || "Impronta-QA-Admin-2026!";

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getAuthUserByEmail(targetEmail) {
  const target = targetEmail.toLowerCase();
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function main() {
  const password = defaultPassword;
  let user = await getAuthUserByEmail(email);
  let createdAuth = false;

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName },
    });
    if (error) throw error;
    user = data.user;
    createdAuth = true;
    console.log(`Created auth user: ${email}`);
  } else {
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
    });
    if (error) throw error;
    console.log(`Auth user already existed; password reset: ${email}`);
  }

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("id, app_role, account_status, display_name")
    .eq("id", user.id)
    .maybeSingle();
  if (pErr) throw pErr;

  if (!profile) {
    const { error: insP } = await supabase.from("profiles").insert({
      id: user.id,
      display_name: displayName,
      app_role: "super_admin",
      account_status: "active",
      onboarding_completed_at: new Date().toISOString(),
    });
    if (insP) throw insP;
  } else {
    const { error: upErr } = await supabase
      .from("profiles")
      .update({
        display_name: profile.display_name?.trim() ? profile.display_name : displayName,
        app_role: "super_admin",
        account_status: "active",
        onboarding_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (upErr) throw upErr;
  }

  console.log("");
  console.log("--- QA admin ready ---");
  console.log(`Email:    ${email}`);
  console.log(`Password: ${password}`);
  console.log(`User id:  ${user.id}`);
  console.log(`Auth:     ${createdAuth ? "newly created" : "existed (password refreshed)"}`);
  console.log("");
  console.log("Sign in at /login, then open /admin.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
