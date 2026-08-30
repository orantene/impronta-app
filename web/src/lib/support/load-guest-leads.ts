import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type { PlatformLeadRow } from "@/app/(workspace)/platform/platform-leads-data";
import { supportFrom } from "./support-from";
import { mapTicketRow } from "./support-types";

export type PlatformLeadSource = "signup" | "support_chat";

export type PlatformLeadRowWithSource = PlatformLeadRow & {
  source: PlatformLeadSource;
  ticketId?: string | null;
};

function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export async function loadRecentSupportLeads(limit: number): Promise<PlatformLeadRowWithSource[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data, error } = await supportFrom(admin, "support_tickets")
    .select("*")
    .eq("surface", "guest")
    .not("contact_email", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    logServerError("support.loadGuestLeads", error);
    return [];
  }
  return ((data ?? []) as unknown[])
    .map(mapTicketRow)
    .filter((t): t is NonNullable<typeof t> => Boolean(t?.contactEmail))
    .map((ticket) => ({
      id: ticket.id,
      email: ticket.contactEmail ?? "",
      name: ticket.contactName || ticket.contactEmail || "Guest",
      audience: "chat",
      rosterSize: null,
      tierInterest: null,
      subdomainWanted: null,
      status: ticket.status,
      claimedByProfileId: ticket.requesterUserId,
      provisionedTenantId: ticket.tenantId,
      claimedAt: null,
      createdAt: formatRelativeDate(ticket.createdAt),
      createdAtIso: ticket.createdAt,
      source: "support_chat" as const,
      ticketId: ticket.id,
    }));
}

/** Best-effort: stamp open guest tickets that share this email with a signup lead. */
export async function stampOpenGuestTicketsWithLeadId(
  email: string,
  leadId: string,
): Promise<void> {
  const admin = createServiceRoleClient();
  if (!admin) return;
  const normalized = email.trim().toLowerCase();
  if (!normalized || !leadId) return;
  const { data, error } = await supportFrom(admin, "support_tickets")
    .select("*")
    .eq("surface", "guest")
    .ilike("contact_email", normalized)
    .eq("status", "open");
  if (error) {
    logServerError("support.stampLeadOnSignup", error);
    return;
  }
  for (const raw of data ?? []) {
    const ticket = mapTicketRow(raw);
    if (!ticket) continue;
    await supportFrom(admin, "support_tickets")
      .update({
        metadata: { ...ticket.metadata, lead_id: leadId },
      })
      .eq("id", ticket.id);
  }
}

export function mergeRecentLeads(
  signups: PlatformLeadRow[],
  chats: PlatformLeadRowWithSource[],
  limit: number,
): PlatformLeadRowWithSource[] {
  const signupRows: PlatformLeadRowWithSource[] = signups.map((row) => ({
    ...row,
    source: "signup",
    ticketId: null,
  }));
  return [...signupRows, ...chats]
    .sort((a, b) => Date.parse(b.createdAtIso) - Date.parse(a.createdAtIso))
    .slice(0, limit);
}
