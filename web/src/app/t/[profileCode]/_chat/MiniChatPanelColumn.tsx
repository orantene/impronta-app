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

import { ClaimEmailRecap } from "./ClaimEmailRecap";
import { ConversationStatusStrip } from "./ConversationStatusStrip";
import { DashboardInquiriesLink } from "./DashboardInquiriesLink";
import { DraftPrivacyBanner } from "./DraftPrivacyBanner";
import { GuestAccountToolkit } from "./GuestAccountToolkit";
import { GuestDetailChips } from "./GuestDetailChips";
import { InquiryDetailsRail } from "./InquiryDetailsRail";
import { GuestPanelHeader } from "./GuestPanelHeader";
import { GuestPanelHeaderExtras } from "./GuestPanelHeaderExtras";
import { InquiryReceiptCard } from "./InquiryReceiptCard";
import { MiniChatComposer } from "./MiniChatComposer";
import { MiniChatGateForm } from "./MiniChatGateForm";
import { MiniChatMessageBubble } from "./MiniChatMessageBubble";
import { NewMessagePulse } from "./NewMessagePulse";
import { OpenFullConversationLink } from "./OpenFullConversationLink";
import { SendToAgencyBar } from "./SendToAgencyBar";
import { SentAirlock } from "./SentAirlock";
import { TrustGateNudge } from "./TrustGateNudge";
import {
  EMAIL_RE,
  FONT_DISPLAY,
  firstNameOf,
  paletteFor,
  type SurfaceMode,
} from "./mini-chat-styles";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 — gate lineup recap
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the quiet contact-gate recap line anchoring the value of the ask, e.g.
 * "We will use this to send you {agency} reply about {Jane, +2}". Lists the
 * lineup talent FIRST names with a +N overflow (max two named, then +remaining).
 * Returns null when the lineup is empty so the gate renders without a recap.
 */
function buildGateLineupRecap(
  cartTalentNames: string[],
  agencyName: string,
  t: (key: string) => string,
): string | null {
  const names = cartTalentNames
    .map((n) => firstNameOf(n))
    .filter((n) => n.length > 0);
  if (names.length === 0) return null;

  const MAX_NAMED = 2;
  const namedList =
    names.length > MAX_NAMED
      ? interpolate(t("public.guestChat.gateRecapOverflow"), {
          names: names.slice(0, MAX_NAMED).join(", "),
          count: names.length - MAX_NAMED,
        })
      : names.join(", ");

  return interpolate(t("public.guestChat.gateRecapOne"), {
    agency: agencyName || t("public.guestChat.sectionTalent"),
    names: namedList,
  });
}

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
   * Finding #3: the panel-level sync state, folded into the DraftPrivacyBanner's
   * sub-line so failed Talent / Brief / Contact writes are visible while the
   * inquiry is a private draft (the rail editors close on submit).
   */
  syncState?: UnifiedSyncState;
  /** Re-run the last failed patch (the draft banner's retry action). */
  onRetrySync?: () => void;
  /**
   * Jon 360 Phase 1: the inquiry is a private draft (an early row exists but the
   * contact is not yet promoted, so nothing has reached the agency). Drives the
   * DraftPrivacyBanner, which subsumes the old SyncStatusBar save states.
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
  /** Client dashboard inbox link; set only for a signed-in client of this tenant. */
  dashboardHref?: string | null;
  onListGuestInquiries?: ListGuestInquiriesCallback | null;
  onToggleExpand?: () => void;
  identity: GuestIdentityTier;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
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
  dashboardHref = null,
  onListGuestInquiries,
  onToggleExpand,
  identity,
  textareaRef,
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

  // Addendum A details rail — the canonical synced "form view". ONE element,
  // mounted per mode: compact -> FLOATS over the conversation (collapsed icon
  // strip / expanded overlay) so it never stacks below the thread and pushes it
  // up; two-pane -> in-flow below the body (rendered further down).
  const detailsRail =
    !showGate && extrasEnabled && inquiryIntent ? (
      <InquiryDetailsRail
        intent={inquiryIntent}
        accent={accent}
        accentInk={accentInk}
        tenantSlug={tenantSlug}
        t={t}
        onListRoster={onListRoster}
        capturedValues={capturedChipValues}
        defaultCollapsed={!expanded}
        bounded={!expanded}
        floating={!expanded}
        surfaceMode={surfaceMode}
        openToSection={railOpenToSection}
        onConsumeOpenTo={onConsumeRailOpenTo}
        onPatchChip={(kind, value) => {
          if (onPatchChip) void onPatchChip(kind, value);
        }}
        onTalentChange={(ids, mode, names) => onTalentChange?.(ids, mode, names)}
        onBriefChange={(summary) => onBriefChange?.(summary)}
        onContactChange={(value) => onContactChange?.(value)}
      />
    ) : null;
  const compactRailFloating = !expanded && detailsRail !== null;

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
        t={t}
        onClose={onClose}
      />

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

      {/* ── Jon 360 Phase 1: draft-privacy banner (above the thread) ───────
          Shown only while the inquiry is a private draft (early row exists, not
          yet sent). Subsumes the old SyncStatusBar: the three save states fold
          into its sub-line. */}
      {isPrivateDraft && (
        <DraftPrivacyBanner
          agencyName={brand.agencyName}
          syncState={syncState}
          t={t}
          onRetry={onRetrySync}
          surfaceMode={surfaceMode}
        />
      )}

      {/* ── Conversation area: floating details rail (compact) + body ────── */}
      <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", minWidth: 0 }}>
        {/* Compact: the rail floats over the conversation (collapsed left strip /
            expanded overlay) so it never stacks below + pushes the thread up. */}
        {compactRailFloating && detailsRail}
        <div
          ref={scrollRef}
          style={{
            // position:relative anchors the SENT airlock overlay to the body box.
            position: "relative",
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "14px 14px 6px",
            // Clear the floating left rail strip (48px) when it is present.
            paddingLeft: compactRailFloating ? 60 : 14,
            display: "flex",
            flexDirection: "column",
            gap: 9,
            background: C.surface,
          }}
        >
        {/* Jon 360 Phase 1: SENT airlock — non-blocking overlay on a real send. */}
        {showSentAirlock && (
          <SentAirlock
            agencyName={brand.agencyName}
            accent={accent}
            t={t}
            surfaceMode={surfaceMode}
          />
        )}

        <NewMessagePulse active={pulseActive} accent={accent} />

        {/* Jon 360 Phase 2: the SENT->RECEIVED receipt, pinned as the FIRST item
            of the now-shared thread. It replaces the assistant greeting opener
            once sent (the greeting is a pre-send affordance), and the server has
            already suppressed the thin auto-ack bubble in its favor. */}
        {receipt ? (
          <InquiryReceiptCard
            receipt={receipt}
            agencyName={brand.agencyName}
            accent={accent}
            t={t}
            locale={brand.locale ?? "en"}
            surfaceMode={surfaceMode}
          />
        ) : (
          <div
            style={{
              alignSelf: "flex-start",
              maxWidth: "88%",
              background: C.surfaceCool,
              color: C.ink,
              borderRadius: "14px 14px 14px 4px",
              padding: "11px 14px",
              // Jon 360 Phase 7 — the greeting is agency identity copy, so it
              // takes the editorial serif (display axis); subsequent thread
              // bubbles stay system-sans.
              fontFamily: FONT_DISPLAY,
              fontSize: 14.5,
              lineHeight: 1.5,
            }}
          >
            {/* Talent-pick-first lead (empty cart, plan §B.2): steer the visitor to
                pick specific talent OR let the agency recommend. The Talent section
                auto-opens below (railOpenToSection="talent"), exposing the roster
                search + "Let the agency recommend". Otherwise the normal opener. */}
            {talentPickFirst
              ? t("public.guestChat.greetingTalentPickFirst")
              : brand.greeting?.trim()
                ? brand.greeting.trim()
                : interpolate(t("public.guestChat.greetingDefault"), {
                    name: talentFirst,
                  })}
          </div>
        )}

        {rows.map((m) => (
          <MiniChatMessageBubble
            key={m.id}
            m={m}
            accent={accent}
            locale={brand.locale ?? "en"}
            surfaceMode={surfaceMode}
          />
        ))}

        {limitNudge && limitNudge.tier !== "account" && (
          <TrustGateNudge
            tier={limitNudge.tier}
            activeCount={limitNudge.activeCount}
            limit={limitNudge.limit}
            accent={accent}
            accentInk={accentInk}
            surfaceMode={surfaceMode}
            canVerify={
              Boolean(onAddClaimEmail) &&
              Boolean(inquiryId) &&
              Boolean(guestContactEmail)
            }
            onVerifyEmail={() => {
              const addr = guestContactEmail;
              if (onAddClaimEmail && inquiryId && addr) {
                void onAddClaimEmail({ inquiryId, email: addr });
              }
            }}
          />
        )}

        {emailedTo && (
          <ClaimEmailRecap
            emailedTo={emailedTo}
            inquiryId={inquiryId}
            accent={accent}
            accentInk={accentInk}
            onAddClaimEmail={onAddClaimEmail}
            surfaceMode={surfaceMode}
          />
        )}

        {inquiryId && (
          <GuestAccountToolkit
            inquiryId={inquiryId}
            guestEmail={guestContactEmail}
            identity={
              guestContactEmail
                ? identity === "guest"
                  ? "identified"
                  : identity
                : identity
            }
            accent={accent}
            accentInk={accentInk}
            onAddClaimEmail={onAddClaimEmail}
            onCheckClaimEmail={onCheckClaimEmail}
            onGuestEmailUpdated={onGuestEmailUpdated}
            surfaceMode={surfaceMode}
            deemphasizeButton={
              threadStatus === "offer_pending" ||
              threadStatus === "approved" ||
              threadStatus === "booked"
            }
          />
        )}
        </div>
      </div>

      {/* ── Inline gate ─────────────────────────────────────────────────── */}
      {showGate && (
        <MiniChatGateForm
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

      {/* ── U4 / P1: detail chips ────────────────────────────────────────── */}
      {/* Unified path (onPatchChip): chips are live even BEFORE an inquiryId so
          the first Date/Location commit lazily creates the early-partial row.
          Legacy path: chips only after an inquiry exists + a direct capture.
          Finding #1: when extrasEnabled the InquiryDetailsRail (below) is the
          SINGLE detail surface — it re-exposes the same 5 kinds with its own
          editor, so rendering the chip row too would duplicate every editor in a
          380px panel. Suppress the chips there; show them only as the compact
          quick-edit on the legacy (no-rail) path. */}
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
            // would 404 there; hide the escalation for guests. Addendum A: when the
            // unified rail (InquiryDetailsRail, below) is the canonical detail
            // surface (extrasEnabled), suppress the chip escalation too. Only the
            // legacy non-guest path keeps the deep-link to the full form.
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

      {/* ── Addendum A: inquiry-details rail. The compact panel floats it over
          the conversation (rendered above); the two-pane renders it in-flow
          here below the body. Same element, positioned per mode. ──────────── */}
      {expanded && detailsRail}

      {/* Sync status (finding #3) is now subsumed by the DraftPrivacyBanner above
          the thread, which folds the saving / saved / error states into its
          sub-line while the inquiry is a private draft. */}

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
          surfaceMode={surfaceMode}
          disabled={sending || inCooldown}
          sent={sentNote}
          typicalReply={typicalReply}
          onSend={onSendToAgency}
        />
      )}

      {/* Signed-in client only: quiet "See all your inquiries" link to the
          dashboard inbox. dashboardHref + "account" identity are resolved
          server-side at the mount, so this is inert for an anonymous guest. */}
      {identity === "account" && (
        <DashboardInquiriesLink
          dashboardHref={dashboardHref}
          label={t("public.guestChat.viewAllInquiries")}
          surfaceMode={surfaceMode}
        />
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
