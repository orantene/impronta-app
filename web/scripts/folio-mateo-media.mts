import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const PROFILE = "30f45c0f-6c40-44d4-bfb7-f04bfd0a6adc";
const { data: media } = await admin
  .from("media_assets")
  .select("storage_path,bucket_id,variant_kind,sort_order")
  .eq("owner_talent_profile_id", PROFILE)
  .order("sort_order", { ascending: true });
const head = (media || []).find((m) => m.variant_kind === "card") || media?.[0];
const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
const publicUrl = head ? `${base}/storage/v1/object/public/${head.bucket_id}/${head.storage_path}` : "";
const { data: tp } = await admin.from("talent_profiles").select("display_name, short_bio").eq("id", PROFILE).single();
const bio = (tp?.short_bio || "").trim();
const coverLine = "Modelo · CDMX";

type TreeNode = {
  kind?: string;
  props?: Record<string, unknown>;
  children?: TreeNode[];
  [key: string]: unknown;
};

function patch(nodes: TreeNode[]): TreeNode[] {
  return (nodes || []).map((n) => {
    if (!n || typeof n !== "object") return n;
    let next = n;
    if (n.kind === "masthead") {
      next = {
        ...n,
        props: {
          ...(n.props || {}),
          coverSrc: publicUrl || (n.props?.coverSrc as string) || "",
          bio: bio || (n.props?.bio as string) || "",
          coverLine: (n.props?.coverLine as string) || coverLine,
          showCover: true,
          edition: "magazine",
        },
      };
    }
    if (Array.isArray(n.children)) next = { ...next, children: patch(n.children) };
    return next;
  });
}

const { data: page } = await admin
  .from("talent_pages")
  .select("id, blocks, blocks_published")
  .eq("talent_profile_id", PROFILE)
  .eq("is_home", true)
  .single();
const nodes = patch((page?.blocks as TreeNode[] | null) || []);
const now = new Date().toISOString();
const { error } = await admin
  .from("talent_pages")
  .update({ blocks: nodes, blocks_published: nodes, updated_at: now })
  .eq("id", page!.id);
if (error) throw error;
console.log("patched+published cover", {
  coverSrc: publicUrl.slice(0, 80),
  bio: bio.slice(0, 60),
});
