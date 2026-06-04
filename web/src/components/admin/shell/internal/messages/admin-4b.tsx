"use client";

/**
 * admin-4b.tsx — AdminActivityStream (D7)
 *
 * Enriched activity timeline for the admin shell's "Activity" sub-thread
 * (the former "DM threads coming soon" stub). Renders the same real
 * DB-backed money/offer/booking cards that the client and talent shells
 * show, but with the FULL admin picture:
 *
 *   - Offer sent/countered/accepted/rejected events
 *   - Payment requested / paid events (gross = client charge)
 *   - Booking confirmed + payout status cards
 *   - Detail-update diffs (any system_event card in the group thread)
 *
 * Source: GROUP thread (engine emits financial cards there for all parties;
 * the PRIVATE thread carries client-only copies which are a subset). Admin
 * sees everything the group thread has.
 *
 * Read-only. No composer — activity is a factual record, not a conversation.
 */

import React, { useState, useEffect } from "react";
import { COLORS, FONTS } from "../state";
import { renderChatCardForMessage } from "./admin-3";
import { useAdminShell } from "../state";
import { type TalentThreadMessage, loadTalentInquiryThread } from "@/app/(workspace)/[tenantSlug]/talent/inbox/[id]/actions";
import { MONEY_KINDS } from "@/components/talent/talent-thread-stream";

// ── Timestamp helpers (same algorithm as RealThreadStream) ────────────
function timeLabel(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${mon} ${d.getDate()} · ${hh}:${mm}`;
  } catch {
    return iso;
  }
}

function EmptyActivity() {
  return (
    <div style={{ padding: "40px 20px", textAlign: "center", fontFamily: FONTS.body }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }} className="text-admin-ink">
        No activity yet
      </div>
      <div style={{ fontSize: 12, maxWidth: 260, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }} className="text-admin-ink-muted">
        Offers, payments, booking confirmations, and status changes will appear here as the job progresses.
      </div>
    </div>
  );
}

/**
 * AdminActivityStream — D7 enriched activity view.
 *
 * Loads the GROUP thread from Supabase (same source as the talent shell but
 * via requireStaffTenantAction scope through loadTalentInquiryThread which
 * falls back to service-role for staff). Filters to MONEY_KINDS cards only
 * so the timeline stays focused on deal events, not human chat messages.
 *
 * Props:
 *   inquiryId  — real UUID; returns empty state for synthetic mock IDs
 *   tenantSlug — used for future revalidation; not needed for load
 *   threadType — "group" (default) loads talent+admin cards;
 *                "private" loads client-thread cards (offer totals visible to client)
 */
export function AdminActivityStream({
  inquiryId,
  threadType = "group",
}: {
  inquiryId: string;
  tenantSlug: string;
  threadType?: "group" | "private";
}) {
  const { toast } = useAdminShell();
  const [messages, setMessages] = useState<TalentThreadMessage[] | null>(null);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inquiryId);

  useEffect(() => {
    if (!isUuid) { setMessages([]); return; }
    let cancelled = false;
    setMessages(null);
    loadTalentInquiryThread(inquiryId, threadType).then((rows) => {
      if (cancelled) return;
      setMessages(rows);
    }).catch(() => {
      if (cancelled) return;
      setMessages([]);
    });
    return () => { cancelled = true; };
  }, [inquiryId, isUuid, threadType]);

  if (messages === null) {
    return (
      <div style={{ padding: "32px 16px", textAlign: "center", fontFamily: FONTS.body, fontSize: 12.5 }} className="text-admin-ink-muted">
        Loading activity…
      </div>
    );
  }

  // Filter to money/booking/system event kinds.
  const events = messages.filter((m) => m.messageKind !== "text" && MONEY_KINDS.has(m.messageKind));

  if (events.length === 0) {
    return <EmptyActivity />;
  }

  return (
    <div style={{ padding: "14px 14px 24px", display: "flex", flexDirection: "column", gap: 10, fontFamily: FONTS.body }}>
      {/* Section eyebrow */}
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }} className="text-admin-ink-muted">
        Deal timeline
      </div>
      {events.map((m) => {
        const node = renderChatCardForMessage(m.messageKind, m.cardPayload ?? {}, toast, {
          inquiryId,
          messageId: m.id,
          // Admin sees money info but suppress pay CTAs here since this is
          // an informational timeline view (payment actions live in Payment tab).
          suppressPayCta: true,
        });
        return (
          <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {/* The card itself */}
            {node ?? (
              // Fallback for unrecognized money kinds — render a slim system row.
              <div style={{
                padding: "7px 12px",
                borderRadius: 8,
                background: COLORS.surfaceAlt,
                border: `1px solid ${COLORS.borderSoft}`,
                fontSize: 12.5,
              }} className="text-admin-ink-muted">
                {m.messageKind.replace(/_/g, " ")}
              </div>
            )}
            {/* Timestamp below each card — small, muted, consistent. */}
            <div style={{ fontSize: 10, paddingLeft: 2 }} className="text-admin-ink-dim">
              {timeLabel(m.ts)}
            </div>
          </div>
        );
      })}

      {/* Footer hint */}
      <div style={{ marginTop: 6, padding: "8px 10px", borderRadius: 8, fontSize: 11, lineHeight: 1.5 }} className="bg-admin-surface-alt text-admin-ink-muted">
        This is a read-only deal record. Payment actions are in the Payment tab.
      </div>
    </div>
  );
}
