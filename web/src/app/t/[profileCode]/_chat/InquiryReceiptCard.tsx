"use client";

/**
 * InquiryReceiptCard — the post-send trust receipt (Jon Inquiry 360, Phase 2:
 * the SENT->RECEIVED beat). Pinned as the FIRST item of the now-shared thread
 * once the inquiry is genuinely sent (status submitted/coordination AND contact
 * promoted). It upgrades the thin auto-ack bubble (which the server suppresses in
 * its favor) into an unmistakable "a real human has this, and here is what comes
 * next" moment.
 *
 * TIERED BY TRUTH — the card NEVER over-claims:
 *   • owningPartyCount > 1 (cross-agency GATE): a NEUTRAL card only. No single
 *     agency name, no coordinator face/name. "reached coordinators from N teams."
 *   • single agency, Tier 1 (coordinator + reply label): names the agency, shows
 *     the lineup faces, names the coordinator + a face + the honest reply time,
 *     the email line, the no-payment line.
 *   • single agency, Tier 2 (coordinator, no reply label): Tier 1 minus the reply
 *     time (NO fabricated time promise).
 *   • single agency, Tier 3 (no coordinator): "{agency} has your inquiry. We are
 *     assigning a coordinator now." No coordinator face/name, no time promise.
 *
 * House rules: tenant accent only (via accentText / the injected accent token,
 * never hardcoded gold), no em dashes, inline styles, reduced-motion-safe (the
 * appear animation is gated behind prefers-reduced-motion). Copy localized via
 * the injected `t`.
 */

import type { CSSProperties } from "react";
import { useState } from "react";

import { Check } from "lucide-react";

import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import type { InquiryReceiptData } from "@/lib/inquiry/guest-chat-contract";
import { C, FONT, accentText } from "./mini-chat-styles";
import {
  AVATAR_DIAMETER_DESKTOP,
  AVATAR_GROUND,
  FACE_OBJECT_POSITION,
  MAX_AVATARS_DESKTOP,
  initialsOf,
} from "./launcher-avatar-styles";

export type InquiryReceiptCardProps = {
  receipt: InquiryReceiptData;
  /** Brand display name — the single-agency fallback when receipt.agencyName null. */
  agencyName: string;
  /** Tenant accent (the pill/brand color). Glyphs derive a >=4.5:1 ink from it. */
  accent: string;
  /** Guest-locale translator (resolved from brand.locale). */
  t: Translator;
  /** BCP-47 locale for date/time formatting. */
  locale: string;
};

/** Locale-aware "Jun 26, 3:42 PM" style stamp. Empty string on a bad date. */
function formatReceivedAt(iso: string | null, locale: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(locale || undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function InquiryReceiptCard({
  receipt,
  agencyName,
  accent,
  t,
  locale,
}: InquiryReceiptCardProps) {
  const ink = accentText(accent, C.surfaceFaint);
  const stamp = formatReceivedAt(receipt.receivedAt, locale);
  const resolvedAgency = receipt.agencyName?.trim() || agencyName;
  const isCrossAgency = receipt.owningPartyCount > 1;

  return (
    <section
      aria-label={t("public.guestChat.receiptAria")}
      className="uic-receipt"
      style={wrapStyle}
    >
      <ReceiptAppearKeyframes />
      {/* Header: the received check + "Inquiry received, {stamp}". */}
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span
          aria-hidden
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: accent,
            color: accentText(accent),
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Check size={13} strokeWidth={3} />
        </span>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>
          {stamp
            ? interpolate(t("public.guestChat.receiptReceivedAt"), { when: stamp })
            : t("public.guestChat.receiptReceived")}
        </div>
      </div>

      {isCrossAgency ? (
        <CrossAgencyBody count={receipt.owningPartyCount} t={t} />
      ) : (
        <SingleAgencyBody
          receipt={receipt}
          agencyName={resolvedAgency}
          accent={accent}
          ink={ink}
          t={t}
        />
      )}

      {/* No-payment reassurance — every tier carries it. The single-agency
          variant names the agency as the channel; the neutral variant stays
          generic (no single agency named). */}
      <div style={noPaymentStyle}>
        {isCrossAgency
          ? t("public.guestChat.receiptNoPaymentNeutral")
          : interpolate(t("public.guestChat.receiptNoPayment"), {
              agency: resolvedAgency,
            })}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-agency GATE — neutral card. Never names a single agency or coordinator.
// ─────────────────────────────────────────────────────────────────────────────

function CrossAgencyBody({ count, t }: { count: number; t: Translator }) {
  return (
    <p style={bodyTextStyle}>
      {interpolate(t("public.guestChat.receiptCrossAgency"), { count })}
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Single-agency body — tiers on coordinator + typicalReplyLabel.
// ─────────────────────────────────────────────────────────────────────────────

function SingleAgencyBody({
  receipt,
  agencyName,
  accent,
  ink,
  t,
}: {
  receipt: InquiryReceiptData;
  agencyName: string;
  accent: string;
  ink: string;
  t: Translator;
}) {
  const { coordinator, typicalReplyLabel, contactEmail, lineup } = receipt;

  // "{agency} has your inquiry about {Talent A, Talent B, +N}".
  const lineupLabel = formatLineupLabel(lineup.map((f) => f.displayName), t);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {/* Agency + lineup line, with the face-stack. */}
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        {lineup.length > 0 && <LineupFaceStack lineup={lineup} ink={ink} t={t} />}
        <p style={{ ...bodyTextStyle, margin: 0, flex: 1, minWidth: 0 }}>
          {lineupLabel
            ? interpolate(t("public.guestChat.receiptHasInquiryAbout"), {
                agency: agencyName,
                lineup: lineupLabel,
              })
            : interpolate(t("public.guestChat.receiptHasInquiry"), {
                agency: agencyName,
              })}
        </p>
      </div>

      {coordinator ? (
        // Tier 1 / Tier 2 — a named coordinator (+ face).
        <div style={coordinatorRowStyle}>
          <CoordinatorFace coordinator={coordinator} accent={accent} ink={ink} />
          <p style={{ ...bodyTextStyle, margin: 0, flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 600, color: C.ink }}>
              {interpolate(t("public.guestChat.receiptCoordinator"), {
                name: coordinator.displayName,
              })}
            </span>
            {typicalReplyLabel ? (
              // Tier 1 — the honest reply time. Tier 2 omits this entirely.
              <>
                {" "}
                <span style={{ color: C.inkMuted }}>
                  {interpolate(t("public.guestChat.receiptTypicallyReplies"), {
                    when: typicalReplyLabel,
                  })}
                </span>
              </>
            ) : null}
          </p>
        </div>
      ) : (
        // Tier 3 — no coordinator seated yet. NO face, NO time promise.
        <p style={{ ...bodyTextStyle, margin: 0, color: C.inkMuted }}>
          {t("public.guestChat.receiptAssigning")}
        </p>
      )}

      {/* The "we will email you" line — only with a real (non-seed) address. */}
      {contactEmail ? (
        <p style={{ ...bodyTextStyle, margin: 0, color: C.inkMuted }}>
          {interpolate(t("public.guestChat.receiptEmailOnReply"), {
            email: contactEmail,
          })}
        </p>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Read-only lineup face-stack — visual parity with the launcher avatar cart
// (same geometry + face crop) but with NO X-remove control (the receipt is a
// record, not an editor).
// ─────────────────────────────────────────────────────────────────────────────

function LineupFaceStack({
  lineup,
  ink,
  t,
}: {
  lineup: InquiryReceiptData["lineup"];
  ink: string;
  t: Translator;
}) {
  const diameter = AVATAR_DIAMETER_DESKTOP;
  const overflow = lineup.length - MAX_AVATARS_DESKTOP;
  const hasOverflow = overflow > 0;
  const visible = hasOverflow
    ? lineup.slice(0, MAX_AVATARS_DESKTOP - 1)
    : lineup.slice(0, MAX_AVATARS_DESKTOP);
  // Newest-first reversal keeps the rightmost face fully exposed, like the rail.
  const ordered = [...visible].reverse();

  return (
    <ul
      role="list"
      aria-label={t("public.guestChat.receiptLineupAria")}
      style={{
        display: "flex",
        flexDirection: "row-reverse",
        alignItems: "center",
        listStyle: "none",
        margin: 0,
        padding: 0,
        flexShrink: 0,
      }}
    >
      {hasOverflow && (
        <li style={{ marginLeft: -10, zIndex: 0 }}>
          <span
            aria-label={interpolate(t("public.guestChat.receiptLineupMore"), {
              count: overflow,
            })}
            style={{
              ...faceBaseStyle(diameter),
              background: "#16181d",
              color: "#ffffff",
              font: "600 12px " + FONT,
            }}
          >
            +{overflow}
          </span>
        </li>
      )}
      {ordered.map((face, i) => (
        <li
          key={face.talentProfileId}
          style={{
            marginLeft: i === ordered.length - 1 ? 0 : -10,
            zIndex: ordered.length - i,
          }}
        >
          <Face face={face} diameter={diameter} ink={ink} />
        </li>
      ))}
    </ul>
  );
}

function Face({
  face,
  diameter,
  ink,
}: {
  face: InquiryReceiptData["lineup"][number];
  diameter: number;
  ink: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(face.portraitUrl) && !failed;
  return (
    <span
      style={{
        ...faceBaseStyle(diameter),
        background: showImage ? AVATAR_GROUND : C.surfaceCool,
        color: ink,
        font: "600 13px " + FONT,
      }}
    >
      {showImage ? (
        <img
          src={face.portraitUrl ?? undefined}
          alt={face.displayName}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: FACE_OBJECT_POSITION,
            display: "block",
          }}
        />
      ) : (
        initialsOf(face.displayName)
      )}
    </span>
  );
}

function CoordinatorFace({
  coordinator,
  accent,
  ink,
}: {
  coordinator: NonNullable<InquiryReceiptData["coordinator"]>;
  accent: string;
  ink: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(coordinator.avatarUrl) && !failed;
  return (
    <span
      aria-hidden
      style={{
        ...faceBaseStyle(28),
        background: showImage ? AVATAR_GROUND : `${accent}1f`,
        color: ink,
        font: "600 11px " + FONT,
      }}
    >
      {showImage ? (
        <img
          src={coordinator.avatarUrl ?? undefined}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: FACE_OBJECT_POSITION,
            display: "block",
          }}
        />
      ) : (
        initialsOf(coordinator.displayName)
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers + styles
// ─────────────────────────────────────────────────────────────────────────────

/** "Talent A, Talent B, +2" — names up to two, overflow as a +N suffix. */
function formatLineupLabel(names: string[], t: Translator): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length <= 2) return clean.join(", ");
  const shown = clean.slice(0, 2).join(", ");
  const overflow = clean.length - 2;
  return `${shown}, ${interpolate(t("public.guestChat.receiptLineupMore"), {
    count: overflow,
  })}`;
}

function faceBaseStyle(diameter: number): CSSProperties {
  return {
    width: diameter,
    height: diameter,
    borderRadius: "50%",
    overflow: "hidden",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1.5px solid #ffffff",
    boxShadow: "0 0 0 1px rgba(20,24,31,0.1)",
    flexShrink: 0,
  };
}

const wrapStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: "13px 14px",
  borderRadius: 14,
  border: `1px solid ${C.borderSoft}`,
  background: C.surfaceFaint,
  fontFamily: FONT,
  alignSelf: "stretch",
};

const bodyTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 12.5,
  lineHeight: 1.5,
  color: C.ink,
};

const coordinatorRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
};

const noPaymentStyle: CSSProperties = {
  fontSize: 11.5,
  lineHeight: 1.45,
  color: C.inkMuted,
  borderTop: `1px solid ${C.borderSoft}`,
  paddingTop: 9,
};

/** Reduced-motion-safe appear: a 180ms fade+rise, suppressed under the media query. */
function ReceiptAppearKeyframes() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html:
          "@keyframes uic-receipt-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}" +
          ".uic-receipt{animation:uic-receipt-in 180ms ease both}" +
          "@media (prefers-reduced-motion: reduce){.uic-receipt{animation:none}}",
      }}
    />
  );
}
