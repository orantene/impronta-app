import "server-only";

/**
 * Server seam: resolve the dock viewer identity from the request session.
 * Used by TalentProfileChatLauncherMount and AgencyChatLauncherMount so the
 * guest claim banner and CTA identity match password / Google / email-code
 * sign-in, not only the guest cookie (TUL-314).
 */

import type { GuestIdentityTier } from "@/lib/inquiry/guest-chat-contract";
import { getCachedActorSession } from "@/lib/server/request-cache";

import { dockViewerIdentityTier } from "./dock-viewer-identity";

export async function resolveDockViewerIdentityTier(): Promise<GuestIdentityTier> {
  const session = await getCachedActorSession();
  return dockViewerIdentityTier({
    hasUser: Boolean(session.user),
    appRole: session.profile?.app_role,
    accountStatus: session.profile?.account_status,
  });
}
