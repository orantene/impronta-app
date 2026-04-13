/**
 * Runtime smoke checks for profile remediation (requires real Supabase + talent credentials).
 *
 * Usage (from web/):
 *   npm run verify:profile-remediation
 *
 * Loads `web/.env.local` automatically. Add:
 *   TALENT_EMAIL=...
 *   TALENT_PASSWORD=...
 *
 * Manual follow-up (browser):
 * - Open /t/{code}?preview=1 as the talent: dynamic Details + height should load.
 * - Open /t/{code} signed out when profile is live public: same, via anon + RLS.
 * - Toggle a boolean custom field off and save; reload — value should stay false (not empty).
 */

import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./load-env-local.mjs";

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = process.env.TALENT_EMAIL?.trim().toLowerCase();
const password = process.env.TALENT_PASSWORD ?? "";

if (!url || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(1);
}

if (!email || !password) {
  console.error("Set TALENT_EMAIL and TALENT_PASSWORD to run this script.");
  process.exit(1);
}

const authed = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anonOnly = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const signIn = await authed.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;

  const uid = signIn.data.user.id;

  const { data: profile, error: pErr } = await authed
    .from("talent_profiles")
    .select("id, profile_code, workflow_status, visibility, height_cm")
    .eq("user_id", uid)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!profile) {
    console.log(JSON.stringify({ ok: false, reason: "no_talent_profile_for_user" }, null, 2));
    return;
  }

  const { data: fv, error: fvErr } = await authed
    .from("field_values")
    .select("id, field_definition_id, value_text, value_number, value_boolean")
    .eq("talent_profile_id", profile.id)
    .limit(200);
  if (fvErr) throw fvErr;

  const { data: reservedDefs } = await authed
    .from("field_definitions")
    .select("key, archived_at")
    .in("key", ["display_name", "short_bio", "first_name", "last_name", "location"])
    .limit(20);

  const { count: anonProfileCount, error: anonErr } = await anonOnly
    .from("talent_profiles")
    .select("id", { count: "exact", head: true })
    .eq("id", profile.id);
  if (anonErr) throw anonErr;

  const { data: activeGroups, error: gErr } = await authed
    .from("field_groups")
    .select("id, slug, name_en, sort_order")
    .is("archived_at", null)
    .order("sort_order");
  if (gErr) throw gErr;

  const byNorm = new Map();
  for (const g of activeGroups ?? []) {
    const norm = String(g.name_en ?? "")
      .trim()
      .toLowerCase();
    if (!norm) continue;
    if (!byNorm.has(norm)) byNorm.set(norm, []);
    byNorm.get(norm).push({ id: g.id, slug: g.slug, name_en: g.name_en, sort_order: g.sort_order });
  }
  const duplicateGroupNames = [...byNorm.entries()].filter(([, list]) => list.length > 1);

  const { data: heightDef } = await authed
    .from("field_definitions")
    .select("id")
    .eq("key", "height_cm")
    .is("archived_at", null)
    .maybeSingle();

  let fvHeight = null;
  if (heightDef?.id) {
    const { data: heightRow } = await authed
      .from("field_values")
      .select("value_number")
      .eq("talent_profile_id", profile.id)
      .eq("field_definition_id", heightDef.id)
      .maybeSingle();
    if (
      heightRow &&
      heightRow.value_number != null &&
      Number.isFinite(Number(heightRow.value_number))
    ) {
      fvHeight = Math.round(Number(heightRow.value_number));
    }
  }
  const colHeight =
    profile.height_cm != null && Number.isFinite(Number(profile.height_cm))
      ? Math.round(Number(profile.height_cm))
      : null;
  const heightMirrorAligned =
    fvHeight === null && colHeight === null ? true : fvHeight !== null && fvHeight === colHeight;

  console.log(
    JSON.stringify(
      {
        ok: true,
        profile: {
          id: profile.id,
          code: profile.profile_code,
          workflow_status: profile.workflow_status,
          visibility: profile.visibility,
          height_cm_column: profile.height_cm,
        },
        height_cm: {
          field_values_cm: fvHeight,
          talent_profiles_column_cm: colHeight,
          mirror_aligned: heightMirrorAligned,
        },
        field_groups: {
          active_count: activeGroups?.length ?? 0,
          duplicate_visible_name_en: duplicateGroupNames.map(([norm, list]) => ({
            normalized_name_en: norm,
            groups: list,
          })),
        },
        authenticated_field_value_rows: fv?.length ?? 0,
        reserved_definitions_snapshot: reservedDefs ?? [],
        anon_count_talent_profile_by_id: anonProfileCount,
        note:
          anonProfileCount === 0
            ? "Anon cannot count/read non-public profile by id (expected for draft/private)."
            : "Anon can see this profile row — likely approved+public.",
        post_merge_warning:
          duplicateGroupNames.length > 0
            ? "Active groups still share the same visible name (EN) — re-run merge migration or resolve manually."
            : null,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
