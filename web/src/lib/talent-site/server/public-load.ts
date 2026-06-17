import "server-only";

import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { TalentPublicSiteRpcRow } from "@/lib/talent-site/types";

/**
 * Resolve a talent's `profile_code` → `talent_profile_id` for the platform
 * `/t/<code>` route.
 *
 * LEGACY CONTEXT (Talent Max Site repoint, #493): this used to return the
 * `talent_sites.published_snapshot` so `/t/<code>` could render it as the
 * profile. That render path is GONE — `/t/<code>` is now always the discovery
 * profile (freeform default or `LightProfileLayout`) and the multi-page Max
 * website lives at `/t/site/<slug>`. The only thing the caller still needs from
 * this loader is the `talent_profile_id`, so the result no longer carries the
 * (now-ignored) snapshot payload.
 *
 * The published RPC (`talent_public_site_for_profile_code`, SECURITY DEFINER,
 * anon-executable) is still queried first because it is the cheapest
 * anon-accessible code→id lookup for a *published* talent; the un-published
 * fallback resolves the id directly off `talent_profiles`. (The RPC still
 * returns the snapshot column over the wire — that is a DB contract left intact
 * on purpose; we simply stop reading it here.)
 */
export type TalentPublicSiteLoadResult =
  | { kind: "published"; talentProfileId: string; profileCode: string }
  | {
      kind: "not_published";
      profileExists: boolean;
      profileCode: string;
      talentProfileId: string;
    }
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
    // The RPC only returns a row for a PUBLISHED talent site. We no longer parse
    // its `published_snapshot` (the snapshot is not the profile render anymore) —
    // a non-empty row is sufficient to confirm publication and carry the id.
    const row = rpcRows[0] as TalentPublicSiteRpcRow;
    if (row.talent_profile_id) {
      return {
        kind: "published",
        talentProfileId: row.talent_profile_id,
        profileCode: row.profile_code,
      };
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
    id: string;
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
    talentProfileId: p.id,
  };
}
