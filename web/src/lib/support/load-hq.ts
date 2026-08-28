import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { supportFrom } from "./support-from";
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
        requesterName: profile?.display_name ?? null,
        requesterEmail: null,
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
    if (ticket.requesterUserId) {
      const { data: past } = await supportFrom(admin, "support_tickets")
        .select("*")
        .eq("requester_user_id", ticket.requesterUserId)
        .neq("id", ticket.id)
        .order("last_message_at", { ascending: false })
        .limit(8);
      pastTickets = ((past ?? []).map(mapTicketRow).filter(Boolean) as SupportTicketRow[]).map((row) => ({
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
    }

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

    return {
      ticket,
      messages,
      context: {
        tenantName: tenant?.display_name ?? tenant?.slug ?? null,
        tenantSlug: tenant?.slug ?? null,
        planTier: tenant?.plan_tier ?? null,
        requesterName: profile?.display_name ?? null,
        requesterEmail: null,
        requesterCreatedAt: profile?.created_at ?? null,
        pastTickets,
        auditEvents,
      },
    };
  } catch (err) {
    logServerError("support.hq.detail", err);
    return null;
  }
}
