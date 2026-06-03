"use client";

import React, { useTransition, useState, type CSSProperties } from "react";
import { MessageReactionMenu, replyTargetFromMessage, ReplyContextBar, type ReplyTarget } from "@/components/chat-interactions";
import { addReaction as addReactionAction, removeReaction as removeReactionAction } from "@/lib/server-actions/message-reactions";
import { sendMessage as sendMessageAction } from "@/app/(workspace)/[tenantSlug]/admin/messages/actions";
import { uploadInquiryAttachment, loadInquiryLineup } from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";
import { type ThreadType } from "@/app/(workspace)/[tenantSlug]/_data-bridge";
import { useAdminShell, TENANT, meetsRole, FONTS, COLORS, type RichInquiry } from "../state";
import { Avatar } from "../primitives";
import { type Conversation } from "../talent";
import { renderChatCardForMessage } from "./admin-3";
import { appendLocalMessage, readLocalMessages, useMessageStashSubscription } from "./conversation-stash";
import { FirstConvBanner } from "./shared/inbox-identity-1";
import { DaySeparator, dayKey } from "./shared/machinery-15";
import { ConversationTab, DraftComposer, SMART_REPLIES_FOR_LAST, type MentionCandidate } from "./shared/machinery-16";


export function AdminMessageStream({
  messages, placeholder, closed, closedNotice, threadKey, smartReplyContext = "default",
  firstTimeClientName, inquiryId, tenantSlug, threadType, topInset = 0,
}: {
  messages: RichInquiry["messages"];
  placeholder: string;
  /** When true, the composer is replaced with a closure pill — same
   *  pattern ConversationTab uses for past/cancelled convs. */
  closed?: boolean;
  closedNotice?: string;
  /** Stable key that identifies which thread a sent message belongs to.
   *  Used for the local-stash so admin's "Just now" sends echo back into
   *  the stream without a backend. */
  threadKey: string;
  /** Stage-flavored smart-reply set ("inquiry" / "hold" / "offer" /
   *  "default"). Maps to SMART_REPLIES_FOR_LAST so admin's chip
   *  suggestions match the conversation's pipeline position rather
   *  than always falling back to the generic default. */
  smartReplyContext?: string;
  /** When set, render the "First time with {client}" banner at the
   *  top of the stream. Caller computes the first-time signal so the
   *  stream stays presentation-only. */
  firstTimeClientName?: string;
  /** Real inquiry UUID — used to persist messages to DB. */
  inquiryId: string;
  /** Workspace slug — passed to sendMessage server action. */
  tenantSlug: string;
  /** DB thread type for this stream: "private" = client, "group" = talent. */
  threadType: ThreadType;
  /** Extra top space for shells with an overlaid chat sub-toggle. */
  topInset?: number;
}) {
  const { toast, state, effectiveTenant } = useAdminShell();
  const [, startTransition] = useTransition();
  // Items 1-3 wiring (Messages consolidation v2): reply target for the
  // composer's quoted-reply context bar. Cleared on send or × dismiss.
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  // Subscribe so locally-sent messages re-render the stream.
  useMessageStashSubscription();
  // C3 — @-mention candidates: load the inquiry lineup once per
  // inquiryId so the composer can offer @name auto-complete. Non-UUID
  // ids (mock data) skip the fetch. Candidates are stable until the
  // inquiry changes — no need to reload on every render.
  const [mentionCandidates, setMentionCandidates] = useState<MentionCandidate[]>([]);
  const isUuidInquiry = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inquiryId);
  React.useEffect(() => {
    if (!isUuidInquiry) return;
    let cancelled = false;
    loadInquiryLineup(effectiveTenant.slug, inquiryId).then((r) => {
      if (cancelled || !r.ok) return;
      const candidates: MentionCandidate[] = (r.data ?? [])
        .filter(p => p.talentDisplayName)
        .map(p => ({ name: p.talentDisplayName!, role: p.talentHeadline ?? "Talent" }));
      setMentionCandidates(candidates);
    });
    return () => { cancelled = true; };
  }, [inquiryId, isUuidInquiry, effectiveTenant.slug]);
  const localMessages = readLocalMessages(threadKey);
  // Phase 4 of System User direction — workspace identity available
  // to the composer when the user is coord+ on a paid tier. The
  // workspace name comes from the Tulala TENANT identity. Free
  // workspaces don't surface the toggle (no abstraction to choose).
  const wsName = effectiveTenant.name;
  const canSendAsWs = meetsRole(state.role, "manager") && state.plan !== "free";
  const allMessages: Array<{
    id: string;
    body: string;
    ts: string;
    isYou: boolean;
    senderName: string;
    senderRole: string;
    senderInitials: string;
    /** Item #4 wiring: when non-text, the bubble row swaps in the
     *  appropriate ChatCard via renderChatCardForMessage. */
    messageKind?: string;
    cardPayload?: Record<string, unknown> | null;
  }> = [
    ...messages.map(m => ({
      id: m.id, body: m.body, ts: m.ts, isYou: !!m.isYou,
      // RichInquiry messages carry senderRole — when it's the
      // synthetic "workspace" role we coerce the rendered name to
      // the workspace identity so the bubble reads as System User.
      senderName: m.senderRole === "workspace"
        ? (m.senderName || "Workspace")
        : m.senderName,
      senderRole: m.senderRole as string,
      senderInitials: m.senderInitials,
      // Mock RichInquiry rows don't yet carry message_kind /
      // card_payload — they fall through to plain text. Real DB rows
      // (post-migration 20260513214948) provide both via the optional
      // cast below.
      messageKind: (m as { messageKind?: string }).messageKind,
      cardPayload: (m as { cardPayload?: Record<string, unknown> | null }).cardPayload ?? null,
    })),
    // Stashed sends honor the per-message sender so workspace-attributed
    // posts render as System User bubbles (not "you" bubbles). When
    // sender is "workspace", we use the workspace identity for the name
    // + initials so the bubble carries the agency voice.
    ...localMessages.map(m => {
      const isWs = m.sender === "workspace";
      return {
        id: m.id, body: m.body, ts: m.ts,
        // Workspace sends are attributed to the workspace, not "you" —
        // even though THIS user is the one who pushed the button. The
        // bubble visually aligns left (theirs side) so the workspace
        // identity reads as a third-party participant.
        isYou: !isWs,
        senderName: isWs ? wsName : "You",
        senderRole: isWs ? "workspace" : "coordinator",
        senderInitials: isWs ? wsName.slice(0, 2).toUpperCase() : "ME",
      };
    }),
  ];
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      flex: 1, minHeight: 0,
      paddingTop: topInset,
      fontFamily: FONTS.body,
    }}>
      {/* Items 1-3 wiring: bubble hover-actions reveal rule. Desktop:
          reveal on hover. Touch / coarse pointer: always visible. */}
      <style dangerouslySetInnerHTML={{ __html:
        "[data-msg-bubble-group]:hover [data-msg-actions]{opacity:1!important;pointer-events:auto!important}"
        + "@media (pointer:coarse){[data-msg-actions]{opacity:1!important;pointer-events:auto!important}}"
      }} />
      {firstTimeClientName && (
        <div style={{ paddingTop: 10 }}>
          <FirstConvBanner clientName={firstTimeClientName} audience="admin" />
        </div>
      )}
      {/* S0.11 — Message visibility label. Tells the admin what audience
          will see messages they send into this stream. private =
          client + workspace staff; group = selected talent + workspace
          coordinators. */}
      <div
        data-msg-visibility-banner
        style={{
          margin: "8px 14px 0",
          padding: "5px 10px",
          borderRadius: 999,
          background: threadType === "private" ? "rgba(245,158,11,0.10)" : "rgba(15,79,62,0.08)",
          color: threadType === "private" ? "#92400E" : "#0F4F3E",
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          alignSelf: "flex-start",
          fontFamily: FONTS.body,
        }}
        title={
          threadType === "private"
            ? "Client thread — visible to the client and workspace staff."
            : "Talent group — visible to selected talent and workspace coordinators."
        }
      >
        {threadType === "private" ? "Client thread" : "Talent group"}
      </div>
      <div style={{
        flex: 1, minHeight: 0, overflowY: "auto",
        padding: "14px 14px 4px",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        {allMessages.length === 0 ? (
          <div style={{ fontSize: 12, fontStyle: "italic", textAlign: "center", padding: "16px 0" }} className="text-admin-ink-dim">
            No messages in this thread yet.
          </div>
        ) : allMessages.map((m, idx) => {
          const mine = m.isYou;
          const prevDay = idx > 0 ? dayKey(allMessages[idx - 1]!.ts) : null;
          const thisDay = dayKey(m.ts);
          const showDay = thisDay !== prevDay;
          return (
            <React.Fragment key={m.id}>
              {showDay && <DaySeparator label={thisDay} />}
              <div
                data-msg-bubble-group
                style={{
                  position: "relative",
                  display: "flex", gap: 8, alignItems: "flex-end",
                  flexDirection: mine ? "row-reverse" : "row",
                }}
              >
                {/* Items 1-3 wiring: hover actions row — reactions +
                    reply + ⋯ menu. Reveals on hover (desktop) and is
                    always-visible on touch via CSS in mobile-shell.css.
                    Engine writes (reactions, reply persistence) are
                    shipped server-side; UI primitive defaults to toast
                    fallback when handlers aren't connected yet. */}
                <div
                  data-msg-actions
                  style={{
                    position: "absolute",
                    top: -10,
                    [mine ? "right" : "left"]: 36,
                    display: "inline-flex", gap: 4,
                    padding: 2,
                    background: "rgba(255,255,255,0.96)",
                    border: `1px solid ${COLORS.borderSoft}`,
                    borderRadius: 999,
                    boxShadow: "0 4px 12px rgba(11,11,13,0.10)",
                    zIndex: 2,
                    // Hidden by default; revealed on group hover via the
                    // [data-msg-bubble-group]:hover [data-msg-actions]
                    // rule injected once at the top of this stream.
                    opacity: 0,
                    transition: "opacity 100ms",
                    pointerEvents: "none",
                  } as React.CSSProperties}
                >
                  <MessageReactionMenu
                    toast={(s) => toast(s)}
                    placement="above"
                    onReact={async (emoji) => {
                      const r = await addReactionAction(m.id, emoji);
                      if (!r.ok) toast(`Reaction failed: ${r.error}`);
                    }}
                    onToggle={async (emoji) => {
                      // Optimistic toggle: insert first; on duplicate-key
                      // error (from the unique index) fall through to
                      // delete to clear the existing row.
                      const add = await addReactionAction(m.id, emoji);
                      if (!add.ok) {
                        const remove = await removeReactionAction(m.id, emoji);
                        if (!remove.ok) toast(`Reaction toggle failed: ${remove.error}`);
                      }
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Reply to this message"
                    title="Reply"
                    onClick={() => setReplyTarget(replyTargetFromMessage({
                      id: m.id,
                      senderName: m.senderName,
                      body: m.body,
                    }))}
                    style={{
                      width: 28, height: 28, padding: 0,
                      background: "transparent", border: "none",
                      cursor: "pointer",
                      color: COLORS.inkMuted,
                      borderRadius: 999,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                      <path d="M5 4L2 7l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 7h6c2 0 4 1 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label="Message actions"
                    title="More"
                    onClick={() => toast("Per-message actions — coming soon")}
                    style={{
                      width: 28, height: 28, padding: 0,
                      background: "transparent", border: "none",
                      cursor: "pointer",
                      color: COLORS.inkMuted,
                      borderRadius: 999,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                      <circle cx="3" cy="7" r="1.2" fill="currentColor"/>
                      <circle cx="7" cy="7" r="1.2" fill="currentColor"/>
                      <circle cx="11" cy="7" r="1.2" fill="currentColor"/>
                    </svg>
                  </button>
                  {/* PIN/STAR PLUG-IN POINT (deferred 2026-05-15):
                      Drop <StarButton messageId={m.id} inquiryId={inquiryId}
                        starred={...} compact onError={(s) => toast(s)} />
                      here once admin's bubble renders WorkspaceMessage
                      rows from loadInquiryMessages (real DB UUIDs) instead
                      of ThreadMessage rows from state.tsx mocks. Engine,
                      migration, and StarButton component all shipped in
                      commit ae47a8a24 — only the data-source migration
                      blocks this. */}
                </div>
                {!mine && (
                  <Avatar
                    size={26}
                    tone={m.senderRole === "coordinator" || m.senderRole === "workspace" ? "ink" : "auto"}
                    hashSeed={m.senderName}
                    initials={m.senderInitials}
                  />
                )}
                {/* Item #4 wiring: typed message → ChatCard render.
                    Plain text rows fall through to the bubble below. */}
                {m.messageKind && m.messageKind !== "text" ? (
                  <div data-msg-card-wrap style={{ maxWidth: "78%", flex: 1 }}>
                    {renderChatCardForMessage(m.messageKind, m.cardPayload ?? {}, toast, { inquiryId, messageId: m.id })}
                  </div>
                ) : (
                <div style={{
                  maxWidth: "78%",
                  background: mine ? COLORS.fill : COLORS.surfaceAlt,
                  color: mine ? "#fff" : COLORS.ink,
                  padding: "9px 12px",
                  borderRadius: mine ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                  fontSize: 13, lineHeight: 1.45,
                }}>
                  {!mine && (
                    <div style={{ fontSize: 10.5, fontWeight: 700, marginBottom: 3, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }} className="text-admin-ink-muted">
                      <span>{m.senderName} <span className="font-medium">· {m.senderRole}</span></span>
                      {m.senderRole === "workspace" && (
                        <span title="Workspace System User" style={{
                          display: "inline-flex", alignItems: "center", gap: 3,
                          padding: "0 5px", borderRadius: 999,
                          background: COLORS.indigoSoft, color: COLORS.indigoDeep,
                          fontSize: 8.5, fontWeight: 700,
                          textTransform: "uppercase", letterSpacing: 0.4,
                        }}>
                          <svg width="7" height="7" viewBox="0 0 8 8" fill="none" aria-hidden>
                            <path d="M2 1.5h4l1 1.5v3l-1 1.5H2l-1-1.5v-3l1-1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
                          </svg>
                          System
                        </span>
                      )}
                    </div>
                  )}
                  <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {m.body}
                  </div>
                  <div style={{ fontSize: 10, color: mine ? "rgba(255,255,255,0.55)" : COLORS.inkDim, marginTop: 5, display: "flex", alignItems: "center", gap: 4 }}>
                    {m.ts}
                    {mine && (
                      <span aria-hidden style={{ display: "inline-flex" }}>
                        <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                          <path d="M1 4.8L3.5 7L7 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M5 4.8L7.5 7L11 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                    )}
                  </div>
                </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
      {/* Items 1-3 wiring: reply context bar sits above the composer
          when the user has tapped Reply on a message. Cancel via × or
          on successful send (caller clears via setReplyTarget(null)). */}
      {replyTarget && (
        <ReplyContextBar
          target={replyTarget}
          onCancel={() => setReplyTarget(null)}
        />
      )}
      <div style={{
        flexShrink: 0,
        padding: "10px 14px 14px",
        background: "#fff",
        borderTop: `1px solid ${COLORS.borderSoft}`,
      }}>
        {closed ? (
          <div style={{ padding: "10px 14px", borderRadius: 999, border: `1px solid ${COLORS.borderSoft}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: FONTS.body, fontSize: 12 }} className="bg-admin-surface-alt text-admin-ink-muted">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
              <rect x="3" y="6.5" width="8" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M5 6.5V5a2 2 0 014 0v1.5" stroke="currentColor" strokeWidth="1.4"/>
            </svg>
            {closedNotice ?? "Conversation closed."}
          </div>
        ) : (
          <DraftComposer
            threadKey={threadKey}
            placeholder={placeholder}
            smartReplyContext={smartReplyContext}
            mentionCandidates={mentionCandidates.length > 0 ? mentionCandidates : undefined}
            onSend={(text) => {
              // Items 1-3 final wiring: thread the active reply target
              // through the send so the inserted row gets
              // reply_to_message_id (migration 20260513210912).
              const replyId = replyTarget?.messageId ?? null;
              appendLocalMessage(threadKey, text);
              setReplyTarget(null);
              startTransition(async () => {
                const result = await sendMessageAction(tenantSlug, inquiryId, threadType, text, replyId);
                if ("error" in result) toast(`Send failed: ${result.error}`);
              });
            }}
            workspaceName={wsName}
            // SEND AS toggle gating (2026-05-13 product fix): only
            // show the workspace-identity option in the Group (talent)
            // thread — where staff post internally and "Impronta
            // Models" reads as the team voice. In the Client (private)
            // thread the user wants the admin to always appear as a
            // person (Name + photo + "Coordinator" label) — never as
            // the raw workspace identity. Clients shouldn't see the
            // workspace abstraction; they're meant to know the
            // person handling their booking.
            canSendAsWorkspace={canSendAsWs && threadType !== "private"}
            onSendAsWorkspace={(text) => {
              const replyId = replyTarget?.messageId ?? null;
              appendLocalMessage(threadKey, text, "workspace");
              setReplyTarget(null);
              startTransition(async () => {
                const result = await sendMessageAction(tenantSlug, inquiryId, threadType, text, replyId);
                if ("error" in result) toast(`Send failed: ${result.error}`);
              });
            }}
            // C1 — attach files to the inquiry. Uses the existing
            // uploadInquiryAttachment server action (admin-only). The
            // attachment is uploaded into inquiry_attachments and a
            // system message is posted to signal the upload.
            onAttach={(file) => {
              startTransition(async () => {
                const fd = new FormData();
                fd.append("inquiryId", inquiryId);
                fd.append("file", file);
                const r = await uploadInquiryAttachment(fd);
                if (!r.ok) toast(`Attach failed: ${r.error}`);
                else toast(`File attached — ${file.name}`);
              });
            }}
          />
        )}
      </div>
    </div>
  );
}
