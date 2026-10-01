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
    const { data: tp } = await admin.from("talent_profiles").select("display_name").eq("id", talentId).maybeSingle();
    const name = (tp as { display_name: string | null } | null)?.display_name?.trim();
    return name ? name : agencyName;
  } catch {
    return null;
  }
}
