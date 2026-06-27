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
import { surfaceModeFromBackgroundMode } from "@/app/t/[profileCode]/_chat/mini-chat-styles";
import { resolveLauncherLifecycleInputs } from "@/app/t/[profileCode]/_chat/launcher-lifecycle-inputs";
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
import {
  captureGuestChip,
  getGuestInquiryDetails,
} from "@/app/t/[profileCode]/_actions/guest-detail-chips-actions";
import {
  listGuestTenantRoster,
  resolveGuestCartPortraits,
} from "@/app/t/[profileCode]/_actions/guest-roster-actions";
import { ensureGuestChatInquiry } from "@/app/t/[profileCode]/_actions/guest-chat-actions";
import { getPublicHostContext } from "@/lib/saas/scope";
import { getPlatformHubTenant } from "@/lib/saas/platform-hub";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadPublicBranding, loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { loadGuestChatSettings } from "@/lib/inquiry/guest-chat-settings";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";

/**
 * Resolve agencies.slug from a tenant id (service-role read). The hub arm of
 * PublicHostContext carries no slug, but the guest chat actions are all
 * slug-based, so we look it up here. Returns null when unavailable (the caller
 * then null-guards and renders nothing rather than a dead launcher).
 */
async function resolveTenantSlugById(tenantId: string): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data } = await admin
    .from("agencies")
    .select("slug")
    .eq("id", tenantId)
    .maybeSingle();
  return (data?.slug as string | null) ?? null;
}

type AgencyChatLauncherMountProps = {
  /** Attribution page for source_context (e.g. "/" or "/directory"). */
  sourcePage?: string;
};

export async function AgencyChatLauncherMount({
  sourcePage = "/",
}: AgencyChatLauncherMountProps) {
  const ctx = await getPublicHostContext();
  // Resolve the request locale so the client panel renders in the page language
  // (the talent mount passes brand.locale; the agency mount must too, or the
  // panel falls back to English on a localized directory).
  const locale = await getRequestLocale();
  const t = createTranslator(locale);

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
    // not, so resolve it from the tenant id (agencies.slug) the same way the
    // marketing/app branch gets a real slug from getPlatformHubTenant. Every
    // slug-based guest action (resolveTenantIdBySlug, ensureGuestChatInquiry,
    // roster/portrait reads) needs a real slug, so a hub launcher with an empty
    // slug renders dead. Fall back to the null-guard below when it can't resolve.
    if ("tenantSlug" in ctx && ctx.tenantSlug) {
      tenantSlug = ctx.tenantSlug;
    } else {
      tenantSlug = (await resolveTenantSlugById(tenantId)) ?? "";
    }
  } else if (ctx.kind === "marketing" || ctx.kind === "app") {
    const hub = await getPlatformHubTenant();
    if (!hub) return null;
    tenantId = hub.tenantId;
    tenantSlug = hub.slug;
    fallbackName = hub.displayName;
  } else {
    return null;
  }

  // Null-guard: every guest action behind this launcher is slug-based, so an
  // empty slug yields a non-functional launcher. Never render a dead one.
  if (!tenantSlug.trim()) return null;

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
  // Jon 360 Phase 7 — derive the dark/light chat surface from the tenant's
  // published `background.mode` token (theme_json holds it directly). A noir
  // directory then gets a dark chat surface instead of a white floating card.
  const backgroundMode =
    typeof theme["background.mode"] === "string"
      ? (theme["background.mode"] as string)
      : null;

  // Phase 3 — talent-less launcher: no resume anchor, so auto-anchor on the
  // guest's most-recent live inquiry on this tenant for the sent/replied label.
  const lifecycle = await resolveLauncherLifecycleInputs({
    tenantSlug,
    activeInquiryId: null,
    autoAnchorLatest: true,
  });

  return (
    <TalentProfileChatLauncher
      tenantSlug={tenantSlug}
      tenantId={tenantId}
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
        locale,
      }}
      label={t("public.guestChat.bookNow")}
      existingInquiryId={null}
      prefill={null}
      onStartInquiry={startGuestChatInquiry}
      onSendMessage={sendGuestMessageAction}
      fetchMessages={getGuestThreadMessages}
      onAddClaimEmail={sendGuestClaimToEmail}
      onCheckClaimEmail={checkGuestClaimEmail}
      onListGuestInquiries={listGuestInquiries}
      onCaptureChip={captureGuestChip}
      onEnsureInquiry={ensureGuestChatInquiry}
      onLoadDetails={getGuestInquiryDetails}
      onListRoster={listGuestTenantRoster}
      onResolveCartPortraits={resolveGuestCartPortraits}
      soundOnReply
      openFullHref={null}
      surfaceMode={surfaceModeFromBackgroundMode(backgroundMode)}
      activePhase={lifecycle.activePhase}
      activeStatus={lifecycle.activeStatus}
      coordinatorId={lifecycle.coordinatorId}
      lastMessageRole={lifecycle.lastMessageRole}
      lastActivityAt={lifecycle.lastActivityAt}
      hasActiveDraft={lifecycle.hasActiveDraft}
      draftInquiryId={lifecycle.draftInquiryId}
      otherOpenInquiries={lifecycle.otherOpenInquiries}
      ctaIdentity="guest"
    />
  );
}
