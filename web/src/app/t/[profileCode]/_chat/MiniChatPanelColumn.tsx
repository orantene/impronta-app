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
  GuestChipInput,
  GuestChipKind,
  GuestIdentityTier,
  GuestThreadStatus,
  ListGuestInquiriesCallback,
  MiniChatBrand,
} from "@/lib/inquiry/guest-chat-contract";

import type { StreamRow } from "./MiniChatMessageBubble";

import { ClaimEmailRecap } from "./ClaimEmailRecap";
import { GuestAccountToolkit } from "./GuestAccountToolkit";
import { GuestDetailChips } from "./GuestDetailChips";
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
  STATUS_COPY,
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
  name: string;
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
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onHoneypotChange: (v: string) => void;
  onSubmit: () => void;
  onFirstSend: () => void;
  onAddClaimEmail: AddClaimEmailCallback | null;
  onSwitchInquiry: (id: string) => void;
  onCaptureChip: CaptureGuestChipCallback | null;
  onCapturedChipKind: (kind: GuestChipKind) => void;
  // Optional
  prefill?: { name?: string | null; email?: string | null; phone?: string | null } | null;
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
  name,
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
  onNameChange,
  onEmailChange,
  onHoneypotChange,
  onSubmit,
  onFirstSend,
  onAddClaimEmail,
  onSwitchInquiry,
  onCaptureChip,
  onCapturedChipKind,
  prefill,
  openFullHref,
  onListGuestInquiries,
  onToggleExpand,
  identity,
  textareaRef,
}: MiniChatPanelColumnProps) {
  const gateReady = Boolean(name.trim()) && EMAIL_RE.test(email.trim());
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
              ? STATUS_COPY[threadStatus]
              : typicalReply
                ? `Typically replies ${typicalReply}`
                : "Leave a message — the team replies by email"}
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
          {brand.greeting?.trim() ? (
            brand.greeting.trim()
          ) : (
            <>
              Hi — I&rsquo;m {talentFirst}&rsquo;s booking assistant. What&rsquo;s the event?
              Tell me a little and I&rsquo;ll get the right person to reply.
            </>
          )}
        </div>

        {rows.map((m) => (
          <MiniChatMessageBubble key={m.id} m={m} accent={accent} />
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
              Boolean(emailedTo ?? prefill?.email)
            }
            onVerifyEmail={() => {
              const addr = (emailedTo ?? prefill?.email ?? email).trim();
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
            guestEmail={emailedTo ?? prefill?.email ?? null}
            identity={emailedTo ? (identity === "guest" ? "identified" : identity) : identity}
            accent={accent}
            accentInk={accentInk}
            onAddClaimEmail={onAddClaimEmail}
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
          name={name}
          onNameChange={onNameChange}
          email={email}
          onEmailChange={onEmailChange}
          accent={accent}
          accentInk={accentInk}
          gateReady={gateReady}
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

      {/* ── U4: detail chips ─────────────────────────────────────────────── */}
      {!showGate && inquiryId && onCaptureChip && (
        <GuestDetailChips
          inquiryId={inquiryId}
          accent={accent}
          accentInk={accentInk}
          capturedKinds={capturedChipKinds}
          onCapture={async (input: GuestChipInput) => {
            const r = await onCaptureChip(input);
            if (r.ok) onCapturedChipKind(input.kind);
            return r;
          }}
          onAddMoreDetails={() => {
            window.open(
              `/${tenantSlug}/client/messages?new=1&talent=${talentProfileId}`,
              "_blank",
            );
          }}
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
