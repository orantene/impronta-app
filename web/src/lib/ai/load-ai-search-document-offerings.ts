/**
 * F1 (TUL-1273 deferred): loads a talent's LISTABLE offerings (D-10a:
 * published + approved + public or on_request, talent-owned) for the AI search
 * document. No price column is read; on_request text is stripped of amounts by
 * the builder.
 *
 * TUL-1709: a workspace's own Menu items (`owner_kind='workspace'`, no single
 * talent owner) are listable too, but only for the ONE talent profile that is
 * the workspace's active owner (`agency_memberships` role=owner, same rule
 * `resolveOwnerTalentProfileId` uses the other way around — TUL-1634's
 * `workspace-menu-side-effects.ts` rebuilds that same owner talent's document
 * after a Menu write). A roster talent with no owned workspace just gets []
 * from the workspace half, same as before.
 *
 * A read error logs and yields [] for that half so the rest of the document
 * still rebuilds.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiSearchDocumentOffering } from "@/lib/ai/ai-search-document-offerings";
import { AI_DOC_OFFERINGS_MAX } from "@/lib/ai/ai-search-document-offerings";
import { logServerError } from "@/lib/server/safe-error";
import { scopeToSellableOfferings } from "@/lib/offerings/sellable";

type OfferingRow = {
  id: string;
  title: string | null;
  category: string | null;
  description: string | null;
  sort_order: number | null;
  status: string | null;
  moderation_state: string | null;
  visibility: string | null;
};

const OFFERING_COLUMNS = "id, title, category, description, sort_order, status, moderation_state, visibility";

function toDocOffering(r: OfferingRow): AiSearchDocumentOffering {
  return {
    id: r.id,
    title: r.title ?? "",
    category: r.category,
    description: r.description,
    sortOrder: r.sort_order,
    status: r.status,
    moderation_state: r.moderation_state,
    visibility: r.visibility,
  };
}

async function loadTalentOwnedOfferings(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<OfferingRow[]> {
  const { data, error } = await scopeToSellableOfferings(
    supabase
      .from("talent_offerings")
      .select(OFFERING_COLUMNS)
      .eq("talent_profile_id", talentProfileId)
      .eq("owner_kind", "talent"),
    "guest_request",
  )
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    // Over-fetch a little: the builder re-checks the gate and drops empty titles.
    .limit(AI_DOC_OFFERINGS_MAX * 2);
  if (error) {
    logServerError("rebuildAiSearchDocument/offerings", error);
    return [];
  }
  return (data ?? []) as OfferingRow[];
}

/**
 * The tenant this talent profile is the active OWNER of, or null. The reverse
 * of `resolveOwnerTalentProfileId` (`@/lib/saas/ensure-self-roster`): that
 * function walks tenant -> owner membership -> talent profile; a workspace
 * item has no talent_profile_id to filter by, so the AI document build walks
 * it the other way, talent profile -> user -> owner membership -> tenant.
 * A talent with no owned workspace (a roster talent, or no workspace at all)
 * resolves to null and the workspace half of the load is skipped.
 */
async function resolveOwnedWorkspaceTenantId(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<string | null> {
  const { data: profile, error: profileErr } = await supabase
    .from("talent_profiles")
    .select("user_id")
    .eq("id", talentProfileId)
    .maybeSingle<{ user_id: string | null }>();
  if (profileErr) {
    logServerError("rebuildAiSearchDocument/offerings/ownerProfile", profileErr);
    return null;
  }
  const userId = profile?.user_id;
  if (!userId) return null;

  const { data: membership, error: memErr } = await supabase
    .from("agency_memberships")
    .select("tenant_id")
    .eq("profile_id", userId)
    .eq("role", "owner")
    .eq("status", "active")
    .order("accepted_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ tenant_id: string | null }>();
  if (memErr) {
    logServerError("rebuildAiSearchDocument/offerings/ownerMembership", memErr);
    return null;
  }
  return typeof membership?.tenant_id === "string" ? membership.tenant_id : null;
}

async function loadWorkspaceOwnedOfferings(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<OfferingRow[]> {
  const tenantId = await resolveOwnedWorkspaceTenantId(supabase, talentProfileId);
  if (!tenantId) return [];

  const { data, error } = await scopeToSellableOfferings(
    supabase
      .from("talent_offerings")
      .select(OFFERING_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("owner_kind", "workspace"),
    "guest_request",
  )
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    .limit(AI_DOC_OFFERINGS_MAX * 2);
  if (error) {
    logServerError("rebuildAiSearchDocument/offerings/workspace", error);
    return [];
  }
  return (data ?? []) as OfferingRow[];
}

export async function loadAiSearchDocumentOfferings(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<AiSearchDocumentOffering[]> {
  const [talentRows, workspaceRows] = await Promise.all([
    loadTalentOwnedOfferings(supabase, talentProfileId),
    loadWorkspaceOwnedOfferings(supabase, talentProfileId),
  ]);
  return [...talentRows, ...workspaceRows].map(toDocOffering);
}
