"use client";

/**
 * use-jon360-panel-tracking — Phase 0c CRO instrumentation extracted from
 * MiniChatPanel (keeps that orchestrator under its 800-line cap). It owns the
 * panel's slice of the Jon-360 funnel:
 *
 *   • receipt_viewed — fired once when the trust receipt first appears
 *     (the SENT -> RECEIVED beat), via an internal effect.
 *   • trackSend()    — fired on the send/airlock success: send_clicked (intent
 *     landed) + contact_promoted (the PRIMARY conversion, anchored on the
 *     internal analytics_events table).
 *   • trackReply()   — fired when a coordinator (non-guest) message lands.
 *
 * All events carry the standard Jon-360 funnel props (built here from the live
 * inputs the panel passes in). Pure wiring over the shared firing helpers; the
 * panel stays free of analytics detail beyond calling trackSend/trackReply.
 */

import { useEffect, useRef } from "react";

import type { InquiryReceiptData } from "@/lib/inquiry/guest-chat-contract";
import {
  trackContactPromoted,
  trackReceiptViewed,
  trackReplyReceived,
  trackSendClicked,
  type Jon360FunnelContext,
  type Jon360Identity,
} from "@/lib/analytics/jon360-funnel-events";

export type UseJon360PanelTrackingArgs = {
  /** The resolved inquiry id (early-row create / resume), or null. */
  inquiryId: string | null;
  /** Agency/tenant uuid (promoted to the analytics_events column by the client). */
  tenantId?: string | null;
  /** Live cart/lineup ids the launcher threads in. */
  cartTalentIds?: readonly string[];
  /** Guest identity tier; only "account" maps to the "client" funnel identity. */
  identity: "guest" | "identified" | "email_verified" | "account";
  /** Attribution surface (e.g. "/t/TA-12345"). */
  sourcePage: string;
  /** The trust receipt; non-null on the SENT -> RECEIVED beat. */
  receipt: InquiryReceiptData | null;
};

export type UseJon360PanelTrackingResult = {
  /** send_clicked + contact_promoted (PRIMARY conversion). Call on send success. */
  trackSend: () => void;
  /** reply_received. Call when a coordinator message lands on the thread. */
  trackReply: () => void;
};

export function useJon360PanelTracking(
  args: UseJon360PanelTrackingArgs,
): UseJon360PanelTrackingResult {
  const { inquiryId, tenantId, cartTalentIds, identity, sourcePage, receipt } = args;

  // Keep the latest context inputs in a ref (synced in an effect, never during
  // render) so the firing helpers + the receipt effect read current values
  // without widening any dep array (the receipt effect must fire exactly once,
  // on the receipt's first appearance).
  const ctxRef = useRef<Jon360FunnelContext>({ lineupCount: 0, source: sourcePage });
  useEffect(() => {
    ctxRef.current = {
      inquiryId,
      tenantId,
      lineupCount: cartTalentIds?.length ?? 0,
      identity: (identity === "account" ? "client" : "guest") satisfies Jon360Identity,
      source: sourcePage,
    };
  }, [inquiryId, tenantId, cartTalentIds, identity, sourcePage]);

  // receipt_viewed once, when the trust receipt first appears.
  const receiptTrackedRef = useRef(false);
  useEffect(() => {
    if (receipt && !receiptTrackedRef.current) {
      receiptTrackedRef.current = true;
      trackReceiptViewed(ctxRef.current);
    }
  }, [receipt]);

  return {
    trackSend: () => {
      trackSendClicked(ctxRef.current);
      trackContactPromoted(ctxRef.current);
    },
    trackReply: () => trackReplyReceived(ctxRef.current),
  };
}
