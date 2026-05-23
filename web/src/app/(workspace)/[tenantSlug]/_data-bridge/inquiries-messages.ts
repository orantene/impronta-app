import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
export { loadInquiryMessages, loadTotalUnreadMessages } from "./inquiry-thread-messages";

/**
 * _data-bridge/inquiries-messages.ts — admin Messages inbox loader.
 *
 * Split out of `_data-bridge.ts` (rev 13). LARGEST split: ~600 lines of
 * inbox listing, per-thread message loads, unread-count aggregation, and
 * source-kind inference. Private helpers (`shortInitials`,
 * `formatMoneyMinor`, `truncate`, `inferSourceKind`,
 * `INQUIRY_INBOX_OPEN_STATUSES`) live here because they're used nowhere
 * else.
 */

export type ThreadType = "private" | "group";

export type WorkspaceMessage = {
  id: string;
  sender_user_id: string;
  sender_name: string;
  sender_role?: "you" | "client" | "coordinator" | "system" | "talent" | null;
  body: string;
  created_at: string;
  is_mine: boolean;
  /** Thread this row belongs to when returned in mixed-thread projections. */
  thread_type?: ThreadType;
  /** Discriminator for structured cards — "text" or one of the enum
   * values in `inquiry_messages.message_kind` (offer_event, payment_request,
   * payment_paid, coordinator_request, call_sheet_update, system_event, etc.).
   * Optional so existing callers don't break. */
  message_kind?: string | null;
  /** Per-kind JSON payload for the structured card. */
  card_payload?: Record<string, unknown> | null;
  /** Aggregated emoji reactions on this message. */
  reactions?: Array<{ emoji: string; count: number; mine: boolean }>;
  /** ISO timestamp when the most-recent counterparty (anyone other than
   * `myUserId`) marked the thread read with last_read_at >= this row's
   * created_at. Only populated when at least one other participant has
   * seen up to or past this message. Render-side uses it to show a
   * "Seen" indicator on the LAST is_mine message whose seen_at is set. */
  seen_at?: string | null;
  /** True when the current user has starred this message (personal
   * bookmark — only visible to them). Driven by inquiry_message_stars. */
  starred?: boolean;
};

/**
 * Full inbox row for the Messages shell. Mirrors the prototype's RichInquiry
 * shape so the canonical UI can render without extra round-trips.
 */
export type WorkspaceInquiryForMessages = {
  id: string;
  status: string;

  // ── Identity ────────────────────────────────────────────────────────────────
  /** Brief / title shown on the inbox row. Falls back through company → contact. */
  briefTitle: string;
  /** Display name of the client (contact_name). */
  clientName: string;
  /** Company / brand name if provided. */
  clientCompany: string | null;
  /** First initial for avatar. */
  clientInitials: string;
  contactEmail: string | null;

  // ── Event ────────────────────────────────────────────────────────────────────
  eventDate: string | null;
  eventLocation: string | null;
  quantity: number | null;

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  createdAt: string;
  lastActivityAt: string;
  /** Hours since last activity. */
  ageHrs: number;
  expiresAt: string | null;
  bookedAt: string | null;
  priority: string | null;

  // ── Routing ──────────────────────────────────────────────────────────────────
  nextActionBy: "client" | "coordinator" | "talent" | "system" | null;

  // ── Source ───────────────────────────────────────────────────────────────────
  sourceKind: "hub" | "direct" | "manual" | "marketplace" | "talent-page" | "other";
  sourcePage: string | null;
  trustLevel: string | null;

  // ── Coordinator ──────────────────────────────────────────────────────────────
  coordinatorUserId: string | null;
  coordinatorName: string | null;
  coordinatorInitials: string | null;
  coordinatorAcceptedAt: string | null;

  // ── Lineup (from inquiry_participants) ───────────────────────────────────────
  lineupConfirmed: number;
  lineupPending: number;
  lineupDeclined: number;
  lineupTotal: number;
  lineupTalent: Array<{
    talentProfileId: string | null;
    displayName: string;
    status: string;
  }>;

  // ── Offer ────────────────────────────────────────────────────────────────────
  currentOfferId: string | null;
  currentOfferStatus: "draft" | "sent" | "accepted" | "rejected" | null;
  currentOfferTotal: string | null; // "$15,000" formatted
  currentOfferCurrency: string | null;

  // ── Per-user flags ───────────────────────────────────────────────────────────
  pinned: boolean;
  manuallyUnread: boolean;
  archived: boolean;

  // ── Read state ───────────────────────────────────────────────────────────────
  unreadPrivate: number;
  unreadGroup: number;
  unreadCount: number;
  /** Whether the user has ever opened this inquiry's threads. */
  seen: boolean;

  // ── Last-message preview ─────────────────────────────────────────────────────
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  lastMessageRole: "you" | "client" | "coordinator" | "system" | "talent" | null;
  lastMessageThreadType: "private" | "group" | null;
  /** Recent real messages across both inquiry threads, chronological. */
  threadMessages: WorkspaceMessage[];
};

/** Statuses considered "open" for the messages inbox (active surface). */
const INQUIRY_INBOX_OPEN_STATUSES = [
  "submitted",
  "coordination",
  "offer_pending",
  "approved",
  "draft",
  "booked",      // booked stays in Messages until wrapped/closed
  "converted",
] as const;

function inferSourceKind(
  sourceType: string | null,
  sourceChannel: string | null,
  sourcePage: string | null,
): WorkspaceInquiryForMessages["sourceKind"] {
  const t = (sourceType ?? "").toLowerCase();
  const c = (sourceChannel ?? "").toLowerCase();
  // Map Discover's two channels to "marketplace" — they're the
  // cross-tenant catalog surface, which is what "marketplace" semantics
  // express in the existing consumer (admin Messages shell). Adding a
  // new "discover" enum value would require coordinated updates in the
  // mega state.tsx mapping; reusing marketplace keeps the wire stable.
  if (c.includes("discover")) return "marketplace";
  if (t.includes("hub") || c.includes("hub")) return "hub";
  if (t.includes("direct") || c.includes("direct")) return "direct";
  if (t.includes("manual") || c === "manual") return "manual";
  if (t.includes("market") || c.includes("market")) return "marketplace";
  if (t.includes("talent") || sourcePage?.startsWith("/t/")) return "talent-page";
  return "other";
}

function shortInitials(...parts: (string | null | undefined)[]): string {
  for (const p of parts) {
    if (!p) continue;
    const tokens = p.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const a = tokens[0]?.[0] ?? "";
    const b = tokens.length > 1 ? tokens[tokens.length - 1]?.[0] ?? "" : "";
    return (a + b).toUpperCase().slice(0, 2);
  }
  return "?";
}

function formatMoneyMinor(amountMinor: number | null, currency: string | null): string | null {
  if (amountMinor == null || isNaN(amountMinor)) return null;
  const major = amountMinor / 100;
  const cur = (currency ?? "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 0,
    }).format(major);
  } catch {
    return `${cur} ${major.toFixed(0)}`;
  }
}

function truncate(s: string | null | undefined, n: number): string | null {
  if (!s) return null;
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > n ? clean.slice(0, n - 1) + "…" : clean;
}

function displayNameFromTalentProfile(
  profile:
    | { display_name: string | null; first_name: string | null; last_name: string | null }
    | { display_name: string | null; first_name: string | null; last_name: string | null }[]
    | null,
): string {
  const row = Array.isArray(profile) ? profile[0] : profile;
  return (
    row?.display_name?.trim()
    || `${row?.first_name ?? ""} ${row?.last_name ?? ""}`.trim()
    || "Talent"
  );
}

function displayNameFromProfile(
  profile:
    | { display_name: string | null }
    | { display_name: string | null }[]
    | null,
  fallback: string,
): string {
  const row = Array.isArray(profile) ? profile[0] : profile;
  return row?.display_name?.trim() || fallback;
}

/**
 * Load every open inquiry for the Messages inbox enriched with unread,
 * lineup, coordinator, offer, source, last-message preview, and per-user
 * flags. Designed to power the prototype-fidelity inbox in one round trip.
 */
export async function loadInquiriesForMessages(
  tenantId: string,
): Promise<WorkspaceInquiryForMessages[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data: { user } } = await supabase.auth.getUser();
    const myUserId = user?.id ?? null;

    // ── 1. Inquiries ─────────────────────────────────────────────────────────
    const inquiryRes = await supabase
      .from("inquiries")
      .select(`
        id, status, contact_name, contact_email, company, message,
        event_date, event_location, quantity,
        created_at, updated_at, expires_at, booked_at,
        next_action_by, priority, trust_level_at_submission,
        source_type, source_channel, source_page,
        coordinator_id, coordinator_accepted_at,
        current_offer_id
      `)
      .eq("tenant_id", tenantId)
      .in("status", INQUIRY_INBOX_OPEN_STATUSES as unknown as string[])
      .order("created_at", { ascending: false })
      .limit(300);

    if (inquiryRes.error) {
      logServerError("workspace.loadInquiriesForMessages.inquiries", inquiryRes.error);
      return [];
    }

    type InquiryRow = {
      id: string;
      status: string;
      contact_name: string | null;
      contact_email: string | null;
      company: string | null;
      message: string | null;
      event_date: string | null;
      event_location: string | null;
      quantity: number | null;
      created_at: string;
      updated_at: string | null;
      expires_at: string | null;
      booked_at: string | null;
      next_action_by: "client" | "coordinator" | "talent" | "system" | null;
      priority: string | null;
      trust_level_at_submission: string | null;
      source_type: string | null;
      source_channel: string | null;
      source_page: string | null;
      coordinator_id: string | null;
      coordinator_accepted_at: string | null;
      current_offer_id: string | null;
    };
    const inquiryRows = (inquiryRes.data ?? []) as InquiryRow[];
    const inquiryIds = inquiryRows.map((row) => row.id);

    if (inquiryIds.length === 0) return [];

    // ── 2. Parallel side queries (8 in flight) ───────────────────────────────
    const coordinatorIds = Array.from(
      new Set(inquiryRows.map((r) => r.coordinator_id).filter((x): x is string => !!x)),
    );
    const offerIds = Array.from(
      new Set(inquiryRows.map((r) => r.current_offer_id).filter((x): x is string => !!x)),
    );

    const [
      readsRes,
      messagesRes,
      participantsRes,
      offersRes,
      coordinatorsRes,
      flagsRes,
      lastMessagesRes,
    ] = await Promise.all([
      // Read watermarks (per-thread) for current user.
      myUserId
        ? supabase
            .from("inquiry_message_reads")
            .select("inquiry_id, thread_type, last_read_at")
            .eq("tenant_id", tenantId)
            .eq("user_id", myUserId)
            .in("inquiry_id", inquiryIds)
        : Promise.resolve({ data: [] as unknown[], error: null }),

      // All messages (for unread counting + activity).
      supabase
        .from("inquiry_messages")
        .select("inquiry_id, thread_type, sender_user_id, created_at")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .in("inquiry_id", inquiryIds),

      // Lineup participants.
      supabase
        .from("inquiry_participants")
        .select(`
          inquiry_id, role, status, talent_profile_id, user_id,
          talent_profiles:talent_profile_id(display_name, first_name, last_name)
        `)
        .eq("tenant_id", tenantId)
        .in("inquiry_id", inquiryIds),

      // Current offers (for status + total).
      offerIds.length > 0
        ? supabase
            .from("inquiry_offers")
            .select("id, status, total_client_price, currency_code")
            .in("id", offerIds)
        : Promise.resolve({ data: [] as unknown[], error: null }),

      // Coordinator profiles.
      coordinatorIds.length > 0
        ? supabase
            .from("profiles")
            .select("id, display_name")
            .in("id", coordinatorIds)
        : Promise.resolve({ data: [] as unknown[], error: null }),

      // Per-user UX flags.
      myUserId
        ? supabase
            .from("inquiry_user_flags")
            .select("inquiry_id, pinned, manually_unread, archived")
            .eq("tenant_id", tenantId)
            .eq("profile_id", myUserId)
            .in("inquiry_id", inquiryIds)
        : Promise.resolve({ data: [] as unknown[], error: null }),

      // Last-message-per-inquiry preview (most recent across both threads).
      supabase
        .from("inquiry_messages")
        .select(`
          id, inquiry_id, thread_type, sender_user_id, body, created_at,
          message_kind, card_payload,
          profiles:sender_user_id(display_name)
        `)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .in("inquiry_id", inquiryIds)
        .order("created_at", { ascending: false })
        .limit(800),
    ]);

    // ── 3. Build lookup maps ─────────────────────────────────────────────────

    // 3a. Read watermarks per (inquiry, thread)
    const readAtMap = new Map<string, string>();
    for (const row of (readsRes.data ?? []) as {
      inquiry_id: string; thread_type: string; last_read_at: string | null;
    }[]) {
      if (row.last_read_at) readAtMap.set(`${row.inquiry_id}:${row.thread_type}`, row.last_read_at);
    }

    // 3b. Unread counts per (inquiry, thread)
    const unreadPrivate = new Map<string, number>();
    const unreadGroup = new Map<string, number>();
    const lastActivityMap = new Map<string, string>();
    const seenSomeMessage = new Map<string, boolean>();
    for (const row of (messagesRes.data ?? []) as {
      inquiry_id: string; thread_type: string; sender_user_id: string | null; created_at: string;
    }[]) {
      // Track latest activity (any message).
      const prev = lastActivityMap.get(row.inquiry_id);
      if (!prev || new Date(row.created_at).getTime() > new Date(prev).getTime()) {
        lastActivityMap.set(row.inquiry_id, row.created_at);
      }
      // Mark that there's at least one message.
      seenSomeMessage.set(row.inquiry_id, true);
      // Skip self-sent for unread purposes.
      if (myUserId && row.sender_user_id === myUserId) continue;
      const key = `${row.inquiry_id}:${row.thread_type}`;
      const lastReadAt = readAtMap.get(key);
      if (lastReadAt && new Date(row.created_at).getTime() <= new Date(lastReadAt).getTime()) {
        continue;
      }
      const target = row.thread_type === "group" ? unreadGroup : unreadPrivate;
      target.set(row.inquiry_id, (target.get(row.inquiry_id) ?? 0) + 1);
    }

    // 3c. Lineup counts
    const lineup = new Map<string, {
      confirmed: number;
      pending: number;
      declined: number;
      total: number;
      talent: Array<{ talentProfileId: string | null; displayName: string; status: string }>;
    }>();
    const participantRoleByInquiryUser = new Map<string, "client" | "coordinator" | "talent">();
    for (const row of (participantsRes.data ?? []) as Array<{
      inquiry_id: string;
      role: "client" | "coordinator" | "talent";
      status: string;
      talent_profile_id: string | null;
      user_id: string | null;
      talent_profiles:
        | { display_name: string | null; first_name: string | null; last_name: string | null }
        | { display_name: string | null; first_name: string | null; last_name: string | null }[]
        | null;
    }>) {
      if (row.user_id) participantRoleByInquiryUser.set(`${row.inquiry_id}:${row.user_id}`, row.role);
      if (row.role !== "talent") continue;
      const cur = lineup.get(row.inquiry_id) ?? { confirmed: 0, pending: 0, declined: 0, total: 0, talent: [] };
      cur.total += 1;
      const s = (row.status ?? "").toLowerCase();
      if (s === "accepted" || s === "confirmed") cur.confirmed += 1;
      else if (s === "declined" || s === "removed") cur.declined += 1;
      else cur.pending += 1;
      cur.talent.push({
        talentProfileId: row.talent_profile_id,
        displayName: displayNameFromTalentProfile(row.talent_profiles),
        status: row.status ?? "pending",
      });
      lineup.set(row.inquiry_id, cur);
    }

    // 3d. Offers
    const offersById = new Map<string, { status: string; totalMinor: number | null; currency: string | null }>();
    for (const row of (offersRes.data ?? []) as {
      id: string; status: string; total_client_price: number | null; currency_code: string | null;
    }[]) {
      offersById.set(row.id, {
        status: row.status,
        totalMinor: row.total_client_price,
        currency: row.currency_code,
      });
    }

    // 3e. Coordinators
    const coordinatorsById = new Map<string, { name: string; initials: string }>();
    for (const row of (coordinatorsRes.data ?? []) as { id: string; display_name: string | null }[]) {
      const name = row.display_name?.trim() || "Unassigned";
      coordinatorsById.set(row.id, { name, initials: shortInitials(name) });
    }

    // 3f. Per-user flags
    const flagsById = new Map<string, { pinned: boolean; manuallyUnread: boolean; archived: boolean }>();
    for (const row of (flagsRes.data ?? []) as {
      inquiry_id: string; pinned: boolean; manually_unread: boolean; archived: boolean;
    }[]) {
      flagsById.set(row.inquiry_id, {
        pinned: row.pinned,
        manuallyUnread: row.manually_unread,
        archived: row.archived,
      });
    }

    // 3g. Last-message preview per inquiry
    const lastMessageById = new Map<string, {
      preview: string;
      at: string;
      role: WorkspaceInquiryForMessages["lastMessageRole"];
      threadType: "private" | "group";
    }>();
    const messagesByInquiry = new Map<string, WorkspaceMessage[]>();
    for (const row of (lastMessagesRes.data ?? []) as {
      id: string;
      inquiry_id: string;
      thread_type: "private" | "group";
      sender_user_id: string | null;
      body: string;
      created_at: string;
      message_kind: string | null;
      card_payload: Record<string, unknown> | null;
      profiles: { display_name: string | null } | { display_name: string | null }[] | null;
    }[]) {
      let role: WorkspaceInquiryForMessages["lastMessageRole"];
      if (row.sender_user_id === myUserId) role = "you";
      else if (!row.sender_user_id) role = "system";
      else {
        const participantRole = participantRoleByInquiryUser.get(`${row.inquiry_id}:${row.sender_user_id}`);
        role = participantRole === "coordinator" ? "coordinator"
          : participantRole === "talent" ? "talent"
          : participantRole === "client" ? "client"
          : row.thread_type === "private" ? "client"
          : "talent";
      }
      if (!lastMessageById.has(row.inquiry_id)) {
        lastMessageById.set(row.inquiry_id, {
          preview: truncate(row.body, 140) ?? "",
          at: row.created_at,
          role,
          threadType: row.thread_type,
        });
      }
      const senderName =
        !row.sender_user_id ? "System"
        : row.sender_user_id === myUserId ? "You"
        : displayNameFromProfile(row.profiles, role === "talent" ? "Talent" : "Client");
      const current = messagesByInquiry.get(row.inquiry_id) ?? [];
      current.push({
        id: row.id,
        sender_user_id: row.sender_user_id ?? "",
        sender_name: senderName,
        sender_role: role,
        body: row.body,
        created_at: row.created_at,
        is_mine: !!row.sender_user_id && row.sender_user_id === myUserId,
        thread_type: row.thread_type,
        message_kind: row.message_kind ?? "text",
        card_payload: row.card_payload ?? null,
        reactions: [],
        seen_at: null,
        starred: false,
      });
      messagesByInquiry.set(row.inquiry_id, current);
    }

    // ── 4. Compose final rows ────────────────────────────────────────────────
    return inquiryRows.map((row): WorkspaceInquiryForMessages => {
      const upr = unreadPrivate.get(row.id) ?? 0;
      const ugr = unreadGroup.get(row.id) ?? 0;
      const flags = flagsById.get(row.id);
      const lineupCounts = lineup.get(row.id) ?? { confirmed: 0, pending: 0, declined: 0, total: 0, talent: [] };
      const offer = row.current_offer_id ? offersById.get(row.current_offer_id) : null;
      const coord = row.coordinator_id ? coordinatorsById.get(row.coordinator_id) : null;
      const lastMsg = lastMessageById.get(row.id);
      const threadMessages = (messagesByInquiry.get(row.id) ?? [])
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      const lastActivityAt =
        lastActivityMap.get(row.id) ??
        row.updated_at ??
        row.created_at;

      const ageHrs =
        (Date.now() - new Date(lastActivityAt).getTime()) / (1000 * 60 * 60);

      const briefTitle =
        (row.company?.trim()) ||
        (row.contact_name?.trim()) ||
        truncate(row.message, 90) ||
        "Untitled inquiry";

      return {
        id: row.id,
        status: row.status,

        briefTitle,
        clientName: row.contact_name ?? "—",
        clientCompany: row.company,
        clientInitials: shortInitials(row.contact_name, row.company, briefTitle),
        contactEmail: row.contact_email,

        eventDate: row.event_date,
        eventLocation: row.event_location,
        quantity: row.quantity,

        createdAt: row.created_at,
        lastActivityAt,
        ageHrs,
        expiresAt: row.expires_at,
        bookedAt: row.booked_at,
        priority: row.priority,

        nextActionBy: row.next_action_by,

        sourceKind: inferSourceKind(row.source_type, row.source_channel, row.source_page),
        sourcePage: row.source_page,
        trustLevel: row.trust_level_at_submission,

        coordinatorUserId: row.coordinator_id ?? null,
        coordinatorName: coord?.name ?? null,
        coordinatorInitials: coord?.initials ?? null,
        coordinatorAcceptedAt: row.coordinator_accepted_at,

        lineupConfirmed: lineupCounts.confirmed,
        lineupPending:   lineupCounts.pending,
        lineupDeclined:  lineupCounts.declined,
        lineupTotal:     lineupCounts.total,
        lineupTalent:    lineupCounts.talent,

        currentOfferId:     row.current_offer_id ?? null,
        currentOfferStatus: (offer?.status as WorkspaceInquiryForMessages["currentOfferStatus"]) ?? null,
        currentOfferTotal:  formatMoneyMinor(offer?.totalMinor ?? null, offer?.currency ?? null),
        currentOfferCurrency: offer?.currency ?? null,

        pinned:         flags?.pinned ?? false,
        manuallyUnread: flags?.manuallyUnread ?? false,
        archived:       flags?.archived ?? false,

        unreadPrivate: upr,
        unreadGroup:   ugr,
        unreadCount:   upr + ugr,

        // Considered "seen" if the read watermark for either thread exists OR
        // there are no messages at all.
        seen:
          !seenSomeMessage.get(row.id) ||
          readAtMap.has(`${row.id}:private`) ||
          readAtMap.has(`${row.id}:group`),

        lastMessagePreview:    lastMsg?.preview ?? null,
        lastMessageAt:         lastMsg?.at ?? null,
        lastMessageRole:       lastMsg?.role ?? null,
        lastMessageThreadType: lastMsg?.threadType ?? null,
        threadMessages,
      };
    });
  } catch (err) {
    logServerError("workspace.loadInquiriesForMessages", err);
    return [];
  }
}
