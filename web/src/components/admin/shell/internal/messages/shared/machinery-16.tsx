"use client";

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { getMessageStringArray } from "@/i18n/messages";
import { sendInquiryMessageAsTalent } from "@/lib/server-actions/talent-pipeline";
import { sendInquiryMessageAsClient } from "@/lib/server-actions/client-pipeline";
import { COLORS, FONTS, useAdminShell } from "../../state";
import { Avatar } from "../../primitives";
import { MOCK_THREAD, type Conversation } from "../../talent";
import { appendLocalMessage, readLocalMessages, useMessageStashSubscription } from "../conversation-stash";
import { FirstConvBanner, getWorkspaceIdentity, isFirstConvWith } from "./inbox-identity-1";
import { convToInquiry } from "./machinery-1";
import { LiveLineupPanel } from "./machinery-11";
import { DaySeparator, TeamStrip, dayKey, renderWithMentions } from "./machinery-15";
import { SystemEventBubble } from "./machinery-6";
import { RealThreadStream } from "@/components/talent/talent-thread-stream";
import { VoiceRecorderButton } from "@/components/chat-interactions/VoiceRecorderButton";
import {
  loadTalentInquiryThread,
  loadTalentInquiryGuestTrust,
  blockInquirySenderAsTalent,
  reportInquirySenderAsTalent,
  type TalentThreadMessage,
  type TalentGuestTrustChipData,
} from "@/app/(workspace)/[tenantSlug]/talent/inbox/[id]/actions";
import { GuestTrustChip } from "@/components/inquiry/GuestTrustChip";
import { useThreadPresence } from "@/lib/realtime/presence";
import { TypingRow } from "@/components/messages/thread-enhancements";
import { PinnedStrip } from "@/components/chat-interactions/PinnedStrip";
import { usePinnedMessages } from "@/components/chat-interactions/usePinnedMessages";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


// ── CrossThreadBridge — a low-key sliver that tells non-coord talent:
// "the coord is also negotiating with the client; here's a stage-aware
// snapshot of what's happening over there." Doesn't leak message bodies —
// just the meta-state. Closes the awareness gap. ──
export function CrossThreadBridge({ who, clientName, stage }: { who: string; clientName: string; stage: string }) {
  const t = useT();
  const summary = (() => {
    const vars = { who, clientName };
    if (stage === "inquiry") return interpolate(t("dashboard.adminTabs.crossThread.inquiry"), vars);
    if (stage === "hold") return interpolate(t("dashboard.adminTabs.crossThread.hold"), vars);
    if (stage === "booked") return interpolate(t("dashboard.adminTabs.crossThread.booked"), vars);
    if (stage === "past") return interpolate(t("dashboard.adminTabs.crossThread.past"), vars);
    return interpolate(t("dashboard.adminTabs.crossThread.default"), vars);
  })();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 11px", background: "rgba(11,11,13,0.025)", border: `1px dashed ${COLORS.borderSoft}`, borderRadius: 8, fontFamily: FONTS.body, fontSize: 11.25, lineHeight: 1.45 }} className="text-admin-ink-muted">
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden style={{ flexShrink: 0, opacity: 0.6 }}>
        <path d="M3 4h6M3 7h4M3 10h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <circle cx="11" cy="3" r="1" fill="currentColor"/>
      </svg>
      <span><strong style={{ fontWeight: 600 }} className="text-admin-ink">{t("dashboard.adminTabs.crossThread.clientSide")}</strong> · {summary}</span>
    </div>
  );
}

// ── Chat stream + composer (shared by talent + client tabs) ──
export function ConversationTab({
  conv, placeholder, threadKey, crossThreadBridge,
  /** Permissions / shape from the host shell. Drives whether the
   *  TeamStrip lets the user edit the lineup, see fees, etc. */
  povCanEditLineup = false,
  povCanSeeOffers = false,
  povCanSeeCoordNote = true,
  /** "chat" (default) = human conversation only — clean. "activity" =
   *  the job's money/booking timeline (offer → payment → booking) as
   *  timestamped cards, read-only. Splits the two so Chat stays a
   *  conversation and every financial/status event lives in Activity. */
  mode = "chat",
  /** Which real thread to load + post to. Defaults to the talent's GROUP
   *  thread. The talent shell passes "private" for a talent-COORDINATOR's
   *  client sub-thread (hub self-coordination) so the same component loads
   *  the client chat and routes sends there. */
  realThreadType = "group",
  /** Explicit send handler for the real-inquiry path. When provided it
   *  overrides the threadKey-suffix dispatch below — the talent shell uses
   *  it to post a coordinator's reply to the client (private) thread via
   *  sendTalentInquiryMessage(..., "private") instead of the client action. */
  onSendReal,
}: {
  conv: Conversation;
  placeholder: string;
  threadKey: string;
  /** Non-coord talent doesn't see the client thread — but they should
   *  know it exists. This thin sliver tells them "the coord is also
   *  brokering the client side, you'll be looped in on the outcome."
   *  Now surfaces inside the LineupDrawer rather than a banner. */
  crossThreadBridge?: { who: string; clientName: string };
  povCanEditLineup?: boolean;
  povCanSeeOffers?: boolean;
  povCanSeeCoordNote?: boolean;
  mode?: "chat" | "activity";
  realThreadType?: "group" | "private";
  onSendReal?: (text: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { toast, bridgeTalentSelfProfile, bridgeSessionIdentity } = useAdminShell();
  const t = useT();
  // S0.3 retirement: TeamStrip tap now nudges user to the Lineup tab
  // (parent shell handles tab switching). The drawer is no longer rendered.
  const openLineupTab = () => toast(t("dashboard.adminTabs.composer.openLineupToast"));
  const inquiryForLineup = useMemo(() => convToInquiry(conv), [conv]);
  // Subscribe to message-stash updates so newly-sent messages appear
  // immediately. Without this, the composer pushes into the store but
  // React doesn't know to re-render this thread.
  useMessageStashSubscription();
  // Look up the per-thread message bank first (e.g. "c7:talent" /
  // "c7:client" for coord-talent jobs that have BOTH threads). Fall
  // back to the unscoped conv.id bank for jobs where booking-team is
  // the only visible thread. Local stash appends "Just now" messages
  // the talent has sent in this session — no backend, but the demo
  // walkthrough now reads "send → see your bubble".
  const seedMessages = MOCK_THREAD[threadKey] ?? MOCK_THREAD[conv.id] ?? [];
  const stashKey = MOCK_THREAD[threadKey] ? threadKey : conv.id;
  const localMessages = readLocalMessages(stashKey).map(m => ({
    id: m.id, kind: "text" as const, sender: m.sender, body: m.body, ts: m.ts, readBy: [],
  }));
  const messages = [...seedMessages, ...localMessages];
  // Real-thread mode: when the conv is a real inquiry (UUID) and a real talent
  // identity is in scope, load the live GROUP thread from Supabase (text +
  // money/booking cards) and render THAT instead of the mock prototype thread.
  // Mock convs (synthetic "c7" ids) are untouched — showReal is false for them.
  const isRealInquiry = UUID_RE.test(conv.id);
  const showReal = isRealInquiry && bridgeTalentSelfProfile != null;
  const [realThread, setRealThread] = useState<TalentThreadMessage[] | null>(null);
  useEffect(() => {
    if (!showReal) { setRealThread(null); return; }
    let active = true;
    setRealThread(null);
    loadTalentInquiryThread(conv.id, realThreadType).then((rows) => { if (active) setRealThread(rows); });
    return () => { active = false; };
    // Re-load when switching conv or when a local send appends (stash bump).
  }, [conv.id, showReal, realThreadType]);
  // Re-pull the real thread after an out-of-band send (e.g. a voice note that
  // goes straight to the server, bypassing the optimistic text path).
  const refreshRealThread = useCallback(() => {
    if (!showReal) return;
    loadTalentInquiryThread(conv.id, realThreadType).then(setRealThread);
  }, [showReal, conv.id, realThreadType]);
  // Guest/client trust chip — the talent-facing identity + trust summary for
  // the inquiry's sender (tier badge, per-signal ticks, booking count, one-line
  // risk read). Loaded once per real inquiry; renders atop the thread header on
  // the talent's GROUP thread (the lineup-talent view). Suppressed on the
  // private/coordinator sub-thread (the coordinator already has the client
  // surface) and on mock convs. Null until loaded / when not authorised.
  const showTrustChip = showReal && realThreadType === "group";
  const [trustChip, setTrustChip] = useState<TalentGuestTrustChipData | null>(null);
  useEffect(() => {
    if (!showTrustChip) { setTrustChip(null); return; }
    let active = true;
    setTrustChip(null);
    loadTalentInquiryGuestTrust(conv.id).then((data) => { if (active) setTrustChip(data); });
    return () => { active = false; };
  }, [conv.id, showTrustChip]);
  // Ephemeral typing presence — broadcast-only, no DB. One channel per real
  // inquiry thread (group vs private kept distinct). Null channelKey on mock
  // convs / when no session identity → the hook is a safe no-op.
  const presenceChannelKey = showReal && bridgeSessionIdentity?.userId
    ? `inquiry:${conv.id}:${realThreadType}`
    : null;
  const { typingUsers, setTyping } = useThreadPresence({
    channelKey: presenceChannelKey,
    userId: bridgeSessionIdentity?.userId ?? "",
    displayName: bridgeSessionIdentity?.displayName ?? "Someone",
  });
  // Inquiry-wide pinned messages (shared — everyone on the thread sees the
  // same set). Only real inquiries have a backing thread; mock convs no-op.
  const { pins, pinnedIds, refresh: refreshPins, removeLocal: removePinLocal } =
    usePinnedMessages(showReal ? conv.id : null, realThreadType);
  // Jump to a pinned message: scroll its bubble into view + pulse-highlight.
  const jumpToMessage = useCallback((messageId: string) => {
    const el = document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.transition = "background 600ms";
    const prevBg = el.style.background;
    el.style.background = COLORS.accentSoft;
    window.setTimeout(() => { el.style.background = prevBg; }, 900);
  }, []);
  const unpinMessage = useCallback(async (messageId: string) => {
    removePinLocal(messageId);
    const { toggleMessagePin } = await import("@/lib/server-actions/message-pins");
    await toggleMessagePin(messageId, conv.id);
    void refreshPins();
  }, [conv.id, removePinLocal, refreshPins]);
  // In-thread search — small toggle in the header opens a compact
  // search input that filters visible bubbles to those whose body
  // matches. System events are kept (they often anchor the search
  // in a date range, e.g. "show me what happened around the booking").
  const [searchOpen, setSearchOpen] = useState(false);
  const [threadSearch, setThreadSearch] = useState("");
  const allTextMessages = messages.filter(m => m.kind === "text") as Array<Extract<(typeof messages)[number], { kind: "text" }>>;
  const textMessages = threadSearch.trim()
    ? allTextMessages.filter(m => m.body.toLowerCase().includes(threadSearch.toLowerCase()))
    : allTextMessages;
  // System events surface centered between message clusters — same data
  // the Activity timeline shows, so the two views never drift.
  const systemEvents = messages.filter(m => m.kind === "system") as Array<Extract<(typeof messages)[number], { kind: "system" }>>;

  // Suppress 'unused' for crossThreadBridge — kept in the API in case
  // a caller needs to surface it explicitly later. The bridge content
  // is now folded into the LineupDrawer (more durable surface).
  void crossThreadBridge;

  // Stub: simulate the coordinator typing on active threads (presence cue).
  const showTyping = textMessages.length > 0 && (conv.stage === "inquiry" || conv.stage === "hold");

  return (
    <div style={{
      // Premium chat layout: fixed top (pins) → scrollable middle
      // (messages) → fixed bottom (composer). Replaces the prior single
      // scrolling block that pushed the composer + pin off-screen as
      // history grew.
      display: "flex", flexDirection: "column",
      flex: 1, minHeight: 0,
      fontFamily: FONTS.body,
    }}>
      {/* Fixed top — slim TeamStrip showing all members at a glance.
          Replaces the old stack of pinned notes (action pin + coord
          note + cross-thread bridge), which ate vertical space. The
          coordinator note + the cross-thread "client side" snippet
          now live inside the LineupDrawer that opens on tap. */}
      <div style={{
        flexShrink: 0,
        padding: "10px 14px 0",
        background: "#fff",
      }}>
        {/* Guest/client trust chip — talent-facing identity + trust summary for
            the inquiry sender. Renders atop the thread header (chat view) once
            loaded. Block/Report affordances are injected only when a subject is
            resolvable (registered client OR guest session on the inquiry). */}
        {mode === "chat" && trustChip && (
          <div className="mb-2">
            <GuestTrustChip
              identity={trustChip.identity}
              tier={trustChip.tier}
              displayName={trustChip.displayName}
              signals={trustChip.signals}
              completedBookings={trustChip.completedBookings}
              riskLine={trustChip.riskLine}
              isBlocked={trustChip.isBlocked}
              onBlock={
                trustChip.blockTarget
                  ? async () => {
                      const target = trustChip.blockTarget!;
                      const r = await blockInquirySenderAsTalent(target.inquiryId, target.subjectType, target.subjectId);
                      if (r.ok) setTrustChip((prev) => (prev ? { ...prev, isBlocked: true } : prev));
                      else toast(t("dashboard.adminTabs.composer.blockFailed"));
                      return r;
                    }
                  : null
              }
              onReport={
                trustChip.blockTarget
                  ? async (reason) => reportInquirySenderAsTalent(trustChip.blockTarget!.inquiryId, reason)
                  : null
              }
            />
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <div className="flex-1 min-w-0">
            <TeamStrip
              lineup={inquiryForLineup.talent}
              canEdit={povCanEditLineup}
              povLabel={povCanEditLineup ? "edit" : "view"}
              onOpen={openLineupTab}
            />
          </div>
          {/* In-thread search toggle. Click reveals a compact search
              input + filters bubbles to those whose body matches. Esc
              clears + closes. */}
          <button type="button"
            onClick={() => { setSearchOpen(o => !o); if (searchOpen) setThreadSearch(""); }}
            aria-label={searchOpen ? t("dashboard.adminTabs.composer.closeThreadSearch") : t("dashboard.adminTabs.composer.searchThread")}
            title={searchOpen ? t("dashboard.adminTabs.composer.closeSearch") : t("dashboard.adminTabs.composer.searchThread")}
            style={{
              flexShrink: 0,
              width: 30, height: 30, borderRadius: 8,
              border: `1px solid ${searchOpen ? COLORS.accent : COLORS.borderSoft}`,
              background: searchOpen ? COLORS.accentSoft : "#fff",
              color: searchOpen ? COLORS.accentDeep : COLORS.inkMuted,
              cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M9 9l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        {searchOpen && (
          <div className="mt-2">
            <input
              type="text"
              autoFocus
              value={threadSearch}
              onChange={(e) => setThreadSearch(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setThreadSearch(""); setSearchOpen(false); } }}
              placeholder={t("dashboard.adminTabs.composer.searchPlaceholder")}
              style={{
                width: "100%", padding: "7px 12px", borderRadius: 999,
                border: `1px solid ${COLORS.borderSoft}`,
                background: COLORS.surfaceAlt,
                fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink,
                outline: "none", boxSizing: "border-box",
              }}
            />
            {threadSearch.trim() && (
              <div style={{ marginTop: 4, fontSize: 10.5, fontFamily: FONTS.body }} className="text-admin-ink-muted">
                {interpolate(t(textMessages.length === 1 ? "dashboard.adminTabs.composer.matchCountOne" : "dashboard.adminTabs.composer.matchCountMany"), { count: textMessages.length, query: threadSearch })}
              </div>
            )}
          </div>
        )}
        {/* LineupDrawer retired (S0.3). TeamStrip tap toasts a nudge
            to the Lineup tab; the canonical lineup surface is now the
            LiveLineupPanel rendered there. */}
        {/* First-time conv context banner — surfaces only when this
            client is in our "first encounter" set. Audience defaults
            to talent (the most common ConversationTab consumer);
            client + coord-talent both fall under the same friendly
            framing here. */}
        {isFirstConvWith(conv.client) && (
          <div style={{ marginTop: 8, marginLeft: -14, marginRight: -14 }}>
            <FirstConvBanner clientName={conv.client} audience="talent" />
          </div>
        )}
        {/* Pinned strip — inquiry-wide pinned messages, shared across the
            thread. Renders nothing when empty. Chat view only. */}
        {mode === "chat" && pins.length > 0 && (
          <div style={{ marginTop: 8, marginBottom: 2 }}>
            <PinnedStrip
              pins={pins}
              onJump={jumpToMessage}
              onUnpin={unpinMessage}
              palette={{
                accent: COLORS.accentDeep,
                accentSoft: COLORS.accentSoft,
                ink: COLORS.ink,
                inkMuted: COLORS.inkMuted,
                border: COLORS.borderSoft,
                surface: "#fff",
              }}
            />
          </div>
        )}
      </div>
      {/* Scrollable middle — message stream + system events. Only THIS
          area scrolls; the pins and composer stay locked in view. */}
      <div style={{
        flex: 1, minHeight: 0, overflowY: "auto",
        padding: "10px 14px",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        {showReal ? (
          <RealThreadStream
            messages={realThread}
            conv={conv}
            toast={toast}
            mode={mode}
            pinnedIds={pinnedIds}
            onPinChanged={() => { void refreshPins(); }}
          />
        ) : (<>
        {systemEvents.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 4 }}>
            {systemEvents.map(e => (
              <SystemEventBubble key={e.id} body={e.body} ts={e.ts} />
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2.5">
        {textMessages.length === 0 ? (
          <ConversationEmptyState />
        ) : textMessages.map((m, idx) => {
          const mine = m.sender === "you";
          const lastMine = mine && idx === textMessages.length - 1;
          const prevDay = idx > 0 ? dayKey(textMessages[idx - 1]!.ts) : null;
          const thisDay = dayKey(m.ts);
          const showDay = thisDay !== prevDay;
          // Workspace bubble = the System User. Resolves to the
          // workspace identity registered for conv.agency, falling
          // back to a synthesized one. Shown with the workspace name +
          // logo + a "Workspace" role label so recipients know this
          // is the agency speaking, not an individual coord.
          const wsIdentity = m.sender === "workspace" ? getWorkspaceIdentity(conv.agency) : null;
          const senderName =
              m.sender === "coordinator" ? conv.leader.name
            : m.sender === "client" ? conv.client
            : m.sender === "agency" ? conv.agency
            : m.sender === "workspace" ? wsIdentity!.name
            : t("dashboard.adminTabs.composer.you");
          const senderInitials =
              m.sender === "coordinator" ? conv.leader.initials
            : m.sender === "client" ? conv.clientInitials
            : m.sender === "agency" ? conv.agency.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
            : m.sender === "workspace" ? wsIdentity!.initials
            : "ME";
          const roleLabel = m.sender === "you" ? null
            : m.sender === "workspace" ? t("dashboard.adminTabs.composer.roleWorkspace")
            : m.sender === "coordinator" ? t("dashboard.adminTabs.composer.roleCoordinator")
            : m.sender === "client" ? t("dashboard.adminTabs.composer.roleClient")
            : m.sender === "agency" ? t("dashboard.adminTabs.composer.roleAgency")
            : m.sender;
          return (
            <React.Fragment key={m.id}>
            {showDay && <DaySeparator label={thisDay} />}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexDirection: mine ? "row-reverse" : "row" }}>
              {!mine && (
                <Avatar
                  size={26}
                  tone={m.sender === "coordinator" || m.sender === "workspace" ? "ink" : "auto"}
                  hashSeed={senderName}
                  initials={senderInitials}
                  photoUrl={m.sender === "workspace" ? wsIdentity?.logoUrl : undefined}
                />
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
                  <div style={{ fontSize: 10.5, fontWeight: 700, marginBottom: 2, display: "inline-flex", alignItems: "center", gap: 5, flexWrap: "wrap" }} className="text-admin-ink-muted">
                    <span>{senderName}{roleLabel ? <span className="font-medium"> · {roleLabel}</span> : null}</span>
                    {m.sender === "workspace" && (
                      <span title={t("dashboard.adminTabs.composer.systemUserTitle")} style={{
                        display: "inline-flex", alignItems: "center", gap: 3,
                        padding: "0 5px", borderRadius: 999,
                        background: COLORS.indigoSoft, color: COLORS.indigoDeep,
                        fontSize: 8.5, fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: 0.4,
                      }}>
                        <svg width="7" height="7" viewBox="0 0 8 8" fill="none" aria-hidden>
                          <path d="M2 1.5h4l1 1.5v3l-1 1.5H2l-1-1.5v-3l1-1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
                        </svg>
                        {t("dashboard.adminTabs.composer.systemBadge")}
                      </span>
                    )}
                    {/* Phase 5 — Network multi-workspace attribution.
                        When the conv came in via an agency referral
                        AND this is a workspace-sent bubble, surface
                        the referring agency alongside the sender's
                        workspace so both parties' identities are
                        visible in the federated context. */}
                    {m.sender === "workspace"
                      && conv.source?.kind === "agency-referral"
                      && (conv.source as { via?: string }).via
                      && (conv.source as { via?: string }).via !== conv.agency && (
                      <span title={interpolate(t("dashboard.adminTabs.composer.referredVia"), { via: (conv.source as { via?: string }).via ?? "" })} style={{
                        display: "inline-flex", alignItems: "center", gap: 3,
                        padding: "0 5px", borderRadius: 999,
                        background: "rgba(46,125,91,0.14)", color: "#1F5C40",
                        fontSize: 8.5, fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: 0.4,
                      }}>
                        <svg width="7" height="7" viewBox="0 0 8 8" fill="none" aria-hidden>
                          <circle cx="2.5" cy="4" r="1" stroke="currentColor" strokeWidth="0.9"/>
                          <circle cx="5.5" cy="4" r="1" stroke="currentColor" strokeWidth="0.9"/>
                          <path d="M3.5 4h1" stroke="currentColor" strokeWidth="0.9"/>
                        </svg>
                        ↔ {(conv.source as { via?: string }).via}
                      </span>
                    )}
                  </div>
                )}
                {renderWithMentions(m.body, mine)}
                <div style={{ fontSize: 10, color: mine ? "rgba(255,255,255,0.55)" : COLORS.inkDim, marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {m.ts}
                  {mine && (
                    <span aria-hidden style={{ display: "inline-flex" }}>
                      <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                        <path d="M1 4.8L3.5 7L7 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M5 4.8L7.5 7L11 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                  )}
                  {lastMine && (
                    <span style={{ marginLeft: 4, fontWeight: 500 }}>· {t("dashboard.adminTabs.composer.read")}</span>
                  )}
                </div>
              </div>
            </div>
            </React.Fragment>
          );
        })}
        {showTyping && <TypingIndicator who={conv.leader.name.split(" ")[0]} />}
        </div>
        </>)}
      </div>
      {/* Ephemeral typing-presence row — sits between the message list and
          the composer. Renders nothing when no peer is typing. */}
      {mode !== "activity" && <TypingRow users={typingUsers} color={COLORS.inkMuted} />}
      {/* Fixed composer — locked at the bottom of the visible area so
          users can always reply without scrolling. Closed convs
          (cancelled / past) replace the composer with a closure
          notice. Hidden entirely in Activity mode — the activity
          timeline is a read-only record of money/booking events. */}
      {mode !== "activity" && (
      <div style={{
        flexShrink: 0,
        padding: "10px 14px 14px",
        background: "#fff",
        borderTop: `1px solid ${COLORS.borderSoft}`,
      }}>
        {(conv.stage === "cancelled" || conv.stage === "past") ? (
          <div style={{ padding: "10px 14px", borderRadius: 999, border: `1px solid ${COLORS.borderSoft}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: FONTS.body, fontSize: 12 }} className="bg-admin-surface-alt text-admin-ink-muted">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
              <rect x="3" y="6.5" width="8" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M5 6.5V5a2 2 0 014 0v1.5" stroke="currentColor" strokeWidth="1.4"/>
            </svg>
            {conv.stage === "past"
              ? t("dashboard.adminTabs.composer.closedWrapped")
              : conv.outcome === "client_cancelled"
                ? t("dashboard.adminTabs.composer.closedCancelled")
                : conv.outcome === "client_rejected"
                  ? t("dashboard.adminTabs.composer.closedRejected")
                  : conv.outcome === "client_no_response"
                    ? t("dashboard.adminTabs.composer.closedNoResponse")
                    : t("dashboard.adminTabs.composer.closedGeneric")}
          </div>
        ) : (
          <DraftComposer
            threadKey={threadKey}
            placeholder={placeholder}
            onSend={(text) => {
              appendLocalMessage(stashKey, text);
              // Synthetic mock conv ids stay local-only for the demo.
              const isRealInquiry = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conv.id);
              if (isRealInquiry) {
                // An explicit onSendReal wins (the talent shell passes one for a
                // COORDINATOR's client sub-thread → sendTalentInquiryMessage(...,
                // "private")). Otherwise dispatch by threadKey suffix:
                //   ":client" → client thread — sendInquiryMessageAsClient (G-pass)
                //   ":talent" → talent group thread — sendInquiryMessageAsTalent (F-pass)
                const send = onSendReal
                  ? onSendReal(text)
                  : /:client$/.test(threadKey)
                    ? sendInquiryMessageAsClient(conv.id, text)
                    : sendInquiryMessageAsTalent(conv.id, text);
                void send.then((r) => { if (!r.ok) toast(interpolate(t("dashboard.adminTabs.composer.sendFailed"), { error: r.error ?? "" })); });
              } else {
                toast(t("dashboard.adminTabs.composer.messageSent"));
              }
            }}
            workspaceName={conv.agency}
            // Sender attribution is a server concern. Keep send-as hidden
            // until persisted sender roles are supported.
            canSendAsWorkspace={false}
            onTyping={setTyping}
            voiceContext={showReal ? { inquiryId: conv.id, threadType: realThreadType } : undefined}
            onVoiceSent={refreshRealThread}
          />
        )}
      </div>
      )}
    </div>
  );
}

export function ConversationEmptyState() {
  const t = useT();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "32px 16px", fontFamily: FONTS.body, textAlign: "center" }} className="text-admin-ink-dim">
      <span aria-hidden style={{
        width: 36, height: 36, borderRadius: "50%",
        background: COLORS.surfaceAlt, color: COLORS.inkMuted,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        marginBottom: 4,
      }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 4h10c.6 0 1 .4 1 1v6c0 .6-.4 1-1 1H7l-3 2.5V12H3c-.6 0-1-.4-1-1V5c0-.6.4-1 1-1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
        </svg>
      </span>
      <div className="text-admin-ink text-admin-13 font-semibold">{t("dashboard.adminTabs.composer.noMessagesYet")}</div>
      <div style={{ fontSize: 11.5, maxWidth: 240 }} className="text-admin-ink-muted">
        {t("dashboard.adminTabs.composer.noMessagesBlurb")}
      </div>
    </div>
  );
}

export function TypingIndicator({ who }: { who: string }) {
  const t = useT();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 12px", fontFamily: FONTS.body, fontSize: 11, fontStyle: "italic" }} className="text-admin-ink-muted">
      <span className="inline-flex gap-0.5">
        {[0, 1, 2].map(i => (
          <span key={i} aria-hidden style={{
            width: 5, height: 5, borderRadius: "50%", background: COLORS.inkMuted,
            opacity: 0.6,
            animation: `tulalaTypingDot 1.2s ${i * 0.15}s infinite ease-in-out`,
          }} />
        ))}
      </span>
      {interpolate(t("dashboard.adminTabs.composer.isTyping"), { who })}
      <style>{`
        @keyframes tulalaTypingDot {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-2px); }
        }
      `}</style>
    </div>
  );
}

// Composer that persists drafts per (inquiry, thread) so switching tabs
// doesn't lose typed text. Uses an in-memory map keyed by `threadKey`.
// Includes: attachment button, AI smart-reply chips (shown by default),
// draft persistence.
export const __draftStore: Map<string, string> = new Map();

export const SMART_REPLIES_FOR_LAST: Record<string, string[]> = {
  inquiry: ["Got it, pulling options", "When do you need it by?", "On it."],
  hold:    ["Confirming with talent", "Sending revised offer", "Will update by EOD"],
  offer:   ["Approved, proceeding", "Can we adjust dates?", "Need budget breakdown"],
  default: ["Sounds good", "Let me check", "Confirming shortly"],
};

/** A single mention candidate — a participant in the inquiry conversation. */
export type MentionCandidate = {
  /** Slash-safe name — no spaces guaranteed, but we handle it. */
  name: string;
  role?: string;
};

export function DraftComposer({
  threadKey, placeholder, onSend, smartReplyContext = "default",
  // Phase 4 of System User direction — when both `workspaceName` is
  // provided AND the caller has permission (coord+ in a paid tier),
  // a small "Send as" toggle appears letting the user post as the
  // workspace identity rather than themselves. The composer doesn't
  // enforce permissions itself; callers gate availability via the
  // `canSendAsWorkspace` flag.
  workspaceName,
  canSendAsWorkspace = false,
  onSendAsWorkspace,
  // C1: optional attachment handler. When provided, the paperclip
  // button is enabled and opens a file picker. The caller handles
  // the actual upload (admin passes uploadInquiryAttachment).
  onAttach,
  // C3: optional mention candidates. When set, typing "@" opens a
  // picker listing these participants. Selecting one inserts "@Name"
  // at the cursor position. renderWithMentions highlights the tags.
  mentionCandidates,
  // Ephemeral typing-presence beat. Called with `true` on each keystroke and
  // `false` on send/blur. The host wires this to useThreadPresence().setTyping.
  onTyping,
  // Voice notes (Deep-plan W11). When a real inquiry context is supplied, the
  // disabled "coming soon" mic is replaced by a live recorder that uploads +
  // sends a voice message. onVoiceSent fires after a successful send so the
  // host refreshes the thread.
  voiceContext,
  onVoiceSent,
}: {
  threadKey: string;
  placeholder: string;
  onSend: (text: string) => void;
  smartReplyContext?: string;
  workspaceName?: string;
  canSendAsWorkspace?: boolean;
  onSendAsWorkspace?: (text: string) => void;
  onAttach?: (file: File) => void;
  mentionCandidates?: MentionCandidate[];
  onTyping?: (isTyping: boolean) => void;
  voiceContext?: { inquiryId: string; threadType: "private" | "group" };
  onVoiceSent?: () => void;
}) {
  const { toast: __composerToast } = useAdminShell();
  const t = useT();
  const locale = useDashboardLocale();
  const [val, setVal] = useState(() => __draftStore.get(threadKey) ?? "");
  // C3 — @-mention picker state. Opens when the user types "@" anywhere
  // in the input. Stores the partial query after "@" for filtering.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Detect "@" trigger: find the last "@" before the cursor and derive
  // the query string (text typed after the "@"). If the user has typed
  // a space or deleted the "@", close the picker.
  const updateMentionState = useCallback((text: string, cursorPos: number) => {
    if (!mentionCandidates?.length) { setMentionQuery(null); return; }
    const textBefore = text.slice(0, cursorPos);
    const atIdx = textBefore.lastIndexOf("@");
    if (atIdx < 0) { setMentionQuery(null); return; }
    const fragment = textBefore.slice(atIdx + 1);
    // Close the picker if the fragment contains a space (mention ended).
    if (fragment.includes(" ")) { setMentionQuery(null); return; }
    setMentionQuery(fragment);
  }, [mentionCandidates]);

  // Filter candidates by the current query (case-insensitive prefix match).
  const filteredMentions = mentionQuery !== null && mentionCandidates?.length
    ? mentionCandidates.filter(c =>
        c.name.toLowerCase().startsWith(mentionQuery.toLowerCase())
      ).slice(0, 6)
    : [];

  const showMentionPicker = mentionQuery !== null && filteredMentions.length > 0;

  // When the user selects a candidate, replace "@<query>" in the input
  // with "@FirstName" (first word of name, no spaces — cleaner tag).
  const selectMention = useCallback((candidate: MentionCandidate) => {
    const input = inputRef.current;
    const cursorPos = input?.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursorPos);
    const textAfter = val.slice(cursorPos);
    const atIdx = textBefore.lastIndexOf("@");
    if (atIdx < 0) { setMentionQuery(null); return; }
    // Use first name only so tags don't create long spans.
    const tag = `@${candidate.name.split(" ")[0]}`;
    const newVal = textBefore.slice(0, atIdx) + tag + " " + textAfter;
    setVal(newVal);
    setMentionQuery(null);
    // Restore focus + move cursor after the inserted tag.
    requestAnimationFrame(() => {
      if (!input) return;
      input.focus();
      const newCursor = atIdx + tag.length + 1;
      input.setSelectionRange(newCursor, newCursor);
    });
  }, [val]);

  const [hasSent, setHasSent] = useState(false);
  // Send-as state — defaults to "you" so accidental posts don't
  // attribute to the workspace.
  const [sendAs, setSendAs] = useState<"you" | "workspace">("you");
  const wsAvailable = canSendAsWorkspace && !!workspaceName && !!onSendAsWorkspace;
  // C4 — smart replies shown by DEFAULT above the composer.
  // Top 2-3 chips surface immediately on fresh/empty threads so the
  // user always sees them without having to hit a sparkle toggle.
  // They auto-collapse: (a) when the user starts typing, (b) when
  // switching threads (tab-switch), (c) after the first send.
  // "Smart open" starts true and collapses on first keystroke; the
  // sparkle toggle can re-open them at any time.
  const [smartOpen, setSmartOpen] = useState(true);
  useEffect(() => {
    if (val) __draftStore.set(threadKey, val); else __draftStore.delete(threadKey);
    if (val) setSmartOpen(false); // typing closes the suggestions
  }, [val, threadKey]);
  useEffect(() => {
    setVal(__draftStore.get(threadKey) ?? "");
    setHasSent(false);
    setSmartOpen(false); // switching threads collapses the panel
  }, [threadKey]);
  // Localized smart-reply chips keyed by the (English) smartReplyContext
  // discriminant. The catalog stores per-context string arrays; on a miss
  // we fall back to the English SMART_REPLIES_FOR_LAST map so behavior is
  // preserved for any context without a catalog entry.
  const smartCtxKey = ["inquiry", "hold", "offer"].includes(smartReplyContext) ? smartReplyContext : "default";
  const localizedReplies = getMessageStringArray(locale, `dashboard.adminTabs.smartReplies.${smartCtxKey}`);
  const replies = localizedReplies.length > 0
    ? localizedReplies
    : (SMART_REPLIES_FOR_LAST[smartReplyContext] ?? SMART_REPLIES_FOR_LAST.default);
  // Show top 2-3 chips only so the row stays compact.
  const visibleReplies = (replies ?? []).slice(0, 3);
  const handleSend = (text: string) => {
    if (sendAs === "workspace" && wsAvailable) {
      onSendAsWorkspace!(text);
    } else {
      onSend(text);
    }
    setVal(""); setHasSent(true); setSmartOpen(false);
    onTyping?.(false);
    // After sending as workspace, snap back to "you" so consecutive
    // sends don't all auto-attribute to the workspace by accident.
    setSendAs("you");
  };
  const canShowSmart = !val && !hasSent && visibleReplies.length > 0;

  return (
    <div data-tulala-composer-wrap style={{ marginTop: 8 }}>
      {/* Smart-reply chips row — shown by default on fresh threads.
          Top 2-3 chips displayed above the composer so users don't
          have to look for them. Auto-collapses on first keystroke,
          tab-switch, or send. The sparkle button re-opens them when
          collapsed. canShowSmart gates the whole block (typing /
          sending / no-replies all suppress this). */}
      {canShowSmart && smartOpen && (
        <div data-tulala-smart-replies style={{
          display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap",
          alignItems: "center",
          animation: "tulala-smart-fade .16s cubic-bezier(.4,0,.2,1)",
        }}>
          <style dangerouslySetInnerHTML={{ __html:
            "@keyframes tulala-smart-fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}"
          }} />
          {visibleReplies.map((r, i) => (
            <button key={i} type="button" onClick={() => { setVal(r); setSmartOpen(false); }} style={{
              padding: "5px 11px", borderRadius: 999,
              background: COLORS.royalSoft,
              border: `1px solid rgba(95,75,139,0.18)`,
              color: COLORS.royal,
              fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 500,
              cursor: "pointer",
            }}>
              {r}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSmartOpen(false)}
            aria-label={t("dashboard.adminTabs.composer.hideSmartReplies")}
            title={t("dashboard.adminTabs.composer.hideSuggestions")}
            style={{
              marginLeft: "auto",
              width: 22, height: 22, borderRadius: "50%",
              border: "none", background: "transparent",
              color: COLORS.inkMuted, cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      )}
      {/* Send-as picker — only renders when the caller can post as
          the workspace (paid tier + coord+ role). Two pill buttons:
          You / <Workspace>. Selected pill carries the indigo System
          User palette so the user always knows which identity will
          attribute the next send. Resets to "You" after each send. */}
      {wsAvailable && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", fontFamily: FONTS.body, marginRight: 2 }} className="text-admin-ink-muted">
            {t("dashboard.adminTabs.composer.sendAs")}
          </span>
          <button type="button"
            onClick={() => setSendAs("you")}
            aria-pressed={sendAs === "you"}
            style={{
              padding: "3px 10px", borderRadius: 999,
              border: `1px solid ${sendAs === "you" ? COLORS.fill : COLORS.borderSoft}`,
              background: sendAs === "you" ? COLORS.fill : "#fff",
              color: sendAs === "you" ? "#fff" : COLORS.ink,
              fontSize: 10.5, fontWeight: 700, cursor: "pointer",
              fontFamily: FONTS.body,
            }}>
            {t("dashboard.adminTabs.composer.you")}
          </button>
          <button type="button"
            onClick={() => setSendAs("workspace")}
            aria-pressed={sendAs === "workspace"}
            title={interpolate(t("dashboard.adminTabs.composer.postAsWorkspace"), { name: workspaceName ?? "" })}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 10px", borderRadius: 999,
              border: `1px solid ${sendAs === "workspace" ? COLORS.indigoDeep : COLORS.borderSoft}`,
              background: sendAs === "workspace" ? COLORS.indigoSoft : "#fff",
              color: sendAs === "workspace" ? COLORS.indigoDeep : COLORS.ink,
              fontSize: 10.5, fontWeight: 700, cursor: "pointer",
              fontFamily: FONTS.body,
            }}>
            <svg width="9" height="9" viewBox="0 0 8 8" fill="none" aria-hidden>
              <path d="M2 1.5h4l1 1.5v3l-1 1.5H2l-1-1.5v-3l1-1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
            </svg>
            {workspaceName}
          </button>
        </div>
      )}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {/* C1 — attachment button. Only rendered when the caller passes
            onAttach (upload is wired). Hidden file input triggers the OS
            picker; selected file is forwarded to onAttach. When attachments
            aren't wired we hide the control entirely rather than showing a
            dead, disabled button. Voice/mic stays stubbed below. */}
        {onAttach && (
          <label
            title={t("dashboard.adminTabs.composer.attachFileTitle")}
            aria-label={t("dashboard.adminTabs.composer.attachFileAria")}
            style={{
              width: 36, height: 36, borderRadius: "50%", border: "none",
              background: "transparent", color: COLORS.inkMuted, cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
          >
            <input
              type="file"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { onAttach(f); e.target.value = ""; }
              }}
            />
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M11 4.5v6a3 3 0 11-6 0V4a2 2 0 014 0v6a1 1 0 11-2 0V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </label>
        )}
        {/* Sparkle toggle — re-opens the smart-reply chips when they've
            been dismissed. Only renders before the user has sent /
            started typing. */}
        {canShowSmart && !smartOpen && (
          <button
            type="button"
            onClick={() => setSmartOpen(true)}
            aria-label={t("dashboard.adminTabs.composer.showSmartReplies")}
            title={t("dashboard.adminTabs.composer.smartReplies")}
            style={{
              width: 36, height: 36, borderRadius: "50%", border: "none",
              background: "transparent",
              color: COLORS.royal, cursor: "pointer", flexShrink: 0,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              transition: "background .12s",
              opacity: 0.65,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v2.5M6 8.5V11M1 6h2.5M8.5 6H11M2.5 2.5l1.7 1.7M7.8 7.8l1.7 1.7M9.5 2.5L7.8 4.2M4.2 7.8l-1.7 1.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
        {/* C3 — @-mention picker floats above the input when active.
            Rendered inside the flex row via absolute positioning from
            the relative wrapper below. */}
        <div style={{ flex: 1, position: "relative" }}>
          {showMentionPicker && (
            <div style={{
              position: "absolute", bottom: "calc(100% + 4px)", left: 0, right: 0,
              background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              boxShadow: "0 4px 16px rgba(11,11,13,0.12)",
              zIndex: 20,
              overflow: "hidden",
              fontFamily: FONTS.body,
            }}>
              <div style={{ padding: "5px 10px 3px", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }} className="text-admin-ink-muted">
                {t("dashboard.adminTabs.composer.mentionSomeone")}
              </div>
              {filteredMentions.map((c, i) => (
                <button
                  key={`${c.name}-${i}`}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); selectMention(c); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    width: "100%", padding: "7px 12px",
                    background: "transparent", border: "none",
                    cursor: "pointer", textAlign: "left",
                    fontFamily: FONTS.body,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.surfaceAlt; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{
                    width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                    background: COLORS.accentSoft, color: COLORS.accentDeep,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700,
                  }}>
                    {c.name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("") || "@"}
                  </span>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }} className="text-admin-ink">{c.name}</div>
                    {c.role && <div style={{ fontSize: 10.5 }} className="text-admin-ink-muted">{c.role}</div>}
                  </div>
                </button>
              ))}
            </div>
          )}
          <input
            ref={inputRef}
            type="text"
            value={val}
            onChange={(e) => {
              setVal(e.target.value);
              updateMentionState(e.target.value, e.target.selectionStart ?? e.target.value.length);
              onTyping?.(e.target.value.length > 0);
            }}
            onBlur={() => onTyping?.(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && showMentionPicker) {
                setMentionQuery(null);
                e.preventDefault();
                return;
              }
              if (e.key === "Enter" && !showMentionPicker && val.trim()) handleSend(val);
            }}
            onClick={(e) => {
              updateMentionState(val, (e.target as HTMLInputElement).selectionStart ?? val.length);
            }}
            placeholder={placeholder}
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 24,
              background: "rgba(11,11,13,0.04)", border: `1.5px solid ${val ? COLORS.accent : "transparent"}`,
              fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink, outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
        {/* Voice note — only rendered when voiceContext is present (recording
            + send is wired). Without it we hide the control rather than show a
            dead, disabled mic button. */}
        {!val && voiceContext && (
          <VoiceRecorderButton
            inquiryId={voiceContext.inquiryId}
            threadType={voiceContext.threadType}
            accent={COLORS.accentDeep}
            idleColor={COLORS.inkMuted}
            onSent={() => onVoiceSent?.()}
            onError={(msg) => __composerToast(msg)}
          />
        )}
        <button type="button" disabled={!val.trim()} onClick={() => { if (val.trim()) handleSend(val); }}
          aria-label={t("dashboard.adminTabs.composer.send")}
          style={{
            width: 36, height: 36, borderRadius: "50%", border: "none",
            cursor: val.trim() ? "pointer" : "default",
            background: val.trim() ? COLORS.fill : "rgba(11,11,13,0.10)",
            color: val.trim() ? "#fff" : COLORS.inkDim,
            display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M12.5 7H1.5M12.5 7L8 2.5M12.5 7L8 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
