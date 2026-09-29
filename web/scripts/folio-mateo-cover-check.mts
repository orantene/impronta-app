import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const PROFILE = "30f45c0f-6c40-44d4-bfb7-f04bfd0a6adc";
const { data: tp } = await admin.from("talent_profiles").select("*").eq("id", PROFILE).single();
const keys = Object.keys(tp || {}).filter((k) => /photo|avatar|head|image|cover|url|media/i.test(k));
console.log("profile keys interesting", keys);
for (const k of keys) {
  const v = (tp as Record<string, unknown>)[k];
  console.log(k, typeof v === "string" ? String(v).slice(0, 140) : v);
}
const { data: page } = await admin
  .from("talent_pages")
  .select("blocks")
  .eq("talent_profile_id", PROFILE)
  .eq("is_home", true)
  .maybeSingle();
function find(nodes: any[], kind: string, out: any[] = []) {
  for (const n of nodes || []) {
    if (n?.kind === kind) out.push(n);
    if (n?.children) find(n.children, kind, out);
  }
  return out;
}
const mh = find(page?.blocks || [], "masthead");
console.log("masthead count", mh.length);
for (const n of mh) {
  console.log({
    edition: n.props?.edition,
    coverSrc: (n.props?.coverSrc || "").slice(0, 120),
    bio: (n.props?.bio || "").slice(0, 60),
    lines: n.props?.lines,
    showCover: n.props?.showCover,
  });
}
