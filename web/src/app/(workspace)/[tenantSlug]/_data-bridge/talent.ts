import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * _data-bridge/talent.ts — talent-side dashboard loaders.
 *
 * Split out of `_data-bridge.ts` (rev 13). Powers the talent app:
 *   - self profile + agency context (loadTalentSelfProfile)
 *   - talent's inquiry list with unread counts (loadTalentInquiries)
 *   - talent's agency relationships (loadTalentAgencies)
 *   - talent's per-agency contact preferences (loadTalentContactPrefs)
 */

// ─── Talent self-dashboard data ───────────────────────────────────────────────

export type TalentSelfProfile = {
  /** talent_profiles.id */
  id: string;
  displayName: string;
  /** Primary talent type label (e.g. "Fashion Model") */
  primaryTypeLabel: string | null;
  /** Home city display name */
  homeCity: string | null;
  /** workflow_status: draft | published | invited */
  workflowStatus: string;
  /** Roster status: active | pending | paused */
  rosterStatus: string;
  /** The talent's public profile URL code (profile_code) */
  profileCode: string | null;
  /** Display name of the agency they're viewing this in context of */
  agencyName: string;
  /** Public URL of the talent's "card" variant media asset, or null */
  headshotUrl: string | null;
  /** True if short_bio or bio_en is non-empty */
  hasBio: boolean;
  /** True if height_cm is non-null */
  hasHeight: boolean;
};

/**
 * Load the talent's own profile + verify they're rostered in this agency.
 * Returns null if not found or not rostered.
 */
export async function loadTalentSelfProfile(
  userId: string,
  tenantId: string,
): Promise<TalentSelfProfile | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;
    const trusted = createServiceRoleClient() ?? supabase;

    // Step 1: Get the talent's profile
    const { data: profileRow, error: profileErr } = await supabase
      .from("talent_profiles")
      .select(`
        id,
        display_name,
        first_name,
        last_name,
        workflow_status,
        profile_code,
        short_bio,
        bio_en,
        height_cm,
        talent_profile_taxonomy (
          relationship_type,
          taxonomy_terms ( name_en )
        ),
        talent_service_areas (
          service_kind,
          locations ( display_name_en )
        )
      `)
      .eq("user_id", userId)
      .maybeSingle();

    if (profileErr || !profileRow) {
      if (profileErr) logServerError("talent.loadSelfProfile.profile", profileErr);
      return null;
    }

    type ProfileRaw = {
      id: string;
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
      workflow_status: string | null;
      profile_code: string | null;
      short_bio: string | null;
      bio_en: string | null;
      height_cm: number | null;
      talent_profile_taxonomy: { relationship_type: string | null; taxonomy_terms: { name_en: string | null } | null }[] | null;
      talent_service_areas: { service_kind: string | null; locations: { display_name_en: string | null } | null }[] | null;
    };

    const p = profileRow as unknown as ProfileRaw;

    // Step 2: Verify the talent is rostered in this tenant
    const { data: rosterRow, error: rosterErr } = await trusted
      .from("agency_talent_roster")
      .select("status, agencies!tenant_id ( display_name )")
      .eq("talent_profile_id", p.id)
      .eq("tenant_id", tenantId)
      .neq("status", "removed")
      .maybeSingle();

    if (rosterErr || !rosterRow) return null;

    // Step 3: Fetch the talent's headshot. Prefer "card" variant; fall back
    // through public_watermarked → gallery → portfolio → original so the
    // talent's own dashboard never goes blank if their photo only landed in
    // a different variant kind.
    const admin = createServiceRoleClient();
    const mediaClient = admin ?? supabase;
    const { data: mediaRows } = await mediaClient
      .from("media_assets")
      .select("storage_path, variant_kind")
      .eq("owner_talent_profile_id", p.id)
      .in("variant_kind", ["card", "public_watermarked", "gallery", "portfolio", "original"])
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
    const variantOrder = ["card", "public_watermarked", "gallery", "portfolio", "original"];
    const mediaRow = (mediaRows ?? [])
      .slice()
      .sort(
        (a, b) =>
          variantOrder.indexOf((a as { variant_kind: string }).variant_kind) -
          variantOrder.indexOf((b as { variant_kind: string }).variant_kind),
      )[0] as { storage_path: string; variant_kind: string } | undefined ?? null;
    const BUCKET = "media-public";
    const headshotUrl = mediaRow?.storage_path
      ? mediaClient.storage.from(BUCKET).getPublicUrl(mediaRow.storage_path).data.publicUrl
      : null;

    type RosterRaw = {
      status: string;
      agencies: { display_name: string } | { display_name: string }[] | null;
    };

    const roster = rosterRow as unknown as RosterRaw;
    const agencyRow = Array.isArray(roster.agencies) ? roster.agencies[0] : roster.agencies;

    const displayName =
      p.display_name?.trim() ||
      `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() ||
      "Unnamed";

    const primaryTypeLabel =
      (p.talent_profile_taxonomy ?? [])
        .find((t) => t.relationship_type === "primary_role")
        ?.taxonomy_terms?.name_en ?? null;

    const homeCity =
      (p.talent_service_areas ?? [])
        .find((a) => a.service_kind === "home_base")
        ?.locations?.display_name_en ?? null;

    return {
      id: p.id,
      displayName,
      primaryTypeLabel,
      homeCity,
      workflowStatus: p.workflow_status ?? "draft",
      rosterStatus: roster.status,
      profileCode: p.profile_code ?? null,
      agencyName: agencyRow?.display_name ?? "Agency",
      headshotUrl,
      hasBio: !!(p.short_bio?.trim() || p.bio_en?.trim()),
      hasHeight: p.height_cm !== null,
    };
  } catch (err) {
    logServerError("talent.loadSelfProfile", err);
    return null;
  }
}

// ─── Talent inquiries ─────────────────────────────────────────────────────────

export type TalentInquiryRow = {
  id: string;
  status: string;
  contact_name: string;
  company: string | null;
  event_date: string | null;
  event_location: string | null;
  created_at: string;
  /** Last activity timestamp — prefer this over created_at for display age. */
  updated_at: string;
  /** participant status: invited | accepted | declined | pending */
  participantStatus: string;
  /** Unread count in the group thread for this talent user. */
  unreadCount: number;
};

/**
 * Load the talent's inquiries via inquiry_participants.
 * Shows all inquiries where the talent is a participant.
 */
export async function loadTalentInquiries(
  talentProfileId: string,
  tenantId: string,
): Promise<TalentInquiryRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const myUserId = user?.id ?? null;

    const { data, error } = await supabase
      .from("inquiry_participants")
      .select(`
        status,
        inquiries!inner (
          id,
          status,
          contact_name,
          company,
          event_date,
          event_location,
          created_at,
          updated_at,
          tenant_id
        )
      `)
      .eq("talent_profile_id", talentProfileId)
      .eq("inquiries.tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      logServerError("talent.loadInquiries", error);
      return [];
    }

    type PartRow = {
      status: string;
      inquiries: {
        id: string;
        status: string;
        contact_name: string;
        company: string | null;
        event_date: string | null;
        event_location: string | null;
        created_at: string;
        updated_at: string;
      } | null;
    };

    const rows = ((data ?? []) as unknown as PartRow[])
      .filter((r) => r.inquiries)
      .map((r) => ({
        id: r.inquiries!.id,
        status: r.inquiries!.status,
        contact_name: r.inquiries!.contact_name,
        company: r.inquiries!.company,
        event_date: r.inquiries!.event_date,
        event_location: r.inquiries!.event_location,
        created_at: r.inquiries!.created_at,
        updated_at: r.inquiries!.updated_at,
        participantStatus: r.status,
        unreadCount: 0,
      }));

    if (!myUserId || rows.length === 0) return rows;

    const inquiryIds = rows.map((row) => row.id);
    const [readsRes, messagesRes] = await Promise.all([
      supabase
        .from("inquiry_message_reads")
        .select("inquiry_id, last_read_at")
        .eq("tenant_id", tenantId)
        .eq("user_id", myUserId)
        .eq("thread_type", "group")
        .in("inquiry_id", inquiryIds),
      supabase
        .from("inquiry_messages")
        .select("inquiry_id, sender_user_id, created_at")
        .eq("tenant_id", tenantId)
        .eq("thread_type", "group")
        .is("deleted_at", null)
        .in("inquiry_id", inquiryIds),
    ]);

    if (readsRes.error) {
      logServerError("talent.loadInquiries.reads", readsRes.error);
    }
    if (messagesRes.error) {
      logServerError("talent.loadInquiries.messages", messagesRes.error);
    }

    const lastReadAtByInquiry = new Map<string, string>();
    for (const row of (readsRes.data ?? []) as {
      inquiry_id: string;
      last_read_at: string | null;
    }[]) {
      if (row.last_read_at) {
        lastReadAtByInquiry.set(row.inquiry_id, row.last_read_at);
      }
    }

    const unreadByInquiry = new Map<string, number>();
    for (const row of (messagesRes.data ?? []) as {
      inquiry_id: string;
      sender_user_id: string | null;
      created_at: string;
    }[]) {
      if (row.sender_user_id && row.sender_user_id === myUserId) continue;
      const lastReadAt = lastReadAtByInquiry.get(row.inquiry_id);
      if (lastReadAt && new Date(row.created_at).getTime() <= new Date(lastReadAt).getTime()) {
        continue;
      }
      unreadByInquiry.set(
        row.inquiry_id,
        (unreadByInquiry.get(row.inquiry_id) ?? 0) + 1,
      );
    }

    return rows.map((row) => ({
      ...row,
      unreadCount: unreadByInquiry.get(row.id) ?? 0,
    }));
  } catch (err) {
    logServerError("talent.loadInquiries", err);
    return [];
  }
}

// ─── Talent agency relationships ──────────────────────────────────────────────

export type TalentAgencyRow = {
  id: string;
  agencyName: string;
  agencySlug: string;
  rosterStatus: string;
  plan: string;
  addedAt: string;
  /** Whether this is the talent's primary agency (is_primary = true on the roster row). */
  isPrimary: boolean;
  /** Agency visibility tier on this roster: roster_only | site_visible | featured */
  agencyVisibility: string;
};

/**
 * Load all agency relationships for a talent (across all tenants).
 */
export async function loadTalentAgencies(
  talentProfileId: string,
): Promise<TalentAgencyRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];
    const trusted = createServiceRoleClient() ?? supabase;

    const { data, error } = await trusted
      .from("agency_talent_roster")
      .select(`
        status,
        created_at,
        is_primary,
        agency_visibility,
        agencies!tenant_id ( id, display_name, slug, plan_tier )
      `)
      .eq("talent_profile_id", talentProfileId)
      .neq("status", "removed")
      .order("created_at", { ascending: true });

    if (error) {
      logServerError("talent.loadAgencies", error);
      return [];
    }

    type RosterRow2 = {
      status: string;
      created_at: string;
      is_primary: boolean;
      agency_visibility: string;
      agencies: { id: string; display_name: string; slug: string; plan_tier: string | null } | { id: string; display_name: string; slug: string; plan_tier: string | null }[] | null;
    };

    return ((data ?? []) as unknown as RosterRow2[]).map((row) => {
      const agency = Array.isArray(row.agencies) ? row.agencies[0] : row.agencies;
      return {
        id: agency?.id ?? row.created_at,
        agencyName: agency?.display_name ?? "Unknown agency",
        agencySlug: agency?.slug ?? "",
        rosterStatus: row.status,
        plan: agency?.plan_tier ?? "free",
        addedAt: row.created_at,
        isPrimary: row.is_primary ?? false,
        agencyVisibility: row.agency_visibility ?? "roster_only",
      };
    });
  } catch (err) {
    logServerError("talent.loadAgencies", err);
    return [];
  }
}

// ─── Talent contact preferences (per-agency) ──────────────────────────────────

export type TalentContactPrefs = {
  talentProfileId: string;
  allowBasic: boolean;
  allowVerified: boolean;
  allowSilver: boolean;
  allowGold: boolean;
};

/**
 * Load contact preferences for a talent profile.
 * Returns null if no record exists yet (all tiers allowed by default).
 */
export async function loadTalentContactPrefs(
  talentProfileId: string,
  tenantId: string,
): Promise<TalentContactPrefs | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("talent_contact_preferences")
      .select("talent_profile_id, allow_basic, allow_verified, allow_silver, allow_gold")
      .eq("talent_profile_id", talentProfileId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      logServerError("talent.loadContactPrefs", error);
      return null;
    }
    if (!data) return null;

    type Row = {
      talent_profile_id: string;
      allow_basic: boolean;
      allow_verified: boolean;
      allow_silver: boolean;
      allow_gold: boolean;
    };
    const row = data as unknown as Row;
    return {
      talentProfileId: row.talent_profile_id,
      allowBasic: row.allow_basic,
      allowVerified: row.allow_verified,
      allowSilver: row.allow_silver,
      allowGold: row.allow_gold,
    };
  } catch (err) {
    logServerError("talent.loadContactPrefs", err);
    return null;
  }
}
