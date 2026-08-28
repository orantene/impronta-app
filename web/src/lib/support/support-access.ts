import "server-only";

import { requireWorkspaceStaffAction, requireTalentSelfAction } from "@/lib/saas/admin-scope";
import { requireSession, requireAdmin } from "@/lib/server/action-guards";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { loadTicketById } from "./support-engine";
import { supportFrom } from "./support-from";
import type { SupportSurface, SupportTicketRow } from "./support-types";

export type SupportRequester =
  | {
      ok: true;
      userId: string;
      tenantId: string | null;
      tenantSlug: string | null;
      surface: SupportSurface;
      talentProfileId: string | null;
      clientProfileId: string | null;
      email: string | null;
    }
  | { ok: false; error: string };

export async function resolveSupportRequester(input: {
  tenantSlug: string | null;
  surface: SupportSurface;
}): Promise<SupportRequester> {
  if (input.surface === "workspace") {
    const staff = await requireWorkspaceStaffAction({
      capability: "agency.support.tickets.view",
    });
    if (!staff.ok) return staff;
    return {
      ok: true,
      userId: staff.user.id,
      tenantId: staff.tenantId,
      tenantSlug: staff.tenantSlug,
      surface: "workspace",
      talentProfileId: null,
      clientProfileId: null,
      email: staff.user.email ?? null,
    };
  }

  const session = await requireSession();
  if (!session.ok) return session;

  if (input.surface === "talent") {
    const { data: tp } = await session.supabase
      .from("talent_profiles")
      .select("id")
      .eq("user_id", session.user.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!tp?.id) return { ok: false, error: "No talent profile." };
    const owned = await requireTalentSelfAction(tp.id);
    if (!owned.ok) return owned;
    return {
      ok: true,
      userId: owned.user.id,
      tenantId: owned.tenantId,
      tenantSlug: input.tenantSlug,
      surface: "talent",
      talentProfileId: tp.id,
      clientProfileId: null,
      email: owned.user.email ?? null,
    };
  }

  if (input.surface === "client") {
    const { data: cp } = await session.supabase
      .from("client_profiles")
      .select("id")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (!cp?.id) return { ok: false, error: "No client profile." };
    let tenantId: string | null = null;
    if (input.tenantSlug) {
      const { data: agency } = await session.supabase
        .from("agencies")
        .select("id")
        .eq("slug", input.tenantSlug)
        .maybeSingle();
      tenantId = agency?.id ?? null;
    }
    return {
      ok: true,
      userId: session.user.id,
      tenantId,
      tenantSlug: input.tenantSlug,
      surface: "client",
      talentProfileId: null,
      clientProfileId: cp.id,
      email: session.user.email ?? null,
    };
  }

  return { ok: false, error: "Unsupported surface." };
}

/**
 * Re-derive the RLS predicate app-side before any service-role write.
 * Never trust a client-sent ticket id.
 */
export async function assertTicketAccess(
  ticketId: string,
  userId: string,
): Promise<{ ok: true; ticket: SupportTicketRow } | { ok: false; error: string }> {
  const session = await requireSession();
  if (!session.ok) return session;
  if (session.user.id !== userId) return { ok: false, error: "Not authorized." };

  const hq = await requireAdmin();
  if (hq.ok) {
    const ticket = await loadTicketById(ticketId);
    if (!ticket) return { ok: false, error: "Ticket not found." };
    return { ok: true, ticket };
  }

  const { data, error } = await supportFrom(session.supabase, "support_tickets")
    .select("id")
    .eq("id", ticketId)
    .maybeSingle();
  if (error || !data) {
    // RLS miss — try requester match via engine (service role) then re-check.
    const ticket = await loadTicketById(ticketId);
    if (!ticket) return { ok: false, error: "Ticket not found." };
    if (ticket.requesterUserId === userId) return { ok: true, ticket };
    if (
      ticket.surface === "workspace" &&
      ticket.tenantId
    ) {
      const staff = await requireWorkspaceStaffAction({
        capability: "agency.support.tickets.view",
      });
      if (staff.ok && staff.tenantId === ticket.tenantId) {
        return { ok: true, ticket };
      }
    }
    return { ok: false, error: "Not authorized." };
  }

  const ticket = await loadTicketById(ticketId);
  if (!ticket) return { ok: false, error: "Ticket not found." };
  return { ok: true, ticket };
}

export async function assertHqAccess(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  return { ok: true, userId: auth.user.id };
}

export function isHqProfile(profile: { app_role?: string | null } | null): boolean {
  return isPlatformAdmin(profile);
}
