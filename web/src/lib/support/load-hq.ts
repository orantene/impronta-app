import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { supportFrom } from "./support-from";
import { hqQueueRequesterEmail } from "./support-hq-presentation";
import {
  mapMessageRow,
  mapTicketRow,
  type SupportMessageRow,
  type SupportTicketRow,
  type SupportTicketSummary,
} from "./support-types";

export type HqQueueRow = {
  ticket: SupportTicketRow;
  tenantName: string | null;
  tenantSlug: string | null;
  planTier: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
};

export type HqTicketContext = {
  tenantName: string | null;
  tenantSlug: string | null;
  planTier: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  requesterCreatedAt: string | null;
  pastTickets: SupportTicketSummary[];
  auditEvents: { action: string; summary: string | null; createdAt: string }[];
  diagnostics: Record<string, unknown> | null;
  /**
   * The requester's recent bookings.
   *
   * The context card previously showed workspace, contact and past tickets and
   * NO commerce data at all, so an agent handling "I was charged twice" could
   * see neither the charge nor the booking. support_tickets has no FK to any
   * money object, so this is resolved through the requester instead: their user
   * id, scoped to the ticket's tenant when it has one.
   *
   * Read-only, and deliberately small: enough to recognise the case being
   * described, not a finance console.
   */
  recentBookings: Array<{
    id: string;
    status: string;
    paymentStatus: string | null;
    totalClientRevenue: number | null;
    bookingSubType: string | null;
    createdAt: string;
  }>;
};

type AgencyLite = { id: string; slug: string | null; display_name: string | null; plan_tier: string | null };
type ProfileLite = { id: string; display_name: string | null; created_at?: string | null };

async function hydrateTenants(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  tenantIds: string[],
): Promise<Map<string, AgencyLite>> {
  const map = new Map<string, AgencyLite>();
  if (tenantIds.length === 0) return map;
  const { data } = await admin
    .from("agencies")
    .select("id, slug, display_name, plan_tier")
    .in("id", tenantIds);
  for (const row of data ?? []) {
    map.set(row.id, row as AgencyLite);
  }
  return map;
}

async function hydrateProfiles(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  userIds: string[],
): Promise<Map<string, ProfileLite>> {
  const map = new Map<string, ProfileLite>();
  if (userIds.length === 0) return map;
  const { data } = await admin.from("profiles").select("id, display_name, created_at").in("id", userIds);
  for (const row of data ?? []) {
    map.set(row.id, row as ProfileLite);
  }
  return map;
}

export async function loadHqSupportOpenCount(): Promise<number> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return 0;
    const { count, error } = await supportFrom(admin, "support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .eq("waiting_on", "support");
    if (error) return 0;
    return count ?? 0;
  } catch (err) {
    logServerError("support.hq.openCount", err);
    return 0;
  }
}

export async function loadHqSupportQueue(): Promise<HqQueueRow[]> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return [];
    const { data, error } = await supportFrom(admin, "support_tickets")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (error) {
      logServerError("support.hq.queue", error);
      return [];
    }
    const tickets = (data ?? []).map(mapTicketRow).filter(Boolean) as SupportTicketRow[];
    const tenantIds = [...new Set(tickets.map((t) => t.tenantId).filter(Boolean))] as string[];
    const userIds = [...new Set(tickets.map((t) => t.requesterUserId).filter(Boolean))] as string[];
    const [tenants, profiles] = await Promise.all([
      hydrateTenants(admin, tenantIds),
      hydrateProfiles(admin, userIds),
    ]);
    return tickets.map((ticket) => {
      const tenant = ticket.tenantId ? tenants.get(ticket.tenantId) : undefined;
      const profile = ticket.requesterUserId ? profiles.get(ticket.requesterUserId) : undefined;
      return {
        ticket,
        tenantName: tenant?.display_name ?? tenant?.slug ?? null,
        tenantSlug: tenant?.slug ?? null,
        planTier: tenant?.plan_tier ?? null,
        requesterName: profile?.display_name ?? ticket.contactName ?? null,
        requesterEmail: hqQueueRequesterEmail(ticket),
      };
    });
  } catch (err) {
    logServerError("support.hq.queue", err);
    return [];
  }
}

export async function loadHqTicketDetail(ticketId: string): Promise<{
  ticket: SupportTicketRow;
  messages: SupportMessageRow[];
  context: HqTicketContext;
} | null> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return null;
    const { data: tRow, error } = await supportFrom(admin, "support_tickets")
      .select("*")
      .eq("id", ticketId)
      .maybeSingle();
    if (error) {
      logServerError("support.hq.detail", error);
      return null;
    }
    const ticket = mapTicketRow(tRow);
    if (!ticket) return null;

    const { data: msgs } = await supportFrom(admin, "support_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    const messages = (msgs ?? []).map(mapMessageRow).filter(Boolean) as SupportMessageRow[];

    const [tenants, profiles] = await Promise.all([
      ticket.tenantId ? hydrateTenants(admin, [ticket.tenantId]) : Promise.resolve(new Map<string, AgencyLite>()),
      ticket.requesterUserId
        ? hydrateProfiles(admin, [ticket.requesterUserId])
        : Promise.resolve(new Map<string, ProfileLite>()),
    ]);
    const tenant = ticket.tenantId ? tenants.get(ticket.tenantId) : undefined;
    const profile = ticket.requesterUserId ? profiles.get(ticket.requesterUserId) : undefined;

    let pastTickets: SupportTicketSummary[] = [];
    const pastById = new Map<string, SupportTicketRow>();
    const ingestPast = (rows: unknown[] | null) => {
      for (const raw of rows ?? []) {
        const row = mapTicketRow(raw);
        if (row && row.id !== ticket.id) pastById.set(row.id, row);
      }
    };
    if (ticket.requesterUserId) {
      const { data: past } = await supportFrom(admin, "support_tickets")
        .select("*")
        .eq("requester_user_id", ticket.requesterUserId)
        .neq("id", ticket.id)
        .order("last_message_at", { ascending: false })
        .limit(8);
      ingestPast(past ?? []);
    }
    if (ticket.guestSessionId) {
      const { data: past } = await supportFrom(admin, "support_tickets")
        .select("*")
        .eq("guest_session_id", ticket.guestSessionId)
        .neq("id", ticket.id)
        .order("last_message_at", { ascending: false })
        .limit(8);
      ingestPast(past ?? []);
    }
    if (ticket.contactEmail) {
      // Scoped to the SAME tenant space as this ticket. An unscoped email match
      // pulled in tickets from other tenants that happened to share a contact
      // address — one person who is a client of agency A and staff at agency B
      // would leak B's ticket subjects into A's drawer.
      //
      // Both branches matter: a tenant ticket matches only that tenant, and a
      // guest/platform ticket (tenant_id null) matches only other tenant-less
      // ones, which is what keeps the returning-guest-on-a-new-device case
      // working — the reason this lookup exists at all.
      let q = supportFrom(admin, "support_tickets")
        .select("*")
        .ilike("contact_email", ticket.contactEmail)
        .neq("id", ticket.id);
      q = ticket.tenantId ? q.eq("tenant_id", ticket.tenantId) : q.is("tenant_id", null);
      const { data: past } = await q.order("last_message_at", { ascending: false }).limit(8);
      ingestPast(past ?? []);
    }
    pastTickets = [...pastById.values()]
      .sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt))
      .slice(0, 8)
      .map((row) => ({
        id: row.id,
        ticketNumber: row.ticketNumber,
        subject: row.subject,
        status: row.status,
        waitingOn: row.waitingOn,
        category: row.category,
        lastMessageAt: row.lastMessageAt,
        lastMessagePreview: row.lastMessagePreview,
        unread: false,
        requesterUserId: row.requesterUserId,
        surface: row.surface,
      }));

    let auditEvents: HqTicketContext["auditEvents"] = [];
    if (ticket.tenantId) {
      const { data: audit } = await admin
        .from("workspace_audit_events")
        .select("action, summary, created_at")
        .eq("tenant_id", ticket.tenantId)
        .order("created_at", { ascending: false })
        .limit(5);
      auditEvents = (audit ?? []).map((row) => ({
        action: String(row.action ?? ""),
        summary: typeof row.summary === "string" ? row.summary : null,
        createdAt: String(row.created_at ?? ""),
      }));
    }

    // Commerce context for the agent. Resolved through the requester, because
    // support_tickets has no link to a booking; scoped to the ticket's tenant
    // when it has one so a platform admin handling one workspace's ticket does
    // not see that person's bookings with a different agency.
    let recentBookings: HqTicketContext["recentBookings"] = [];
    if (ticket.requesterUserId) {
      let bq = admin
        .from("agency_bookings")
        .select("id, status, payment_status, total_client_revenue, booking_sub_type, created_at")
        .eq("client_user_id", ticket.requesterUserId);
      if (ticket.tenantId) bq = bq.eq("tenant_id", ticket.tenantId);
      const { data: bookings, error: bErr } = await bq
        .order("created_at", { ascending: false })
        .limit(5);
      if (bErr) {
        // Never let a context lookup take down the drawer — an agent with a
        // partial card can still answer; an agent with an error page cannot.
        logServerError("support.loadHqTicketDetail.bookings", bErr);
      } else {
        recentBookings = (bookings ?? []).map((b: Record<string, unknown>) => ({
          id: String(b.id ?? ""),
          status: String(b.status ?? ""),
          paymentStatus: b.payment_status == null ? null : String(b.payment_status),
          totalClientRevenue:
            b.total_client_revenue == null ? null : Number(b.total_client_revenue),
          bookingSubType: b.booking_sub_type == null ? null : String(b.booking_sub_type),
          createdAt: String(b.created_at ?? ""),
        }));
      }
    }

    let diagnostics: Record<string, unknown> | null = null;
    {
      const { data: diag } = await supportFrom(admin, "support_ticket_diagnostics")
        .select("*")
        .eq("ticket_id", ticketId)
        .maybeSingle();
      if (diag && typeof diag === "object") diagnostics = diag as Record<string, unknown>;
    }

    return {
      ticket,
      messages,
      context: {
        tenantName: tenant?.display_name ?? tenant?.slug ?? null,
        tenantSlug: tenant?.slug ?? null,
        planTier: tenant?.plan_tier ?? null,
        requesterName: profile?.display_name ?? ticket.contactName ?? null,
        requesterEmail:
          ticket.contactEmail ??
          (ticket.requesterUserId
            ? ((await admin.auth.admin.getUserById(ticket.requesterUserId)).data.user?.email ?? null)
            : null),
        requesterCreatedAt: profile?.created_at ?? null,
        pastTickets,
        auditEvents,
        diagnostics,
        recentBookings,
      },
    };
  } catch (err) {
    logServerError("support.hq.detail", err);
    return null;
  }
}
