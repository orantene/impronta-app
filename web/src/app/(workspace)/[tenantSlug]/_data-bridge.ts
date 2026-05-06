import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  loadClientTrustStatesForTenant,
  loadClientTrustState,
  type ClientTrustState,
} from "@/lib/client-trust/evaluator";
import { loadFieldCatalog } from "@/lib/profile-fields-service";
import { loadWorkspaceSubscriptionState, type WorkspaceSubscriptionState } from "@/lib/stripe/workspace-billing";
import { loadTalentSubscriptionState, type TalentSubscriptionState } from "@/lib/stripe/talent-billing";
import { getFeeBasisPoints, feePercent } from "@/lib/bookings/commission";
import { loadTransactionsForTenant } from "@/lib/bookings/transactions";

// Type-only import — `_state.tsx` is "use client"; import type is erased.
import type { TalentProfile } from "@/app/prototypes/admin-shell/_state";

// Site-admin helpers used by loadWebsiteData.
import { listPagesForStaff } from "@/lib/site-admin/server/pages-reads";
import { loadIdentityForStaff } from "@/lib/site-admin/server/reads";

/**
 * _data-bridge.ts — Phase 3 workspace server-side data bridge.
 *
 * Provides tenant-id-explicit data loaders for the canonical workspace
 * routes at `(workspace)/[tenantSlug]/*`. Unlike the existing dashboard
 * loaders (which call `getTenantScope()` internally), these functions
 * accept an explicit `tenantId` so they work correctly on the app host
 * where tenant resolution comes from the URL slug, not the host header
 * or active-tenant cookie.
 *
 * Every function here is server-only, uses the SSR client (user RLS), and
 * never falls back to mock data. Empty/null returns are safe states — the
 * route renders gracefully without them.
 */

// ─── Overview metrics ────────────────────────────────────────────────────────

export type WorkspaceOverviewMetrics = {
  /** Total rostered talent (status != removed). */
  rosterTotal: number;
  /** Rostered talent with workflow_status = 'published' and roster status = 'active'. */
  rosterPublished: number;
  /** Active open inquiries (status IN ('submitted','coordination','offer_pending','approved')). */
  openInquiries: number;
  /** Active workspace members (agency_memberships.status = 'active'). */
  teamMembers: number;
  /** Roster rows with status = 'pending' — talent awaiting agency approval. */
  pendingApprovals: number;
  /** Inquiries waiting for client decision (next_action_by = 'client'). */
  awaitingClientCount: number;
  /** Inquiries in draft state. */
  draftInquiryCount: number;
  /** Days since the oldest coordinator-pending inquiry was created. Null if none. */
  oldestCoordinatorWaitDays: number | null;
  /** Label for the next upcoming confirmed booking (contact_name + event_date). Null if none. */
  nextBookingLabel: string | null;
  /** ISO date of the next upcoming booking. Null if none. */
  nextBookingDate: string | null;
};

export async function loadWorkspaceOverviewMetrics(
  tenantId: string,
): Promise<WorkspaceOverviewMetrics | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    const [rosterRes, openInquiriesRes, teamRes, pendingRes, awaitingClientRes, draftInqRes, oldestCoordRes, nextBookingRes] = await Promise.all([
      // Roster: total + published count
      supabase
        .from("agency_talent_roster")
        .select(
          "status, talent_profiles!talent_profile_id ( workflow_status )",
          { count: "exact", head: false },
        )
        .eq("tenant_id", tenantId)
        .neq("status", "removed"),

      // Open inquiries
      supabase
        .from("inquiries")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("status", ["submitted", "coordination", "offer_pending", "approved"]),

      // Active team members
      supabase
        .from("agency_memberships")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "active"),

      // Pending approvals
      supabase
        .from("agency_talent_roster")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "pending"),

      // Inquiries awaiting client decision
      supabase
        .from("inquiries")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("next_action_by", "client"),

      // Draft inquiries
      supabase
        .from("inquiries")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("status", ["draft"]),

      // Oldest coordinator-pending inquiry (for urgency signal in TodaysFocusCard)
      supabase
        .from("inquiries")
        .select("created_at")
        .eq("tenant_id", tenantId)
        .eq("next_action_by", "coordinator")
        .not("status", "in", `(rejected,expired,cancelled,booked,converted)`)
        .order("created_at", { ascending: true })
        .limit(1),

      // Next upcoming confirmed booking (for quiet-day overview signal)
      supabase
        .from("inquiries")
        .select("contact_name, event_date")
        .eq("tenant_id", tenantId)
        .in("status", ["booked", "converted"])
        .gte("event_date", new Date().toISOString().slice(0, 10))
        .order("event_date", { ascending: true })
        .limit(1),
    ]);

    if (rosterRes.error) {
      logServerError("workspace.loadOverviewMetrics.roster", rosterRes.error);
    }
    if (openInquiriesRes.error) {
      logServerError("workspace.loadOverviewMetrics.inquiries", openInquiriesRes.error);
    }
    if (teamRes.error) {
      logServerError("workspace.loadOverviewMetrics.team", teamRes.error);
    }
    if (pendingRes.error) {
      logServerError("workspace.loadOverviewMetrics.pending", pendingRes.error);
    }

    type RosterRow = {
      status: string;
      talent_profiles: { workflow_status: string | null } | null;
    };

    const rosterRows = ((rosterRes.data ?? []) as unknown as RosterRow[]);
    const rosterTotal = rosterRows.length;
    const rosterPublished = rosterRows.filter(
      (r) => r.status === "active" && r.talent_profiles?.workflow_status === "published",
    ).length;

    const oldestCoordCreatedAt = (oldestCoordRes.data?.[0] as { created_at: string } | undefined)?.created_at ?? null;
    const oldestCoordinatorWaitDays = oldestCoordCreatedAt
      ? Math.floor((Date.now() - new Date(oldestCoordCreatedAt).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    type NextBookingRow = { contact_name: string | null; event_date: string | null };
    const nextBookingRow = (nextBookingRes.data?.[0] as NextBookingRow | undefined) ?? null;
    const nextBookingDate = nextBookingRow?.event_date ?? null;
    const nextBookingLabel = nextBookingRow?.contact_name
      ? (() => {
          if (!nextBookingDate) return nextBookingRow.contact_name;
          const d = new Date(nextBookingDate);
          const month = d.toLocaleDateString("en-GB", { month: "short" });
          const day = d.getDate();
          return `${nextBookingRow.contact_name} · ${month} ${day}`;
        })()
      : null;

    return {
      rosterTotal,
      rosterPublished,
      openInquiries: openInquiriesRes.count ?? 0,
      teamMembers: teamRes.count ?? 0,
      pendingApprovals: pendingRes.count ?? 0,
      awaitingClientCount: awaitingClientRes.count ?? 0,
      draftInquiryCount: draftInqRes.count ?? 0,
      oldestCoordinatorWaitDays,
      nextBookingLabel,
      nextBookingDate,
    };
  } catch (err) {
    logServerError("workspace.loadOverviewMetrics", err);
    return null;
  }
}

// ─── Roster ──────────────────────────────────────────────────────────────────

// Mirror of prototype/_data-bridge.ts RosterRow — kept local to avoid
// coupling the workspace bridge to the prototype tree's internal types.
type RosterRow = {
  status: string;
  agency_visibility: string;
  talent_profile_id: string;
  talent_profiles: {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    workflow_status: string | null;
    height_cm: number | null;
    talent_profile_taxonomy:
      | {
          relationship_type: string | null;
          taxonomy_terms: {
            term_type: string | null;
            slug: string | null;
            name_en: string | null;
          } | null;
        }[]
      | null;
    talent_service_areas:
      | {
          service_kind: string | null;
          locations: { display_name_en: string | null; country_code: string | null } | null;
        }[]
      | null;
  } | null;
};

// ─── Enriched roster item (used by canonical workspace roster page) ───────────

export type WorkspaceRosterItem = {
  id: string;
  name: string;
  state: "published" | "draft" | "invited" | "awaiting-approval" | "claimed";
  primaryType?: string;        // taxonomy term slug
  primaryTypeLabel?: string;   // human-readable label from taxonomy_terms.name_en
  city?: string;
  height?: string;
  thumb?: string;
  /** ISO timestamp when this talent was added to the roster. Used for "Newest" sort. */
  addedAt?: string;
};

function deriveProfileState(row: RosterRow): TalentProfile["state"] {
  if (row.status === "pending") return "awaiting-approval";
  if (row.status === "active" && row.talent_profiles?.workflow_status === "published") {
    return "published";
  }
  if (row.talent_profiles?.workflow_status === "draft") return "draft";
  if (row.talent_profiles?.workflow_status === "invited") return "invited";
  return "draft";
}

function deriveDisplayName(p: NonNullable<RosterRow["talent_profiles"]>): string {
  if (p.display_name?.trim()) return p.display_name.trim();
  const joined = `${p.first_name?.trim() ?? ""} ${p.last_name?.trim() ?? ""}`.trim();
  return joined || "Unnamed talent";
}

function derivePrimaryType(p: NonNullable<RosterRow["talent_profiles"]>): string | undefined {
  return (
    (p.talent_profile_taxonomy ?? [])
      .find((t) => t.relationship_type === "primary_role")
      ?.taxonomy_terms?.slug ?? undefined
  );
}

function derivePrimaryTypeLabel(p: NonNullable<RosterRow["talent_profiles"]>): string | undefined {
  return (
    (p.talent_profile_taxonomy ?? [])
      .find((t) => t.relationship_type === "primary_role")
      ?.taxonomy_terms?.name_en ?? undefined
  ) || undefined;
}

function deriveCity(p: NonNullable<RosterRow["talent_profiles"]>): string | undefined {
  return (
    (p.talent_service_areas ?? [])
      .find((a) => a.service_kind === "home_base")
      ?.locations?.display_name_en ?? undefined
  );
}

function deriveHeightLabel(p: { height_cm: number | null }): string | undefined {
  if (p.height_cm == null) return undefined;
  const totalInches = Math.round(p.height_cm / 2.54);
  return `${Math.floor(totalInches / 12)}'${totalInches % 12}"`;
}

/**
 * Load the workspace roster for the given tenant. Explicit tenantId variant
 * of the prototype bridge — works correctly on the app host where tenant
 * scope comes from the URL slug, not the middleware header.
 *
 * Returns [] on error or empty roster. Never falls back to mock data.
 */
export async function loadWorkspaceRosterForTenant(
  tenantId: string,
): Promise<TalentProfile[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("agency_talent_roster")
      .select(
        `
        status,
        agency_visibility,
        talent_profile_id,
        talent_profiles!talent_profile_id (
          id,
          display_name,
          first_name,
          last_name,
          workflow_status,
          height_cm,
          talent_profile_taxonomy (
            relationship_type,
            taxonomy_terms ( term_type, slug, name_en )
          ),
          talent_service_areas (
            service_kind,
            locations ( display_name_en, country_code )
          )
        )
        `,
      )
      .eq("tenant_id", tenantId)
      .neq("status", "removed")
      .order("created_at", { ascending: true });

    if (error) {
      logServerError("workspace.loadRosterForTenant", error);
      return [];
    }

    const rows = (data ?? []) as unknown as RosterRow[];
    const out: TalentProfile[] = [];
    for (const row of rows) {
      const profile = row.talent_profiles;
      if (!profile) continue;
      out.push({
        id: profile.id,
        name: deriveDisplayName(profile),
        state: deriveProfileState(row),
        height: deriveHeightLabel(profile),
        city: deriveCity(profile),
        primaryType: derivePrimaryType(profile),
      });
    }
    return out;
  } catch (err) {
    logServerError("workspace.loadRosterForTenant", err);
    return [];
  }
}

/**
 * Enriched roster for the canonical workspace roster page.
 * Same query as loadWorkspaceRosterForTenant but returns WorkspaceRosterItem[]
 * with primaryTypeLabel included (from taxonomy_terms.name_en).
 */
export async function loadWorkspaceRosterEnriched(
  tenantId: string,
): Promise<WorkspaceRosterItem[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("agency_talent_roster")
      .select(
        `
        status,
        agency_visibility,
        talent_profile_id,
        created_at,
        talent_profiles!talent_profile_id (
          id,
          display_name,
          first_name,
          last_name,
          workflow_status,
          height_cm,
          talent_profile_taxonomy (
            relationship_type,
            taxonomy_terms ( term_type, slug, name_en )
          ),
          talent_service_areas (
            service_kind,
            locations ( display_name_en, country_code )
          )
        )
        `,
      )
      .eq("tenant_id", tenantId)
      .neq("status", "removed")
      .order("created_at", { ascending: true });

    if (error) {
      logServerError("workspace.loadRosterEnriched", error);
      return [];
    }

    const rows = (data ?? []) as unknown as (RosterRow & { created_at?: string })[];

    // Batch-load card avatars from media_assets for all talent IDs.
    const talentIds = rows
      .map((r) => r.talent_profiles?.id)
      .filter(Boolean) as string[];

    const thumbByTalentId = new Map<string, string>();
    if (talentIds.length > 0) {
      const admin = createServiceRoleClient();
      const mediaClient = admin ?? supabase;
      const { data: mediaRows } = await mediaClient
        .from("media_assets")
        .select("owner_talent_profile_id, storage_path")
        .in("owner_talent_profile_id", talentIds)
        .eq("variant_kind", "card")
        .is("deleted_at", null);

      const BUCKET = "media-public";
      for (const m of (mediaRows ?? []) as {
        owner_talent_profile_id: string;
        storage_path: string;
      }[]) {
        if (!thumbByTalentId.has(m.owner_talent_profile_id)) {
          const { data: urlData } = mediaClient.storage
            .from(BUCKET)
            .getPublicUrl(m.storage_path);
          thumbByTalentId.set(m.owner_talent_profile_id, urlData.publicUrl);
        }
      }
    }

    const out: WorkspaceRosterItem[] = [];
    for (const row of rows) {
      const profile = row.talent_profiles;
      if (!profile) continue;
      out.push({
        id: profile.id,
        name: deriveDisplayName(profile),
        state: deriveProfileState(row),
        height: deriveHeightLabel(profile),
        city: deriveCity(profile),
        primaryType: derivePrimaryType(profile),
        primaryTypeLabel: derivePrimaryTypeLabel(profile),
        thumb: thumbByTalentId.get(profile.id),
        addedAt: row.created_at,
      });
    }
    return out;
  } catch (err) {
    logServerError("workspace.loadRosterEnriched", err);
    return [];
  }
}

// ─── Work / Inquiries ────────────────────────────────────────────────────────

/** Terminal statuses excluded from the open Work queue. */
const INQUIRY_CLOSED_STATUSES = [
  "booked",
  "rejected",
  "expired",
  "closed_lost",
  "archived",
  "converted", // legacy alias for booked
  "closed",    // legacy alias for closed_lost
] as const;

export type WorkspaceInquiryRow = {
  id: string;
  status: string;
  contact_name: string;
  company: string | null;
  event_date: string | null;
  event_location: string | null;
  quantity: number | null;
  created_at: string;
  /** next_action_by value: 'admin' | 'coordinator' | 'client' | 'talent' | null */
  next_action_by: string | null;
  /** Inquiry source: 'direct' | 'hub' | 'manual' | 'marketplace' | null */
  source: string | null;
};

/**
 * Load open inquiries for the Work page. Returns inquiries excluding terminal
 * statuses, ordered by recency (newest first). Capped at 200 rows — the Work
 * page is a live queue view, not a full archive.
 *
 * Returns [] on error or empty queue. Never falls back to mock data.
 */
export async function loadWorkspaceInquiries(
  tenantId: string,
): Promise<WorkspaceInquiryRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("inquiries")
      .select(
        "id, status, contact_name, company, event_date, event_location, quantity, created_at, next_action_by, source",
      )
      .eq("tenant_id", tenantId)
      .not("status", "in", `(${INQUIRY_CLOSED_STATUSES.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      logServerError("workspace.loadInquiries", error);
      return [];
    }

    return (data ?? []) as WorkspaceInquiryRow[];
  } catch (err) {
    logServerError("workspace.loadInquiries", err);
    return [];
  }
}

// ─── Clients ─────────────────────────────────────────────────────────────────

export type WorkspaceClientRow = {
  /** user_id from auth */
  id: string;
  /** Display name from profiles table */
  name: string;
  /** Company / business name from client_profiles */
  company: string | null;
  /** Account status from profiles (registered / active / suspended) */
  accountStatus: string | null;
  /** Total inquiries submitted to this tenant */
  inquiryCount: number;
  /** Confirmed bookings (status in booked/converted) in the current calendar year */
  bookingsYTD: number;
  /** Phase 3.7 — client trust tier for this tenant. null = no trust record (equivalent to basic). */
  trustLevel: "basic" | "verified" | "silver" | "gold" | null;
  /** Most recent inquiry ID for deep-linking to messages. */
  latestInquiryId: string | null;
};

/**
 * Load the client list for a tenant. Scoped via inquiries.client_user_id —
 * only returns clients who have placed at least one inquiry with this tenant.
 * Ordered by most-recent-inquiry descending.
 *
 * Returns [] on error. Never falls back to mock data.
 */
export async function loadWorkspaceClients(
  tenantId: string,
): Promise<WorkspaceClientRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    // Step 1: Get all inquiries for this tenant — count all + booked YTD per client.
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const { data: inquiryAggRows, error: inquiryErr } = await supabase
      .from("inquiries")
      .select("id, client_user_id, created_at, status")
      .eq("tenant_id", tenantId)
      .not("client_user_id", "is", null)
      .order("created_at", { ascending: false });

    if (inquiryErr) {
      logServerError("workspace.loadClients.inquiries", inquiryErr);
      return [];
    }

    // Aggregate: total inquiries, bookings YTD, latest activity per client
    const clientStats = new Map<string, { count: number; bookingsYTD: number; latestAt: string; latestInquiryId: string }>();
    for (const row of inquiryAggRows ?? []) {
      const uid = (row as { client_user_id: string | null }).client_user_id;
      if (!uid) continue;
      const inquiryId = (row as { id: string }).id;
      const createdAt = (row as { created_at: string }).created_at;
      const status = (row as { status: string | null }).status;
      const isBookedThisYear =
        (status === "booked" || status === "converted") &&
        createdAt >= yearStart;
      const existing = clientStats.get(uid);
      if (!existing) {
        clientStats.set(uid, { count: 1, bookingsYTD: isBookedThisYear ? 1 : 0, latestAt: createdAt, latestInquiryId: inquiryId });
      } else {
        clientStats.set(uid, {
          count: existing.count + 1,
          bookingsYTD: existing.bookingsYTD + (isBookedThisYear ? 1 : 0),
          latestAt: existing.latestAt,
          latestInquiryId: existing.latestInquiryId, // keep first = most recent (rows ordered desc)
        });
      }
    }

    const userIds = [...clientStats.keys()];
    if (userIds.length === 0) return [];

    // Step 2: Fetch client_profiles + profiles + trust states in parallel.
    const [profileResult, trustMap] = await Promise.all([
      supabase
        .from("client_profiles")
        .select("user_id, company_name, profiles!inner(display_name, account_status)")
        .in("user_id", userIds),
      loadClientTrustStatesForTenant(userIds, tenantId, supabase),
    ]);

    const { data: profileRows, error: profileErr } = profileResult;

    if (profileErr) {
      logServerError("workspace.loadClients.profiles", profileErr);
      return [];
    }

    type ClientProfileRow = {
      user_id: string;
      company_name: string | null;
      profiles:
        | { display_name: string | null; account_status: string | null }
        | { display_name: string | null; account_status: string | null }[]
        | null;
    };

    const profileByUserId = new Map<string, ClientProfileRow>();
    for (const row of (profileRows ?? []) as unknown as ClientProfileRow[]) {
      profileByUserId.set(row.user_id, row);
    }

    // Step 3: Assemble output, sorted by most-recent inquiry desc
    const out: WorkspaceClientRow[] = [];
    const sorted = [...clientStats.entries()].sort(
      ([, a], [, b]) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime(),
    );

    for (const [uid, stats] of sorted) {
      const row = profileByUserId.get(uid);
      const profileJoin = row?.profiles;
      const profile = Array.isArray(profileJoin) ? profileJoin[0] : profileJoin;
      const name = profile?.display_name?.trim() || uid.slice(0, 8);
      out.push({
        id: uid,
        name,
        company: row?.company_name ?? null,
        accountStatus: profile?.account_status ?? null,
        inquiryCount: stats.count,
        bookingsYTD: stats.bookingsYTD,
        // Phase 3.7 — trust level from client_trust_state; null if no record yet.
        trustLevel: trustMap.get(uid) ?? null,
        latestInquiryId: stats.latestInquiryId,
      });
    }

    return out;
  } catch (err) {
    logServerError("workspace.loadClients", err);
    return [];
  }
}

// ─── Bookings ─────────────────────────────────────────────────────────────────

export type WorkspaceBookingRow = {
  id: string;
  contact_name: string;
  company: string | null;
  event_date: string | null;
  event_location: string | null;
  quantity: number | null;
  created_at: string;
  /** Gross booking revenue in cents (from agency_bookings.total_client_revenue). Null if not set. */
  grossRevenueCents: number | null;
  /** Booking currency from agency_bookings.currency_code. */
  currencyCode: string | null;
  /** Active transaction status for this booking (null = no transaction yet). */
  transactionStatus: string | null;
  /** Snapshotted transaction amounts when an active transaction exists. */
  transactionGrossCents: number | null;
  transactionFeeBasisPoints: number | null;
  transactionFeeCents: number | null;
  transactionNetCents: number | null;
  transactionCurrency: string | null;
};

/**
 * Load confirmed bookings for a tenant. Booked = status IN ('booked',
 * 'converted'). Ordered by event_date ascending so the next upcoming job
 * is first; null dates sort last.
 *
 * Returns [] on error. Never falls back to mock data.
 */
export async function loadWorkspaceBookings(
  tenantId: string,
): Promise<WorkspaceBookingRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    // Inquiries in booked/converted state + their linked agency_booking revenue.
    // Active transaction snapshots are loaded separately so the list always
    // reflects the canonical transaction amounts, not a recomputed preview.
    const { data, error } = await supabase
      .from("inquiries")
      .select(
        `id, contact_name, company, event_date, event_location, quantity, created_at,
         agency_bookings!agency_bookings_source_inquiry_id_fkey(id, total_client_revenue, currency_code)`,
      )
      .eq("tenant_id", tenantId)
      .in("status", ["booked", "converted"])
      .order("event_date", { ascending: true, nullsFirst: false })
      .limit(200);

    if (error) {
      // Fallback: if the join fails (e.g. fkey names differ), load plain rows
      logServerError("workspace.loadBookings", error);
      const { data: plain } = await supabase
        .from("inquiries")
        .select("id, contact_name, company, event_date, event_location, quantity, created_at")
        .eq("tenant_id", tenantId)
        .in("status", ["booked", "converted"])
        .order("event_date", { ascending: true, nullsFirst: false })
        .limit(200);
      return (plain ?? []).map((r: Record<string, unknown>) => ({
        ...(r as Omit<
          WorkspaceBookingRow,
          | "grossRevenueCents"
          | "currencyCode"
          | "transactionStatus"
          | "transactionGrossCents"
          | "transactionFeeBasisPoints"
          | "transactionFeeCents"
          | "transactionNetCents"
          | "transactionCurrency"
        >),
        grossRevenueCents: null,
        currencyCode: null,
        transactionStatus: null,
        transactionGrossCents: null,
        transactionFeeBasisPoints: null,
        transactionFeeCents: null,
        transactionNetCents: null,
        transactionCurrency: null,
      }));
    }

    const transactionsByBookingId = await loadTransactionsForTenant(tenantId, supabase);

    return (data ?? []).map((r: Record<string, unknown>) => {
      // total_client_revenue is NUMERIC in PG — convert to cents (×100)
      const bookingJoin = r["agency_bookings"] as
        | { id?: string; total_client_revenue?: number | string | null; currency_code?: string | null }
        | {
            id?: string;
            total_client_revenue?: number | string | null;
            currency_code?: string | null;
          }[]
        | null
        | undefined;
      const booking =
        Array.isArray(bookingJoin) ? bookingJoin[0] ?? null : bookingJoin ?? null;
      const rawRevenue = booking?.total_client_revenue;
      const grossRevenueCents = rawRevenue != null ? Math.round(Number(rawRevenue) * 100) : null;
      const tx = booking?.id ? transactionsByBookingId.get(booking.id) ?? null : null;

      return {
        id: r.id as string,
        contact_name: r.contact_name as string,
        company: r.company as string | null,
        event_date: r.event_date as string | null,
        event_location: r.event_location as string | null,
        quantity: r.quantity as number | null,
        created_at: r.created_at as string,
        grossRevenueCents,
        currencyCode: booking?.currency_code ?? null,
        transactionStatus: tx?.status ?? null,
        transactionGrossCents: tx?.grossAmountCents ?? null,
        transactionFeeBasisPoints: tx?.platformFeeBasisPoints ?? null,
        transactionFeeCents: tx?.platformFeeCents ?? null,
        transactionNetCents: tx?.netAmountCents ?? null,
        transactionCurrency: tx?.currency ?? null,
      };
    });
  } catch (err) {
    logServerError("workspace.loadBookings", err);
    return [];
  }
}

// ─── Agency summary ───────────────────────────────────────────────────────────

/** Valid workspace plan tiers — mirrors WorkspacePlan from admin-workspace-summary. */
export type WorkspacePlan = "free" | "studio" | "agency" | "network";

const VALID_WORKSPACE_PLANS = new Set<string>(["free", "studio", "agency", "network"]);

function coercePlan(raw: unknown): WorkspacePlan {
  if (typeof raw === "string" && VALID_WORKSPACE_PLANS.has(raw)) {
    return raw as WorkspacePlan;
  }
  return "free";
}

export type WorkspaceAgencySummary = {
  displayName: string;
  slug: string;
  plan: WorkspacePlan;
  /** Null = unlimited (Network plan). */
  talentLimit: number | null;
  talentCount: number;
  contactEmail: string | null;
  contactPhone: string | null;
  addressCity: string | null;
  addressCountry: string | null;
  /** Preferred Stripe presentment currency (lowercase ISO 4217). Null = Adaptive Pricing auto-detect. */
  preferredCurrency: string | null;
};

/**
 * Tenant-id-explicit workspace summary. Used by the Account page on the app
 * host where tenant scope comes from the URL slug, not the active-tenant
 * cookie.
 *
 * Returns null on error or missing data.
 */
export async function loadWorkspaceAgencySummary(
  tenantId: string,
): Promise<WorkspaceAgencySummary | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    const [agencyRes, identityRes, rosterCountRes] = await Promise.all([
      supabase
        .from("agencies")
        .select("slug, display_name, plan_tier, talent_seat_limit, preferred_currency")
        .eq("id", tenantId)
        .maybeSingle(),
      supabase
        .from("agency_business_identity")
        .select("contact_email, contact_phone, address_city, address_country")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      supabase
        .from("agency_talent_roster")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .neq("status", "removed"),
    ]);

    if (agencyRes.error) {
      logServerError("workspace.loadAgencySummary.agency", agencyRes.error);
    }

    if (!agencyRes.data) return null;

    const row = agencyRes.data as {
      slug: string;
      display_name: string;
      plan_tier: string | null;
      talent_seat_limit: number | null;
      preferred_currency: string | null;
    };
    const identity = identityRes.data as {
      contact_email: string | null;
      contact_phone: string | null;
      address_city: string | null;
      address_country: string | null;
    } | null;

    return {
      displayName: row.display_name,
      slug: row.slug,
      plan: coercePlan(row.plan_tier),
      talentLimit: row.talent_seat_limit,
      talentCount: rosterCountRes.count ?? 0,
      contactEmail: identity?.contact_email ?? null,
      contactPhone: identity?.contact_phone ?? null,
      addressCity: identity?.address_city ?? null,
      addressCountry: identity?.address_country ?? null,
      preferredCurrency: row.preferred_currency ?? null,
    };
  } catch (err) {
    logServerError("workspace.loadAgencySummary", err);
    return null;
  }
}

export type WorkspaceDomainSummary = {
  primaryHost: string | null;
  primaryHostKind: "subdomain" | "custom" | null;
  primaryHostStatus:
    | "pending"
    | "dns_verification_sent"
    | "verified"
    | "ssl_provisioned"
    | "active"
    | "failed"
    | "suspended"
    | null;
  subdomainHost: string | null;
  customDomainHost: string | null;
  customDomainStatus:
    | "pending"
    | "dns_verification_sent"
    | "verified"
    | "ssl_provisioned"
    | "active"
    | "failed"
    | "suspended"
    | null;
  customDomainVerifiedAt: string | null;
  verificationToken: string | null;
  failureReason: string | null;
  customDomains: {
    hostname: string;
    isPrimary: boolean;
    status:
      | "pending"
      | "dns_verification_sent"
      | "verified"
      | "ssl_provisioned"
      | "active"
      | "failed"
      | "suspended";
    verificationToken: string | null;
    verifiedAt: string | null;
    failureReason: string | null;
  }[];
  subdomains: {
    hostname: string;
    isPrimary: boolean;
    status:
      | "pending"
      | "dns_verification_sent"
      | "verified"
      | "ssl_provisioned"
      | "active"
      | "failed"
      | "suspended";
  }[];
};

/**
 * Load current branded host + custom-domain state for workspace settings.
 * Returns null hosts when the domain registry is unavailable or no rows exist.
 */
export async function loadWorkspaceDomainSummary(
  tenantId: string,
): Promise<WorkspaceDomainSummary> {
  const empty: WorkspaceDomainSummary = {
    primaryHost: null,
    primaryHostKind: null,
    primaryHostStatus: null,
    subdomainHost: null,
    customDomainHost: null,
    customDomainStatus: null,
    customDomainVerifiedAt: null,
    verificationToken: null,
    failureReason: null,
    customDomains: [],
    subdomains: [],
  };

  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return empty;

    const { data, error } = await supabase
      .from("agency_domains")
      .select("hostname, kind, is_primary, status, verification_token, verified_at, failure_reason, updated_at")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false });

    if (error) {
      logServerError("workspace.loadDomainSummary", error);
      return empty;
    }

    const rows = (data ?? []) as {
      hostname: string;
      kind: "subdomain" | "custom";
      is_primary: boolean;
      status:
        | "pending"
        | "dns_verification_sent"
        | "verified"
        | "ssl_provisioned"
        | "active"
        | "failed"
        | "suspended";
      verification_token: string | null;
      verified_at: string | null;
      failure_reason: string | null;
      updated_at: string;
    }[];

    const subdomains = rows.filter((row) => row.kind === "subdomain");
    const customs = rows.filter((row) => row.kind === "custom");

    const preferredSubdomain =
      subdomains.find((row) => row.is_primary)
      ?? subdomains.find((row) => row.hostname.endsWith(".tulala.digital"))
      ?? subdomains.find((row) => row.hostname.endsWith(".lvh.me"))
      ?? subdomains.find((row) => row.hostname.endsWith(".studiobooking.io"))
      ?? subdomains[0]
      ?? null;

    const custom =
      customs.find((row) => row.is_primary)
      ?? customs[0]
      ?? null;
    const primary =
      rows.find((row) => row.is_primary)
      ?? custom
      ?? preferredSubdomain
      ?? null;

    return {
      primaryHost: primary?.hostname ?? null,
      primaryHostKind: primary?.kind ?? null,
      primaryHostStatus: primary?.status ?? null,
      subdomainHost: preferredSubdomain?.hostname ?? null,
      customDomainHost: custom?.hostname ?? null,
      customDomainStatus: custom?.status ?? null,
      customDomainVerifiedAt: custom?.verified_at ?? null,
      verificationToken: custom?.verification_token ?? null,
      failureReason: custom?.failure_reason ?? null,
      customDomains: customs.map((row) => ({
        hostname: row.hostname,
        isPrimary: row.is_primary,
        status: row.status,
        verificationToken: row.verification_token,
        verifiedAt: row.verified_at,
        failureReason: row.failure_reason,
      })),
      subdomains: subdomains.map((row) => ({
        hostname: row.hostname,
        isPrimary: row.is_primary,
        status: row.status,
      })),
    };
  } catch (err) {
    logServerError("workspace.loadDomainSummary", err);
    return empty;
  }
}

// ─── Billing (Stripe subscription state) ─────────────────────────────────────

export type { WorkspaceSubscriptionState };

/**
 * Load the current Stripe subscription state for a tenant.
 * Returns null when the tenant has no active subscription (free tier or
 * legacy plan). Uses the SSR client so RLS is applied (staff read only).
 */
export async function loadWorkspaceBillingState(
  tenantId: string,
): Promise<WorkspaceSubscriptionState | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;
    return loadWorkspaceSubscriptionState(tenantId, supabase);
  } catch (err) {
    logServerError("workspace.loadBillingState", err);
    return null;
  }
}

// ─── Payout accounts (Phase 8.4) ────────────────────────────────────────────

export type PayoutAccountSummary = {
  id: string;
  ownerType: "agency" | "profile" | "talent";
  ownerId: string;
  displayName: string;
  provider: string;
  status: "pending_verification" | "connected" | "restricted" | "disconnected" | "failed";
  connectedAt: string | null;
  lastVerifiedAt: string | null;
};

export type WorkspacePayoutSnapshot = {
  workspaceAccount: PayoutAccountSummary | null;
  selfStaffAccount: PayoutAccountSummary | null;
  connectedCount: number;
};

/**
 * Returns workspace payout account + current staff profile payout account.
 * Safe fallback when payout tables are not yet applied: returns null accounts.
 */
export async function loadWorkspacePayoutSnapshot(
  tenantId: string,
  profileId: string,
): Promise<WorkspacePayoutSnapshot> {
  const empty: WorkspacePayoutSnapshot = {
    workspaceAccount: null,
    selfStaffAccount: null,
    connectedCount: 0,
  };

  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return empty;

    const { data, error } = await supabase
      .from("payout_accounts")
      .select("id, owner_type, owner_id, display_name, provider, status, connected_at, last_verified_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (error) {
      logServerError("workspace.loadPayoutSnapshot", error);
      return empty;
    }

    const rows = (data ?? []) as {
      id: string;
      owner_type: "agency" | "profile" | "talent";
      owner_id: string;
      display_name: string;
      provider: string;
      status: "pending_verification" | "connected" | "restricted" | "disconnected" | "failed";
      connected_at: string | null;
      last_verified_at: string | null;
    }[];

    const toSummary = (row: (typeof rows)[number]): PayoutAccountSummary => ({
      id: row.id,
      ownerType: row.owner_type,
      ownerId: row.owner_id,
      displayName: row.display_name,
      provider: row.provider,
      status: row.status,
      connectedAt: row.connected_at,
      lastVerifiedAt: row.last_verified_at,
    });

    const workspaceAccountRaw = rows.find(
      (row) => row.owner_type === "agency" && row.owner_id === tenantId,
    );
    const selfStaffAccountRaw = rows.find(
      (row) => row.owner_type === "profile" && row.owner_id === profileId,
    );

    return {
      workspaceAccount: workspaceAccountRaw ? toSummary(workspaceAccountRaw) : null,
      selfStaffAccount: selfStaffAccountRaw ? toSummary(selfStaffAccountRaw) : null,
      connectedCount: rows.filter((row) => row.status === "connected").length,
    };
  } catch (err) {
    logServerError("workspace.loadPayoutSnapshot", err);
    return empty;
  }
}

/**
 * Talent-owned payout account in one workspace.
 * Returns null when no account exists or payout tables are not applied yet.
 */
export async function loadTalentPayoutAccountForTenant(
  tenantId: string,
  talentProfileId: string,
): Promise<PayoutAccountSummary | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("payout_accounts")
      .select("id, owner_type, owner_id, display_name, provider, status, connected_at, last_verified_at")
      .eq("tenant_id", tenantId)
      .eq("owner_type", "talent")
      .eq("owner_id", talentProfileId)
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (error || !data) {
      if (error) logServerError("workspace.loadTalentPayoutAccount", error);
      return null;
    }

    const row = data as {
      id: string;
      owner_type: "agency" | "profile" | "talent";
      owner_id: string;
      display_name: string;
      provider: string;
      status: "pending_verification" | "connected" | "restricted" | "disconnected" | "failed";
      connected_at: string | null;
      last_verified_at: string | null;
    };

    return {
      id: row.id,
      ownerType: row.owner_type,
      ownerId: row.owner_id,
      displayName: row.display_name,
      provider: row.provider,
      status: row.status,
      connectedAt: row.connected_at,
      lastVerifiedAt: row.last_verified_at,
    };
  } catch (err) {
    logServerError("workspace.loadTalentPayoutAccount", err);
    return null;
  }
}

// ─── Talent billing ───────────────────────────────────────────────────────────

export type { TalentSubscriptionState };

/**
 * Load the Stripe subscription state for a talent profile.
 * Returns null when the talent is on Basic (free — no subscription row).
 * Also reads talent_plan_key directly from talent_profiles for the current tier.
 */
export async function loadTalentBillingState(
  talentProfileId: string,
): Promise<{ planKey: string; subscription: TalentSubscriptionState | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { planKey: "talent_basic", subscription: null };

    const [profileRes, subscriptionState] = await Promise.all([
      supabase
        .from("talent_profiles")
        .select("talent_plan_key")
        .eq("id", talentProfileId)
        .maybeSingle(),
      loadTalentSubscriptionState(talentProfileId, supabase),
    ]);

    const planKey =
      (profileRes.data as { talent_plan_key: string } | null)?.talent_plan_key
        ?? "talent_basic";

    return { planKey, subscription: subscriptionState };
  } catch (err) {
    logServerError("workspace.loadTalentBillingState", err);
    return { planKey: "talent_basic", subscription: null };
  }
}

// ─── Team members ─────────────────────────────────────────────────────────────

export type WorkspaceTeamMember = {
  /** profile_id from agency_memberships */
  id: string;
  name: string;
  /** Membership role: viewer | editor | coordinator | admin | owner */
  role: string;
  /** Membership status: active | pending_acceptance */
  status: string;
  /** ISO timestamp when the membership was accepted or created */
  joinedAt: string | null;
};

/**
 * Load active + pending team members for a workspace.
 * Ordered by role rank desc (owner first), then by join date asc.
 *
 * Returns [] on error. Never falls back to mock data.
 */
export async function loadWorkspaceTeamMembers(
  tenantId: string,
): Promise<WorkspaceTeamMember[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("agency_memberships")
      .select(
        "profile_id, role, status, accepted_at, created_at, profiles:profile_id(display_name)",
      )
      .eq("tenant_id", tenantId)
      .in("status", ["active", "pending_acceptance"])
      .order("created_at", { ascending: true });

    if (error) {
      logServerError("workspace.loadTeamMembers", error);
      return [];
    }

    type MemberRow = {
      profile_id: string;
      role: string;
      status: string;
      accepted_at: string | null;
      created_at: string;
      profiles:
        | { display_name: string | null }
        | { display_name: string | null }[]
        | null;
    };

    const ROLE_RANK: Record<string, number> = {
      owner: 4,
      admin: 3,
      coordinator: 2,
      editor: 1,
      viewer: 0,
    };

    const rows = (data ?? []) as unknown as MemberRow[];
    const out: WorkspaceTeamMember[] = rows.map((row) => {
      const profileJoin = row.profiles;
      const profile = Array.isArray(profileJoin) ? profileJoin[0] : profileJoin;
      const name = profile?.display_name?.trim() || row.profile_id.slice(0, 8);
      return {
        id: row.profile_id,
        name,
        role: row.role,
        status: row.status,
        joinedAt: row.accepted_at ?? row.created_at,
      };
    });

    // Sort: higher rank first, then by joinedAt asc
    out.sort((a, b) => {
      const ra = ROLE_RANK[a.role] ?? -1;
      const rb = ROLE_RANK[b.role] ?? -1;
      if (ra !== rb) return rb - ra;
      return new Date(a.joinedAt ?? 0).getTime() - new Date(b.joinedAt ?? 0).getTime();
    });

    return out;
  } catch (err) {
    logServerError("workspace.loadTeamMembers", err);
    return [];
  }
}

// ─── Messages ─────────────────────────────────────────────────────────────────
//
// The inquiry_messages table uses:
//   inquiry_id  uuid
//   thread_type inquiry_thread_type  ('private' = client thread, 'group' = talent thread)
//   sender_user_id uuid
//   body text
//   created_at timestamptz
//   tenant_id uuid
//
// inquiry_message_reads tracks (inquiry_id, thread_type, user_id, last_read_at).

export type ThreadType = "private" | "group";

export type WorkspaceMessage = {
  id: string;
  sender_user_id: string;
  sender_name: string;
  body: string;
  created_at: string;
  is_mine: boolean;
};

export type WorkspaceInquiryForMessages = {
  id: string;
  status: string;
  contact_name: string;
  company: string | null;
  event_date: string | null;
  event_location: string | null;
  quantity: number | null;
  created_at: string;
  next_action_by: string | null;
  /** Total unread messages across both threads for the current user. */
  unread_count: number;
};

/**
 * Load all non-terminal inquiries for the Messages inbox.
 * Includes unread counts from inquiry_message_reads for the current user.
 */
export async function loadInquiriesForMessages(
  tenantId: string,
): Promise<WorkspaceInquiryForMessages[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    // Get current user id for unread counting
    const { data: { user } } = await supabase.auth.getUser();
    const myUserId = user?.id ?? null;

    const inquiryRes = await supabase
      .from("inquiries")
      .select("id, status, contact_name, company, event_date, event_location, quantity, created_at, next_action_by")
      .eq("tenant_id", tenantId)
      .not("status", "in", `(${INQUIRY_CLOSED_STATUSES.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(200);

    if (inquiryRes.error) {
      logServerError("workspace.loadInquiriesForMessages.inquiries", inquiryRes.error);
      return [];
    }

    type InquiryRow = {
      id: string;
      status: string;
      contact_name: string;
      company: string | null;
      event_date: string | null;
      event_location: string | null;
      quantity: number | null;
      created_at: string;
      next_action_by: string | null;
    };
    const inquiryRows = (inquiryRes.data ?? []) as InquiryRow[];
    const inquiryIds = inquiryRows.map((row) => row.id);

    // True unread count:
    //  messages from others where created_at > last_read_at watermark
    //  (or all messages if no watermark exists yet).
    const unreadByInquiry = new Map<string, number>();
    if (myUserId && inquiryIds.length > 0) {
      const [readsRes, messagesRes] = await Promise.all([
        supabase
          .from("inquiry_message_reads")
          .select("inquiry_id, thread_type, last_read_at")
          .eq("tenant_id", tenantId)
          .eq("user_id", myUserId)
          .in("inquiry_id", inquiryIds),
        supabase
          .from("inquiry_messages")
          .select("inquiry_id, thread_type, sender_user_id, created_at")
          .eq("tenant_id", tenantId)
          .is("deleted_at", null)
          .in("inquiry_id", inquiryIds),
      ]);

      if (readsRes.error) {
        logServerError("workspace.loadInquiriesForMessages.reads", readsRes.error);
      }
      if (messagesRes.error) {
        logServerError("workspace.loadInquiriesForMessages.messages", messagesRes.error);
      }

      const readAtByInquiryThread = new Map<string, string>();
      for (const row of (readsRes.data ?? []) as {
        inquiry_id: string;
        thread_type: string;
        last_read_at: string | null;
      }[]) {
        const key = `${row.inquiry_id}:${row.thread_type}`;
        if (row.last_read_at) {
          readAtByInquiryThread.set(key, row.last_read_at);
        }
      }

      for (const row of (messagesRes.data ?? []) as {
        inquiry_id: string;
        thread_type: string;
        sender_user_id: string | null;
        created_at: string;
      }[]) {
        if (row.sender_user_id && row.sender_user_id === myUserId) continue;
        const key = `${row.inquiry_id}:${row.thread_type}`;
        const lastReadAt = readAtByInquiryThread.get(key);
        if (lastReadAt && new Date(row.created_at).getTime() <= new Date(lastReadAt).getTime()) {
          continue;
        }
        unreadByInquiry.set(
          row.inquiry_id,
          (unreadByInquiry.get(row.inquiry_id) ?? 0) + 1,
        );
      }
    }

    return inquiryRows.map((row) => {
      return {
        id: row.id,
        status: row.status,
        contact_name: row.contact_name,
        company: row.company,
        event_date: row.event_date,
        event_location: row.event_location,
        quantity: row.quantity,
        created_at: row.created_at,
        next_action_by: row.next_action_by,
        unread_count: unreadByInquiry.get(row.id) ?? 0,
      };
    });
  } catch (err) {
    logServerError("workspace.loadInquiriesForMessages", err);
    return [];
  }
}

/**
 * Count total unread messages across all open inquiries for the current user.
 * Used by the workspace nav to show a badge on the Messages tab.
 * Returns 0 on any error (badge is non-critical).
 */
export async function loadTotalUnreadMessages(tenantId: string): Promise<number> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return 0;

    const { data: { user } } = await supabase.auth.getUser();
    const myUserId = user?.id ?? null;
    if (!myUserId) return 0;

    // Only count open inquiries
    const { data: inquiryRows, error: inquiryErr } = await supabase
      .from("inquiries")
      .select("id")
      .eq("tenant_id", tenantId)
      .not("status", "in", `(${INQUIRY_CLOSED_STATUSES.join(",")})`);

    if (inquiryErr || !inquiryRows?.length) return 0;
    const inquiryIds = inquiryRows.map((r: { id: string }) => r.id);

    const [readsRes, messagesRes] = await Promise.all([
      supabase
        .from("inquiry_message_reads")
        .select("inquiry_id, thread_type, last_read_at")
        .eq("tenant_id", tenantId)
        .eq("user_id", myUserId)
        .in("inquiry_id", inquiryIds),
      supabase
        .from("inquiry_messages")
        .select("inquiry_id, thread_type, sender_user_id, created_at")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .neq("sender_user_id", myUserId)
        .in("inquiry_id", inquiryIds),
    ]);

    if (messagesRes.error) {
      logServerError("workspace.loadTotalUnreadMessages", messagesRes.error);
      return 0;
    }

    // Build read watermark map: "inquiryId:threadType" → last_read_at
    const readAtMap = new Map<string, string>();
    for (const r of (readsRes.data ?? []) as {
      inquiry_id: string; thread_type: string; last_read_at: string | null;
    }[]) {
      if (r.last_read_at) readAtMap.set(`${r.inquiry_id}:${r.thread_type}`, r.last_read_at);
    }

    let total = 0;
    for (const m of (messagesRes.data ?? []) as {
      inquiry_id: string; thread_type: string; created_at: string;
    }[]) {
      const key = `${m.inquiry_id}:${m.thread_type}`;
      const lastRead = readAtMap.get(key);
      if (!lastRead || new Date(m.created_at).getTime() > new Date(lastRead).getTime()) {
        total += 1;
      }
    }
    return total;
  } catch (err) {
    logServerError("workspace.loadTotalUnreadMessages", err);
    return 0;
  }
}

/**
 * Load messages for a specific inquiry thread (private or group).
 * Returns messages with sender display_name resolved.
 */
export async function loadInquiryMessages(
  tenantId: string,
  inquiryId: string,
  threadType: ThreadType,
): Promise<WorkspaceMessage[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data: { user } } = await supabase.auth.getUser();
    const myUserId = user?.id ?? null;

    const { data, error } = await supabase
      .from("inquiry_messages")
      .select("id, sender_user_id, body, created_at, profiles:sender_user_id(display_name)")
      .eq("inquiry_id", inquiryId)
      .eq("thread_type", threadType)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      logServerError("workspace.loadInquiryMessages", error);
      return [];
    }

    type MsgRow = {
      id: string;
      sender_user_id: string;
      body: string;
      created_at: string;
      profiles: { display_name: string | null } | { display_name: string | null }[] | null;
    };

    return ((data ?? []) as unknown as MsgRow[]).map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id: row.id,
        sender_user_id: row.sender_user_id,
        sender_name: profile?.display_name?.trim() || row.sender_user_id.slice(0, 8),
        body: row.body,
        created_at: row.created_at,
        is_mine: row.sender_user_id === myUserId,
      };
    });
  } catch (err) {
    logServerError("workspace.loadInquiryMessages", err);
    return [];
  }
}

// ─── Calendar events ──────────────────────────────────────────────────────────

export type CalendarEvent = {
  id: string;
  contact_name: string;
  company: string | null;
  event_date: string; // ISO date string "YYYY-MM-DD"
  status: string;
};

/**
 * Load all inquiries with a non-null event_date for the calendar page.
 * Returns events sorted by event_date ascending so month navigation is fast
 * client-side (no re-fetch on month change).
 */
export async function loadCalendarEvents(
  tenantId: string,
): Promise<CalendarEvent[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("inquiries")
      .select("id, contact_name, company, event_date, status")
      .eq("tenant_id", tenantId)
      .not("event_date", "is", null)
      .order("event_date", { ascending: true })
      .limit(500);

    if (error) {
      logServerError("workspace.loadCalendarEvents", error);
      return [];
    }

    return (data ?? []).map((row) => ({
      id: (row as { id: string }).id,
      contact_name: (row as { contact_name: string }).contact_name,
      company: (row as { company: string | null }).company,
      event_date: (row as { event_date: string }).event_date,
      status: (row as { status: string }).status,
    }));
  } catch (err) {
    logServerError("workspace.loadCalendarEvents", err);
    return [];
  }
}

// ─── Website data ────────────────────────────────────────────────────────────

export type WebsitePageItem = {
  id: string;
  slug: string;
  title: string;
  status: string; // 'published' | 'draft' | 'scheduled'
  updatedAt: string | null;
  updatedBy: string | null;
};

export type WebsitePostItem = {
  id: string;
  title: string;
  slug: string;
  status: string;
  updatedAt: string | null;
};

export type WebsiteRedirectItem = {
  id: string;
  oldPath: string;
  newPath: string;
  statusCode: number;
  active: boolean;
};

export type WebsiteData = {
  pages: WebsitePageItem[];
  posts: WebsitePostItem[];
  redirects: WebsiteRedirectItem[];
  seoTitle: string | null;
  seoDescription: string | null;
  domainSummary: WorkspaceDomainSummary;
};

/**
 * Load all data needed for the canonical workspace Website page:
 * CMS pages, posts, redirects, SEO identity, and the live storefront URL.
 *
 * Returns a safe empty state on any error — the page renders gracefully.
 */
export async function loadWebsiteData(tenantId: string): Promise<WebsiteData> {
  const emptyDomainSummary: WorkspaceDomainSummary = {
    primaryHost: null,
    primaryHostKind: null,
    primaryHostStatus: null,
    subdomainHost: null,
    customDomainHost: null,
    customDomainStatus: null,
    customDomainVerifiedAt: null,
    verificationToken: null,
    failureReason: null,
    customDomains: [],
    subdomains: [],
  };
  const empty: WebsiteData = {
    pages: [], posts: [], redirects: [],
    seoTitle: null,
    seoDescription: null,
    domainSummary: emptyDomainSummary,
  };
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return empty;

    const [pagesRaw, postsRes, redirectsRes, identity, domainSummary] = await Promise.all([
      listPagesForStaff(supabase, tenantId).catch(() => []),
      supabase
        .from("cms_posts")
        .select("id, slug, title, status, updated_at")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false })
        .limit(50),
      supabase
        .from("cms_redirects")
        .select("id, old_path, new_path, status_code, active, updated_at")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false })
        .limit(50),
      loadIdentityForStaff(supabase, tenantId).catch(() => null),
      loadWorkspaceDomainSummary(tenantId).catch(() => emptyDomainSummary),
    ]);

    type PostRow = { id: string; slug: string; title: string; status: string; updated_at: string | null };
    type RedirectRow = { id: string; old_path: string; new_path: string; status_code: number; active: boolean };

    return {
      pages: pagesRaw.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        status: p.status,
        updatedAt: (p as unknown as { updated_at: string | null }).updated_at ?? null,
        updatedBy: (p as unknown as { updated_by: string | null }).updated_by ?? null,
      })),
      posts: ((postsRes.data ?? []) as unknown as PostRow[]).map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        status: p.status,
        updatedAt: p.updated_at,
      })),
      redirects: ((redirectsRes.data ?? []) as unknown as RedirectRow[]).map((r) => ({
        id: r.id,
        oldPath: r.old_path,
        newPath: r.new_path,
        statusCode: r.status_code,
        active: r.active,
      })),
      seoTitle: identity?.seo_default_title ?? null,
      seoDescription: identity?.seo_default_description ?? null,
      domainSummary,
    };
  } catch (err) {
    logServerError("workspace.loadWebsiteData", err);
    return empty;
  }
}

// ─── Recent activity feed ─────────────────────────────────────────────────────

export type RecentActivityItem = {
  id: string;
  event_type: string;
  actor_name: string | null;
  actor_role: string;
  inquiry_contact: string;
  inquiry_company: string | null;
  created_at: string;
};

/**
 * Load recent workspace activity from inquiry_events for the Overview page.
 * Joins inquiry context (contact_name, company) and actor profile display_name.
 * Returns the 10 most recent staff_only + participants events.
 */
export async function loadRecentActivity(
  tenantId: string,
): Promise<RecentActivityItem[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    // Fetch recent events with inquiry and actor profile context
    const { data, error } = await supabase
      .from("inquiry_events")
      .select(`
        id,
        event_type,
        actor_user_id,
        actor_role,
        created_at,
        inquiries!inner(contact_name, company, tenant_id)
      `)
      .eq("inquiries.tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      logServerError("workspace.loadRecentActivity.events", error);
      return [];
    }

    if (!data || data.length === 0) return [];

    // Gather unique actor user IDs to look up display names
    type EventRow = {
      id: string;
      event_type: string;
      actor_user_id: string | null;
      actor_role: string;
      created_at: string;
      inquiries: { contact_name: string; company: string | null } | null;
    };
    const rows = data as unknown as EventRow[];

    const actorIds = [...new Set(rows.map((r) => r.actor_user_id).filter(Boolean) as string[])];
    const nameMap: Map<string, string> = new Map();

    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", actorIds);
      for (const p of (profiles ?? []) as { id: string; display_name: string | null }[]) {
        if (p.display_name) nameMap.set(p.id, p.display_name);
      }
    }

    return rows
      .filter((r) => r.inquiries)
      .slice(0, 10)
      .map((r) => ({
        id: r.id,
        event_type: r.event_type,
        actor_name: r.actor_user_id ? (nameMap.get(r.actor_user_id) ?? null) : null,
        actor_role: r.actor_role,
        inquiry_contact: r.inquiries!.contact_name,
        inquiry_company: r.inquiries!.company,
        created_at: r.created_at,
      }));
  } catch (err) {
    logServerError("workspace.loadRecentActivity", err);
    return [];
  }
}

// ─── Inquiry activity feed ────────────────────────────────────────────────────

export type InquiryActivityItem = {
  id: string;
  event_type: string;
  actor_name: string | null;
  actor_role: string | null;
  created_at: string;
};

/**
 * Load the most recent inquiry_events rows for a single inquiry.
 * Used by the work detail page activity panel.
 */
export async function loadInquiryActivity(
  tenantId: string,
  inquiryId: string,
  limit = 20,
): Promise<InquiryActivityItem[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("inquiry_events")
      .select("id, event_type, actor_user_id, actor_role, created_at")
      .eq("inquiry_id", inquiryId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      logServerError("workspace.loadInquiryActivity", error);
      return [];
    }
    if (!data?.length) return [];

    type EventRow = { id: string; event_type: string; actor_user_id: string | null; actor_role: string | null; created_at: string };
    const rows = data as EventRow[];
    const actorIds = [...new Set(rows.map((r) => r.actor_user_id).filter(Boolean) as string[])];
    const nameMap = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", actorIds);
      for (const p of (profiles ?? []) as { id: string; display_name: string | null }[]) {
        if (p.display_name) nameMap.set(p.id, p.display_name);
      }
    }
    return rows.map((r) => ({
      id: r.id,
      event_type: r.event_type,
      actor_name: r.actor_user_id ? (nameMap.get(r.actor_user_id) ?? null) : null,
      actor_role: r.actor_role,
      created_at: r.created_at,
    }));
  } catch (err) {
    logServerError("workspace.loadInquiryActivity", err);
    return [];
  }
}

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

    // Step 3: Fetch the talent's card-variant headshot
    const admin = createServiceRoleClient();
    const mediaClient = admin ?? supabase;
    const { data: mediaRow } = await mediaClient
      .from("media_assets")
      .select("storage_path")
      .eq("owner_talent_profile_id", p.id)
      .eq("variant_kind", "card")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
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

export type TalentAgencyRow = {
  id: string;
  agencyName: string;
  agencySlug: string;
  rosterStatus: string;
  plan: string;
  addedAt: string;
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
      };
    });
  } catch (err) {
    logServerError("talent.loadAgencies", err);
    return [];
  }
}

// ─── Client self-dashboard data ───────────────────────────────────────────────

export type ClientSelfProfile = {
  /** client_profiles.id (UUID, not user_id) */
  id: string;
  userId: string;
  displayName: string;
  company: string | null;
  /** Display name of the agency they're viewing this dashboard in context of */
  agencyName: string;
  agencySlug: string;
};

/**
 * Load the client's own profile and verify they have an active relationship
 * with this agency. Historical inquiry count is kept as a fallback for local
 * environments that do not have a service key, but the canonical gate is now
 * agency_client_relationships so a freshly registered branded client can
 * enter the workspace before creating their first inquiry.
 */
export async function loadClientSelfProfile(
  userId: string,
  tenantId: string,
): Promise<ClientSelfProfile | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;
    const trusted = createServiceRoleClient();

    const [profileRes, agencyRes] = await Promise.all([
      supabase
        .from("client_profiles")
        .select("id, company_name, profiles!inner(display_name)")
        .eq("user_id", userId)
        .maybeSingle(),

      (trusted ?? supabase)
        .from("agencies")
        .select("display_name, slug")
        .eq("id", tenantId)
        .maybeSingle(),
    ]);

    if (profileRes.error) logServerError("client.loadSelfProfile.profile", profileRes.error);
    if (!profileRes.data) return null;

    type ProfileRaw = {
      id: string;
      company_name: string | null;
      profiles: { display_name: string | null } | { display_name: string | null }[] | null;
    };

    const row = profileRes.data as unknown as ProfileRaw;

    let hasRelationship = false;
    if (trusted) {
      const { data: relationship, error: relationshipErr } = await trusted
        .from("agency_client_relationships")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("client_profile_id", row.id)
        .eq("status", "active")
        .maybeSingle();

      if (relationshipErr) {
        logServerError("client.loadSelfProfile.relationship", relationshipErr);
      }
      hasRelationship = Boolean(relationship);
    } else {
      const { count, error: inquiryCountErr } = await supabase
        .from("inquiries")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("client_user_id", userId);

      if (inquiryCountErr) {
        logServerError("client.loadSelfProfile.inquiryFallback", inquiryCountErr);
      }
      hasRelationship = (count ?? 0) > 0;
    }

    if (!hasRelationship) return null;

    const profileJoin = row.profiles;
    const profile = Array.isArray(profileJoin) ? profileJoin[0] : profileJoin;

    const agencyRow = agencyRes.data as { display_name: string; slug: string } | null;

    return {
      id: row.id,
      userId,
      displayName: profile?.display_name?.trim() || userId.slice(0, 8),
      company: row.company_name ?? null,
      agencyName: agencyRow?.display_name ?? "Agency",
      agencySlug: agencyRow?.slug ?? "",
    };
  } catch (err) {
    logServerError("client.loadSelfProfile", err);
    return null;
  }
}

export type ClientInquiryRow = {
  id: string;
  status: string;
  event_date: string | null;
  event_location: string | null;
  company: string | null;
  quantity: number | null;
  created_at: string;
  next_action_by: string | null;
  /** Unread count in the private client thread. */
  unreadCount: number;
};

/**
 * Load all inquiries submitted by this client to this tenant.
 * Ordered by most recent first. Cap at 200.
 */
export async function loadClientInquiries(
  userId: string,
  tenantId: string,
): Promise<ClientInquiryRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("inquiries")
      .select("id, status, event_date, event_location, company, quantity, created_at, next_action_by")
      .eq("tenant_id", tenantId)
      .eq("client_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      logServerError("client.loadInquiries", error);
      return [];
    }

    const rows = (data ?? []) as Omit<ClientInquiryRow, "unreadCount">[];
    if (rows.length === 0) return [];

    const inquiryIds = rows.map((row) => row.id);
    const [readsRes, messagesRes] = await Promise.all([
      supabase
        .from("inquiry_message_reads")
        .select("inquiry_id, last_read_at")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .eq("thread_type", "private")
        .in("inquiry_id", inquiryIds),
      supabase
        .from("inquiry_messages")
        .select("inquiry_id, sender_user_id, created_at")
        .eq("tenant_id", tenantId)
        .eq("thread_type", "private")
        .is("deleted_at", null)
        .in("inquiry_id", inquiryIds),
    ]);

    if (readsRes.error) {
      logServerError("client.loadInquiries.reads", readsRes.error);
    }
    if (messagesRes.error) {
      logServerError("client.loadInquiries.messages", messagesRes.error);
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
      if (row.sender_user_id && row.sender_user_id === userId) continue;
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
    logServerError("client.loadInquiries", err);
    return [];
  }
}

export type ClientBookingRow = {
  id: string;
  event_date: string | null;
  event_location: string | null;
  company: string | null;
  quantity: number | null;
  created_at: string;
};

/**
 * Load confirmed bookings for a client at this tenant.
 * Booked = status IN ('booked', 'converted'). Ordered by event_date ascending.
 */
export async function loadClientBookings(
  userId: string,
  tenantId: string,
): Promise<ClientBookingRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("inquiries")
      .select("id, event_date, event_location, company, quantity, created_at")
      .eq("tenant_id", tenantId)
      .eq("client_user_id", userId)
      .in("status", ["booked", "converted"])
      .order("event_date", { ascending: true, nullsFirst: false })
      .limit(200);

    if (error) {
      logServerError("client.loadBookings", error);
      return [];
    }

    return (data ?? []) as ClientBookingRow[];
  } catch (err) {
    logServerError("client.loadBookings", err);
    return [];
  }
}

// ─── Phase 3.7 — Talent contact preferences ───────────────────────────────────

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

// ─── F2 — Workspace field catalog (profile_field_definitions) ─────────────────

export type WorkspaceFieldEntry = {
  fieldKey: string;
  label: string;
  tier: "universal" | "global" | "type-specific";
  section: string;
  kind: string;
  enabled: boolean;
  adminOnly: boolean;
  showInPublic: boolean;
  talentEditable: boolean;
};

export type WorkspaceFieldGroup = {
  tier: "universal" | "global" | "type-specific";
  fields: WorkspaceFieldEntry[];
};

/**
 * Load the field catalog for workspace settings display (F2 cutover).
 * Reads profile_field_definitions via loadFieldCatalog() with workspace
 * overrides from workspace_profile_field_settings.
 *
 * Groups fields by tier for the settings "Fields" tab.
 * Returns empty groups on error — never throws.
 */
export async function loadWorkspaceFieldCatalog(
  tenantId: string,
): Promise<WorkspaceFieldGroup[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const resolved = await loadFieldCatalog(supabase, { tenantId });

    const byTier = new Map<"universal" | "global" | "type-specific", WorkspaceFieldEntry[]>();
    const tiers: ("universal" | "global" | "type-specific")[] = ["universal", "global", "type-specific"];
    for (const tier of tiers) byTier.set(tier, []);

    for (const f of resolved) {
      const tier = f.tier as "universal" | "global" | "type-specific";
      const list = byTier.get(tier) ?? [];
      list.push({
        fieldKey: f.fieldKey,
        label: f.label,
        tier,
        section: f.section,
        kind: f.kind,
        enabled: f.enabled,
        adminOnly: f.adminOnly,
        showInPublic: f.showInPublic,
        talentEditable: f.talentEditable,
      });
      byTier.set(tier, list);
    }

    return tiers
      .map((tier) => ({ tier, fields: byTier.get(tier) ?? [] }))
      .filter((g) => g.fields.length > 0);
  } catch (err) {
    logServerError("workspace.loadFieldCatalog", err);
    return [];
  }
}

// ─── Commission context (Phase 8.4) ──────────────────────────────────────────

export type CommissionContext = {
  planTier: string;
  feeBasisPoints: number;
  feePercent: string;
};

/**
 * Returns the workspace plan tier and the corresponding platform fee basis points.
 * Used by the bookings page to display the fee rate and by transaction creation.
 */
export async function loadCommissionContext(tenantId: string): Promise<CommissionContext> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { planTier: "free", feeBasisPoints: 0, feePercent: "0%" };

    const { data } = await supabase
      .from("agencies")
      .select("plan_tier")
      .eq("id", tenantId)
      .maybeSingle();

    const planTier = (data as { plan_tier?: string } | null)?.plan_tier ?? "free";
    const bps = getFeeBasisPoints(planTier);
    return { planTier, feeBasisPoints: bps, feePercent: feePercent(bps) };
  } catch (err) {
    logServerError("workspace.loadCommissionContext", err);
    return { planTier: "free", feeBasisPoints: 0, feePercent: "0%" };
  }
}

// ─── Client trust state (Phase 8.3) ──────────────────────────────────────────

export type { ClientTrustState };

/**
 * Load the trust state for a client user in a given tenant.
 * Returns a default Basic state when no row exists yet.
 */
export async function loadClientTrustBillingState(
  userId: string,
  tenantId: string,
): Promise<ClientTrustState> {
  const state = await loadClientTrustState(userId, tenantId);
  return state ?? {
    userId,
    tenantId,
    trustLevel: "basic",
    verifiedAt: null,
    fundedBalanceCents: 0,
    manualOverride: null,
    evaluatedAt: new Date().toISOString(),
  };
}
