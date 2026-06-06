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

import { TalentProfileChatLauncher } from "./TalentProfileChatLauncher";
// Real Lane A server actions (the build stub was removed at integration). These
// match the contract callbacks 1:1, so they pass straight into the launcher.
import {
  getActiveGuestInquiry,
  getGuestThreadMessages,
  sendGuestClaimToEmail,
  sendGuestMessageAction,
  startGuestChatInquiry,
} from "@/app/t/[profileCode]/_actions/guest-chat-actions";
// U2 thread switcher + U4 detail chips — injected as callbacks so the client
// bundle imports no backend module.
import { listGuestInquiries } from "@/app/t/[profileCode]/_actions/guest-inquiries-actions";
import { captureGuestChip } from "@/app/t/[profileCode]/_actions/guest-detail-chips-actions";

type TalentProfileChatLauncherMountProps = {
  /** talent_profiles.id — the single talent the guest is messaging (MVP). */
  talentProfileId: string;
  /** Public profile code (source_context provenance). */
  talentProfileCode: string;
  /** Talent display name for the opener / launcher label. */
  talentDisplayName: string;
  /** Tenant slug for routing the start action; "" on non-agency surfaces. */
  tenantSlug: string;
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
};

export async function TalentProfileChatLauncherMount({
  talentProfileId,
  talentProfileCode,
  talentDisplayName,
  tenantSlug,
  agencyName,
  accentColor = null,
  logoUrl = null,
  sourcePage,
  openFullHref = null,
  greeting = null,
}: TalentProfileChatLauncherMountProps) {
  // Guest chat only makes sense on an agency surface (the thread is tenant-owned).
  if (!tenantSlug) return null;

  // Returning-guest resume (B1): reopen the live thread from the cookie instead
  // of starting fresh. Always { active } | failure; any failure → fresh start.
  const resume = await getActiveGuestInquiry({ tenantSlug, talentProfileId });
  const active = resume.ok ? resume.active : null;

  return (
    <TalentProfileChatLauncher
      tenantSlug={tenantSlug}
      talentProfileId={talentProfileId}
      talentProfileCode={talentProfileCode}
      sourcePage={sourcePage}
      brand={{
        agencyName,
        talentDisplayName,
        accentColor,
        logoUrl,
        greeting,
      }}
      // Returning guest → reopen the thread + prefill the gate (B1). null → fresh.
      existingInquiryId={active?.inquiryId ?? null}
      prefill={active?.prefill ?? null}
      onStartInquiry={startGuestChatInquiry}
      onSendMessage={sendGuestMessageAction}
      fetchMessages={getGuestThreadMessages}
      onAddClaimEmail={sendGuestClaimToEmail}
      onListGuestInquiries={listGuestInquiries}
      onCaptureChip={captureGuestChip}
      soundOnReply
      openFullHref={openFullHref}
    />
  );
}
