import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  buildTalentMembershipState,
  type TalentMembershipState,
} from "@/lib/access/talent-membership";

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
  /** Talent's global hide kill-switch (`talent_profiles.is_publicly_hidden`).
   *  true = the talent has hidden their profile across all of Tulala. */
  isPubliclyHidden: boolean;
  /** Roster status: active | pending | paused */
  rosterStatus: string;
  /** The talent's public profile URL code (profile_code) */
  profileCode: string | null;
  /** Canonical talent subscription plan key on talent_profiles.talent_plan_key. */
  talentPlanKey: TalentMembershipState["planKey"];
  /** Dashboard tier label used by the talent shell: Free / Pro / Max. */
  talentTier: TalentMembershipState["tier"];
  /** Server-derived talent plan capabilities for client rendering. */
  talentCapabilities: TalentMembershipState["capabilities"];
  /** Display name of the agency they're viewing this in context of */
  agencyName: string;
  /** Public URL of the talent's "card" variant media asset, or null */
  headshotUrl: string | null;
  /** True if short_bio or bio_en is non-empty */
  hasBio: boolean;
  /** True if height_cm is non-null */
  hasHeight: boolean;
  /** Contact policy — which client trust tiers can initiate inbound contact */
  contactPolicy: Record<string, boolean>;
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
        is_publicly_hidden,
        profile_code,
        talent_plan_key,
        short_bio,
        bio_en,
        height_cm,
        contact_policy,
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
      is_publicly_hidden: boolean | null;
      profile_code: string | null;
      talent_plan_key: string | null;
      short_bio: string | null;
      bio_en: string | null;
      height_cm: number | null;
      contact_policy: Record<string, boolean> | null;
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
    const membership = buildTalentMembershipState(p.talent_plan_key);

    return {
      id: p.id,
      displayName,
      primaryTypeLabel,
      homeCity,
      workflowStatus: p.workflow_status ?? "draft",
      isPubliclyHidden: p.is_publicly_hidden ?? false,
      rosterStatus: roster.status,
      profileCode: p.profile_code ?? null,
      talentPlanKey: membership.planKey,
      talentTier: membership.tier,
      talentCapabilities: membership.capabilities,
      agencyName: agencyRow?.display_name ?? "Agency",
      headshotUrl,
      hasBio: !!(p.short_bio?.trim() || p.bio_en?.trim()),
      hasHeight: p.height_cm !== null,
      contactPolicy: p.contact_policy ?? { basic: true, verified: true, silver: true, gold: true },
    };
  } catch (err) {
    logServerError("talent.loadSelfProfile", err);
    return null;
  }
}

/**
 * Platform-scoped talent profile — no roster gate. Used on `/talent/*` routes
 * on app.tulala.digital before an active agency context is applied.
 */
export async function loadTalentSelfProfileByUser(
  userId: string,
): Promise<TalentSelfProfile | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;
    const trusted = createServiceRoleClient() ?? supabase;

    const { data: profileRow, error: profileErr } = await supabase
      .from("talent_profiles")
      .select(`
        id,
        display_name,
        first_name,
        last_name,
        workflow_status,
        is_publicly_hidden,
        profile_code,
        talent_plan_key,
        short_bio,
        bio_en,
        height_cm,
        contact_policy,
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
      if (profileErr) logServerError("talent.loadSelfProfileByUser.profile", profileErr);
      return null;
    }

    type ProfileRaw = {
      id: string;
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
      workflow_status: string | null;
      is_publicly_hidden: boolean | null;
      profile_code: string | null;
      talent_plan_key: string | null;
      short_bio: string | null;
      bio_en: string | null;
      height_cm: number | null;
      contact_policy: Record<string, boolean> | null;
      talent_profile_taxonomy: { relationship_type: string | null; taxonomy_terms: { name_en: string | null } | null }[] | null;
      talent_service_areas: { service_kind: string | null; locations: { display_name_en: string | null } | null }[] | null;
    };

    const p = profileRow as unknown as ProfileRaw;

    const { data: mediaRows } = await trusted
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
      ? trusted.storage.from(BUCKET).getPublicUrl(mediaRow.storage_path).data.publicUrl
      : null;

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
    const membership = buildTalentMembershipState(p.talent_plan_key);

    return {
      id: p.id,
      displayName,
      primaryTypeLabel,
      homeCity,
      workflowStatus: p.workflow_status ?? "draft",
      isPubliclyHidden: p.is_publicly_hidden ?? false,
      rosterStatus: "active",
      profileCode: p.profile_code ?? null,
      talentPlanKey: membership.planKey,
      talentTier: membership.tier,
      talentCapabilities: membership.capabilities,
      agencyName: "Tulala",
      headshotUrl,
      hasBio: !!(p.short_bio?.trim() || p.bio_en?.trim()),
      hasHeight: p.height_cm !== null,
      contactPolicy: p.contact_policy ?? { basic: true, verified: true, silver: true, gold: true },
    };
  } catch (err) {
    logServerError("talent.loadSelfProfileByUser", err);
    return null;
  }
}

// ─── Talent inquiries ─────────────────────────────────────────────────────────

export type TalentInquiryRow = {
  id: string;
  status: string;
  contact_name: string;
  company: string | null;
  message: string | null;
  event_date: string | null;
  event_location: string | null;
  created_at: string;
  /** Last activity timestamp — prefer this over created_at for display age. */
  updated_at: string;
  /** participant status: invited | accepted | declined | pending */
  participantStatus: string;
  /** Unread count in the group thread for this talent user. */
  unreadCount: number;
  /** Client trust tier snapshot at inquiry submission. Null on historical rows. */
  trustLevel: "basic" | "verified" | "silver" | "gold" | null;
  /**
   * Audit T6 — Discover unified plan §6 source channels. Used by the
   * inbox to render a "via Discover" / "via Shortlist" pill so the
   * talent knows the inquiry originated cross-tenant rather than from
   * the agency's existing direct funnel.
   */
  sourceChannel: string | null;
};

/** Cross-agency inquiry row — includes agency context for unified inbox. */
export type TalentInquiryAllAgenciesRow = TalentInquiryRow & {
  tenantId: string;
  agencySlug: string;
  agencyName: string | null;
};

/**
 * Load the talent's inquiries via inquiry_participants.
 *
 * Contract (task 0.3 — root-cause why the talent inbox was empty after
 * admin assignment):
 *
 * 1. Key on `talent_profile_id`, never on `user_id`. The engine sets
 *    `participants.user_id = talent_profiles.user_id` at insert time, but
 *    that can be NULL for talents who haven't claimed their account yet.
 *    Once the talent claims, the legacy participant rows still carry
 *    `user_id = NULL`. Filtering by `user_id` would invisibly hide every
 *    one of those rows after the claim — exactly the loop-break the user
 *    spotted live on 2026-05-12.
 *
 * 2. Do NOT filter `status = 'active'`. New invitations land with
 *    `status = 'invited'` and the inbox must surface them — that IS the
 *    inbox's whole job. We only filter out `status = 'removed'` so admin
 *    deletions stop showing up.
 *
 * 3. RLS (`inquiry_participants_talent_select` +
 *    `inquiries_select_talent_participant`) gates rows on
 *    `talent_profiles.user_id = auth.uid()` via the profile join, so the
 *    query stays auth-correct even when the participant row's `user_id`
 *    column is NULL.
 *
 * Returns the inquiries the talent is a roster participant on, ordered
 * newest first, with per-inquiry unread counts from the group thread.
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

    // Task 0.3 — talent inbox loop hardening.
    //
    // The bridge MUST stay keyed on `talent_profile_id`, NOT `user_id`.
    // Reasoning:
    //   1. RLS (`inquiry_participants_talent_select`) gates rows on
    //      `talent_profiles.user_id = auth.uid()` via the profile, so this
    //      filter is auth-correct even when participant.user_id is NULL
    //      (admin added the talent BEFORE the talent claimed their account).
    //   2. The engine sets `participants.user_id = talent_profiles.user_id`
    //      at insert time. Legacy rows from pre-claim adds keep user_id NULL
    //      forever — switching this filter to `user_id` would silently hide
    //      every such row from the talent's inbox after they claim. That was
    //      the loop-break the user spotted (audit 2026-05-12).
    //
    // We also explicitly exclude `status = 'removed'` and pin `role = 'talent'`.
    // RLS already enforces `role = 'talent'` for this SELECT path, but making
    // it explicit at the query layer means a future RLS regression cannot
    // leak coordinator/client rows into the talent inbox.
    const { data, error } = await supabase
      .from("inquiry_participants")
      .select(`
        status,
        inquiries!inner (
          id,
          status,
          contact_name,
          company,
          message,
          event_date,
          event_location,
          created_at,
          updated_at,
          tenant_id,
          trust_level_at_submission,
          source_channel
        )
      `)
      .eq("talent_profile_id", talentProfileId)
      .eq("role", "talent")
      .neq("status", "removed")
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
        message: string | null;
        event_date: string | null;
        event_location: string | null;
        created_at: string;
        updated_at: string;
        trust_level_at_submission: "basic" | "verified" | "silver" | "gold" | null;
        source_channel: string | null;
      } | null;
    };

    const rows = ((data ?? []) as unknown as PartRow[])
      .filter((r) => r.inquiries)
      .map((r) => ({
        id: r.inquiries!.id,
        status: r.inquiries!.status,
        contact_name: r.inquiries!.contact_name,
        company: r.inquiries!.company,
        message: r.inquiries!.message,
        event_date: r.inquiries!.event_date,
        event_location: r.inquiries!.event_location,
        created_at: r.inquiries!.created_at,
        updated_at: r.inquiries!.updated_at,
        participantStatus: r.status,
        unreadCount: 0,
        trustLevel: r.inquiries!.trust_level_at_submission ?? null,
        sourceChannel: r.inquiries!.source_channel ?? null,
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

/**
 * Load the talent's inquiries across every agency roster they belong to.
 * Used by the platform `/talent/*` shell — agency is a filter, not a data gate.
 */
export async function loadTalentInquiriesAllAgencies(
  talentProfileId: string,
): Promise<TalentInquiryAllAgenciesRow[]> {
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
          message,
          event_date,
          event_location,
          created_at,
          updated_at,
          tenant_id,
          trust_level_at_submission,
          source_channel
        )
      `)
      .eq("talent_profile_id", talentProfileId)
      .eq("role", "talent")
      .neq("status", "removed")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      logServerError("talent.loadInquiriesAllAgencies", error);
      return [];
    }

    type PartRow = {
      status: string;
      inquiries: {
        id: string;
        status: string;
        contact_name: string;
        company: string | null;
        message: string | null;
        event_date: string | null;
        event_location: string | null;
        created_at: string;
        updated_at: string;
        tenant_id: string;
        trust_level_at_submission: "basic" | "verified" | "silver" | "gold" | null;
        source_channel: string | null;
      } | null;
    };

    const partialRows = ((data ?? []) as unknown as PartRow[])
      .filter((r) => r.inquiries)
      .map((r) => ({
        id: r.inquiries!.id,
        status: r.inquiries!.status,
        contact_name: r.inquiries!.contact_name,
        company: r.inquiries!.company,
        message: r.inquiries!.message,
        event_date: r.inquiries!.event_date,
        event_location: r.inquiries!.event_location,
        created_at: r.inquiries!.created_at,
        updated_at: r.inquiries!.updated_at,
        participantStatus: r.status,
        unreadCount: 0,
        trustLevel: r.inquiries!.trust_level_at_submission ?? null,
        sourceChannel: r.inquiries!.source_channel ?? null,
        tenantId: r.inquiries!.tenant_id,
      }));

    if (partialRows.length === 0) return [];

    const tenantIds = [...new Set(partialRows.map((row) => row.tenantId))];
    const { data: agencyRows, error: agencyError } = await supabase
      .from("agencies")
      .select("id, slug, display_name")
      .in("id", tenantIds);

    if (agencyError) {
      logServerError("talent.loadInquiriesAllAgencies.agencies", agencyError);
    }

    const agencyById = new Map(
      ((agencyRows ?? []) as { id: string; slug: string; display_name: string | null }[]).map(
        (agency) => [agency.id, agency],
      ),
    );

    const rows = partialRows.map((row) => {
      const agency = agencyById.get(row.tenantId);
      return {
        ...row,
        agencySlug: agency?.slug ?? "",
        agencyName: agency?.display_name ?? null,
      };
    });

    if (!myUserId) return rows;

    const inquiryIds = rows.map((row) => row.id);

    const [readsRes, messagesRes] = await Promise.all([
      supabase
        .from("inquiry_message_reads")
        .select("inquiry_id, tenant_id, last_read_at")
        .eq("user_id", myUserId)
        .eq("thread_type", "group")
        .in("inquiry_id", inquiryIds)
        .in("tenant_id", tenantIds),
      supabase
        .from("inquiry_messages")
        .select("inquiry_id, tenant_id, sender_user_id, created_at")
        .eq("thread_type", "group")
        .is("deleted_at", null)
        .in("inquiry_id", inquiryIds)
        .in("tenant_id", tenantIds),
    ]);

    if (readsRes.error) {
      logServerError("talent.loadInquiriesAllAgencies.reads", readsRes.error);
    }
    if (messagesRes.error) {
      logServerError("talent.loadInquiriesAllAgencies.messages", messagesRes.error);
    }

    const lastReadKey = (inquiryId: string, tenantId: string) => `${tenantId}:${inquiryId}`;
    const lastReadAtByInquiry = new Map<string, string>();
    for (const row of (readsRes.data ?? []) as {
      inquiry_id: string;
      tenant_id: string;
      last_read_at: string | null;
    }[]) {
      if (row.last_read_at) {
        lastReadAtByInquiry.set(lastReadKey(row.inquiry_id, row.tenant_id), row.last_read_at);
      }
    }

    const unreadByInquiry = new Map<string, number>();
    for (const row of (messagesRes.data ?? []) as {
      inquiry_id: string;
      tenant_id: string;
      sender_user_id: string | null;
      created_at: string;
    }[]) {
      if (row.sender_user_id && row.sender_user_id === myUserId) continue;
      const key = lastReadKey(row.inquiry_id, row.tenant_id);
      const lastReadAt = lastReadAtByInquiry.get(key);
      if (lastReadAt && new Date(row.created_at).getTime() <= new Date(lastReadAt).getTime()) {
        continue;
      }
      unreadByInquiry.set(key, (unreadByInquiry.get(key) ?? 0) + 1);
    }

    return rows.map((row) => ({
      ...row,
      unreadCount: unreadByInquiry.get(lastReadKey(row.id, row.tenantId)) ?? 0,
    }));
  } catch (err) {
    logServerError("talent.loadInquiriesAllAgencies", err);
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
  /** Talent's own per-site opt-out for this agency (agency_talent_roster.talent_site_hidden).
   *  true = the talent has chosen not to appear on this agency's public site. */
  talentSiteHidden: boolean;
  /**
   * Exclusivity confirmation lifecycle (migration 20260515195642):
   *   confirmed       — talent accepted or back-compat default
   *   auto_assigned   — admin auto-flagged is_primary; talent prompt pending
   *   declined        — talent declined; is_primary reverted
   *   notice_period   — talent leaving (future use)
   */
  exclusivityStatus: "confirmed" | "auto_assigned" | "declined" | "notice_period";
  /** ISO when admin auto-flagged (null otherwise). Drives the prompt countdown. */
  exclusivityAutoAssignedAt: string | null;
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
        talent_site_hidden,
        exclusivity_status,
        exclusivity_auto_assigned_at,
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
      talent_site_hidden: boolean | null;
      exclusivity_status: "confirmed" | "auto_assigned" | "declined" | "notice_period" | null;
      exclusivity_auto_assigned_at: string | null;
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
        talentSiteHidden: row.talent_site_hidden ?? false,
        exclusivityStatus: row.exclusivity_status ?? "confirmed",
        exclusivityAutoAssignedAt: row.exclusivity_auto_assigned_at,
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
