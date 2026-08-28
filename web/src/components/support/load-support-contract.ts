import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadPlatformWorkspaceUi } from "@/lib/platform/workspace-ui";
import { loadSupportTicketSummaries } from "@/lib/support/load-summaries";
import {
  closeSupportTicketAction,
  createSupportTicketAction,
  markSupportTicketReadAction,
  rateSupportTicketAction,
  requestHumanAction,
  sendSupportMessageAction,
  updateTicketContactAction,
} from "@/lib/support/actions";
import type { SupportContract } from "./support-contract";

export async function loadSupportContract(input: {
  surface: "workspace" | "talent" | "client";
  tenantSlug: string | null;
  tenantId?: string | null;
  canSeeWorkspaceTickets?: boolean;
  observeShellDrawers?: boolean;
  originSlug?: string | null;
}): Promise<SupportContract | null> {
  const ui = await loadPlatformWorkspaceUi();
  if (!ui.supportEnabled) return null;
  const session = await getCachedActorSession();
  if (!session.user) return null;

  const firstName =
    (typeof session.user.user_metadata?.first_name === "string"
      ? session.user.user_metadata.first_name
      : null) ||
    session.user.email?.split("@")[0] ||
    "there";

  const initialTickets = await loadSupportTicketSummaries(session.user.id, {
    tenantId: input.tenantId ?? null,
    workspaceAll: input.canSeeWorkspaceTickets,
  });

  return {
    surface: input.surface,
    tenantSlug: input.tenantSlug,
    firstName,
    userId: session.user.id,
    canSeeWorkspaceTickets: input.canSeeWorkspaceTickets ?? false,
    observeShellDrawers: input.observeShellDrawers ?? false,
    initialTickets,
    originSlug: input.originSlug ?? null,
    createTicket: createSupportTicketAction,
    sendMessage: sendSupportMessageAction,
    markRead: markSupportTicketReadAction,
    requestHuman: requestHumanAction,
    rateTicket: rateSupportTicketAction,
    closeTicket: closeSupportTicketAction,
    updateContact: updateTicketContactAction,
  };
}
