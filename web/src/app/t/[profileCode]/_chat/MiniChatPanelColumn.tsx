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
import { GuestAccountToolkit } from "./GuestAccountToolkit";
import { GuestDetailChips } from "./GuestDetailChips";
import { InquiryDetailsRail } from "./InquiryDetailsRail";
import { GuestPanelHeaderExtras } from "./GuestPanelHeaderExtras";
import { MiniChatComposer } from "./MiniChatComposer";
import { MiniChatGateForm } from "./MiniChatGateForm";
import { MiniChatMessageBubble } from "./MiniChatMessageBubble";
import { NewMessagePulse } from "./NewMessagePulse";
import { OpenFullConversationLink } from "./OpenFullConversationLink";
import { TrustGateNudge } from "./TrustGateNudge";
import {
  C,
  EMAIL_RE,
  FONT,
  statusCopy,
} from "./mini-chat-styles";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export type MiniChatPanelColumnProps = {
  // Brand + colors
  brand: MiniChatBrand;
  accent: string;
  accentInk: string;
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
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function MiniChatPanelColumn({
  brand,
  accent,
  accentInk,
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
  extrasEnabled = false,
  onListRoster = null,
  onTalentChange,
  onBriefChange,
  onContactChange,
  talentPickFirst = false,
  railOpenToSection = null,
  onConsumeRailOpenTo,
  inquiryIntent = null,
  prefill,
  openFullHref,
  onListGuestInquiries,
  onToggleExpand,
  identity,
  textareaRef,
}: MiniChatPanelColumnProps) {
  // Guest UI locale rides along on `brand` (resolved server-side from the
  // tenant's default_locale, since guests have no LOCALE_COOKIE).
  const t = createTranslator(brand.locale ?? "en");
  const gateReady = Boolean(firstName.trim()) && EMAIL_RE.test(email.trim());
  const guestContactEmail =
    (emailedTo ?? prefill?.email ?? email.trim()) || null;
  const showGate = stage === "gate";

  return (
    <>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 11,
          padding: "13px 14px",
          borderBottom: `1px solid ${C.borderSoft}`,
          background: C.surfaceFaint,
          flexShrink: 0,
        }}
      >
        <div
          aria-hidden
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            flexShrink: 0,
            background: brand.logoUrl
              ? `center / cover no-repeat url(${brand.logoUrl})`
              : accent,
            color: accentInk,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: 0.2,
          }}
        >
          {!brand.logoUrl && (talentFirst[0]?.toUpperCase() ?? "•")}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              color: C.ink,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {brand.agencyName}
          </div>
          <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 1 }}>
            {inquiryId
              ? statusCopy(threadStatus, t)
              : typicalReply
                ? interpolate(t("public.guestChat.typicallyReplies"), { when: typicalReply })
                : t("public.guestChat.leaveMessage")}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: C.inkMuted,
            cursor: "pointer",
            fontSize: 19,
            lineHeight: 1,
            flexShrink: 0,
            fontFamily: FONT,
          }}
        >
          ×
        </button>
      </div>

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
        />
      )}

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          // minHeight:0 lets the conversation body yield vertical room to the
          // bounded details rail (compact panel) instead of forcing the column
          // past its maxHeight and pushing the composer off-screen.
          minHeight: 0,
          overflowY: "auto",
          padding: "14px 14px 6px",
          display: "flex",
          flexDirection: "column",
          gap: 9,
          background: C.surface,
        }}
      >
        <NewMessagePulse active={pulseActive} accent={accent} />

        <div
          style={{
            alignSelf: "flex-start",
            maxWidth: "88%",
            background: C.surfaceCool,
            color: C.ink,
            borderRadius: "14px 14px 14px 4px",
            padding: "10px 13px",
            fontSize: 13.5,
            lineHeight: 1.5,
          }}
        >
          {/* Talent-pick-first lead (empty cart, plan §B.2): steer the visitor to
              pick specific talent OR let the agency recommend. The Talent section
              auto-opens below (railOpenToSection="talent"), exposing the roster
              search + "Let the agency recommend". Otherwise the normal opener. */}
          {talentPickFirst ? (
            <>
              Hi, I&rsquo;m here to help you find the right talent. Want someone
              specific, or should we recommend a fit?
            </>
          ) : brand.greeting?.trim() ? (
            brand.greeting.trim()
          ) : (
            <>
              Hi, I&rsquo;m {talentFirst}&rsquo;s booking assistant. What&rsquo;s the event?
              Tell me a little and I&rsquo;ll line up the right talent for you.
            </>
          )}
        </div>

        {rows.map((m) => (
          <MiniChatMessageBubble key={m.id} m={m} accent={accent} locale={brand.locale ?? "en"} />
        ))}

        {limitNudge && limitNudge.tier !== "account" && (
          <TrustGateNudge
            tier={limitNudge.tier}
            activeCount={limitNudge.activeCount}
            limit={limitNudge.limit}
            accent={accent}
            accentInk={accentInk}
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
            deemphasizeButton={
              threadStatus === "offer_pending" ||
              threadStatus === "approved" ||
              threadStatus === "booked"
            }
          />
        )}
      </div>

      {/* ── Inline gate ─────────────────────────────────────────────────── */}
      {showGate && (
        <MiniChatGateForm
          talentFirst={talentFirst}
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
          Quick human check required to continue. (Verification widget loads here.)
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
          {inCooldown ? ` Try again in ${cooldownSecs}s.` : ""}
        </div>
      )}

      {/* ── U4 / P1: detail chips ────────────────────────────────────────── */}
      {/* Unified path (onPatchChip): chips are live even BEFORE an inquiryId so
          the first Date/Location commit lazily creates the early-partial row.
          Legacy path: chips only after an inquiry exists + a direct capture. */}
      {!showGate && (onPatchChip || (inquiryId && onCaptureChip)) && (
        <GuestDetailChips
          inquiryId={inquiryId}
          alwaysShow={Boolean(onPatchChip)}
          accent={accent}
          accentInk={accentInk}
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
          onAddMoreDetails={() => {
            // Addendum A: the collapsible details sidebar (InquiryDetailsRail,
            // below) is now the canonical full-detail surface. The chip row stays
            // as a compact same-data fallback. When the unified path is unavailable
            // (legacy), keep the deep-link to the full form.
            if (extrasEnabled) return;
            window.open(
              `/${tenantSlug}/client/messages?new=1&talent=${talentProfileId}`,
              "_blank",
            );
          }}
        />
      )}

      {/* ── Addendum A: collapsible inquiry-details SIDEBAR ──────────────────
          The canonical "form view": a vertical list of every section (Type,
          Budget, Headcount, Date, Location, Talent, Brief, Contact) with
          filled-state checks derived from the live unified draft. Clicking a row
          opens that section's reusable editor; every commit routes through the
          SAME patch handlers as the chips, so there is one source of truth.
          Collapsed (icon-only rail) by default in the compact panel; expanded in
          the two-pane. SUPERSEDES the slide-up sheet + the old extras editors. */}
      {!showGate && extrasEnabled && inquiryIntent && (
        <InquiryDetailsRail
          intent={inquiryIntent}
          accent={accent}
          accentInk={accentInk}
          tenantSlug={tenantSlug}
          onListRoster={onListRoster}
          capturedValues={capturedChipValues}
          defaultCollapsed={!expanded}
          bounded={!expanded}
          openToSection={railOpenToSection}
          onConsumeOpenTo={onConsumeRailOpenTo}
          onPatchChip={(kind, value) => {
            if (onPatchChip) void onPatchChip(kind, value);
          }}
          onTalentChange={(ids, mode, names) => onTalentChange?.(ids, mode, names)}
          onBriefChange={(summary) => onBriefChange?.(summary)}
          onContactChange={(value) => onContactChange?.(value)}
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
          placeholder={inquiryId ? "Write a reply…" : "Type your message…"}
          sending={sending}
          inCooldown={inCooldown}
          sendDisabled={sendDisabled}
          accent={accent}
          accentInk={accentInk}
          textareaRef={textareaRef}
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
        />
      )}
    </>
  );
}
