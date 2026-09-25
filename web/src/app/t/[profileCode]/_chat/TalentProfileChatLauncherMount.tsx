/**
 * TalentProfileChatLauncherMount — SERVER COMPONENT wiring seam (Lane D / F1).
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  This server component is the bridge that hands the REAL guest-chat server
 *  actions (Lane A) down into the client launcher as callback props — so the
 *  client bundle (TalentProfileChatLauncher / MiniChatPanel) imports NO backend
 *  module. The three actions come from:
 *
 *      @/app/t/[profileCode]/_actions/guest-chat-actions
 *        → startGuestChatInquiry   (OnStartInquiryCallback)
 *        → sendGuestMessageAction  (OnSendMessageCallback)
 *        → getGuestThreadMessages  (FetchMessagesCallback)
 *
 *  Their signatures match the contract callbacks 1:1.
 *
 *  Returning-guest resume (B1): `existingInquiryId` + `prefill` are resolved
 *  server-side from the x-impronta-guest cookie via getActiveGuestInquiry, so a
 *  refresh (or a fresh tab in the same session) reopens the live thread with the
 *  name/email gate pre-filled instead of restarting a brand-new chat. A cleared
 *  cookie / new device still recovers via the emailed magic link.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Branding is read on the page and passed in as plain props (agencyName +
 * accentColor from agency_branding), so this component stays a thin pass-through
 * and the panel imports nothing server-side. NO gold/rust accent is hard-coded
 * (house rule) — the accent is the tenant's own brand color or a neutral fallback.
 */

import { loadGuestDockFlags } from "@/lib/inquiry/guest-dock-flags";
import { TalentProfileChatLauncher } from "./TalentProfileChatLauncher";
import { categoryChipLabel } from "./category-chip-label";
import { guestDockServicePriceLabel } from "./guest-dock-service-price";
import { loadPublicOfferingsForProfile } from "@/lib/talent/offerings-public";
import { loadUsdRatesForSitePrices } from "@/lib/talent-site/server/vanity-usd-rates";
import type { GuestChatOffering } from "@/lib/inquiry/guest-chat-contract";
import { surfaceModeFromBackgroundMode } from "./mini-chat-styles";
import { createTranslator } from "@/i18n/messages";
import { isEditModeActiveForTenant } from "@/lib/site-admin/edit-mode/is-active";
import {
  resolveLauncherLifecycleInputs,
} from "./launcher-lifecycle-inputs";
// Real Lane A server actions (the build stub was removed at integration). These
// match the contract callbacks 1:1, so they pass straight into the launcher.
import {
  attachOfferingToGuestInquiry,
  getActiveGuestInquiry,
  getGuestThreadMessages,
  sendGuestClaimToEmail,
  sendGuestMessageAction,
  startGuestChatInquiry,
  checkGuestClaimEmail,
} from "@/app/t/[profileCode]/_actions/guest-chat-actions";
// U2 thread switcher + U4 detail chips — injected as callbacks so the client
// bundle imports no backend module.
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
import { scanGuestConversationForDetails } from "@/app/t/[profileCode]/_actions/guest-conversation-scan-action";
import { TalentOfferingIntentQuery } from "@/app/%5Ftalent-site/TalentOfferingIntentQuery";
import type { IndustryPresetId } from "@/lib/words/presets";

type TalentProfileChatLauncherMountProps = {
  /** talent_profiles.id — the single talent the guest is messaging (MVP). */
  talentProfileId: string;
  /** Public profile code (source_context provenance). */
  talentProfileCode: string;
  /** Talent display name for the opener / launcher label. */
  talentDisplayName: string;
  /** Tenant slug for routing the start action; "" on non-agency surfaces. */
  tenantSlug: string;
  /** Tenant uuid for the realtime channel filter (P1-T3 inbound reconcile). */
  tenantId?: string | null;
  /**
   * Talent-site hosts must not put a tenant id in the client bundle. The
   * server still uses `tenantId` for dock flags and the edit-mode gate.
   * Guest actions re-resolve the tenant from the host header.
   */
  exposeTenantToClient?: boolean;
  /** Agency display name for the header + opener. */
  agencyName: string;
  /** Brand accent color (agency_branding primary/accent). Null → neutral fallback. */
  accentColor?: string | null;
  /** Optional agency logo URL for the panel header. */
  logoUrl?: string | null;
  /** Source page for attribution (e.g. /t/TA-12345). */
  sourcePage: string;
  /** "Open full conversation ↗" target (inert/link-only for MVP). Null hides it. */
  openFullHref?: string | null;
  /** Optional custom opener from tenant_guest_chat_settings.greeting. */
  greeting?: string | null;
  /**
   * Guest UI locale — the public-profile locale already resolved on the page
   * (URL/tenant default; guests have no LOCALE_COOKIE). Threaded onto `brand` so
   * the panel's card/status labels render in the tenant's language.
   */
  locale?: string | null;
  /**
   * Jon 360 Phase 7 — the tenant's resolved `background.mode` token. The launcher
   * derives a dark/light chat surface from it so a noir tenant's chat stops
   * popping a white card on the dark page. Null/undefined → light (safe default).
   */
  backgroundMode?: string | null;
  /**
   * A words preset that replaces the tenant's for this dock only — the talent's
   * own trade on her own vanity host (D-MSG-430). Null keeps the tenant's, which
   * is what every agency surface wants. See `resolveTalentTradePreset`.
   */
  wordsPresetOverride?: IndustryPresetId | null;
  /**
   * Solo vanity host: omit the platform brand from guest-account copy so the
   * panel never names Tulala on her own site (front-door Ana step 1).
   */
  omitPlatformBrand?: boolean;
};

export async function TalentProfileChatLauncherMount({
  talentProfileId,
  talentProfileCode,
  talentDisplayName,
  tenantSlug,
  tenantId = null,
  exposeTenantToClient = true,
  agencyName,
  accentColor = null,
  logoUrl = null,
  sourcePage,
  openFullHref = null,
  greeting = null,
  locale = null,
  backgroundMode = null,
  wordsPresetOverride = null,
  omitPlatformBrand = false,
}: TalentProfileChatLauncherMountProps) {
  // Guest chat only makes sense on an agency surface (the thread is tenant-owned).
  if (!tenantSlug) return null;

  // P2 chrome hygiene — defense-in-depth mirror of AgencyChatLauncherMount's
  // edit-mode gate. EditChromeMount currently never mounts on `/t/` profile
  // paths (see NON_STOREFRONT_PREFIXES in edit-chrome-mount.tsx), so this is
  // a no-op today, but the launcher shouldn't rely on that exclusion staying
  // true forever — the tenant-scoped edit cookie is the single source of
  // truth for "the builder canvas is active", so check it here too.
  if (tenantId && (await isEditModeActiveForTenant(tenantId))) return null;

  const t = createTranslator(locale ?? "en");
  // L13: the tenant-wide dock switches + the per-business Items label.
  const dockFlags = await loadGuestDockFlags(tenantId, locale, wordsPresetOverride);

  // Returning-guest resume (B1): reopen the live thread from the cookie instead
  // of starting fresh. Always { active } | failure; any failure → fresh start.
  const resume = await getActiveGuestInquiry({ tenantSlug, talentProfileId });
  const active = resume.ok ? resume.active : null;

  // Phase 3 — resolve the resolver-driven label's lifecycle inputs server-side
  // (phase / coordinator / last-message-role / other-open) from the same guest
  // actions, so the client launcher stays backend-free.
  const lifecycle = await resolveLauncherLifecycleInputs({
    tenantSlug,
    activeInquiryId: active?.inquiryId ?? null,
  });

  // W2-B — the talent's published services as in-chat request chips. Talents
  // with none get a single "Custom quote" default so EVERY talent is
  // requestable from the chat.
  const publicOfferings = await loadPublicOfferingsForProfile(talentProfileId, locale ?? "en");
  const usdRates = await loadUsdRatesForSitePrices(publicOfferings);
  const chatOfferings: GuestChatOffering[] =
    publicOfferings.length > 0
      ? publicOfferings.slice(0, 8).map((o) => ({
          offeringId: o.id,
          // Talent-profile public load always returns talent-owned rows; fall
          // back to the mount's profile id if a row somehow lacks one.
          talentProfileId: o.talentProfileId ?? talentProfileId,
          title: o.title,
          kind: o.kind,
          priceType: o.priceType,
          amountCents: o.visibility === "on_request" ? null : o.amountCents,
          currency: o.currency,
          durationMinutes: o.durationMinutes,
          allowPayInPerson: o.allowPayInPerson,
          reserveMode: o.reserveMode,
          depositPct: o.depositPct,
          imageUrl: o.imageUrls[0] ?? null,
        }))
      : [
          {
            offeringId: "default-custom-quote",
            talentProfileId,
            title: t("public.guestChat.customQuoteChip"),
            kind: "service",
            priceType: "custom",
            amountCents: null,
            currency: "USD",
            durationMinutes: null,
            allowPayInPerson: false,
            reserveMode: "full",
            depositPct: null,
            imageUrl: null,
          },
        ];

  return (
    <>
    <TalentOfferingIntentQuery />
    <TalentProfileChatLauncher
      tenantSlug={tenantSlug}
      tenantId={exposeTenantToClient ? tenantId : null}
      talentProfileId={talentProfileId}
      talentProfileCode={talentProfileCode}
      sourcePage={sourcePage}
      brand={{
        ...dockFlags,
        dockServiceMenu: publicOfferings
          .map((o) => {
            const category = categoryChipLabel(o.category);
            if (!category) return null;
            const amountCents = o.visibility === "on_request" ? null : o.amountCents;
            return {
              title: o.title,
              category,
              amountCents,
              currency: o.currency,
              priceLabel: guestDockServicePriceLabel(
                amountCents,
                o.currency,
                usdRates,
                locale ?? "en",
              ),
            };
          })
          .filter((o): o is NonNullable<typeof o> => o != null),
        agencyName,
        talentDisplayName,
        accentColor,
        logoUrl,
        greeting,
        locale,
        omitPlatformBrand,
      }}
      label={t("public.guestChat.bookNow")}
      // Returning guest → reopen the thread + prefill the gate (B1). null → fresh.
      existingInquiryId={active?.inquiryId ?? null}
      existingContactPromoted={active?.contactPromoted ?? null}
      prefill={active?.prefill ?? null}
      offerings={chatOfferings}
      onAttachOffering={attachOfferingToGuestInquiry}
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
      onScanConversation={scanGuestConversationForDetails}
      soundOnReply
      openFullHref={openFullHref}
      surfaceMode={surfaceModeFromBackgroundMode(backgroundMode)}
      activePhase={lifecycle.activePhase}
      activeStatus={lifecycle.activeStatus}
      coordinatorId={lifecycle.coordinatorId}
      lastMessageRole={lifecycle.lastMessageRole}
      lastActivityAt={lifecycle.lastActivityAt}
      hasActiveDraft={lifecycle.hasActiveDraft}
      draftInquiryId={lifecycle.draftInquiryId}
      otherOpenInquiries={lifecycle.otherOpenInquiries}
      unreadCoordinatorReply={lifecycle.unreadCoordinatorReply}
      ctaIdentity="guest"
    />
    </>
  );
}
