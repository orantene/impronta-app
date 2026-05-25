import "server-only";

import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { TalentPublicSiteRpcRow, TalentSiteSnapshot } from "@/lib/talent-site/types";
import { parseTalentSiteSnapshot, validateTalentSiteSnapshot } from "@/lib/talent-site/validation";

export type TalentPublicSiteLoadResult =
  | { kind: "published"; row: TalentPublicSiteRpcRow; snapshot: TalentSiteSnapshot }
  | { kind: "not_published"; profileExists: boolean; profileCode: string }
  | { kind: "not_found" };

export async function loadTalentPublicSiteByProfileCode(
  profileCode: string,
): Promise<TalentPublicSiteLoadResult> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) {
    return { kind: "not_found" };
  }

  const { data: rpcRows, error: rpcErr } = await supabase.rpc(
    "talent_public_site_for_profile_code",
    { p_profile_code: profileCode },
  );

  if (!rpcErr && rpcRows && Array.isArray(rpcRows) && rpcRows.length > 0) {
    const row = rpcRows[0] as TalentPublicSiteRpcRow;
    const validated = validateTalentSiteSnapshot(row.published_snapshot);
    if (validated.ok) {
      return { kind: "published", row, snapshot: validated.snapshot };
    }
  }

  const admin = createServiceRoleClient() ?? supabase;
  const { data: profile } = await admin
    .from("talent_profiles")
    .select("id, profile_code, is_publicly_hidden")
    .eq("profile_code", profileCode)
    .maybeSingle();

  if (!profile) {
    return { kind: "not_found" };
  }

  const p = profile as {
    profile_code: string;
    is_publicly_hidden: boolean | null;
  };

  if (p.is_publicly_hidden) {
    return { kind: "not_found" };
  }

  return {
    kind: "not_published",
    profileExists: true,
    profileCode: p.profile_code,
  };
}

export async function loadTalentPublicSiteDraftForOwner(
  profileCode: string,
  userId: string,
): Promise<TalentSiteSnapshot | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;

  const { data: profile } = await admin
    .from("talent_profiles")
    .select("id, user_id")
    .eq("profile_code", profileCode)
    .maybeSingle();

  if (!profile) return null;
  const p = profile as { id: string; user_id: string | null };
  if (p.user_id !== userId) return null;

  const { data: site } = await admin
    .from("talent_sites")
    .select("draft_snapshot")
    .eq("talent_profile_id", p.id)
    .maybeSingle();

  if (!site) return null;
  return parseTalentSiteSnapshot((site as { draft_snapshot: unknown }).draft_snapshot);
}
