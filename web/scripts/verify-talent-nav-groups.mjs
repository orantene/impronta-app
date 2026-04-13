import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = process.env.TALENT_EMAIL?.trim().toLowerCase();
const password = process.env.TALENT_PASSWORD ?? "";

if (!url || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(1);
}

if (!email || !password) {
  console.error("Missing TALENT_EMAIL or TALENT_PASSWORD.");
  process.exit(1);
}

const supabase = createClient(url, anonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function buildNavItems(groups) {
  return groups.map((group) => ({
    id: `talent-profile-group-${group.slug}`,
    href: `/talent/my-profile?group=${encodeURIComponent(group.slug)}`,
    label: group.name_en,
  }));
}

async function main() {
  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;

  const fieldDefinitionsRes = await supabase
    .from("field_definitions")
    .select("id, field_group_id, key, value_type")
    .eq("active", true)
    .is("archived_at", null)
    .eq("editable_by_talent", true)
    .eq("profile_visible", true)
    .eq("internal_only", false)
    .not("field_group_id", "is", null)
    .neq("value_type", "location")
    .order("field_group_id")
    .order("sort_order");

  if (fieldDefinitionsRes.error) throw fieldDefinitionsRes.error;

  const groupIds = [...new Set((fieldDefinitionsRes.data ?? []).map((row) => row.field_group_id).filter(Boolean))];

  const fieldGroupsRes =
    groupIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("field_groups")
          .select("id, slug, name_en, name_es, sort_order")
          .in("id", groupIds)
          .is("archived_at", null)
          .order("sort_order");

  if (fieldGroupsRes.error) throw fieldGroupsRes.error;

  console.log(
    JSON.stringify(
      {
        authenticatedEmail: signIn.data.user?.email ?? null,
        counts: {
          fieldDefinitions: fieldDefinitionsRes.data?.length ?? 0,
          fieldGroups: fieldGroupsRes.data?.length ?? 0,
        },
        fieldDefinitions: (fieldDefinitionsRes.data ?? []).map((row) => ({
          id: row.id,
          key: row.key,
          value_type: row.value_type,
          field_group_id: row.field_group_id,
        })),
        fieldGroups: (fieldGroupsRes.data ?? []).map((row) => ({
          id: row.id,
          slug: row.slug,
          name_en: row.name_en,
          name_es: row.name_es,
          sort_order: row.sort_order,
        })),
        navItems: buildNavItems(fieldGroupsRes.data ?? []),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("verify-talent-nav-groups failed");
  console.error(error);
  process.exit(1);
});
