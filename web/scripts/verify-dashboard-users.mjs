import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the shell environment.",
  );
  process.exit(1);
}

const adminEmail = (process.env.ADMIN_EMAIL ?? "orantene@gmail.com").toLowerCase();
const talentEmail = (process.env.TALENT_EMAIL ?? "orantenemx@gmail.com").toLowerCase();
const clientEmail = (process.env.CLIENT_EMAIL ?? "").trim().toLowerCase();

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getAuthUserByEmail(email) {
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;

    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found;

    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, app_role, account_status, onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function hasTalentProfile(userId) {
  const { data, error } = await supabase
    .from("talent_profiles")
    .select("id, profile_code, deleted_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .limit(1);

  if (error) throw error;
  return data?.[0] ?? null;
}

async function hasClientProfile(userId) {
  const { data, error } = await supabase
    .from("client_profiles")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (error) throw error;
  return data?.[0] ?? null;
}

async function updateProfile(userId, values) {
  const { error } = await supabase
    .from("profiles")
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) throw error;
}

async function ensureClientProfile(userId) {
  const existing = await hasClientProfile(userId);
  if (existing) return existing;

  const { error } = await supabase.from("client_profiles").insert({ user_id: userId });
  if (error) throw error;
  return hasClientProfile(userId);
}

async function ensureTalentProfile(userId, displayName) {
  const existing = await hasTalentProfile(userId);
  if (existing) return existing;

  const { data: profileCode, error: codeError } = await supabase.rpc(
    "generate_profile_code",
  );
  if (codeError) throw codeError;

  const { error } = await supabase.from("talent_profiles").insert({
    user_id: userId,
    profile_code: profileCode,
    display_name: displayName ?? null,
    workflow_status: "draft",
    visibility: "hidden",
  });
  if (error) throw error;

  return hasTalentProfile(userId);
}

async function reconcileUser({ email, targetRole, targetStatus }) {
  if (!email) return null;

  const authUser = await getAuthUserByEmail(email);
  if (!authUser) {
    return {
      email,
      foundInAuth: false,
    };
  }

  const before = await getProfile(authUser.id);
  const beforeTalentProfile = await hasTalentProfile(authUser.id);
  const beforeClientProfile = await hasClientProfile(authUser.id);

  if (!before) {
    const { error } = await supabase.from("profiles").insert({
      id: authUser.id,
      display_name:
        authUser.user_metadata?.full_name ??
        authUser.user_metadata?.name ??
        authUser.email?.split("@")[0] ??
        email,
      app_role: targetRole,
      account_status: targetStatus,
      onboarding_completed_at: targetStatus === "active" ? new Date().toISOString() : null,
    });
    if (error) throw error;
  } else if (
    before.app_role !== targetRole ||
    before.account_status !== targetStatus
  ) {
    await updateProfile(authUser.id, {
      app_role: targetRole,
      account_status: targetStatus,
      onboarding_completed_at:
        targetStatus === "active"
          ? before.onboarding_completed_at ?? new Date().toISOString()
          : null,
    });
  }

  if (targetRole === "client" && targetStatus === "active") {
    await ensureClientProfile(authUser.id);
  }

  if (targetRole === "talent" && targetStatus === "active") {
    await ensureTalentProfile(
      authUser.id,
      before?.display_name ??
        authUser.user_metadata?.full_name ??
        authUser.user_metadata?.name ??
        authUser.email?.split("@")[0] ??
        email,
    );
  }

  const after = await getProfile(authUser.id);
  const afterTalentProfile = await hasTalentProfile(authUser.id);
  const afterClientProfile = await hasClientProfile(authUser.id);

  return {
    email,
    foundInAuth: true,
    before: before
      ? {
          app_role: before.app_role,
          account_status: before.account_status,
        }
      : null,
    beforeTalentProfile: Boolean(beforeTalentProfile),
    beforeClientProfile: Boolean(beforeClientProfile),
    after: after
      ? {
          app_role: after.app_role,
          account_status: after.account_status,
        }
      : null,
    afterTalentProfile: Boolean(afterTalentProfile),
    afterClientProfile: Boolean(afterClientProfile),
  };
}

const results = [];
results.push(
  await reconcileUser({
    email: adminEmail,
    targetRole: "super_admin",
    targetStatus: "active",
  }),
);
results.push(
  await reconcileUser({
    email: talentEmail,
    targetRole: "talent",
    targetStatus: "active",
  }),
);

if (clientEmail) {
  results.push(
    await reconcileUser({
      email: clientEmail,
      targetRole: "client",
      targetStatus: "active",
    }),
  );
}

console.log(JSON.stringify(results, null, 2));
