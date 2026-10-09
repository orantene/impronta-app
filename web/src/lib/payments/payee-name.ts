/**
 * Name shown on the card statement (descriptor suffix) for a workspace's sale.
 * An independent talent's own workspace (`workspace_type = 'talent'`) shows the
 * talent's public display name; any other workspace shows its own display name.
 * Best effort: any failure falls back to the workspace name, never throws.
 */
import { resolveOwnerTalentProfileId } from "@/lib/saas/ensure-self-roster";

type Admin = Parameters<typeof resolveOwnerTalentProfileId>[0];

export async function resolvePayeeName(admin: Admin, tenantId: string): Promise<string | null> {
  try {
    // supabase-read-unchecked-ok: card-statement label only; a failed read
    // falls back to no suffix, and the charge itself is unaffected.
    const { data } = await admin
      .from("agencies")
      .select("display_name, workspace_type")
      .eq("id", tenantId)
      .maybeSingle();
    const row = data as { display_name: string | null; workspace_type: string | null } | null;
    const agencyName = row?.display_name ?? null;
    if (row?.workspace_type !== "talent") return agencyName;
    const talentId = await resolveOwnerTalentProfileId(admin, tenantId);
    if (!talentId) return agencyName;
    // supabase-read-unchecked-ok: a failed read falls back to the workspace name.
    const { data: tp } = await admin.from("talent_profiles").select("display_name").eq("id", talentId).maybeSingle();
    const name = (tp as { display_name: string | null } | null)?.display_name?.trim();
    return name ? name : agencyName;
  } catch {
    return null;
  }
}

/**
 * The seller shown on a pay link / paid page. On the platform hub the sale belongs to the TALENT
 * the order's lines name (a hub sale is her own sale, TUL-437), so the page must not say "Impronta
 * Hub". Any other workspace, and a hub order with no single talent on its lines (mixed or none),
 * keeps `resolvePayeeName`'s answer. Best effort, never throws.
 */
export async function resolveOrderPayeeName(admin: Admin, tenantId: string, orderId: string): Promise<string | null> {
  const base = await resolvePayeeName(admin, tenantId);
  try {
    // supabase-read-unchecked-ok: display name only; a failed read keeps the workspace name.
    const { data: ag } = await admin.from("agencies").select("kind, plan_tier").eq("id", tenantId).maybeSingle();
    const a = ag as { kind: string | null; plan_tier: string | null } | null;
    if (a?.kind !== "hub" || a?.plan_tier !== "network") return base;
    // supabase-read-unchecked-ok: display name only.
    const { data: lines } = await (admin as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: unknown }> } } })
      .from("order_lines")
      .select("talent_profile_id")
      .eq("order_id", orderId);
    const ids = [...new Set(((lines ?? []) as Array<{ talent_profile_id: string | null }>).map((l) => l.talent_profile_id).filter((x): x is string => !!x))];
    if (ids.length !== 1) return base;
    // supabase-read-unchecked-ok: display name only.
    const { data: tp } = await admin.from("talent_profiles").select("display_name").eq("id", ids[0]).maybeSingle();
    const name = (tp as { display_name: string | null } | null)?.display_name?.trim();
    return name ? name : base;
  } catch {
    return base;
  }
}
