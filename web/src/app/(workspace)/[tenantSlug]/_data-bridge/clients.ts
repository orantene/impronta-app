import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { loadClientTrustStatesForTenant } from "@/lib/client-trust/evaluator";

/**
 * _data-bridge/clients.ts — client-related loaders (workspace + client pov).
 *
 * Split out of `_data-bridge.ts` (rev 13). Three concerns:
 *   - `loadWorkspaceClients` — admin pov, lists every client who has placed
 *     at least one inquiry with this tenant. Includes trust tier + booking
 *     YTD aggregates.
 *   - `loadClientSelfProfile` — client pov, verifies the user has an active
 *     relationship with this agency.
 *   - `loadClientInquiries` — client pov, the client's inquiry list with
 *     unread counts on the private thread.
 */

// ─── Workspace clients (admin pov) ────────────────────────────────────────────

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

// ─── Client self-dashboard data (client pov) ─────────────────────────────────

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

// ─── Client inquiries (client pov) ───────────────────────────────────────────

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
  /** Phase 9 — set when this inquiry was converted from a curated pitch. */
  source_pitch_id: string | null;
  /**
   * Discover unified plan §6 — value space includes
   * 'discover_single_talent' and 'discover_shortlist' for inquiries
   * that originated on the buyer-side Discover surface. Other channels:
   * 'admin_manual', 'public_directory', 'talent_profile_request',
   * 'pitch_conversion'. Used by the page to surface a source pill.
   */
  source_channel: string | null;
  /** Newest message timestamp in the private thread (null = no messages). */
  last_message_at: string | null;
  /** First ~80 chars of the newest message body, for the inbox preview. */
  last_message_body: string | null;
  /** True when the newest message was sent by this client themselves. */
  last_message_from_me: boolean;
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
      .select("id, status, event_date, event_location, company, quantity, created_at, next_action_by, source_pitch_id, source_channel")
      .eq("tenant_id", tenantId)
      .eq("client_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      logServerError("client.loadInquiries", error);
      return [];
    }

    const rows = (data ?? []) as Omit<ClientInquiryRow, "unreadCount" | "last_message_at" | "last_message_body" | "last_message_from_me">[];
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
        .select("inquiry_id, sender_user_id, body, created_at")
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
    // Track the newest message per inquiry so the inbox can show a
    // preview ("You: hola · 1:52 PM") and sort by activity rather than
    // by inquiry creation date. Sender + body + created_at are all
    // retained from the single message scan above.
    const lastMessageByInquiry = new Map<string, { at: string; body: string; senderUserId: string | null }>();
    for (const row of (messagesRes.data ?? []) as {
      inquiry_id: string;
      sender_user_id: string | null;
      body: string | null;
      created_at: string;
    }[]) {
      // Newest-wins running max for the preview map.
      const prev = lastMessageByInquiry.get(row.inquiry_id);
      if (!prev || row.created_at > prev.at) {
        lastMessageByInquiry.set(row.inquiry_id, {
          at: row.created_at,
          body: row.body ?? "",
          senderUserId: row.sender_user_id,
        });
      }
      // Unread counting (skip own messages + already-read).
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

    const enriched = rows.map((row) => {
      const last = lastMessageByInquiry.get(row.id) ?? null;
      return {
        ...row,
        unreadCount: unreadByInquiry.get(row.id) ?? 0,
        last_message_at: last?.at ?? null,
        last_message_body: last?.body ?? null,
        last_message_from_me: !!last && last.senderUserId === userId,
      };
    });

    // Sort by last-activity desc (last_message_at if present, otherwise
    // created_at) so a new message bubbles its inquiry to the top of
    // the inbox — the behaviour every messaging UI conditions users to.
    enriched.sort((a, b) => {
      const aT = a.last_message_at ?? a.created_at;
      const bT = b.last_message_at ?? b.created_at;
      return bT.localeCompare(aT);
    });

    return enriched;
  } catch (err) {
    logServerError("client.loadInquiries", err);
    return [];
  }
}
