/**
 * Create two fixed QA client accounts (auth + profiles + client_profiles).
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * (e.g. `node --env-file=.env.local scripts/create-test-clients.mjs` from `web/`).
 *
 * Default password: set TEST_CLIENT_PASSWORD or uses a dev-only default printed on first create.
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

const TEST_CLIENTS = [
  {
    email: "qa-client-1@impronta.test",
    displayName: "QA Client One",
  },
  {
    email: "qa-client-2@impronta.test",
    displayName: "QA Client Two",
  },
];

const defaultPassword =
  process.env.TEST_CLIENT_PASSWORD?.trim() || "Impronta-QA-Client-2026!";

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getAuthUserByEmail(email) {
  const target = email.toLowerCase();
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

async function ensureClientProfileRow(userId) {
  const { data: existing, error: selErr } = await supabase
    .from("client_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return;

  const { error: insErr } = await supabase.from("client_profiles").insert({
    user_id: userId,
  });
  if (insErr) throw insErr;
}

async function ensureTestClient({ email, displayName }) {
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
    console.log(`Auth user already exists: ${email}`);
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
      app_role: "client",
      account_status: "active",
      onboarding_completed_at: new Date().toISOString(),
    });
    if (insP) throw insP;
  } else {
    const { error: upErr } = await supabase
      .from("profiles")
      .update({
        display_name: profile.display_name?.trim() ? profile.display_name : displayName,
        app_role: "client",
        account_status: "active",
        onboarding_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (upErr) throw upErr;
  }

  await ensureClientProfileRow(user.id);

  return {
    email,
    userId: user.id,
    createdAuth,
  };
}

async function main() {
  console.log("Creating / reconciling test client accounts…\n");
  const out = [];
  for (const row of TEST_CLIENTS) {
    const result = await ensureTestClient(row);
    out.push({
      email: result.email,
      userId: result.userId,
      authJustCreated: result.createdAuth,
    });
    console.log(`  UUID (profiles.id / IMPERSONATION_QA_CLIENT_USER_ID candidate): ${result.userId}\n`);
  }

  console.log("---");
  console.log("Summary (use one UUID for IMPERSONATION_QA_CLIENT_USER_ID):");
  console.log(JSON.stringify(out, null, 2));
  console.log("---");
  console.log(
    `Default password (only applies to accounts created in this run; see authJustCreated): ${defaultPassword}`,
  );
  console.log("Override with TEST_CLIENT_PASSWORD in .env.local.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
