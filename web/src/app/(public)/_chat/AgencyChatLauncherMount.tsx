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
  checkGuestClaimEmail,
  getGuestThreadMessages,
  sendGuestClaimToEmail,
  sendGuestMessageAction,
  startGuestChatInquiry,
} from "@/app/t/[profileCode]/_actions/guest-chat-actions";
// U2 thread switcher (scopes by tenant + cookie — "all my threads on this brand")
// + U4 detail chips (per-inquiry). Injected so the client bundle stays backend-free.
import { listGuestInquiries } from "@/app/t/[profileCode]/_actions/guest-inquiries-actions";
import { captureGuestChip } from "@/app/t/[profileCode]/_actions/guest-detail-chips-actions";
import { getPublicHostContext } from "@/lib/saas/scope";
import { getPlatformHubTenant } from "@/lib/saas/platform-hub";
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

  // Resolve the tenant that owns this chat:
  //  - agency / hub host → that tenant
  //  - marketing / app (the tulala.digital platform apex, which has no tenant
  //    of its own) → the in-house platform network hub, so visitors can
  //    "message the platform" and the inquiry lands in the hub's Messages.
  let tenantId: string;
  let tenantSlug: string;
  let fallbackName = "the agency";
  if ((ctx.kind === "agency" || ctx.kind === "hub") && ctx.tenantId) {
    tenantId = ctx.tenantId;
    // Only the agency arm of PublicHostContext carries a slug; the hub arm does
    // not. Narrow with `in` (default hub → "" — unchanged runtime behavior) so
    // the access type-checks. (Pre-existing tsc error from #260, surfaced here.)
    tenantSlug = "tenantSlug" in ctx ? ctx.tenantSlug ?? "" : "";
  } else if (ctx.kind === "marketing" || ctx.kind === "app") {
    const hub = await getPlatformHubTenant();
    if (!hub) return null;
    tenantId = hub.tenantId;
    tenantSlug = hub.slug;
    fallbackName = hub.displayName;
  } else {
    return null;
  }

  const settings = await loadGuestChatSettings(tenantId);
  if (!settings.enabled || !settings.showOnDirectory) return null;

  const [identity, branding] = await Promise.all([
    loadPublicIdentity(tenantId),
    loadPublicBranding(tenantId),
  ]);

  const agencyName = identity?.public_name?.trim() || fallbackName;
  const accentColor = branding?.primary_color ?? branding?.accent_color ?? null;
  const theme =
    typeof branding?.theme_json === "object" && branding.theme_json !== null
      ? (branding.theme_json as Record<string, unknown>)
      : {};
  const logoUrl = typeof theme.logo_url === "string" ? theme.logo_url : null;

  return (
    <TalentProfileChatLauncher
      tenantSlug={tenantSlug}
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
      onCheckClaimEmail={checkGuestClaimEmail}
      onListGuestInquiries={listGuestInquiries}
      onCaptureChip={captureGuestChip}
      soundOnReply
      openFullHref={null}
    />
  );
}
