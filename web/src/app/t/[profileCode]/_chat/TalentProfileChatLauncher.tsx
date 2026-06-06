"use client";

/**
 * TalentProfileChatLauncher — floating, brand-skinned chat launcher (Lane D / F1).
 *
 * Mounts as a sibling of TalentProfileInquireButton on /t/[profileCode]. It is
 * the acquisition skin: a floating "Message {Name}" pill (label overridable to
 * e.g. "Ask availability" via the `label` prop) that opens the MiniChatPanel
 * inline — no navigation, per strategy §3.1.
 *
 *   • Color comes from agency_branding (accentColor on brand) — NO hard-coded
 *     gold/rust (house rule). Falls back to a neutral ink token when null.
 *   • Owns the open/close state; the panel is controlled.
 *   • Imports NO backend module — the three server actions arrive as props and
 *     are forwarded straight to the panel (the security boundary, the guest
 *     cookie, is resolved server-side inside those actions).
 */

import { useEffect, useState } from "react";

import type { TalentChatLauncherProps } from "@/lib/inquiry/guest-chat-contract";

import { MiniChatPanel } from "./MiniChatPanel";
import { DEFAULT_ACCENT, firstNameOf, readableOn } from "./mini-chat-styles";

export function TalentProfileChatLauncher({
  tenantSlug,
  talentProfileId,
  talentProfileCode,
  sourcePage,
  brand,
  existingInquiryId = null,
  prefill = null,
  onStartInquiry,
  onSendMessage,
  fetchMessages,
  onAddClaimEmail = null,
  onListGuestInquiries = null,
  onCaptureChip = null,
  soundOnReply = true,
  identity = "guest",
  label,
  className,
  openFullHref = null,
}: TalentChatLauncherProps) {
  const [open, setOpen] = useState(false);
  // F4: expanded state — grows the panel into a 2-pane layout in-place.
  const [expanded, setExpanded] = useState(false);

  // Restore the open panel across a refresh (B1) so the conversation doesn't
  // appear to reset. sessionStorage is per-tab → a refresh restores; closing the
  // tab forgets. Only auto-restore when there's a LIVE thread to show — never
  // auto-open an empty intro chat, which would read as spammy (strategy §10).
  const openStateKey = `tulala_guestchat_open:${talentProfileId}`;
  useEffect(() => {
    if (!existingInquiryId) return;
    try {
      if (sessionStorage.getItem(openStateKey) === "1") setOpen(true);
    } catch {
      /* sessionStorage blocked (some privacy modes) — stay closed, no-op. */
    }
    // existingInquiryId + openStateKey are stable for a given mount, so this
    // restores once and never re-opens after the user manually closes.
  }, [existingInquiryId, openStateKey]);
  useEffect(() => {
    try {
      if (open) sessionStorage.setItem(openStateKey, "1");
      else sessionStorage.removeItem(openStateKey);
    } catch {
      /* ignore — persistence is best-effort. */
    }
  }, [open, openStateKey]);

  const accent = brand.accentColor ?? DEFAULT_ACCENT;
  const accentInk = readableOn(brand.accentColor);
  const talentFirst = firstNameOf(brand.talentDisplayName);
  const launcherLabel = label ?? `Message ${talentFirst}`;

  return (
    <>
      {/* Floating launcher pill. Bottom-right, above the panel's anchor. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={launcherLabel}
        aria-expanded={open}
        className={className}
        style={{
          position: "fixed",
          right: "max(16px, env(safe-area-inset-right))",
          bottom: "calc(20px + env(safe-area-inset-bottom))",
          zIndex: 95,
          display: "inline-flex",
          alignItems: "center",
          gap: 9,
          height: 52,
          padding: "0 20px 0 18px",
          borderRadius: 26,
          border: "none",
          background: accent,
          color: accentInk,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: 0.1,
          cursor: "pointer",
          boxShadow:
            "0 14px 34px -10px rgba(16,18,29,0.5), 0 4px 12px -4px rgba(16,18,29,0.3)",
          transition: "transform 140ms ease, box-shadow 140ms ease",
        }}
      >
        {open ? (
          <CloseGlyph color={accentInk} />
        ) : (
          <ChatGlyph color={accentInk} />
        )}
        <span>{open ? "Close" : launcherLabel}</span>
      </button>

      {/* Faint scrim behind the panel when expanded (non-blocking — aria-modal="false") */}
      {open && expanded && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 88,
            background: "rgba(16,18,29,0.18)",
            pointerEvents: "none",
          }}
        />
      )}

      <MiniChatPanel
        open={open}
        onClose={() => {
          setOpen(false);
          setExpanded(false);
        }}
        expanded={expanded}
        onToggleExpand={() => setExpanded((v) => !v)}
        tenantSlug={tenantSlug}
        talentProfileId={talentProfileId}
        talentProfileCode={talentProfileCode}
        sourcePage={sourcePage}
        brand={brand}
        existingInquiryId={existingInquiryId}
        prefill={prefill}
        onStartInquiry={onStartInquiry}
        onSendMessage={onSendMessage}
        fetchMessages={fetchMessages}
        onAddClaimEmail={onAddClaimEmail}
        onListGuestInquiries={onListGuestInquiries}
        onCaptureChip={onCaptureChip}
        soundOnReply={soundOnReply}
        identity={identity}
        openFullHref={openFullHref}
      />
    </>
  );
}

function ChatGlyph({ color }: { color: string }) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function CloseGlyph({ color }: { color: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
