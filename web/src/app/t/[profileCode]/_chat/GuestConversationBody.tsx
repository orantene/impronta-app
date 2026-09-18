"use client";

/**
 * GuestConversationBody — the scrollable conversation area (floating details
 * rail slot + scrollRef body: SENT airlock, new-message pulse, receipt card /
 * greeting, message rows, trust-gate nudge, claim-email recap, account
 * toolkit). Extracted verbatim from MiniChatPanelColumn.tsx (W1-A
 * decomposition pre-pass) to keep that file under the 800-line cap. Renders no
 * hooks of its own — pure props-in, JSX-out, so hook ownership stays with
 * MiniChatPanelColumn. No logic changes.
 */

import { useEffect, useMemo, useState, type RefObject } from "react";

import type {
  GuestIdentityTier,
  GuestThreadStatus,
  GuestThreadV5Extras,
  InquiryReceiptData,
  MiniChatBrand,
} from "@/lib/inquiry/guest-chat-contract";
import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";

import type { StreamRow } from "./MiniChatMessageBubble";
import { ClaimEmailRecap } from "./ClaimEmailRecap";
import { GuestAccountToolkit } from "./GuestAccountToolkit";
import { InquiryReceiptCard } from "./InquiryReceiptCard";
import { MiniChatMessageBubble } from "./MiniChatMessageBubble";
import { GuestClientCardRow, isGuestClientCardRow, useGuestClientCards } from "./GuestClientCards";
import { SystemNoteCluster } from "./SystemNoteCluster";
import { clusterSystemRows } from "./cluster-system-rows";
import { NewMessagePulse } from "./NewMessagePulse";
import { SentAirlock } from "./SentAirlock";
import { TrustGateNudge } from "./TrustGateNudge";
import { FONT_DISPLAY, type Palette, type SurfaceMode } from "./mini-chat-styles";
import type {
  AddClaimEmailCallback,
  CheckGuestClaimEmailCallback,
} from "@/lib/inquiry/guest-chat-contract";

export type GuestConversationBodyProps = {
  scrollRef: RefObject<HTMLDivElement | null>;
  C: Palette;
  showSentAirlock: boolean;
  brand: MiniChatBrand;
  accent: string;
  accentInk: string;
  t: Translator;
  surfaceMode: SurfaceMode;
  pulseActive: boolean;
  receipt: InquiryReceiptData | null;
  talentPickFirst: boolean;
  talentFirst: string;
  rows: StreamRow[];
  limitNudge: {
    tier: GuestIdentityTier;
    activeCount: number;
    limit: number;
  } | null;
  onAddClaimEmail: AddClaimEmailCallback | null;
  onCheckClaimEmail?: CheckGuestClaimEmailCallback | null;
  inquiryId: string | null;
  guestContactEmail: string | null;
  emailedTo: string | null;
  onGuestEmailUpdated?: (email: string) => void;
  identity: GuestIdentityTier;
  threadStatus: GuestThreadStatus;
  /**
   * P1-10: the SendToAgencyBar is showing (an un-sent draft). The save-card
   * (GuestAccountToolkit "create your free account") must NOT render at the same
   * time — it belongs AFTER a real send. Mutually exclusive with the send bar.
   */
  sendBarActive?: boolean;
  /**
   * L13 (Messages v5): token + offers + pay code from the full thread load.
   * Null until it lands (or when the secret is unset); the v5 card rows then
   * draw without actions and offer rows keep the legacy bubble.
   */
  v5?: GuestThreadV5Extras | null;
  /** L13: re-read the thread after a card action (the panel's full-load bump). */
  onRefreshThread?: () => void;
};

export function GuestConversationBody({
  scrollRef,
  C,
  showSentAirlock,
  brand,
  accent,
  accentInk,
  t,
  surfaceMode,
  pulseActive,
  receipt,
  talentPickFirst,
  talentFirst,
  rows,
  limitNudge,
  onAddClaimEmail,
  onCheckClaimEmail,
  inquiryId,
  guestContactEmail,
  emailedTo,
  onGuestEmailUpdated,
  identity,
  threadStatus,
  sendBarActive = false,
  v5 = null,
  onRefreshThread,
}: GuestConversationBodyProps) {
  // L13: one card model per thread. A held time shows a countdown; tick once
  // a second while any card is held (same rule as the secure link).
  const [now, setNow] = useState(() => new Date());
  const anyHold = rows.some((m) => m.kind === "professional_times" && typeof (m.cardPayload as { holdExpiresAt?: unknown } | null)?.holdExpiresAt === "string");
  useEffect(() => {
    if (!anyHold) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [anyHold]);
  const cardModel = useGuestClientCards({
    rows,
    v5,
    locale: brand.locale ?? "en",
    businessName: brand.agencyName,
    refresh: onRefreshThread ?? (() => undefined),
    onTick: () => setNow(new Date()),
  });
  // Offer rows only move to the v5 card once the offer summaries are here;
  // until then the legacy enriched offer bubble keeps drawing them.
  const hasOffers = cardModel.offers.length > 0;
  // Tenant switch (Settings, Guest chat, "Offer, payment and booking cards"):
  // off keeps every row on the legacy bubbles. Opt-in until QA (decision 10).
  const cardsOn = brand.dockCardsV5 === true;
  const drawsV5Card = useMemo(
    () => (row: StreamRow) => cardsOn && isGuestClientCardRow(row) && (hasOffers || !String(row.kind).startsWith("offer_")),
    [cardsOn, hasOffers],
  );
  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", minWidth: 0 }}>
      <div
        ref={scrollRef}
        style={{
          // position:relative anchors the SENT airlock overlay to the body box.
          position: "relative",
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          // P0-4b: keep wheel/touch scroll inside the thread, never the page.
          overscrollBehavior: "contain",
          padding: "14px 14px 6px",
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
      ) : rows.every((m) => m.authorRole === "system") ? (
        // P1-15 (revised in W1 live-QA): the static greeting is a pre-send
        // affordance. It must NOT double up once a real CONVERSATION message
        // exists (the original auto-ack double-render bug) — but a fresh draft
        // whose only rows are SYSTEM notes (e.g. "Lineup · 3 talent") should
        // still show the greeting, so the panel opens alive instead of blank.
        // So: show while every row is a system note; hide once any
        // guest/coordinator message lands.
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
                  // FULL display name, not the first-name split. #1766 gave this
                  // line the tenant's own `brand.greeting` when there is one;
                  // this is the fallback beneath it, and it read
                  // "Hi, I'm El's booking assistant" on El Paisa.
                  //
                  // `talentFirst` is everything before the first space, which is
                  // right for a person and wrong for every business. Splitting
                  // only for people needs the industry preset's
                  // `representsPeople`, which resolves to "custom" on every live
                  // workspace today, so it would change nothing. A full name is
                  // never wrong, only slightly more formal for a person.
                  name: brand.talentDisplayName.trim() || talentFirst,
                })}
        </div>
      ) : null}

      {/* W1-1 — fold consecutive system notes into ONE quiet caption cluster
          so lineup/AI-capture bursts read as a whisper, not spam. Human
          messages render as bubbles, in place. */}
      {clusterSystemRows(rows).map((node) =>
        node.kind === "message" && drawsV5Card(node.row) ? (
          <GuestClientCardRow key={node.row.id} row={node.row} model={cardModel} now={now} />
        ) : node.kind === "message" ? (
          <MiniChatMessageBubble
            key={node.row.id}
            m={node.row}
            accent={accent}
            locale={brand.locale ?? "en"}
            surfaceMode={surfaceMode}
          />
        ) : (
          <SystemNoteCluster key={node.id} rows={node.rows} C={C} t={t} />
        ),
      )}

      {limitNudge && limitNudge.tier !== "account" && (
        <TrustGateNudge
          t={t}
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
          t={t}
          emailedTo={emailedTo}
          inquiryId={inquiryId}
          accent={accent}
          accentInk={accentInk}
          onAddClaimEmail={onAddClaimEmail}
          surfaceMode={surfaceMode}
        />
      )}

      {inquiryId && !sendBarActive && (
        <GuestAccountToolkit
          t={t}
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
  );
}
