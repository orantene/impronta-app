"use client";

/**
 * InquiryReceiptCard — the post-send receipt, DOCK v2 compact form.
 *
 * The original Jon-360 receipt was a four-section card (title, agency line,
 * coordinator avatar block, email line, no-payment paragraph). Owner verdict:
 * "all this is so overwhelming". The receipt is now ONE calm bubble:
 *
 *   (✓) Inquiry received · Jul 10, 6:57 PM
 *       Oran Tene will reply to mike@x.com, usually within a day.
 *
 * TIERED BY TRUTH — the single body sentence never over-claims:
 *   • owningPartyCount > 1 (cross-agency GATE): neutral, no single agency or
 *     coordinator named — "Coordinators from N teams have your inquiry".
 *   • coordinator known: names the coordinator; adds the guest's email when the
 *     contact is real; appends the honest reply-time fragment when one exists.
 *   • no coordinator: names the agency instead. No fabricated time promise.
 *
 * The no-payment reassurance is NOT repeated here — the composer already
 * carries it pre-send, and repeating legal-ish copy after every send was the
 * overwhelm. House rules: tenant accent only, no em dashes, inline styles.
 */

import { Check } from "lucide-react";

import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import type { InquiryReceiptData } from "@/lib/inquiry/guest-chat-contract";
import {
  FONT,
  FONT_DISPLAY,
  accentText,
  paletteFor,
  type SurfaceMode,
} from "./mini-chat-styles";

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
  /** Jon 360 Phase 7 — dark surface variant for noir tenants. Default "light". */
  surfaceMode?: SurfaceMode;
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

/**
 * The single body sentence, tiered by what is actually true. Returned WITHOUT
 * a trailing period; the caller appends the optional reply-time fragment and
 * closes the sentence.
 */
function bodySentence(
  receipt: InquiryReceiptData,
  agencyName: string,
  t: Translator,
): string {
  if (receipt.owningPartyCount > 1) {
    return interpolate(t("public.guestChat.receiptLineCross"), {
      count: receipt.owningPartyCount,
    });
  }
  const coordinator = receipt.coordinator?.displayName?.trim() || null;
  const email = receipt.contactEmail?.trim() || null;
  if (coordinator && email) {
    return interpolate(t("public.guestChat.receiptLineCoordinatorEmail"), {
      name: coordinator,
      email,
    });
  }
  if (coordinator) {
    return interpolate(t("public.guestChat.receiptLineCoordinator"), {
      name: coordinator,
      agency: agencyName,
    });
  }
  if (email) {
    return interpolate(t("public.guestChat.receiptLineAgencyEmail"), {
      agency: agencyName,
      email,
    });
  }
  return interpolate(t("public.guestChat.receiptLineAgency"), { agency: agencyName });
}

export function InquiryReceiptCard({
  receipt,
  agencyName,
  accent,
  t,
  locale,
  surfaceMode = "light",
}: InquiryReceiptCardProps) {
  const P = paletteFor(surfaceMode);
  const stamp = formatReceivedAt(receipt.receivedAt, locale);
  const resolvedAgency = receipt.agencyName?.trim() || agencyName;

  let body = bodySentence(receipt, resolvedAgency, t);
  // Honest reply time only (never fabricated): "…, usually within a day."
  if (receipt.owningPartyCount <= 1 && receipt.typicalReplyLabel) {
    body = `${body}, ${interpolate(t("public.guestChat.receiptLineUsually"), {
      label: receipt.typicalReplyLabel,
    })}`;
  }

  return (
    <section
      aria-label={t("public.guestChat.receiptAria")}
      className="uic-receipt"
      style={{
        alignSelf: "stretch",
        display: "flex",
        alignItems: "flex-start",
        gap: 9,
        padding: "10px 12px",
        borderRadius: 12,
        background: P.surfaceFaint,
        border: `1px solid ${P.borderSoft}`,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: accent,
          color: accentText(accent),
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        <Check size={12} strokeWidth={3} />
      </span>
      <span style={{ minWidth: 0 }}>
        {/* Title row — agency identity register (display serif), one line. */}
        <span
          style={{
            display: "block",
            fontFamily: FONT_DISPLAY,
            fontSize: 13.5,
            fontWeight: 600,
            color: P.ink,
            lineHeight: 1.35,
          }}
        >
          {stamp
            ? interpolate(t("public.guestChat.receiptReceivedAt"), { when: stamp })
            : t("public.guestChat.receiptReceived")}
        </span>
        {/* The single truthful body sentence. */}
        <span
          style={{
            display: "block",
            fontFamily: FONT,
            fontSize: 11.5,
            color: P.inkMuted,
            lineHeight: 1.45,
            marginTop: 2,
            overflowWrap: "anywhere",
          }}
        >
          {body}.
        </span>
      </span>
    </section>
  );
}
