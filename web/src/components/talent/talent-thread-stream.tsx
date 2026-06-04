"use client";

import React from "react";
import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import { Avatar } from "@/components/admin/shell/internal/primitives";
import { type Conversation } from "@/components/admin/shell/internal/talent";
import { DaySeparator } from "@/components/admin/shell/internal/messages/shared/machinery-15";
import { renderChatCardForMessage } from "@/components/admin/shell/internal/messages/admin-3";
import { type TalentThreadMessage } from "@/app/(workspace)/[tenantSlug]/talent/inbox/[id]/actions";
import { renderMessageMarkdown } from "@/lib/messages/markdown";
import { LinkPreview, firstHttpUrl } from "@/components/messages/thread-enhancements";
import { PinButton } from "@/components/chat-interactions/PinButton";

/** Money/booking/system kinds that render as structured cards (Activity view). */
export const MONEY_KINDS = new Set([
  "offer_event", "payment_request", "payment_paid", "booking_confirmed",
  "talent_rate", "talent_rate_confirmed", "call_sheet_update", "booking_status", "system_event",
]);

// ── Real talent thread — live Supabase GROUP thread (text + money cards) ──
// Rendered in place of the mock prototype when the conv is a real inquiry.
// Money/booking kinds dispatch to the shared renderChatCardForMessage (talent
// POV — card_payload carries labels only, never margin/commission).
//   mode "chat"     → human conversation only (text bubbles).
//   mode "activity" → the job's money/booking timeline (cards + timestamps).
function realInitials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]?.toUpperCase() ?? "").slice(0, 2).join("") || "?";
}
function realTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${mon} ${d.getDate()} · ${hh}:${mm}`;
}
function realDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mon = ["January","February","March","April","May","June","July","August","September","October","November","December"][d.getMonth()];
  return `${mon} ${d.getDate()}`;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ padding: "32px 16px", textAlign: "center", fontFamily: FONTS.body }} className="text-admin-ink-muted">
      <div className="text-admin-ink text-admin-13 font-semibold">{title}</div>
      <div style={{ fontSize: 11.5, marginTop: 4, maxWidth: 260, marginLeft: "auto", marginRight: "auto" }}>{body}</div>
    </div>
  );
}

export function RealThreadStream({
  messages, conv, toast, mode = "chat", pinnedIds, onPinChanged,
}: {
  messages: TalentThreadMessage[] | null;
  conv: Conversation;
  toast: (s: string) => void;
  mode?: "chat" | "activity";
  /** Inquiry-wide pinned message ids (shared). Drives the per-bubble pin. */
  pinnedIds?: Set<string>;
  /** Called after a pin toggle reconciles so the host refreshes the strip. */
  onPinChanged?: () => void;
}) {
  if (messages === null) {
    return (
      <div style={{ padding: "28px 16px", textAlign: "center", fontFamily: FONTS.body, fontSize: 12.5 }} className="text-admin-ink-muted">
        Loading…
      </div>
    );
  }
  // ACTIVITY view: the job's money/booking timeline — only the structured
  // event cards (offer → payment → booking), each with a timestamp, read-only.
  if (mode === "activity") {
    const events = messages.filter((m) => m.messageKind !== "text" && MONEY_KINDS.has(m.messageKind));
    if (events.length === 0) {
      return (
        <EmptyState
          title="No activity yet"
          body="Offers, payments and booking confirmations will appear here as the job progresses."
        />
      );
    }
    return (
      <div className="flex flex-col gap-2.5">
        {events.map((m) => {
          const node = renderChatCardForMessage(m.messageKind, m.cardPayload ?? {}, toast, {
            inquiryId: conv.id, messageId: m.id, suppressPayCta: true,
          });
          return (
            <div key={m.id} style={{ alignSelf: "stretch" }}>
              {node}
              <div style={{ fontSize: 10, color: COLORS.inkDim, marginTop: 3, paddingLeft: 2 }}>
                {realTimeLabel(m.ts)}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  // CHAT view: human conversation only — every money/system event is moved to
  // the Activity tab, so the thread stays a clean conversation.
  const chatMessages = messages.filter((m) => m.messageKind === "text");
  if (chatMessages.length === 0) {
    return (
      <EmptyState
        title="No messages yet"
        body="Start the conversation below — your message will go to the right people in this thread."
      />
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      {chatMessages.map((m, idx) => {
        const mine = m.isMine;
        const prevDay = idx > 0 ? realDayKey(chatMessages[idx - 1]!.ts) : null;
        const thisDay = realDayKey(m.ts);
        const showDay = thisDay !== prevDay;
        return (
          <React.Fragment key={m.id}>
            {showDay && <DaySeparator label={thisDay} />}
            <div data-message-id={m.id} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexDirection: mine ? "row-reverse" : "row" }}>
              {!mine && (
                <Avatar size={26} tone="ink" hashSeed={m.senderName} initials={realInitials(m.senderName)} />
              )}
              <div style={{
                maxWidth: "78%",
                background: mine ? COLORS.fill : COLORS.surfaceAlt,
                color: mine ? "#fff" : COLORS.ink,
                padding: "9px 12px",
                borderRadius: mine ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                fontSize: 13, lineHeight: 1.45,
              }}>
                {!mine && (
                  <div style={{ fontSize: 10.5, fontWeight: 700, marginBottom: 2 }} className="text-admin-ink-muted">
                    {m.senderName}
                  </div>
                )}
                <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{renderMessageMarkdown(m.body)}</div>
                {(() => {
                  const url = firstHttpUrl(m.body);
                  return url ? (
                    <LinkPreview
                      url={url}
                      colors={{
                        bg: mine ? "rgba(255,255,255,0.10)" : COLORS.card,
                        border: mine ? "rgba(255,255,255,0.22)" : COLORS.borderSoft,
                        title: mine ? "#fff" : COLORS.ink,
                        muted: mine ? "rgba(255,255,255,0.7)" : COLORS.inkMuted,
                      }}
                    />
                  ) : null;
                })()}
                <div style={{ fontSize: 10, color: mine ? "rgba(255,255,255,0.55)" : COLORS.inkDim, marginTop: 4 }}>
                  {realTimeLabel(m.ts)}
                </div>
              </div>
              {/* Pin control — inquiry-wide (shared). Sits on the outer edge of
                  the bubble row so it reads as an affordance, not chrome. */}
              <PinButton
                messageId={m.id}
                inquiryId={conv.id}
                pinned={pinnedIds?.has(m.id) ?? false}
                compact
                accent={COLORS.accentDeep}
                onError={toast}
                onChanged={() => onPinChanged?.()}
              />
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
