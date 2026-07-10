"use client";

/**
 * MiniChatPanelColumn — the full vertical thread column for MiniChatPanel (Lane C / F4).
 *
 * Extracted from MiniChatPanel.tsx to keep that file under the 800-line hard cap.
 * Renders the header, optional mini-mode thread switcher, scrollable body,
 * gate form, error line, chips, composer, and footer CTA — everything between
 * the outer container div and the ExpandedChatLayout 2-pane shell.
 *
 * In mini mode, MiniChatPanel wraps this in its own fixed-position div.
 * In expanded mode, ExpandedChatLayout passes this as the `right` pane.
 */

import type { RefObject } from "react";

import type {
  AddClaimEmailCallback,
  CaptureGuestChipCallback,
  CheckGuestClaimEmailCallback,
  GuestChipInput,
  GuestChipKind,
  GuestChipValue,
  GuestIdentityTier,
  GuestInquirySummary,
  GuestThreadStatus,
  InquiryReceiptData,
  ListGuestInquiriesCallback,
  ListGuestTenantRosterCallback,
  MiniChatBrand,
} from "@/lib/inquiry/guest-chat-contract";
import type { UnifiedSyncState } from "./use-unified-inquiry";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";

import type { StreamRow } from "./MiniChatMessageBubble";

import { ConversationStatusStrip } from "./ConversationStatusStrip";
import { GuestConversationBody } from "./GuestConversationBody";
import { GuestDockLineupView } from "./GuestDockLineupView";
import { GuestDockProjectsView } from "./GuestDockProjectsView";
import { GuestDockViewSwitcher } from "./GuestDockViewSwitcher";
import type { GuestDockView } from "./guest-dock-view";
import { GuestDetailChips } from "./GuestDetailChips";
import { GuestDetailChipRow } from "./GuestDetailChipRow";
import { GuestPanelHeader } from "./GuestPanelHeader";
import { GuestPanelHeaderExtras } from "./GuestPanelHeaderExtras";
import { MiniChatComposer } from "./MiniChatComposer";
import { MiniChatGateForm } from "./MiniChatGateForm";
import { OfferingQuickPicker, type ChatOffering } from "./OfferingQuickPicker";
import { OpenFullConversationLink } from "./OpenFullConversationLink";
import { SendToAgencyBar } from "./SendToAgencyBar";
import { buildGateLineupRecap } from "./guest-gate-lineup-recap";
import {
  EMAIL_RE,
  paletteFor,
  type SurfaceMode,
} from "./mini-chat-styles";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export type MiniChatPanelColumnProps = {
  // Brand + colors
  brand: MiniChatBrand;
  accent: string;
  accentInk: string;
  /** Jon 360 Phase 7 — dark surface variant for noir tenants. Default "light". */
  surfaceMode?: SurfaceMode;
  talentFirst: string;
  // Context
  tenantSlug: string;
  talentProfileId: string;
  open: boolean;
  expanded: boolean;
  // Thread state (read-only; mutations via callbacks)
  inquiryId: string | null;
  rows: StreamRow[];
  scrollRef: RefObject<HTMLDivElement | null>;
  stage: "intro" | "gate" | "thread";
  threadStatus: GuestThreadStatus;
  typicalReply: string | null;
  /**
   * Jon 360 Phase 2 — the post-send SENT->RECEIVED receipt. Non-null only once
   * the inquiry is genuinely sent; drives the pinned InquiryReceiptCard + the
   * humanized coordinator header. Null pre-send.
   */
  receipt?: InquiryReceiptData | null;
  emailedTo: string | null;
  seenAtByInquiry: Record<string, string>;
  pulseActive: boolean;
  limitNudge: {
    tier: GuestIdentityTier;
    activeCount: number;
    limit: number;
  } | null;
  capturedChipKinds: GuestChipKind[];
  // Composer state
  draft: string;
  firstName: string;
  lastName: string;
  email: string;
  honeypot: string;
  sending: boolean;
  error: string | null;
  inCooldown: boolean;
  cooldownSecs: number;
  sendDisabled: boolean;
  captchaRequired: boolean;
  // Callbacks (UI → parent)
  onClose: () => void;
  onDraftChange: (v: string) => void;
  onFirstNameChange: (v: string) => void;
  onLastNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onHoneypotChange: (v: string) => void;
  onSubmit: () => void;
  onFirstSend: () => void;
  gateEmailNotice?: string | null;
  gateEmailBlocksSubmit?: boolean;
  onAddClaimEmail: AddClaimEmailCallback | null;
  onCheckClaimEmail?: CheckGuestClaimEmailCallback | null;
  onGuestEmailUpdated?: (email: string) => void;
  onSwitchInquiry: (id: string) => void;
  onCaptureChip: CaptureGuestChipCallback | null;
  onCapturedChipKind: (kind: GuestChipKind) => void;
  /**
   * P1-T1/T2: route a chip edit through useUnifiedInquiry.patch (lazily creates
   * the early row, writes via captureGuestChip, tracks sync state). When set this
   * supersedes the direct onCaptureChip path for chip edits.
   */
  onPatchChip?: ((kind: GuestChipKind, value: GuestChipValue) => Promise<void>) | null;
  /** Per-kind captured chip values (re-edit pre-fill + reconcile display). */
  capturedChipValues?: Partial<Record<GuestChipKind, GuestChipValue>>;
  /** Per-kind sync status for the field-level micro-status (B.4). */
  chipFieldState?: Record<string, UnifiedSyncState>;
  /** Kinds a remote edit just changed, for the accent flash (P1-T3). */
  chipRemoteFlashKinds?: GuestChipKind[];
  /**
   * Finding #3: the panel-level sync state, folded into the header draft lock
   * chip's sub-text so failed writes are visible while the inquiry is a private
   * draft (Wave 1 subsumed the old DraftPrivacyBanner band into the header).
   */
  syncState?: UnifiedSyncState;
  /** Re-run the last failed patch (the draft lock chip's retry action). */
  onRetrySync?: () => void;
  /**
   * Jon 360 Phase 1: the inquiry is a private draft (an early row exists but the
   * contact is not yet promoted, so nothing has reached the agency). Drives the
   * header draft lock chip (Wave 1; formerly the DraftPrivacyBanner band).
   */
  inquiryRecordExists?: boolean;
  /** Whether the inquiry's contact has been promoted (real send happened). */
  contactPromoted?: boolean;
  /** Play the SENT airlock overlay (a real send just succeeded). */
  showSentAirlock?: boolean;
  /**
   * Finding #2: the explicit "Send to agency" submit. Forces the ContactCard gate
   * when contact is still the placeholder seed, then confirms via `sentNote`.
   */
  onSendToAgency?: () => void;
  /** Whether to show the post-send success confirmation note. */
  sentNote?: boolean;
  // ── Phase 2: Talent / Brief / Contact "Add more details" expansion ──────────
  /** When true the "Add more details" button toggles the extras editors. */
  extrasEnabled?: boolean;
  /** Whether the extras editors are currently expanded. */
  extrasOpen?: boolean;
  /** Toggle the extras expansion. */
  onToggleExtras?: () => void;
  /** Injected guest-safe roster loader for the in-chat talent picker. */
  onListRoster?: ListGuestTenantRosterCallback | null;
  /** Current selected talent ids (from the unified draft). */
  selectedTalentIds?: string[];
  /**
   * Phase 6 — live cart talent display names, used only for the gate recap line
   * ("...send you {agency} reply about {Jane, +2}"). Aligned with the cart, so it
   * reflects the exact lineup the contact ask is anchoring.
   */
  cartTalentNames?: string[];
  /** Current brief summary (from the unified draft). */
  briefSummary?: string | null;
  /** Current contact values (from the unified draft). */
  contactValues?: { name: string | null; email: string | null; phone: string | null };
  /**
   * Addendum A: the full live unified draft. Drives the collapsible details
   * sidebar's filled-state. When present (extras enabled) the rail renders as the
   * primary details affordance.
   */
  inquiryIntent?: InquiryIntent | null;
  /** Commit a new talent selection through useUnifiedInquiry.patch. */
  onTalentChange?: (
    selectedIds: string[],
    selectionMode: "i_know_who" | "agency_recommends",
    selectedNames: string[],
  ) => void;
  /** Commit a brief edit through useUnifiedInquiry.patch. */
  onBriefChange?: (summary: string) => void;
  /** Commit a contact edit through useUnifiedInquiry.patch. */
  onContactChange?: (value: { name: string; email: string; phone: string }) => void;
  /**
   * Phase 3: the cart is empty, so lead with the talent-pick step (greeting +
   * auto-opened Talent section). Drives the empty-state copy + auto-expand.
   */
  talentPickFirst?: boolean;
  /**
   * Phase 3 one-shot: open the details rail to a specific section (the +N chip /
   * a rail avatar deep-links to "talent"; the empty cart leads with "talent").
   */
  railOpenToSection?: "talent" | null;
  /** Clear the railOpenToSection one-shot once applied. */
  onConsumeRailOpenTo?: () => void;
  // Optional
  prefill?: {
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  openFullHref?: string | null;
  onListGuestInquiries?: ListGuestInquiriesCallback | null;
  onToggleExpand?: () => void;
  identity: GuestIdentityTier;
  /**
   * P0-5 / W0-F — hub host (platform/network hub or marketing apex). Drives the
   * SendToAgencyBar copy so the send button + notes drop the agency framing.
   */
  isHub?: boolean;
  /**
   * W1-G: the talent's services, rendered as the OfferingQuickPicker strip ABOVE
   * the composer inside the column (moved in from MiniChatPanel's outer div, where
   * it was clipped below the rounded footer). Empty array hides the strip.
   */
  offerings?: ChatOffering[];
  /** Pick a service: prefill the composer + attach it to the inquiry. */
  onPickOffering?: (o: ChatOffering) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  // ── W2-A: the 3-view dock (Chat / Lineup / Projects) ───────────────────────
  /** Active dock view. "chat" (default) renders today's panel unchanged. */
  dockView?: GuestDockView;
  /** Switch the dock view. Absent → the switcher band never renders. */
  onDockViewChange?: (view: GuestDockView) => void;
  /** The guest's inquiries (useGuestInquiriesList) — the Projects view data. */
  inquiries?: GuestInquirySummary[];
  /** Source attribution for a Lineup-view "move to inquiry" add. */
  sourcePage?: string;
  /**
   * The launcher's unified remove path (cart flip + record patch + Undo) — the
   * Lineup view's per-tile remove routes through THIS, same as the rail X.
   */
  onRemoveCartTalent?: (talentProfileId: string) => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function MiniChatPanelColumn({
  brand,
  accent,
  accentInk,
  surfaceMode = "light",
  talentFirst,
  tenantSlug,
  talentProfileId,
  open,
  expanded,
  inquiryId,
  rows,
  scrollRef,
  stage,
  threadStatus,
  typicalReply,
  receipt = null,
  emailedTo,
  seenAtByInquiry,
  pulseActive,
  limitNudge,
  capturedChipKinds,
  draft,
  firstName,
  lastName,
  email,
  honeypot,
  sending,
  error,
  inCooldown,
  cooldownSecs,
  sendDisabled,
  captchaRequired,
  onClose,
  onDraftChange,
  onFirstNameChange,
  onLastNameChange,
  onEmailChange,
  onHoneypotChange,
  onSubmit,
  onFirstSend,
  gateEmailNotice = null,
  gateEmailBlocksSubmit = false,
  onAddClaimEmail,
  onCheckClaimEmail,
  onGuestEmailUpdated,
  onSwitchInquiry,
  onCaptureChip,
  onCapturedChipKind,
  onPatchChip = null,
  capturedChipValues = {},
  chipFieldState = {},
  chipRemoteFlashKinds = [],
  syncState = "idle",
  onRetrySync,
  inquiryRecordExists = false,
  contactPromoted = false,
  showSentAirlock = false,
  onSendToAgency,
  sentNote = false,
  extrasEnabled = false,
  onListRoster = null,
  onTalentChange,
  onBriefChange,
  onContactChange,
  talentPickFirst = false,
  cartTalentNames = [],
  railOpenToSection = null,
  onConsumeRailOpenTo,
  inquiryIntent = null,
  prefill,
  openFullHref,
  onListGuestInquiries,
  onToggleExpand,
  identity,
  isHub = false,
  offerings = [],
  onPickOffering,
  textareaRef,
  dockView = "chat",
  onDockViewChange,
  inquiries = [],
  sourcePage = "",
  onRemoveCartTalent,
}: MiniChatPanelColumnProps) {
  // Guest UI locale rides along on `brand` (resolved server-side from the
  // tenant's default_locale, since guests have no LOCALE_COOKIE).
  const t = createTranslator(brand.locale ?? "en");
  // Jon 360 Phase 7 — the active C palette. Light by default (byte-identical to
  // before); dark for noir tenants. Every `C.*` below resolves through this, so a
  // single binding flips the whole column's surface/ink/borders.
  const C = paletteFor(surfaceMode);
  const gateReady = Boolean(firstName.trim()) && EMAIL_RE.test(email.trim());
  const guestContactEmail =
    (emailedTo ?? prefill?.email ?? email.trim()) || null;
  const showGate = stage === "gate";
  // Jon 360 Phase 1: the inquiry is a private draft while its early row exists but
  // the contact is not yet promoted (nothing has reached the agency). Hidden at the
  // gate (the gate is its own moment) and once the airlock plays.
  const isPrivateDraft =
    extrasEnabled &&
    inquiryRecordExists &&
    !contactPromoted &&
    !showGate &&
    !showSentAirlock;

  // Wave 1 (W1-B): the InquiryDetailsRail is retired. Details are now a horizontal
  // chip row above the composer (GuestDetailChipRow, rendered in the composer band
  // below) in BOTH the compact panel and the expanded right pane, so the
  // conversation is the only vertical grower and nothing floats over the thread.
  const showChipRow = !showGate && extrasEnabled && inquiryIntent !== null;
  // The SendToAgencyBar is showing (an un-sent draft) whenever the parent supplies
  // onSendToAgency; the save-card must not co-render with it (P1-10).
  const sendBarActive = !showGate && extrasEnabled && Boolean(onSendToAgency);

  // W2-A: the 3-view dock. The switcher renders only on the unified path
  // (extrasEnabled) with a wired handler, and never at the gate (the gate is
  // its own moment). While Lineup/Projects is active, the whole chat band
  // stack below the header (thread rail, conversation, chips, composer, send
  // bar) is replaced by that view; Chat renders today's stack unchanged.
  const dockEnabled = extrasEnabled && !showGate && Boolean(onDockViewChange);
  const activeDockView: GuestDockView = dockEnabled ? dockView : "chat";

  return (
    <>
      {/* ── Header (extracted to GuestPanelHeader to hold the 800-line cap) ── */}
      <GuestPanelHeader
        brand={brand}
        accent={accent}
        accentInk={accentInk}
        talentFirst={talentFirst}
        C={C}
        surfaceMode={surfaceMode}
        inquiryId={inquiryId}
        threadStatus={threadStatus}
        typicalReply={typicalReply}
        receipt={receipt}
        isPrivateDraft={isPrivateDraft}
        syncState={syncState}
        onRetrySync={onRetrySync}
        t={t}
        onClose={onClose}
      />

      {/* ── W2-A: dock view switcher (Chat · Lineup · Projects) ──────────── */}
      {dockEnabled && (
        <GuestDockViewSwitcher
          active={activeDockView}
          onChange={(view) => onDockViewChange?.(view)}
          accent={accent}
          C={C}
          t={t}
          lineupCount={cartTalentNames.length}
          projectsCount={inquiries.length}
        />
      )}

      {/* ── W2-A: Lineup view — cart + saved favorites, two shelves, two
          stores (saved_talent vs client_favorites), unified VISUALLY only. ── */}
      {activeDockView === "lineup" && (
        <GuestDockLineupView
          accent={accent}
          accentInk={accentInk}
          surfaceMode={surfaceMode}
          t={t}
          sourcePage={sourcePage}
          onRemoveCartTalent={onRemoveCartTalent}
        />
      )}

      {/* ── W2-A: Projects view — the guest's inquiries as project cards.
          Selecting one reuses the existing thread-switch path + hops back to
          Chat. ───────────────────────────────────────────────────────────── */}
      {activeDockView === "projects" && (
        <GuestDockProjectsView
          inquiries={inquiries}
          activeInquiryId={inquiryId}
          seenAtByInquiry={seenAtByInquiry}
          accent={accent}
          agencyName={brand.agencyName}
          surfaceMode={surfaceMode}
          t={t}
          onSelect={(id) => {
            onSwitchInquiry(id);
            onDockViewChange?.("chat");
          }}
        />
      )}

      {activeDockView === "chat" && (
        <>
      {/* ── U2: thread switcher (mini mode only; expanded left pane replaces) ─ */}
      {!expanded && onListGuestInquiries && (
        <GuestPanelHeaderExtras
          open={open}
          tenantSlug={tenantSlug}
          activeInquiryId={inquiryId}
          accent={accent}
          accentInk={accentInk}
          seenAtByInquiry={seenAtByInquiry}
          onListGuestInquiries={onListGuestInquiries}
          onSelect={onSwitchInquiry}
          surfaceMode={surfaceMode}
          locale={brand.locale ?? "en"}
        />
      )}

      {/* ── Conversation area (the ONLY vertical grower). The old floating
          details rail is gone; details live in the chip row below the thread.
          The draft-privacy state is now a one-line lock chip in the header. ── */}
      <GuestConversationBody
        scrollRef={scrollRef}
        C={C}
        showSentAirlock={showSentAirlock}
        brand={brand}
        accent={accent}
        accentInk={accentInk}
        t={t}
        surfaceMode={surfaceMode}
        pulseActive={pulseActive}
        receipt={receipt}
        talentPickFirst={talentPickFirst}
        talentFirst={talentFirst}
        rows={rows}
        limitNudge={limitNudge}
        onAddClaimEmail={onAddClaimEmail}
        onCheckClaimEmail={onCheckClaimEmail}
        inquiryId={inquiryId}
        guestContactEmail={guestContactEmail}
        emailedTo={emailedTo}
        onGuestEmailUpdated={onGuestEmailUpdated}
        identity={identity}
        threadStatus={threadStatus}
        sendBarActive={sendBarActive}
      />

      {/* ── Inline gate ─────────────────────────────────────────────────── */}
      {showGate && (
        <MiniChatGateForm
          t={t}
          talentFirst={talentFirst}
          lineupRecap={buildGateLineupRecap(
            cartTalentNames,
            brand.agencyName,
            t,
          )}
          draft={draft}
          firstName={firstName}
          onFirstNameChange={onFirstNameChange}
          lastName={lastName}
          onLastNameChange={onLastNameChange}
          email={email}
          onEmailChange={onEmailChange}
          accent={accent}
          accentInk={accentInk}
          gateReady={gateReady}
          emailNotice={gateEmailNotice}
          emailBlocksSubmit={gateEmailBlocksSubmit}
          sending={sending}
          surfaceMode={surfaceMode}
          onSend={onFirstSend}
        />
      )}

      {/* ── Captcha slot ─────────────────────────────────────────────────── */}
      {captchaRequired && !showGate && (
        <div
          data-guest-chat-captcha-slot
          style={{
            padding: "9px 14px",
            borderTop: `1px solid ${C.borderSoft}`,
            background: C.surfaceFaint,
            fontSize: 11.5,
            color: C.inkMuted,
          }}
        >
          {t("public.guestChat.captchaNotice")}
        </div>
      )}

      {/* ── Error line ───────────────────────────────────────────────────── */}
      {error && !showGate && (
        <div
          role="alert"
          style={{
            padding: "7px 14px",
            fontSize: 11.5,
            color: C.danger,
            background: "rgba(161,58,58,0.06)",
          }}
        >
          {error}
          {inCooldown
            ? ` ${interpolate(t("public.guestChat.tryAgainIn"), { secs: cooldownSecs })}`
            : ""}
        </div>
      )}

      {/* ── U4 / P1: LEGACY detail chips (no unified inquiry) ─────────────── */}
      {/* Legacy path only (no onEnsureInquiry): chips after an inquiry exists +
          a direct capture. The unified (extrasEnabled) path uses GuestDetailChipRow
          below the conversation instead — the single detail surface. */}
      {!showGate && !extrasEnabled && (onPatchChip || (inquiryId && onCaptureChip)) && (
        <GuestDetailChips
          inquiryId={inquiryId}
          alwaysShow={Boolean(onPatchChip)}
          accent={accent}
          accentInk={accentInk}
          t={t}
          surfaceMode={surfaceMode}
          capturedKinds={capturedChipKinds}
          capturedValues={capturedChipValues}
          fieldState={chipFieldState}
          remoteFlashKinds={chipRemoteFlashKinds}
          onPatch={onPatchChip ?? undefined}
          onCapture={async (input: GuestChipInput) => {
            // Legacy direct-capture fallback (only reached when onPatchChip is
            // absent). The unified path uses onPatch above.
            if (!onCaptureChip) {
              return { ok: false as const, code: "engine_error" as const, message: "" };
            }
            const r = await onCaptureChip(input);
            if (r.ok) onCapturedChipKind(input.kind);
            return r;
          }}
          onAddMoreDetails={
            // #683: /client/messages requires an authenticated client, so a guest
            // would 404 there; hide the escalation for guests. When extrasEnabled
            // the GuestDetailChipRow is the canonical detail surface, so this
            // legacy chip block never renders there anyway; only the legacy
            // non-guest path keeps the deep-link to the full form.
            identity === "guest" || extrasEnabled
              ? undefined
              : () => {
                  window.open(
                    `/${tenantSlug}/client/messages?new=1&talent=${talentProfileId}`,
                    "_blank",
                  );
                }
          }
        />
      )}

      {/* Jon 360 CONVERSATION strip: "whose turn / what is next", above the
          composer; self-gates to the post-send window (see component). */}
      <ConversationStatusStrip
        threadStatus={threadStatus}
        receipt={receipt}
        agencyName={brand.agencyName}
        rows={rows}
        scrollRef={scrollRef}
        suppressed={showGate || showSentAirlock}
        accent={accent}
        t={t}
        surfaceMode={surfaceMode}
      />

      {/* ── W1-B: detail chip row (unified path). The single detail surface,
          above the composer in BOTH compact + expanded. Each chip opens its
          editor in a bottom sheet (GuestDetailBottomSheet). ──────────────── */}
      {showChipRow && inquiryIntent && (
        <GuestDetailChipRow
          intent={inquiryIntent}
          accent={accent}
          accentInk={accentInk}
          t={t}
          surfaceMode={surfaceMode}
          tenantSlug={tenantSlug}
          capturedValues={capturedChipValues}
          fieldState={chipFieldState}
          remoteFlashKinds={chipRemoteFlashKinds}
          onListRoster={onListRoster}
          onPatchChip={(kind, value) => {
            if (onPatchChip) void onPatchChip(kind, value);
          }}
          onTalentChange={onTalentChange}
          onBriefChange={onBriefChange}
          onContactChange={onContactChange}
          openToSection={railOpenToSection}
          onConsumeOpenTo={onConsumeRailOpenTo}
        />
      )}

      {/* ── W1-G: services strip, above the composer, inside the palette. ─── */}
      {!showGate && onPickOffering && offerings.length > 0 && (
        <OfferingQuickPicker
          offerings={offerings}
          locale={brand.locale ?? "en"}
          t={t}
          surfaceMode={surfaceMode}
          onPick={onPickOffering}
        />
      )}

      {/* ── Composer ─────────────────────────────────────────────────────── */}
      {!showGate && (
        <MiniChatComposer
          draft={draft}
          onDraftChange={onDraftChange}
          honeypot={honeypot}
          onHoneypotChange={onHoneypotChange}
          onSubmit={onSubmit}
          placeholder={
            inquiryId
              ? t("public.guestChat.composerReply")
              : t("public.guestChat.composerFirst")
          }
          sending={sending}
          inCooldown={inCooldown}
          sendDisabled={sendDisabled}
          accent={accent}
          accentInk={accentInk}
          surfaceMode={surfaceMode}
          textareaRef={textareaRef}
        />
      )}

      {/* ── Send to agency (finding #2): explicit submit + success note ───── */}
      {!showGate && extrasEnabled && onSendToAgency && (
        <SendToAgencyBar
          accent={accent}
          accentInk={accentInk}
          t={t}
          isHub={isHub}
          brandName={brand.agencyName}
          surfaceMode={surfaceMode}
          disabled={sending || inCooldown}
          sent={sentNote}
          typicalReply={typicalReply}
          onSend={onSendToAgency}
        />
      )}
        </>
      )}

      {/* ── Footer: expand/collapse (F4) or hard-nav fallback ────────────── */}
      {(inquiryId || openFullHref) && (
        <OpenFullConversationLink
          href={openFullHref ?? (inquiryId ? `/c/${inquiryId}` : undefined)}
          accent={accent}
          emphasize={
            threadStatus === "offer_pending" ||
            threadStatus === "approved" ||
            threadStatus === "booked"
          }
          onExpand={onToggleExpand}
          expanded={expanded}
          surfaceMode={surfaceMode}
        />
      )}
    </>
  );
}
