import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadPlatformWorkspaceUi } from "@/lib/platform/workspace-ui";
import { createServiceRoleClient } from "@/lib/supabase/admin";
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

  let replayBufferEnabled = false;
  if (input.tenantId && input.surface !== "client") {
    const admin = createServiceRoleClient();
    if (admin) {
      const { data } = await admin.from("agencies").select("settings").eq("id", input.tenantId).maybeSingle();
      const settings =
        data?.settings && typeof data.settings === "object"
          ? (data.settings as Record<string, unknown>)
          : {};
      replayBufferEnabled = settings.support_replay_buffer === true;
    }
  }

  return {
    surface: input.surface,
    tenantSlug: input.tenantSlug,
    firstName,
    userId: session.user.id,
    canSeeWorkspaceTickets: input.canSeeWorkspaceTickets ?? false,
    observeShellDrawers: input.observeShellDrawers ?? false,
    initialTickets,
    originSlug: input.originSlug ?? null,
    replayBufferEnabled,
    // The client surface mounts no LiveShareHost, so accepting a live view
    // there would strand HQ waiting on a stream that never starts.
    liveShareAvailable: input.surface !== "client",
    createTicket: createSupportTicketAction,
    sendMessage: sendSupportMessageAction,
    markRead: markSupportTicketReadAction,
    requestHuman: requestHumanAction,
    rateTicket: rateSupportTicketAction,
    closeTicket: closeSupportTicketAction,
    updateContact: updateTicketContactAction,
  };
}
