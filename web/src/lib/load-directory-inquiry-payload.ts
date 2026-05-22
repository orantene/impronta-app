import { getGuestSessionKey } from "@/lib/guest-session";
import { getPublicSettings } from "@/lib/public-settings";
import { isResolvedAiChatConfigured } from "@/lib/ai/resolve-provider";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { getPublicHostContext } from "@/lib/saas/scope";
import { loadPublicIdentity } from "@/lib/site-admin/server/reads";

export type DirectoryInquiryOrderedTalent = {
  id: string;
  profile_code: string;
  display_name: string | null;
  /** Public card-thumbnail URL — drives the composer's talent mini-cards. */
  photo_url: string | null;
};

export type DirectoryInquiryPayload =
  | { kind: "unconfigured" }
  | {
      kind: "ready";
      inquiriesOpen: boolean;
      /** Phase 13 — `ai_draft_enabled` + resolved provider key; UI shows inline draft assistant. */
      aiInquiryDraftEnabled: boolean;
      agencyWhatsAppNumber?: string;
      mode: "client" | "guest";
      defaultEmail?: string;
      defaultName?: string;
      defaultPhone?: string;
      defaultCompany?: string;
      talentIds: string[];
      orderedTalent: DirectoryInquiryOrderedTalent[];
      eventTypes: { id: string; name_en: string }[];
      /**
       * Lane B / B2 — the tenant slug + display name the canonical
       * InquiryDrawer needs to route the submit and render header copy.
       * Empty slug ⇒ the host did not resolve to an agency tenant; the
       * directory inquiry sheet falls back to a closed state.
       */
      tenantSlug: string;
      agencyName: string;
      /**
       * Auth user id when `mode === "client"` — lets the InquiryDrawer
       * render the logged-in trust card instead of the "New client" one.
       */
      userId?: string;
    };

/**
 * Shared loader for the public inquiry sheet (header panel).
 */
export async function loadDirectoryInquiryPayload(): Promise<DirectoryInquiryPayload> {
  if (!isSupabaseConfigured()) {
    return { kind: "unconfigured" };
  }

  const pub = createPublicSupabaseClient()!;
  const publicSettings = await getPublicSettings();
  const guestKey = await getGuestSessionKey();

  // Lane B / B2 — resolve the tenant slug + display name so the canonical
  // InquiryDrawer can route its submit (`submitInquiryNowAction` is
  // slug-keyed) and render header copy.
  const hostCtx = await getPublicHostContext();
  const tenantSlug = hostCtx.kind === "agency" ? hostCtx.tenantSlug : "";
  let agencyName = "the agency";
  if (hostCtx.tenantId) {
    // The storefront brand name lives in `agency_business_identity.public_name`
    // (the same source the public header uses). The `agencies` table is not
    // readable by the anon client, so resolve it via loadPublicIdentity.
    const identity = await loadPublicIdentity(hostCtx.tenantId);
    const publicName = identity?.public_name?.trim();
    if (publicName) agencyName = publicName;
  }
  if (guestKey) {
    await pub.rpc("ensure_guest_session", { p_session_key: guestKey });
  }

  const actor = await getCachedActorSession();
  const user = actor.user;
  const supabase = actor.supabase;

  const { data: clientProfile } =
    user && supabase
      ? await supabase
          .from("client_profiles")
          .select("company_name, phone, whatsapp_phone, website_url, notes")
          .eq("user_id", user.id)
          .maybeSingle()
      : { data: null };

  let talentIds: string[] = [];
  if (user && supabase) {
    const { data: saves } = await supabase
      .from("saved_talent")
      .select("talent_profile_id")
      .eq("client_user_id", user.id)
      .order("created_at", { ascending: false });
    talentIds = saves?.map((s) => s.talent_profile_id) ?? [];
  } else if (guestKey) {
    const { data: guestRows } = await pub.rpc("guest_list_saved_talent_ids", {
      p_session_key: guestKey,
    });
    talentIds =
      (guestRows as { talent_profile_id: string }[] | null)?.map(
        (r) => r.talent_profile_id,
      ) ?? [];
  }

  const { data: talentRows } =
    talentIds.length > 0
      ? await pub
          .from("talent_profiles")
          .select("id, profile_code, display_name")
          .in("id", talentIds)
      : { data: [] as { id: string; profile_code: string; display_name: string | null }[] };

  // Card-thumbnail per talent — so the composer can render a face, not a
  // bare name chip. `variant_kind = 'card'` is the directory card crop;
  // pick the first approved, non-deleted one per talent.
  const photoByTalent = new Map<string, string>();
  if (talentIds.length > 0) {
    const { data: mediaRows } = await pub
      .from("media_assets")
      .select("owner_talent_profile_id, bucket_id, storage_path, variant_kind, sort_order")
      .in("owner_talent_profile_id", talentIds)
      .eq("variant_kind", "card")
      .eq("approval_state", "approved")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true });
    for (const m of mediaRows ?? []) {
      const ownerId = m.owner_talent_profile_id as string;
      if (photoByTalent.has(ownerId)) continue;
      if (!m.bucket_id || !m.storage_path) continue;
      const { data: pubUrl } = pub.storage
        .from(m.bucket_id as string)
        .getPublicUrl(m.storage_path as string);
      if (pubUrl?.publicUrl) photoByTalent.set(ownerId, pubUrl.publicUrl);
    }
  }

  const talentMap = new Map(
    (talentRows ?? []).map((t) => [t.id, t] as const),
  );
  const orderedTalent: DirectoryInquiryOrderedTalent[] = talentIds
    .map((id) => {
      const row = talentMap.get(id);
      if (!row) return null;
      return {
        id: row.id,
        profile_code: row.profile_code,
        display_name: row.display_name,
        photo_url: photoByTalent.get(id) ?? null,
      };
    })
    .filter((t): t is DirectoryInquiryOrderedTalent => t !== null);

  const { data: eventTypes } = await pub
    .from("taxonomy_terms")
    .select("id, name_en")
    .eq("kind", "event_type")
    .is("archived_at", null)
    .order("sort_order", { ascending: true });

  const aiFlags = await getAiFeatureFlags();
  const aiInquiryDraftEnabled = Boolean(
    aiFlags.ai_master_enabled &&
      aiFlags.ai_draft_enabled &&
      (await isResolvedAiChatConfigured()),
  );

  const defaultEmail = user?.email ?? undefined;
  const defaultName =
    actor.profile?.display_name ??
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    undefined;

  return {
    kind: "ready",
    inquiriesOpen: publicSettings.inquiriesOpen,
    aiInquiryDraftEnabled,
    agencyWhatsAppNumber: publicSettings.agencyWhatsAppNumber ?? undefined,
    mode: user ? "client" : "guest",
    defaultEmail,
    defaultName,
    defaultPhone: clientProfile?.phone ?? undefined,
    defaultCompany: clientProfile?.company_name ?? undefined,
    talentIds,
    orderedTalent,
    eventTypes: eventTypes ?? [],
    tenantSlug,
    agencyName,
    userId: user?.id,
  };
}
