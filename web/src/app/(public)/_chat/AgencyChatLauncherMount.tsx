/**
 * AgencyChatLauncherMount — the floating guest-chat launcher for the AGENCY
 * surface (directory + home pages). Mirrors TalentProfileChatLauncherMount but
 * starts a talent-less "message the agency" inquiry (source `agency_site`).
 *
 * Self-contained server component: it resolves the tenant from the public host
 * context, loads the tenant's guest-chat settings, and renders nothing unless
 * the chat is enabled AND shown on the directory/home surface. Branding is read
 * server-side and passed to the (client) launcher as plain props, so the client
 * bundle imports no backend module — same seam as the talent mount.
 */

import { TalentProfileChatLauncher } from "@/app/t/[profileCode]/_chat/TalentProfileChatLauncher";
import {
  getGuestThreadMessages,
  sendGuestClaimToEmail,
  sendGuestMessageAction,
  startGuestChatInquiry,
} from "@/app/t/[profileCode]/_actions/guest-chat-actions";
import { getPublicHostContext } from "@/lib/saas/scope";
import { loadPublicBranding, loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { loadGuestChatSettings } from "@/lib/inquiry/guest-chat-settings";

type AgencyChatLauncherMountProps = {
  /** Attribution page for source_context (e.g. "/" or "/directory"). */
  sourcePage?: string;
};

export async function AgencyChatLauncherMount({
  sourcePage = "/",
}: AgencyChatLauncherMountProps) {
  const ctx = await getPublicHostContext();
  if (ctx.kind !== "agency" || !ctx.tenantId) return null;

  const settings = await loadGuestChatSettings(ctx.tenantId);
  if (!settings.enabled || !settings.showOnDirectory) return null;

  const [identity, branding] = await Promise.all([
    loadPublicIdentity(ctx.tenantId),
    loadPublicBranding(ctx.tenantId),
  ]);

  const agencyName = identity?.public_name?.trim() || "the agency";
  const accentColor = branding?.primary_color ?? branding?.accent_color ?? null;
  const theme =
    typeof branding?.theme_json === "object" && branding.theme_json !== null
      ? (branding.theme_json as Record<string, unknown>)
      : {};
  const logoUrl = typeof theme.logo_url === "string" ? theme.logo_url : null;

  return (
    <TalentProfileChatLauncher
      tenantSlug={ctx.tenantSlug ?? ""}
      // Agency-level: no specific talent — the action builds a talent-less
      // `agency_site` inquiry when these are empty.
      talentProfileId=""
      talentProfileCode=""
      sourcePage={sourcePage}
      brand={{
        agencyName,
        // Drives the opener voice ("Hi — I'm {agency}'s booking assistant").
        talentDisplayName: agencyName,
        accentColor,
        logoUrl,
        greeting: settings.greeting,
      }}
      label={`Message ${agencyName}`}
      existingInquiryId={null}
      prefill={null}
      onStartInquiry={startGuestChatInquiry}
      onSendMessage={sendGuestMessageAction}
      fetchMessages={getGuestThreadMessages}
      onAddClaimEmail={sendGuestClaimToEmail}
      openFullHref={null}
    />
  );
}
