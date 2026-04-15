/**
 * Links the four Tulum Spanish demo talent rows (TAL-92001–TAL-92004 from
 * `supabase/seed_tulum_spanish_talent.sql`) to Supabase Auth users so they can sign in.
 *
 * Run after the SQL seed. From `web/`:
 *   npm run register:tulum-demo-talent
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (e.g. --env-file=.env.local)
 *
 * Password: TULUM_DEMO_TALENT_PASSWORD or default dev password printed on create.
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

const defaultPassword =
  process.env.TULUM_DEMO_TALENT_PASSWORD?.trim() || "Impronta-Tulum-Talent-2026!";

const ACCOUNTS = [
  {
    profileCode: "TAL-92001",
    email: "tulum-talent-sofia@impronta.test",
    displayName: "Sofía Herrera",
  },
  {
    profileCode: "TAL-92002",
    email: "tulum-talent-carmen@impronta.test",
    displayName: "Carmen Díaz",
  },
  {
    profileCode: "TAL-92003",
    email: "tulum-talent-luis@impronta.test",
    displayName: "Luis Ortega",
  },
  {
    profileCode: "TAL-92004",
    email: "tulum-talent-marco@impronta.test",
    displayName: "Marco Sánchez",
  },
];

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

async function ensureAuthUser(email, displayName, password) {
  let user = await getAuthUserByEmail(email);
  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName },
    });
    if (error) throw error;
    user = data.user;
    console.log(`Created auth user: ${email}`);
  } else {
    console.log(`Auth user already exists: ${email}`);
  }
  return user;
}

async function linkTalentProfile({ profileCode, email, displayName }) {
  const password = defaultPassword;
  const user = await ensureAuthUser(email, displayName, password);

  const { data: tp, error: tpErr } = await supabase
    .from("talent_profiles")
    .select("id, user_id, display_name")
    .eq("profile_code", profileCode)
    .maybeSingle();

  if (tpErr) throw tpErr;
  if (!tp?.id) {
    throw new Error(
      `No talent_profiles row for ${profileCode}. Apply supabase/seed_tulum_spanish_talent.sql first.`,
    );
  }

  if (tp.user_id && tp.user_id !== user.id) {
    throw new Error(
      `${profileCode} is already linked to another user (${tp.user_id}). Refusing to reassign.`,
    );
  }

  const { error: updTp } = await supabase
    .from("talent_profiles")
    .update({
      user_id: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tp.id);

  if (updTp) throw updTp;

  const { error: profErr } = await supabase
    .from("profiles")
    .update({
      display_name: tp.display_name ?? displayName,
      app_role: "talent",
      account_status: "active",
      onboarding_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (profErr) throw profErr;

  console.log(`  Linked ${profileCode} → ${user.id}`);
}

async function main() {
  for (const row of ACCOUNTS) {
    console.log(`\n${row.profileCode} (${row.email})`);
    await linkTalentProfile(row);
  }

  console.log(`
Done. Sign-in emails (password from TULUM_DEMO_TALENT_PASSWORD or default):
${ACCOUNTS.map((a) => `  ${a.email}`).join("\n")}
`);
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
