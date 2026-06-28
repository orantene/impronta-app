"use client";

/**
 * ConversationStatusStrip — the slim "whose turn / what is next" strip mounted
 * ABOVE the composer in the guest mini-chat (Jon Inquiry 360, section 2
 * CONVERSATION).
 *
 * DISTINCT from ReceiptCoordinatorHeader: the header names WHO the coordinator
 * is (identity). This strip names the NEXT STEP / NEXT ACTOR so the guest never
 * stares at a dead thread wondering whose move it is. Shown once the inquiry is
 * in conversation (post-send), keyed to `threadStatus`:
 *
 *   open / coordination -> "In conversation with {coordinator|agency}". When the
 *     guest's own message is the latest, reassure that the coordinator is on it
 *     instead of going silent.
 *   offer_pending -> the GUEST's turn: a bright accent CTA naming the offer +
 *     a jump-to-offer affordance (scrolls the offer card into view).
 *   approved -> "Approved. Confirming your booking" (coordinator's turn).
 *   booked -> "Booked. You are all set".
 *   closed -> nothing (the thread is over; no next actor to name).
 *
 * House rules: tenant accent only (injected token; never hardcoded gold), no em
 * dashes, dark-variant-aware via paletteFor(surfaceMode), reduced-motion-safe
 * (no animation here at all), inline styles to match the _chat family.
 */

import type { RefObject } from "react";

import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import type {
  GuestThreadStatus,
  InquiryReceiptData,
} from "@/lib/inquiry/guest-chat-contract";
import type { StreamRow } from "./MiniChatMessageBubble";
import {
  FONT,
  paletteFor,
  readableOn,
  type SurfaceMode,
} from "./mini-chat-styles";

export type ConversationStatusStripProps = {
  threadStatus: GuestThreadStatus;
  /** The post-send receipt (coordinator name/agency live here). Null pre-send. */
  receipt?: InquiryReceiptData | null;
  /** Brand display name — the single-agency fallback when receipt has no name. */
  agencyName: string;
  /**
   * The live thread rows. The latest non-system author role drives the guest-vs-
   * coordinator turn nuance for the `open` status (last word = guest -> coordinator
   * is working on it; last word = staff/talent -> the guest can reply).
   */
  rows: StreamRow[];
  /** The scrollable thread body, for the offer_pending "Review it" jump. */
  scrollRef: RefObject<HTMLDivElement | null>;
  /**
   * Hard-suppress the strip (at the gate / while the SENT airlock plays). The
   * strip otherwise self-gates to the in-conversation (post-send) window.
   */
  suppressed?: boolean;
  accent: string;
  t: Translator;
  /** Jon 360 Phase 7 — dark surface variant for noir tenants. Default "light". */
  surfaceMode?: SurfaceMode;
};

/** First name only, so the reassurance reads human ("Maya is on it"). */
function firstNameOf(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export function ConversationStatusStrip({
  threadStatus,
  receipt = null,
  agencyName,
  rows,
  scrollRef,
  suppressed = false,
  accent,
  t,
  surfaceMode = "light",
}: ConversationStatusStripProps) {
  const C = paletteFor(surfaceMode);

  // Self-gate to the in-conversation window: the receipt is the post-send marker
  // (non-null only after a real send). Hidden at the gate / airlock (suppressed)
  // and once the thread is over (closed) — no next actor to name.
  if (suppressed || !receipt || threadStatus === "closed") return null;

  // The latest non-system author role. System rows name no actor, so skip them.
  let lastMessageRole: StreamRow["authorRole"] | null = null;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i]?.authorRole !== "system") {
      lastMessageRole = rows[i]?.authorRole ?? null;
      break;
    }
  }

  // Scroll the offer card into view for the offer_pending "Review it" jump.
  const jumpToOffer = () => {
    const el = scrollRef.current?.querySelector<HTMLElement>(
      "[data-guest-offer-anchor]",
    );
    if (!el) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
  };

  // Cross-agency lineups never name a single agency/coordinator (TIERED BY
  // TRUTH, mirroring the receipt header). Fall back to the neutral agency word.
  const isCrossAgency = (receipt?.owningPartyCount ?? 0) > 1;
  const resolvedAgency = (receipt?.agencyName?.trim() || agencyName).trim();
  const coordinatorFirst =
    !isCrossAgency && receipt?.coordinator
      ? firstNameOf(receipt.coordinator.displayName)
      : "";
  // Who the next step belongs to / who is being reassured. Prefer the named
  // coordinator; fall back to the agency name.
  const actor = coordinatorFirst || resolvedAgency;

  const baseWrap = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 14px",
    borderTop: `1px solid ${C.borderSoft}`,
    background: C.surfaceFaint,
    fontFamily: FONT,
    fontSize: 12,
    lineHeight: 1.4,
    color: C.inkMuted,
    flexShrink: 0,
  } as const;

  // ── offer_pending: the GUEST's turn. Bright accent CTA + jump-to-offer. ──────
  if (threadStatus === "offer_pending") {
    const label = interpolate(t("public.guestChat.stripOfferReady"), {
      agency: resolvedAgency,
    });
    const jumpLabel = t("public.guestChat.stripReviewOffer");
    const ctaInk = readableOn(accent);
    return (
      <div
        style={{
          ...baseWrap,
          // The guest's turn earns the brand accent ground (a faint tint), so
          // the strip reads as an action, not a passive status line.
          background: `${accent}14`,
          color: C.ink,
        }}
      >
        <Dot accent={accent} />
        <span style={{ minWidth: 0, flex: 1, fontWeight: 600 }}>{label}</span>
        <button
          type="button"
          onClick={jumpToOffer}
          style={{
            flexShrink: 0,
            border: "none",
            borderRadius: 999,
            padding: "5px 13px",
            background: accent,
            color: ctaInk,
            fontFamily: FONT,
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: 0.2,
            cursor: "pointer",
          }}
        >
          {jumpLabel}
        </button>
      </div>
    );
  }

  // ── approved: the coordinator's turn (confirming the booking). Reassure. ─────
  if (threadStatus === "approved") {
    return (
      <div style={baseWrap}>
        <Dot accent={accent} />
        <span style={{ minWidth: 0, flex: 1 }}>
          {t("public.guestChat.stripApproved")}
        </span>
      </div>
    );
  }

  // ── booked: done. ────────────────────────────────────────────────────────────
  if (threadStatus === "booked") {
    return (
      <div style={baseWrap}>
        <Dot accent={accent} />
        <span style={{ minWidth: 0, flex: 1 }}>
          {t("public.guestChat.stripBooked")}
        </span>
      </div>
    );
  }

  // ── open / coordination: an active conversation. ─────────────────────────────
  // If the guest's own message is the latest word, the ball is with the
  // coordinator: reassure they are on it rather than imply a stall. Otherwise the
  // coordinator (or agency) has the floor and the composer invites a reply.
  const guestSpokeLast = lastMessageRole === "guest";
  const openCopy = guestSpokeLast
    ? interpolate(t("public.guestChat.stripCoordinatorWorking"), { actor })
    : interpolate(t("public.guestChat.stripInConversation"), { actor });
  return (
    <div style={baseWrap}>
      <Dot accent={accent} />
      <span style={{ minWidth: 0, flex: 1 }}>{openCopy}</span>
    </div>
  );
}

/** A small accent status dot. Static (reduced-motion-safe by construction). */
function Dot({ accent }: { accent: string }) {
  return (
    <span
      aria-hidden
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: accent,
        flexShrink: 0,
      }}
    />
  );
}
