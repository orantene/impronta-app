import "server-only";

/**
 * Server seam: resolve the dock viewer identity from the request session.
 * Used by TalentProfileChatLauncherMount and AgencyChatLauncherMount so the
 * guest claim banner and CTA identity match password / Google / email-code
 * sign-in, not only the guest cookie (TUL-314).
 */

import type { GuestIdentityTier } from "@/lib/inquiry/guest-chat-contract";
import { defaultClientName } from "@/lib/inquiry/default-client-name";
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

/**
 * TUL-965: the signed-in viewer's name and email for the dock's first-message form, so a client
 * who is already signed in is never asked to retype contact fields (the form read empty Nombre,
 * Apellido and Correo and kept Send disabled). A stored name wins; with none, a neutral label from
 * the email (`defaultClientName`) keeps the form sendable and editable. Signed out: null.
 */
export async function resolveDockViewerPrefill(): Promise<{ name: string | null; email: string } | null> {
  const session = await getCachedActorSession();
  const user = session.user;
  const email = user?.email?.trim();
  if (!user || !email) return null;
  const name = defaultClientName(
    session.profile?.display_name ??
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined),
    email,
  );
  return { name: name ?? null, email };
}
