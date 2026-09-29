import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const admin = createClient(url, key, { auth: { persistSession: false } });
const id = "30f45c0f-6c40-44d4-bfb7-f04bfd0a6adc";
const { data: tp, error } = await admin
  .from("talent_profiles")
  .select("id, profile_code, user_id, display_name")
  .eq("id", id)
  .maybeSingle();
console.log("by id", tp, error);
const { data: byName } = await admin
  .from("talent_profiles")
  .select("id, profile_code, user_id, display_name")
  .ilike("display_name", "%Mateo%");
console.log("by name", byName);
const { data: bySlug } = await admin
  .from("talent_sites")
  .select("id, talent_profile_id, theme_design_slug, theme_look_slug, status, slug")
  .eq("slug", "mateo-ferrer")
  .maybeSingle();
console.log("site", bySlug);
if (tp?.user_id) {
  const { data: u } = await admin.auth.admin.getUserById(tp.user_id);
  console.log("email", u.user?.email, "demo_batch", u.user?.app_metadata?.demo_batch);
}
