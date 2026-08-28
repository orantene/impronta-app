import { getGuestSessionKey } from "@/lib/guest-session";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";
import { getPublicSettings } from "@/lib/public-settings";
import { isResolvedAiChatConfigured } from "@/lib/ai/resolve-provider";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getPublicHostContext } from "@/lib/saas/scope";
import { getPlatformHubTenant } from "@/lib/saas/platform-hub";
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
       * The event fields this visitor already gave the guest chat, so opening
       * the drawer does not show them an empty form. See `loadCarriedDraft`.
       * Undefined when there is no live draft to carry.
       */
      carriedIntent?: CarriedDraftIntent;
      /**
       * The id of the draft `carriedIntent` came from. The sheet threads it
       * into `source_context.carried_draft_id`, and a successful submit then
       * RETIRES that draft (status -> cancelled) so the chat does not resume a
       * ghost "Not sent yet" duplicate of an inquiry the visitor already sent.
       */
      carriedDraftId?: string;
    };

/**
 * The subset of a draft's intent the drawer may safely pre-fill.
 *
 * DELIBERATELY NOT the whole intent: `talent` is already owned by the shared
 * lineup (bindToInquiryCart), `requester`/`client` are already prefilled from
 * the account, and `source_context` must describe THIS entry point, not the
 * one that created the draft. Copying those would fight surfaces that are
 * already correct.
 */
export type CarriedDraftIntent = Pick<
  InquiryIntent,
  "location" | "date" | "budget" | "brief"
>;

/**
 * Carry the event fields a guest already gave the CHAT into the drawer.
 *
 * The two surfaces are one inquiry to the visitor but had two persistence
 * models: the chat writes field-by-field through `captureGuestChip` into the
 * draft's `interpreted_query`, while the drawer holds everything in local
 * React state until submit (guest autosave is deliberately off). So a guest
 * who told the chat their date, then opened the drawer, was met with an empty
 * form and had to type it again.
 *
 * DECISION (2026-08-27): read-only prefill IS the sync model — write-back is
 * rejected, not deferred. Live two-way sync would need guest draft autosave
 * (deliberately off: orphan drafts, abuse surface) plus a conflict rule, and
 * every rule silently overwrites something the guest typed on the other
 * surface. Instead the flow is: chat persists as you talk -> drawer opens
 * pre-filled -> drawer SUBMIT creates the real inquiry and retires the carried
 * draft (see carriedDraftId), so the two surfaces converge at the only moment
 * that matters and no ghost "Not sent yet" duplicate survives the send.
 *
 * Anon RLS cannot see `inquiries`, so this mirrors the chat's own resolver and
 * goes through the service-role client after proving the session key. Silent
 * on every failure: a missing draft must never break the composer opening.
 */
async function loadCarriedDraftIntent(
  guestKey: string | null,
  tenantSlug: string,
): Promise<{ intent: CarriedDraftIntent; draftId: string } | undefined> {
  if (!guestKey || !tenantSlug) return undefined;
  const admin = createServiceRoleClient();
  if (!admin) return undefined;

  try {
    const { data: guestRow } = await admin
      .from("guest_sessions")
      .select("id")
      .eq("session_key", guestKey)
      .maybeSingle();
    const guestSessionId = (guestRow as { id?: string } | null)?.id;
    if (!guestSessionId) return undefined;

    const { data: agency } = await admin
      .from("agencies")
      .select("id")
      .eq("slug", tenantSlug)
      .maybeSingle();
    const tenantId = (agency as { id?: string } | null)?.id;
    if (!tenantId) return undefined;

    // Newest un-sent draft for this guest on this tenant. `draft` is the only
    // status the chat leaves an in-progress inquiry in; anything submitted is
    // finished and must not bleed into a NEW inquiry the visitor is starting.
    const { data: row } = await admin
      .from("inquiries")
      .select("id, interpreted_query")
      .eq("guest_session_id", guestSessionId)
      .eq("tenant_id", tenantId)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const draftId = (row as { id?: string } | null)?.id;
    const intent = (row as { interpreted_query?: unknown } | null)
      ?.interpreted_query as Partial<InquiryIntent> | null | undefined;
    if (!draftId || !intent || typeof intent !== "object") return undefined;

    // Only the four event sections. `talent` stays with the shared lineup,
    // `requester`/`client` with the account prefill, and `source_context` must
    // describe THIS entry point.
    const carried: CarriedDraftIntent = {};
    if (intent.location) carried.location = intent.location;
    if (intent.date) carried.date = intent.date;
    if (intent.budget) carried.budget = intent.budget;
    if (intent.brief) carried.brief = intent.brief;

    return Object.keys(carried).length > 0
      ? { intent: carried, draftId }
      : undefined;
  } catch {
    // Best-effort prefill. Never block the composer.
    return undefined;
  }
}

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
  // Agency hosts route to their own tenant. Platform hosts (marketing apex,
  // app, hub) route to the platform hub tenant — the same resolution the
  // guest-chat launcher uses — so the inquiry sheet stops rendering
  // "Directory is not configured." for a visitor on tulala.digital.
  let tenantSlug = "";
  let brandTenantId: string | null = null;
  let agencyName = "the agency";
  if (hostCtx.kind === "agency") {
    tenantSlug = hostCtx.tenantSlug ?? "";
    brandTenantId = hostCtx.tenantId;
  } else {
    const hub = await getPlatformHubTenant();
    if (hub) {
      tenantSlug = hub.slug;
      brandTenantId = hub.tenantId;
      agencyName = hub.displayName;
    }
  }
  if (brandTenantId) {
    // The storefront brand name lives in `agency_business_identity.public_name`
    // (the same source the public header uses). The `agencies` table is not
    // readable by the anon client, so resolve it via loadPublicIdentity.
    const identity = await loadPublicIdentity(brandTenantId);
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

  const { data: eventTypeRows } = await pub
    .from("taxonomy_terms")
    .select("id, name_i18n")
    .eq("kind", "event_type")
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
  const eventTypes = ((eventTypeRows ?? []) as Array<{ id: string; name_i18n: Record<string, string | null> | null }>).map(
    (t) => ({ id: t.id, name_en: t.name_i18n?.en ?? "" }),
  );

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

  // Guests only: a signed-in client's drawer already autosaves its own draft,
  // so carrying the chat's would fight a surface that is already correct.
  const carried = user
    ? undefined
    : await loadCarriedDraftIntent(guestKey, tenantSlug);

  return {
    kind: "ready",
    carriedIntent: carried?.intent,
    carriedDraftId: carried?.draftId,
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
  };
}
