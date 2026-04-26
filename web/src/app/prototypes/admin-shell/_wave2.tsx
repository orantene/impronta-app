"use client";

/**
 * Wave-2 surfaces: drawers and inline cards introduced after the initial
 * prototype shipped. Kept in their own file so _drawers.tsx doesn't grow
 * past 7k lines.
 *
 * Drawers (called from DrawerRoot in _drawers.tsx):
 *   - InboxSnippetsDrawer (#9)
 *   - NotificationsPrefsDrawer (#10)
 *   - DataExportDrawer (#16, off-boarding)
 *   - AuditLogDrawer (#15)
 *   - TenantSwitcherDrawer (#3)
 *   - TalentShareCardDrawer (#25)
 *
 * Inline cards (rendered by surface pages):
 *   - <TalentAnalyticsCard /> (#17, talent today)
 *   - <TalentFunnelCard /> (#27, talent today)
 *   - <InquiryTemplatesPicker /> (#26, new-inquiry composer)
 *   - <DoubleBookingWarning /> (#13, inquiry workspace)
 *   - <ReadReceipt /> (#11, message thread)
 *
 * Shared mock data lives at the bottom — kept here so it doesn't pollute
 * the main _state.tsx until any of these graduate to "real."
 */

import { useMemo, useState, type ReactNode } from "react";
import {
  COLORS,
  FONTS,
  RICH_INQUIRIES,
  TENANT,
  useProto,
  type RichInquiry,
} from "./_state";
import {
  Avatar,
  ClientTrustChip,
  DrawerShell,
  EmptyState,
  GhostButton,
  Icon,
  PrimaryButton,
  SecondaryButton,
  Toggle,
  TextInput,
  TextArea,
  FieldRow,
} from "./_primitives";

// ════════════════════════════════════════════════════════════════════
// #9 — InboxSnippetsDrawer
// ════════════════════════════════════════════════════════════════════

const STARTER_SNIPPETS: { id: string; title: string; body: string }[] = [
  {
    id: "confirming-availability",
    title: "Confirming availability",
    body:
      "Thanks for the brief — checking with talent now and will come back within the hour with availability + hold options.",
  },
  {
    id: "offer-sent",
    title: "Offer sent — awaiting client",
    body:
      "Offer sent to the client side; they have until end-of-day to confirm or counter. I'll ping when it lands.",
  },
  {
    id: "polite-decline",
    title: "Polite decline",
    body:
      "Thanks so much for thinking of us — talent isn't available for these dates. Would love to be in the loop on the next one.",
  },
];

export function InboxSnippetsDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "inbox-snippets";
  const [snippets, setSnippets] = useState(STARTER_SNIPPETS);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");

  const addSnippet = () => {
    if (!draftTitle.trim() || !draftBody.trim()) {
      toast("Title + body are both required");
      return;
    }
    setSnippets((s) => [
      ...s,
      { id: `s-${Date.now()}`, title: draftTitle.trim(), body: draftBody.trim() },
    ]);
    setDraftTitle("");
    setDraftBody("");
    toast("Snippet saved. Use / in any reply to insert.");
  };
  const removeSnippet = (id: string) => {
    setSnippets((s) => s.filter((x) => x.id !== id));
    toast("Snippet removed");
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Saved snippets"
      description="Reusable replies — type / in any message composer to insert one. Per-tenant."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <section
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            style={{
              fontFamily: FONTS.body,
              fontSize: 12,
              fontWeight: 600,
              color: COLORS.ink,
              letterSpacing: 0.05,
            }}
          >
            New snippet
          </div>
          <FieldRow label="Title">
            <TextInput
              placeholder="e.g. Confirming hold"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Body">
            <TextArea
              rows={3}
              placeholder="The message you want to insert."
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
            />
          </FieldRow>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <PrimaryButton onClick={addSnippet}>Save snippet</PrimaryButton>
          </div>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              fontFamily: FONTS.body,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: COLORS.inkMuted,
            }}
          >
            Library — {snippets.length}
          </div>
          {snippets.map((s) => (
            <div
              key={s.id}
              data-tulala-row
              style={{
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 10,
                padding: "12px 14px",
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 11,
                  background: COLORS.accentSoft,
                  color: COLORS.accentDeep,
                  padding: "2px 6px",
                  borderRadius: 5,
                  flexShrink: 0,
                }}
              >
                /
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink }}>
                  {s.title}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: COLORS.inkMuted,
                    marginTop: 2,
                    lineHeight: 1.45,
                  }}
                >
                  {s.body}
                </div>
              </div>
              <GhostButton size="sm" onClick={() => removeSnippet(s.id)}>
                Delete
              </GhostButton>
            </div>
          ))}
        </section>
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// #10 — NotificationsPrefsDrawer
// ════════════════════════════════════════════════════════════════════

type NotifEvent =
  | "booking-confirmed"
  | "message-received"
  | "offer-received"
  | "cap-warning"
  | "client-replied"
  | "team-mentioned";

const NOTIF_EVENTS: { id: NotifEvent; label: string; description: string }[] = [
  { id: "booking-confirmed", label: "Booking confirmed", description: "When all parties accept and a booking goes live." },
  { id: "message-received", label: "Message received", description: "Any new message in any thread you're on." },
  { id: "offer-received", label: "Offer received", description: "When the client side sends an offer or counter." },
  { id: "cap-warning", label: "Cap warning", description: "When usage crosses 80% of a plan limit." },
  { id: "client-replied", label: "Client replied", description: "When the client side responds in an active inquiry." },
  { id: "team-mentioned", label: "Team mention", description: "When a teammate @mentions you anywhere." },
];

type NotifChannel = "email" | "inApp" | "digest";

export function NotificationsPrefsDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "notifications-prefs";
  // Initial prefs — every event on for in-app, booking-confirmed on for email.
  const [prefs, setPrefs] = useState<Record<NotifEvent, Record<NotifChannel, boolean>>>(() => {
    const out: Partial<Record<NotifEvent, Record<NotifChannel, boolean>>> = {};
    for (const ev of NOTIF_EVENTS) {
      out[ev.id] = {
        email: ev.id === "booking-confirmed",
        inApp: true,
        digest: ev.id === "message-received" || ev.id === "client-replied",
      };
    }
    return out as Record<NotifEvent, Record<NotifChannel, boolean>>;
  });
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("07:00");

  const toggle = (ev: NotifEvent, ch: NotifChannel) => {
    setPrefs((p) => ({ ...p, [ev]: { ...p[ev], [ch]: !p[ev][ch] } }));
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Notifications"
      description="Choose what reaches you, and how. Email goes immediately; digest batches into a daily 9am summary."
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton
            onClick={() => {
              toast("Notification preferences saved");
              closeDrawer();
            }}
          >
            Save preferences
          </PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <section
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 70px 70px 70px",
              padding: "10px 14px",
              borderBottom: `1px solid ${COLORS.borderSoft}`,
              background: "rgba(11,11,13,0.02)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: COLORS.inkMuted,
            }}
          >
            <span>Event</span>
            <span style={{ textAlign: "center" }}>Email</span>
            <span style={{ textAlign: "center" }}>In-app</span>
            <span style={{ textAlign: "center" }}>Digest</span>
          </div>
          {NOTIF_EVENTS.map((ev) => (
            <div
              key={ev.id}
              data-tulala-row
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 70px 70px 70px",
                alignItems: "center",
                padding: "12px 14px",
                borderTop: `1px solid ${COLORS.borderSoft}`,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink }}>
                  {ev.label}
                </div>
                <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
                  {ev.description}
                </div>
              </div>
              {(["email", "inApp", "digest"] as NotifChannel[]).map((ch) => (
                <div key={ch} style={{ display: "flex", justifyContent: "center" }}>
                  <Toggle
                    on={prefs[ev.id][ch]}
                    onChange={() => toggle(ev.id, ch)}
                  />
                </div>
              ))}
            </div>
          ))}
        </section>

        <section
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            style={{
              fontFamily: FONTS.body,
              fontSize: 12,
              fontWeight: 600,
              color: COLORS.ink,
              letterSpacing: 0.05,
            }}
          >
            Quiet hours
          </div>
          <div style={{ fontSize: 11.5, color: COLORS.inkMuted, lineHeight: 1.45 }}>
            Email + in-app suppressed during this window. Digest still runs.
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="time"
              value={quietStart}
              onChange={(e) => setQuietStart(e.target.value)}
              style={timeInputStyle}
            />
            <span style={{ color: COLORS.inkMuted, fontSize: 12 }}>to</span>
            <input
              type="time"
              value={quietEnd}
              onChange={(e) => setQuietEnd(e.target.value)}
              style={timeInputStyle}
            />
          </div>
        </section>
      </div>
    </DrawerShell>
  );
}

const timeInputStyle: React.CSSProperties = {
  padding: "6px 10px",
  border: `1px solid ${COLORS.borderSoft}`,
  borderRadius: 7,
  fontFamily: FONTS.body,
  fontSize: 13,
  color: COLORS.ink,
  background: "#fff",
};

// ════════════════════════════════════════════════════════════════════
// #16 — DataExportDrawer (off-boarding)
// ════════════════════════════════════════════════════════════════════

export function DataExportDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "data-export";
  const [include, setInclude] = useState({
    roster: true,
    inquiries: true,
    bookings: true,
    clients: true,
    branding: true,
    audit: false,
  });
  const [requested, setRequested] = useState(false);

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Export workspace data"
      description="A complete JSON archive of everything tied to this tenant. Useful before pausing, transferring, or closing the workspace."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <section
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {(
            [
              ["roster", "Roster", "Talent profiles, photos, skills, rate cards"],
              ["inquiries", "Inquiries", "All inquiry threads with messages and offers"],
              ["bookings", "Bookings", "Confirmed bookings, holds, payment records"],
              ["clients", "Clients", "Client profiles + per-relationship history"],
              ["branding", "Branding", "Theme tokens, logo, copy, custom domain config"],
              ["audit", "Audit log", "Who-did-what timestamps (last 12 months)"],
            ] as const
          ).map(([key, label, desc]) => (
            <label
              key={key}
              data-tulala-row
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                cursor: "pointer",
                padding: "8px 0",
              }}
            >
              <input
                type="checkbox"
                checked={include[key]}
                onChange={() => setInclude((s) => ({ ...s, [key]: !s[key] }))}
                style={{ marginTop: 3 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink }}>
                  {label}
                </div>
                <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
                  {desc}
                </div>
              </div>
            </label>
          ))}
        </section>

        {requested ? (
          <div
            style={{
              padding: 14,
              background: COLORS.accentSoft,
              border: `1px solid rgba(15,79,62,0.18)`,
              borderRadius: 12,
              fontSize: 13,
              color: COLORS.accentDeep,
              lineHeight: 1.55,
            }}
          >
            <strong>Export queued.</strong> We'll email a download link to{" "}
            <span style={{ fontFamily: FONTS.mono }}>orantene@gmail.com</span> within 10 minutes.
            Link is valid for 24 hours.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
            <PrimaryButton
              onClick={() => {
                setRequested(true);
                toast("Export queued — you'll receive an email with the link");
              }}
            >
              Request export
            </PrimaryButton>
          </div>
        )}
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// #15 — AuditLogDrawer
// ════════════════════════════════════════════════════════════════════

type AuditEvent = {
  id: string;
  ts: string;
  actor: string;
  actorInitials: string;
  action: string;
  subject: string;
  detail?: string;
};

const MOCK_AUDIT: AuditEvent[] = [
  {
    id: "a1",
    ts: "Today, 4:12 PM",
    actor: "Oran Tene",
    actorInitials: "OT",
    action: "confirmed booking",
    subject: "Mango — Spring lookbook",
    detail: "All three parties accepted. Total €4,200. Payout receiver: agency.",
  },
  {
    id: "a2",
    ts: "Today, 2:48 PM",
    actor: "Marta Reyes",
    actorInitials: "MR",
    action: "approved their line",
    subject: "Mango — Spring lookbook",
  },
  {
    id: "a3",
    ts: "Today, 12:03 PM",
    actor: "Estudio Solé",
    actorInitials: "ES",
    action: "approved offer",
    subject: "Mango — Spring lookbook",
    detail: "Offer ID off_412. Client accepted standard terms.",
  },
  {
    id: "a4",
    ts: "Yesterday, 6:20 PM",
    actor: "Oran Tene",
    actorInitials: "OT",
    action: "sent offer",
    subject: "Bvlgari — Editorial campaign",
    detail: "€6,000 base + travel. Hold expires May 4.",
  },
  {
    id: "a5",
    ts: "Yesterday, 11:15 AM",
    actor: "Lina Park",
    actorInitials: "LP",
    action: "added talent",
    subject: "Roster",
    detail: "Added Saoirse Devlin. State: draft.",
  },
];

export function AuditLogDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "audit-log";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Activity log"
      description="Every state change across this workspace, ordered newest first. Used for support, dispute resolution, and recovery."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {MOCK_AUDIT.map((e, idx) => (
          <div
            key={e.id}
            data-tulala-row
            style={{
              display: "flex",
              gap: 12,
              padding: "12px 0",
              borderTop: idx === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
            }}
          >
            <Avatar initials={e.actorInitials} hashSeed={e.actor} size={28} tone="auto" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: COLORS.ink, lineHeight: 1.45 }}>
                <strong style={{ fontWeight: 600 }}>{e.actor}</strong>
                {" "}
                <span style={{ color: COLORS.inkMuted }}>{e.action}</span>
                {" — "}
                <span>{e.subject}</span>
              </div>
              {e.detail && (
                <div
                  style={{
                    fontSize: 11.5,
                    color: COLORS.inkMuted,
                    marginTop: 2,
                    lineHeight: 1.5,
                  }}
                >
                  {e.detail}
                </div>
              )}
              <div
                style={{
                  fontSize: 11,
                  color: COLORS.inkDim,
                  marginTop: 4,
                  fontFamily: FONTS.mono,
                }}
              >
                {e.ts}
              </div>
            </div>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// #3 — TenantSwitcherDrawer
// ════════════════════════════════════════════════════════════════════

const MOCK_TENANTS = [
  { id: "acme", name: "Acme Models", role: "Owner", initials: "A" },
  { id: "northcoast", name: "North Coast Talent", role: "Coordinator", initials: "N" },
  { id: "vela", name: "Vela Hub", role: "Admin", initials: "V" },
];

export function TenantSwitcherDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "tenant-switcher";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Switch workspace"
      description="Workspaces you're a member of. Switching swaps your topbar identity, roster, and inbox."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {MOCK_TENANTS.map((t) => {
          const isCurrent = t.name === TENANT.name;
          return (
            <button
              key={t.id}
              type="button"
              data-tulala-row
              onClick={() => {
                if (isCurrent) {
                  closeDrawer();
                  return;
                }
                toast(`Switched to ${t.name}`);
                closeDrawer();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                background: isCurrent ? COLORS.accentSoft : "#fff",
                border: `1px solid ${isCurrent ? "rgba(15,79,62,0.22)" : COLORS.borderSoft}`,
                borderRadius: 10,
                cursor: "pointer",
                fontFamily: FONTS.body,
                textAlign: "left",
              }}
            >
              <Avatar initials={t.initials} size={36} tone="ink" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: isCurrent ? COLORS.accentDeep : COLORS.ink }}>
                  {t.name}
                </div>
                <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
                  {t.role}
                </div>
              </div>
              {isCurrent && (
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 600,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    padding: "3px 7px",
                    background: "rgba(15,79,62,0.18)",
                    color: COLORS.accentDeep,
                    borderRadius: 999,
                  }}
                >
                  Current
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            toast("Create-workspace flow — coming soon");
            closeDrawer();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            background: "transparent",
            border: `1px dashed ${COLORS.border}`,
            borderRadius: 10,
            cursor: "pointer",
            fontFamily: FONTS.body,
            color: COLORS.inkMuted,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <Icon name="plus" size={14} stroke={1.7} color={COLORS.inkMuted} />
          Create new workspace
        </button>
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// TalentNotificationsDrawer — list of actual events, then collapsible
// "Notification settings" section underneath. Bell-icon click target.
// ════════════════════════════════════════════════════════════════════

// ─── Notifications data model ──────────────────────────────────────
//
// Three categories, each with its own behavior contract:
//
//   action  — inquiry pipeline events that need a response. Sticky until
//             the action is taken (offer accepted, hold confirmed, etc.).
//             Coral tone (your-move signal). Shows when-stamp.
//   system  — onboarding / setup / account-level guidance. Sticky until
//             the milestone is reached. Optional progress meter. Indigo
//             tone (informational). Persistent — clears itself when done.
//   update  — informational events already resolved. Dismissible × .
//             Sage (success) or indigo (neutral) tone. Auto-archive after
//             N days in production.
//
// A `sticky` notification has no dismiss button — it lives until the
// underlying state resolves. This is deliberate: it's the difference
// between "a thing happened" (dismissible) and "you have an open loop"
// (stays until closed). Mixing them visually = lost signal.

type NotifCategory = "action" | "system" | "update";

type TalentNotif = {
  id: string;
  category: NotifCategory;
  icon: "mail" | "user" | "calendar" | "team" | "bolt" | "sparkle" | "check";
  tone?: "ink" | "coral" | "indigo" | "success" | "caution";
  title: string;
  sub?: string;
  when?: string;
  unread?: boolean;
  /** Sticky = no dismiss. Stays until the underlying action/state resolves. */
  sticky?: boolean;
  /** Optional progress (e.g. 84% profile complete, 1/4 setup steps). */
  progress?: { done: number; total: number; label?: string };
};

const MOCK_TALENT_NOTIFS: TalentNotif[] = [
  // Action needed — sticky, coral, your move.
  { id: "tn1", category: "action", icon: "mail", tone: "coral", title: "Mango — Spring lookbook · new offer", sub: "€1,800 · awaiting your reply", when: "5h", unread: true, sticky: true },
  { id: "tn2", category: "action", icon: "calendar", tone: "coral", title: "Bvlgari hold expires in 2h", sub: "Editorial · jewelry · May 18–20", when: "2h", unread: true, sticky: true },
  // System / setup — sticky, indigo, has progress.
  { id: "tn3", category: "system", icon: "sparkle", tone: "indigo", title: "4 steps to get booked", sub: "Complete your profile to enter the inquiry pipeline", unread: true, sticky: true, progress: { done: 0, total: 4, label: "0 of 4 steps" } },
  { id: "tn4", category: "system", icon: "user", tone: "indigo", title: "Profile 84% complete", sub: "3 fields left — polaroids, rate card, showreel", unread: true, sticky: true, progress: { done: 84, total: 100, label: "84%" } },
  // Updates — dismissible × on hover.
  { id: "tn5", category: "update", icon: "check", tone: "success", title: "Vogue Italia booking confirmed", sub: "Tue, May 6 · €1,800", when: "1d" },
  { id: "tn6", category: "update", icon: "team", tone: "indigo", title: "Mango site referred 12 new views", sub: "+8 vs prior week", when: "2d" },
];

const NOTIF_CATEGORY_META: Record<NotifCategory, { label: string; hint: string }> = {
  action: { label: "Action needed", hint: "stays here until you respond" },
  system: { label: "Setup", hint: "auto-clears when complete" },
  update: { label: "Updates", hint: "dismissible" },
};

// Compact notification row — ~52px tall. Single-line title with
// time-stamp on the right, optional sub on a second line, optional
// progress bar at the bottom for sticky/system items.
function NotifRow({
  notif,
  onOpen,
  onDismiss,
}: {
  notif: TalentNotif;
  onOpen: () => void;
  onDismiss?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const tonePalette = {
    coral: { bg: COLORS.coralSoft, fg: COLORS.coral },
    indigo: { bg: COLORS.indigoSoft, fg: COLORS.indigo },
    success: { bg: "rgba(46,125,91,0.10)", fg: COLORS.green },
    caution: { bg: "rgba(82,96,109,0.10)", fg: COLORS.amber },
    ink: { bg: "rgba(11,11,13,0.04)", fg: COLORS.ink },
  } as const;
  const tone = tonePalette[notif.tone ?? "ink"];

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      data-tulala-row
      style={{
        position: "relative",
        background: notif.unread ? "#fff" : "rgba(11,11,13,0.015)",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 8,
        transition: "border-color .15s ease, background .15s ease",
        borderColor: hover ? COLORS.border : COLORS.borderSoft,
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open: ${notif.title}`}
        style={{
          all: "unset",
          display: "flex",
          gap: 9,
          alignItems: "flex-start",
          padding: "8px 10px",
          paddingRight: onDismiss ? 30 : 10,
          width: "100%",
          boxSizing: "border-box",
          cursor: "pointer",
          fontFamily: FONTS.body,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: tone.bg,
            color: tone.fg,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          <Icon name={notif.icon} size={11} stroke={1.8} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: COLORS.ink,
                letterSpacing: -0.05,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                flex: 1,
                minWidth: 0,
              }}
            >
              {notif.title}
            </span>
            {notif.unread && (
              <span
                aria-label="Unread"
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: tone.fg,
                  flexShrink: 0,
                }}
              />
            )}
            {notif.when && (
              <span
                style={{
                  fontSize: 10.5,
                  color: COLORS.inkDim,
                  flexShrink: 0,
                  fontFamily: FONTS.body,
                }}
              >
                {notif.when}
              </span>
            )}
          </div>
          {notif.sub && (
            <div
              style={{
                fontSize: 11.5,
                color: COLORS.inkMuted,
                marginTop: 1,
                lineHeight: 1.4,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {notif.sub}
            </div>
          )}
          {notif.progress && (
            <div
              style={{
                marginTop: 6,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div
                aria-hidden
                style={{
                  flex: 1,
                  height: 3,
                  background: "rgba(11,11,13,0.06)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    display: "block",
                    height: "100%",
                    width: `${(notif.progress.done / notif.progress.total) * 100}%`,
                    background: tone.fg,
                    borderRadius: 2,
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: 10.5,
                  color: COLORS.inkMuted,
                  flexShrink: 0,
                  fontFamily: FONTS.body,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {notif.progress.label ??
                  `${notif.progress.done}/${notif.progress.total}`}
              </span>
            </div>
          )}
        </div>
      </button>
      {onDismiss && hover && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          aria-label={`Dismiss: ${notif.title}`}
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 20,
            height: 20,
            borderRadius: 5,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: COLORS.inkDim,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="x" size={11} stroke={1.8} />
        </button>
      )}
    </div>
  );
}

export function TalentNotificationsDrawer() {
  const { state, closeDrawer, openDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-notifications";
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Same prefs as the workspace notifications-prefs drawer — mirrored
  // here so the talent surface owns its own copy. Real implementation
  // shares storage by user_id.
  const [prefs, setPrefs] = useState<Record<string, { email: boolean; push: boolean }>>({
    "new-offer": { email: true, push: true },
    "hold-expiring": { email: true, push: false },
    "booking-reminder": { email: true, push: true },
    payouts: { email: false, push: false },
    "weekly-summary": { email: false, push: false },
  });
  const NOTIF_ROWS: { id: string; label: string; description: string }[] = [
    { id: "new-offer", label: "New offer", description: "When an agency sends you an offer." },
    { id: "hold-expiring", label: "Hold expiring soon", description: "When a hold is about to release." },
    { id: "booking-reminder", label: "Booking reminders", description: "24h and 2h before a confirmed booking." },
    { id: "payouts", label: "Payouts", description: "When a booking is paid." },
    { id: "weekly-summary", label: "Weekly summary", description: "Monday digest of last week's activity." },
  ];
  const togglePref = (id: string, ch: "email" | "push") => {
    setPrefs((p) => ({ ...p, [id]: { ...p[id]!, [ch]: !p[id]![ch] } }));
  };

  // Local dismiss state — non-sticky updates can be cleared.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = MOCK_TALENT_NOTIFS.filter((n) => !dismissed.has(n.id));
  const grouped: Record<NotifCategory, TalentNotif[]> = {
    action: visible.filter((n) => n.category === "action"),
    system: visible.filter((n) => n.category === "system"),
    update: visible.filter((n) => n.category === "update"),
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Notifications"
      description="What's waiting on you, and what's running through email + push."
    >
      {/* Grouped notifications by category. Each group has a tiny header
          with count + behavior hint so the user learns the contract. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {(["action", "system", "update"] as NotifCategory[]).map((cat) => {
          const items = grouped[cat];
          if (items.length === 0) return null;
          const meta = NOTIF_CATEGORY_META[cat];
          return (
            <section key={cat}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 6,
                  padding: "0 2px",
                }}
              >
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                    color: COLORS.inkMuted,
                  }}
                >
                  {meta.label} · {items.length}
                </span>
                <span
                  style={{
                    fontSize: 10.5,
                    color: COLORS.inkDim,
                    fontFamily: FONTS.body,
                  }}
                >
                  {meta.hint}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {items.map((n) => (
                  <NotifRow
                    key={n.id}
                    notif={n}
                    onOpen={() => toast(`Opening ${n.title}`)}
                    onDismiss={
                      n.sticky
                        ? undefined
                        : () =>
                            setDismissed((prev) => {
                              const next = new Set(prev);
                              next.add(n.id);
                              return next;
                            })
                    }
                  />
                ))}
              </div>
            </section>
          );
        })}
        {visible.length === 0 && (
          <div
            style={{
              padding: "24px 12px",
              textAlign: "center",
              fontSize: 13,
              color: COLORS.inkMuted,
              fontFamily: FONTS.body,
            }}
          >
            All clear. No notifications right now.
          </div>
        )}
      </div>

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: COLORS.borderSoft,
          margin: "20px 0 14px",
        }}
      />

      {/* Collapsible settings section */}
      <button
        type="button"
        onClick={() => setSettingsOpen((o) => !o)}
        aria-expanded={settingsOpen}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "10px 0",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontFamily: FONTS.body,
          textAlign: "left",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icon name="settings" size={13} stroke={1.7} color={COLORS.inkMuted} />
          <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
            Notification settings
          </span>
          <span style={{ fontSize: 11.5, color: COLORS.inkMuted }}>
            Email + push per event
          </span>
        </span>
        <span
          aria-hidden
          style={{
            color: COLORS.inkMuted,
            fontSize: 14,
            transition: "transform .2s",
            transform: settingsOpen ? "rotate(180deg)" : "rotate(0)",
            display: "inline-flex",
          }}
        >
          <Icon name="chevron-down" size={13} stroke={1.7} />
        </span>
      </button>
      {settingsOpen && (
        <section
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 10,
            overflow: "hidden",
            marginTop: 6,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 70px 70px",
              padding: "8px 14px",
              borderBottom: `1px solid ${COLORS.borderSoft}`,
              background: "rgba(11,11,13,0.02)",
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: COLORS.inkMuted,
            }}
          >
            <span>Event</span>
            <span style={{ textAlign: "center" }}>Email</span>
            <span style={{ textAlign: "center" }}>Push</span>
          </div>
          {NOTIF_ROWS.map((row) => (
            <div
              key={row.id}
              data-tulala-row
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 70px 70px",
                alignItems: "center",
                padding: "10px 14px",
                borderTop: `1px solid ${COLORS.borderSoft}`,
              }}
            >
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.ink }}>
                  {row.label}
                </div>
                <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 1 }}>
                  {row.description}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <Toggle on={prefs[row.id]!.email} onChange={() => togglePref(row.id, "email")} />
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <Toggle on={prefs[row.id]!.push} onChange={() => togglePref(row.id, "push")} />
              </div>
            </div>
          ))}
        </section>
      )}
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// #25 — TalentShareCardDrawer
// ════════════════════════════════════════════════════════════════════

export function TalentShareCardDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-share-card";
  const talentName = (state.drawer.payload?.name as string) ?? "your talent";
  const slug = (state.drawer.payload?.slug as string) ?? "talent-slug";
  const url = `${TENANT.domain}/share/talent/${slug}`;
  const [recipient, setRecipient] = useState("");

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={`Share ${talentName}`}
      description="A standalone client-friendly link with photos, rate hint, and a tracked-link inquiry CTA. No login required for the recipient."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Card preview */}
        <div
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              background: COLORS.surfaceAlt,
              height: 160,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: COLORS.inkMuted,
              fontFamily: FONTS.body,
              fontSize: 12,
              borderBottom: `1px solid ${COLORS.borderSoft}`,
            }}
          >
            [Cover photo + 4-up grid preview]
          </div>
          <div style={{ padding: "14px 16px" }}>
            <div
              style={{
                fontFamily: FONTS.display,
                fontSize: 20,
                fontWeight: 500,
                color: COLORS.ink,
                letterSpacing: -0.2,
              }}
            >
              {talentName}
            </div>
            <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 4 }}>
              Editorial · Runway · Commercial · Based in Madrid
            </div>
            <button
              type="button"
              onClick={() => toast("Sample inquiry would prefill from this link")}
              style={{
                marginTop: 12,
                padding: "8px 14px",
                background: COLORS.ink,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontFamily: FONTS.body,
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              Send inquiry →
            </button>
          </div>
        </div>

        {/* URL + send */}
        <FieldRow label="Share link">
          <div style={{ display: "flex", gap: 8 }}>
            <TextInput value={url} readOnly />
            <SecondaryButton
              onClick={() => {
                navigator.clipboard?.writeText(`https://${url}`);
                toast("Link copied to clipboard");
              }}
            >
              Copy
            </SecondaryButton>
          </div>
        </FieldRow>
        <FieldRow label="Send to client" hint="Optional — sends a short intro email with the link.">
          <div style={{ display: "flex", gap: 8 }}>
            <TextInput
              placeholder="hello@client.com"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
            <PrimaryButton
              onClick={() => {
                if (!recipient.trim()) {
                  toast("Email required to send");
                  return;
                }
                toast(`Share email queued to ${recipient}`);
                closeDrawer();
              }}
            >
              Send
            </PrimaryButton>
          </div>
        </FieldRow>
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Inline cards (rendered by surface pages)
// ════════════════════════════════════════════════════════════════════

/** #17 — TalentAnalyticsCard. Mock metrics for the talent today page. */
export function TalentAnalyticsCard() {
  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        padding: 18,
        fontFamily: FONTS.body,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>
            Profile views · last 7 days
          </div>
          <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
            Where your link is being viewed and what it converts to.
          </div>
        </div>
      </div>
      <div
        data-tulala-grid="3"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginTop: 12,
        }}
      >
        <Stat value="48" label="Views" trend="+12" />
        <Stat value="12" label="From Mango site" trend="+8" />
        <Stat value="3" label="Inquiries" trend="+1" />
      </div>
    </section>
  );
}

function Stat({ value, label, trend }: { value: string; label: string; trend?: string }) {
  const positive = trend?.startsWith("+");
  // Compact layout: number sits left at the same height as the
  // label+trend stack on the right. Two visual lines instead of three.
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "rgba(11,11,13,0.02)",
        borderRadius: 9,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.display,
          fontSize: 26,
          fontWeight: 500,
          letterSpacing: -0.4,
          color: COLORS.ink,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        {value}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: COLORS.ink, fontWeight: 500, lineHeight: 1.2 }}>{label}</div>
        {trend && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: positive ? COLORS.green : COLORS.red,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.2,
            }}
          >
            {trend} vs prior 7d
          </div>
        )}
      </div>
    </div>
  );
}

/** #27 — TalentFunnelCard. Pipeline-view from the talent perspective. */
export function TalentFunnelCard() {
  // Pull a few inquiries that involve this talent (mock — using rich
  // inquiries that exist in mock state).
  const myInquiries = RICH_INQUIRIES.slice(0, 3);
  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        padding: 18,
        fontFamily: FONTS.body,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>
        Inquiries you're in
      </div>
      <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
        How many other talent are also being considered, and where each conversation has reached.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        {myInquiries.map((inq, i) => (
          <FunnelRow key={inq.id} inquiry={inq} idx={i} />
        ))}
      </div>
    </section>
  );
}

/**
 * Derive a descriptive pipeline status from real inquiry state. Replaces
 * the prior "IN PLAY / YOUR SHOT / BEHIND" cryptic chips with copy that
 * actually tells the talent what's happening:
 *   - Coordinator picking talent      (stage=coordination)
 *   - Awaiting other talents          (offer_pending, peers haven't accepted)
 *   - Offer with client               (offer_pending, client deciding)
 *   - Approved · awaiting booking     (stage=approved)
 *   - Booked                          (stage=booked)
 *
 * The talent reads the row and immediately knows where the inquiry is
 * in the pipeline AND who is currently blocking it. This is information
 * about the inquiry's STATE, not about competitive heat.
 */
function deriveInquiryStatus(
  inquiry: RichInquiry,
  peers: number,
  acceptedPeers: number,
): { copy: string; tone: "indigo" | "amber" | "success" | "coral" } {
  switch (inquiry.stage) {
    case "submitted":
      return { copy: "Submitted · awaiting coordinator", tone: "amber" };
    case "coordination":
      return { copy: "Coordinator picking talent", tone: "amber" };
    case "offer_pending":
      if (inquiry.nextActionBy === "client") {
        return { copy: "Offer with client", tone: "indigo" };
      }
      if (acceptedPeers < peers) {
        return { copy: "Awaiting other talents", tone: "indigo" };
      }
      return { copy: "Offer pending", tone: "indigo" };
    case "approved":
      return { copy: "Approved · awaiting booking", tone: "success" };
    case "booked":
      return { copy: "Booked", tone: "success" };
    case "draft":
      return { copy: "Draft", tone: "amber" };
    case "rejected":
      return { copy: "Closed", tone: "amber" };
    case "expired":
      return { copy: "Expired · response window passed", tone: "amber" };
  }
}

/** Brand initials — "Mango" → "M", "Vogue Italia" → "VI", "Bvlgari" → "B". */
function clientInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0]!.charAt(0) + words[1]!.charAt(0)).toUpperCase();
  }
  return name.charAt(0).toUpperCase();
}

function FunnelRow({ inquiry, idx }: { inquiry: RichInquiry; idx: number }) {
  // Anonymized peer count + stage. Mock — in production read from the
  // inquiry's lineup.
  const { openDrawer } = useProto();
  const peers = idx === 0 ? 3 : idx === 1 ? 2 : 4;
  const acceptedPeers = idx === 0 ? 1 : idx === 1 ? 0 : 2;
  const summary = inquiry.brief.length > 40 ? `${inquiry.brief.slice(0, 38)}…` : inquiry.brief;
  const status = deriveInquiryStatus(inquiry, peers, acceptedPeers);
  const statusFg = {
    success: COLORS.green,
    indigo: COLORS.indigo,
    amber: COLORS.amber,
    coral: COLORS.coral,
  }[status.tone];
  return (
    <button
      type="button"
      data-tulala-row
      onClick={() =>
        openDrawer("inquiry-workspace", { inquiryId: inquiry.id, pov: "talent" })
      }
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        background: "rgba(11,11,13,0.02)",
        borderRadius: 9,
        border: "none",
        width: "100%",
        cursor: "pointer",
        fontFamily: FONTS.body,
        textAlign: "left",
        transition: "background .12s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.05)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.02)")}
    >
      {/* Client identity — avatar with initials + auto-hashed tint per
          brand. In production: real client logo URLs go here via photoUrl. */}
      <Avatar
        size={36}
        tone="auto"
        hashSeed={inquiry.clientName}
        initials={clientInitials(inquiry.clientName)}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13.5,
            fontWeight: 500,
            color: COLORS.ink,
          }}
        >
          <span
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              minWidth: 0,
            }}
          >
            {inquiry.clientName} — {summary}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 2,
            fontSize: 11.5,
          }}
        >
          {/* Status — descriptive pipeline state, color-tinted by tone.
              Tiny dot in the same color carries the state visually for
              scanning at a glance. */}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              color: statusFg,
              fontWeight: 500,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: statusFg,
                flexShrink: 0,
              }}
            />
            {status.copy}
          </span>
          <span style={{ color: COLORS.inkDim }}>·</span>
          <span style={{ color: COLORS.inkMuted }}>
            You + {peers} invited · {acceptedPeers} accepted
          </span>
        </div>
      </div>
      <ClientTrustChip level={inquiry.clientTrust} compact />
      <Icon name="chevron-right" size={13} color={COLORS.inkDim} />
    </button>
  );
}

/** #26 — InquiryTemplatesPicker. Top-of-composer suggestion strip. */
export function InquiryTemplatesPicker({
  onPick,
}: {
  onPick: (template: { title: string; brief: string }) => void;
}) {
  // Use last 3 inquiries as "templates from past" — seeds a brief from
  // an actual past run rather than starting blank.
  const past = RICH_INQUIRIES.slice(0, 3).map((i) => ({
    title: i.brief.length > 50 ? `${i.brief.slice(0, 48)}…` : i.brief,
    brief: i.brief,
    client: i.clientName,
  }));
  if (past.length === 0) return null;
  return (
    <div
      style={{
        background: COLORS.accentSoft,
        border: `1px solid rgba(15,79,62,0.18)`,
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 600,
          color: COLORS.accentDeep,
          letterSpacing: 0.3,
        }}
      >
        Start from a similar brief
      </div>
      <div style={{ fontSize: 11, color: COLORS.accentDeep, opacity: 0.8, marginTop: 2 }}>
        We found {past.length} past inquiries with the same shape. Click one to prefill.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
        {past.map((p, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(p)}
            data-tulala-row
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              background: "#fff",
              border: `1px solid rgba(15,79,62,0.12)`,
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: FONTS.body,
              textAlign: "left",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: COLORS.ink,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {p.title}
              </div>
              <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1 }}>
                {p.client}
              </div>
            </div>
            <Icon name="chevron-right" size={12} color={COLORS.inkDim} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** #13 — DoubleBookingWarning. Inline warning row in the inquiry composer / workspace. */
export function DoubleBookingWarning({
  talentName,
  conflictTitle,
  conflictDates,
  onView,
}: {
  talentName: string;
  conflictTitle: string;
  conflictDates: string;
  onView?: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "12px 14px",
        background: "rgba(176,48,58,0.08)",
        border: `1px solid rgba(176,48,58,0.30)`,
        borderRadius: 10,
        fontFamily: FONTS.body,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: COLORS.red,
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        !
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.red }}>
          {talentName} is already booked
        </div>
        <div style={{ fontSize: 12, color: COLORS.ink, marginTop: 2, lineHeight: 1.5 }}>
          Conflicts with <strong>{conflictTitle}</strong> on {conflictDates}. Holding for both will
          force one to drop.
        </div>
      </div>
      {onView && (
        <GhostButton size="sm" onClick={onView}>
          Open conflict
        </GhostButton>
      )}
    </div>
  );
}

/** #11 — ReadReceipt. Inline indicator under the last sent message. */
export function ReadReceipt({
  seenBy,
  ts,
}: {
  seenBy: { name: string; initials: string }[];
  ts: string;
}) {
  if (seenBy.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 12px 8px",
        fontFamily: FONTS.body,
        fontSize: 11,
        color: COLORS.inkMuted,
      }}
    >
      <div style={{ display: "inline-flex", gap: -8 }}>
        {seenBy.slice(0, 3).map((s, i) => (
          <span key={i} style={{ marginLeft: i === 0 ? 0 : -6 }}>
            <Avatar initials={s.initials} hashSeed={s.name} size={18} tone="auto" />
          </span>
        ))}
      </div>
      <span>
        Seen by{" "}
        {seenBy.length === 1
          ? seenBy[0]!.name
          : `${seenBy[0]!.name} and ${seenBy.length - 1} other${seenBy.length === 2 ? "" : "s"}`}{" "}
        · {ts}
      </span>
    </div>
  );
}

/** Companion: an ephemeral typing indicator. */
export function TypingIndicator({ name }: { name: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 12px 6px",
        fontFamily: FONTS.body,
        fontSize: 11.5,
        color: COLORS.inkMuted,
        fontStyle: "italic",
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          gap: 3,
        }}
      >
        <Dot delay={0} />
        <Dot delay={120} />
        <Dot delay={240} />
      </span>
      {name} is typing…
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      style={{
        width: 4,
        height: 4,
        borderRadius: "50%",
        background: COLORS.inkMuted,
        animation: `tulalaTypingDot 1s ${delay}ms infinite ease-in-out`,
      }}
    />
  );
}

/**
 * iCal export affordance — presents a subscribe-URL with a copy button.
 * Lives on the talent calendar page in production; here it's an inline
 * card that can be dropped anywhere in the talent surface.
 */
export function ICalSubscribeCard({ talentName, slug }: { talentName: string; slug: string }) {
  const { toast } = useProto();
  const url = `tulala.digital/cal/${slug}.ics`;
  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        padding: 16,
        fontFamily: FONTS.body,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: COLORS.accentSoft,
            color: COLORS.accent,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="calendar" size={16} stroke={1.7} color={COLORS.accent} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>
            Sync to your calendar
          </div>
          <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2, lineHeight: 1.5 }}>
            Subscribe to {talentName}'s confirmed bookings and holds in your phone or laptop calendar app. Updates automatically.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <SecondaryButton
              onClick={() => {
                navigator.clipboard?.writeText(`https://${url}`);
                toast("Calendar URL copied — paste into your calendar app");
              }}
            >
              Copy URL
            </SecondaryButton>
            <GhostButton
              onClick={() => toast("Webcal handler — coming soon")}
            >
              Open in Calendar app
            </GhostButton>
          </div>
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════
// #6 — Onboarding arcs (client + talent)
// ════════════════════════════════════════════════════════════════════
/**
 * Reusable first-run arc card. Renders a numbered checklist with
 * per-step "Open" affordances. Each surface (client, talent) has its own
 * arc data; the wrapper only handles dismissal + step interaction.
 */
export function OnboardingArc({
  storageKey,
  title,
  subtitle,
  steps,
}: {
  storageKey: string;
  title: string;
  subtitle: string;
  steps: { id: string; label: string; description: string; onOpen?: () => void; auto?: boolean }[];
}) {
  const { toast } = useProto();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(storageKey) === "dismissed";
    } catch {
      return false;
    }
  });
  const [completed, setCompleted] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(`${storageKey}_completed`);
      if (!raw) return new Set();
      return new Set(JSON.parse(raw) as string[]);
    } catch {
      return new Set();
    }
  });
  if (dismissed) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(storageKey, "dismissed");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  const markComplete = (id: string) => {
    const next = new Set(completed);
    next.add(id);
    setCompleted(next);
    try {
      window.localStorage.setItem(`${storageKey}_completed`, JSON.stringify(Array.from(next)));
    } catch {
      /* ignore */
    }
  };

  const total = steps.length;
  const doneCount = steps.filter((s) => completed.has(s.id) || s.auto).length;
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  return (
    <section
      style={{
        background: COLORS.surfaceAlt,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 14,
        padding: 18,
        marginBottom: 16,
        position: "relative",
        fontFamily: FONTS.body,
      }}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss onboarding"
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: COLORS.inkMuted,
          fontSize: 16,
          lineHeight: 1,
          padding: 4,
        }}
      >
        ×
      </button>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: COLORS.accentSoft,
            color: COLORS.accent,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="sparkle" size={16} stroke={1.7} color={COLORS.accent} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: FONTS.display,
              fontSize: 18,
              fontWeight: 500,
              letterSpacing: -0.2,
              color: COLORS.ink,
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 12.5, color: COLORS.inkMuted, marginTop: 4, lineHeight: 1.55 }}>
            {subtitle}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
            <div
              style={{
                flex: 1,
                height: 5,
                background: "rgba(11,11,13,0.08)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: COLORS.accent,
                  transition: "width .3s",
                }}
              />
            </div>
            <span style={{ fontSize: 11, color: COLORS.inkMuted, fontVariantNumeric: "tabular-nums" }}>
              {doneCount}/{total} done · {pct}%
            </span>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
        {steps.map((step, idx) => {
          const done = completed.has(step.id) || !!step.auto;
          return (
            <div
              key={step.id}
              data-tulala-row
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 9,
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: done ? COLORS.accent : "rgba(11,11,13,0.05)",
                  color: done ? "#fff" : COLORS.inkMuted,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {done ? "✓" : idx + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: done ? COLORS.inkMuted : COLORS.ink,
                    textDecoration: done ? "line-through" : "none",
                  }}
                >
                  {step.label}
                </div>
                <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1, lineHeight: 1.45 }}>
                  {step.description}
                </div>
              </div>
              {/* "Open →" navigates to the relevant drawer/page WITHOUT
                  marking the step complete — completion only fires once
                  the underlying action lands (talent saved, link copied,
                  etc.). A separate "Mark done" button lets the user
                  explicitly check off a step that's done elsewhere. */}
              {!done && step.onOpen && (
                <div style={{ display: "inline-flex", gap: 6 }}>
                  <GhostButton
                    size="sm"
                    onClick={() => {
                      markComplete(step.id);
                      toast(`Marked "${step.label}" complete`);
                    }}
                  >
                    Mark done
                  </GhostButton>
                  <GhostButton size="sm" onClick={step.onOpen}>
                    Open →
                  </GhostButton>
                </div>
              )}
              {!done && !step.onOpen && (
                <GhostButton
                  size="sm"
                  onClick={() => {
                    markComplete(step.id);
                    toast(`Marked "${step.label}" complete`);
                  }}
                >
                  Mark done
                </GhostButton>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Convenience: client first-run arc — "browse → shortlist → inquiry". */
export function ClientOnboardingArc() {
  const { openDrawer, setClientPage } = useProto();
  return (
    <OnboardingArc
      storageKey="tulala_onboard_client"
      title="Welcome — let's get you booking"
      subtitle="Three steps to a booked talent. The faster you go, the better the agencies' response time."
      steps={[
        {
          id: "browse",
          label: "Browse the directory",
          description: "Filter by specialty, region, and availability — bookmark talent you might want.",
          onOpen: () => setClientPage("discover"),
        },
        {
          id: "shortlist",
          label: "Save 3+ talent to a shortlist",
          description: "Shortlists let you compare options side-by-side and share with stakeholders.",
          onOpen: () => setClientPage("shortlists"),
        },
        {
          id: "inquiry",
          label: "Send your first inquiry",
          description: "Pick dates, brief, and budget. Agencies typically reply within the hour.",
          onOpen: () => openDrawer("client-send-inquiry"),
        },
      ]}
    />
  );
}

/** Convenience: talent first-run arc — "profile → photos → availability → share". */
export function TalentOnboardingArc() {
  const { openDrawer, setTalentPage, toast } = useProto();
  return (
    <OnboardingArc
      storageKey="tulala_onboard_talent"
      title="4 steps to get booked"
      subtitle="Agencies only see complete profiles in the inquiry pipeline. Each step adds another booking signal."
      steps={[
        {
          id: "basics",
          label: "Fill the profile basics",
          description: "Name, pronouns, height + measurements, locations you'll work from.",
          onOpen: () => openDrawer("talent-profile-edit"),
        },
        {
          id: "photos",
          label: "Upload 5+ photos",
          description: "Variety beats polish — headshot, full-length, motion, and a recent unedited iPhone photo.",
          onOpen: () => openDrawer("talent-portfolio"),
        },
        {
          id: "availability",
          label: "Set availability + blocks",
          description: "Mark vacation days and recurring busy windows so agencies don't pitch you when you're out.",
          onOpen: () => setTalentPage("calendar"),
        },
        {
          id: "share",
          label: "Copy your public link",
          description: "Share with your other agencies and on socials — bookings come from anywhere.",
          onOpen: () => {
            navigator.clipboard?.writeText("https://tulala.digital/t/marta-reyes");
            toast("Public link copied to clipboard");
          },
        },
      ]}
    />
  );
}

// ════════════════════════════════════════════════════════════════════
// #7 — SavedViewsBar
// ════════════════════════════════════════════════════════════════════
/**
 * Generic saved-views bar. Each list page that wants saved views
 * provides a `viewKey` (per-list namespace) plus a `getCurrent` callback
 * to capture state, and an `applyView` callback to restore it.
 *
 * Storage: localStorage at `tulala_views_${viewKey}`.
 */
export function SavedViewsBar<T>({
  viewKey,
  current,
  onApply,
}: {
  viewKey: string;
  current: T;
  onApply: (view: T) => void;
}) {
  const { toast } = useProto();
  const storageKey = `tulala_views_${viewKey}`;
  const [views, setViews] = useState<{ id: string; name: string; payload: T }[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return [];
      return JSON.parse(raw) as { id: string; name: string; payload: T }[];
    } catch {
      return [];
    }
  });

  const persist = (next: { id: string; name: string; payload: T }[]) => {
    setViews(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const saveCurrent = () => {
    const name = window.prompt("Name this view");
    if (!name) return;
    persist([...views, { id: `v-${Date.now()}`, name: name.trim(), payload: current }]);
    toast(`View "${name}" saved`);
  };

  const remove = (id: string) => {
    persist(views.filter((v) => v.id !== id));
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 0",
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: COLORS.inkMuted,
          marginRight: 4,
        }}
      >
        Views
      </span>
      {views.map((v) => (
        <span
          key={v.id}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 4px 4px 10px",
            background: "rgba(11,11,13,0.05)",
            borderRadius: 999,
            fontSize: 12,
            color: COLORS.ink,
          }}
        >
          <button
            type="button"
            onClick={() => onApply(v.payload)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
              fontFamily: FONTS.body,
              fontSize: 12,
              color: COLORS.ink,
              fontWeight: 500,
            }}
          >
            {v.name}
          </button>
          <button
            type="button"
            onClick={() => remove(v.id)}
            aria-label={`Remove view ${v.name}`}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: COLORS.inkDim,
              padding: "0 4px",
              lineHeight: 1,
              fontSize: 14,
            }}
          >
            ×
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={saveCurrent}
        style={{
          padding: "4px 10px",
          background: "transparent",
          border: `1px dashed ${COLORS.border}`,
          borderRadius: 999,
          fontSize: 12,
          color: COLORS.inkMuted,
          fontFamily: FONTS.body,
          cursor: "pointer",
        }}
      >
        + Save current
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// #3 — LoadMore pagination primitive
// ════════════════════════════════════════════════════════════════════
/**
 * Generic "Load more" pagination wrapper. Slices the input array based
 * on `pageSize` * `pagesShown` and renders a button at the bottom that
 * extends `pagesShown`. Each list page tracks its own state — no
 * coordination across pages.
 *
 * Real version would call a `loadMore` server action; this is shape-
 * compatible (just swap the slice for the API call later).
 */
export function LoadMore({
  total,
  shown,
  onMore,
}: {
  total: number;
  shown: number;
  onMore: () => void;
}) {
  if (shown >= total) {
    return (
      <div
        style={{
          padding: "16px 0 0",
          textAlign: "center",
          fontSize: 11.5,
          color: COLORS.inkDim,
          fontFamily: FONTS.body,
        }}
      >
        End of list · {total} {total === 1 ? "item" : "items"}
      </div>
    );
  }
  return (
    <div style={{ padding: "16px 0 0", textAlign: "center" }}>
      <button
        type="button"
        onClick={onMore}
        style={{
          padding: "8px 16px",
          background: "#fff",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          fontFamily: FONTS.body,
          fontSize: 12.5,
          fontWeight: 500,
          color: COLORS.ink,
          cursor: "pointer",
        }}
      >
        Load more · {total - shown} remaining
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// #4 — DraggableList primitive (HTML5 drag/drop)
// ════════════════════════════════════════════════════════════════════
/**
 * Minimal HTML5 drag-and-drop reorder. Each row sets draggable, and
 * onDragOver/onDrop swap positions in the consumer's array. Touch users
 * get a fallback up/down button pair next to each row (mobile DnD via
 * native HTML5 doesn't work).
 */
export function DraggableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
}: {
  items: T[];
  onReorder: (next: T[]) => void;
  renderItem: (item: T, index: number) => ReactNode;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= items.length) return;
    const next = items.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onReorder(next);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((item, idx) => (
        <div
          key={item.id}
          draggable
          onDragStart={() => setDragId(item.id)}
          onDragOver={(e) => {
            e.preventDefault();
            if (!dragId || dragId === item.id) return;
            const fromIdx = items.findIndex((i) => i.id === dragId);
            move(fromIdx, idx);
          }}
          onDragEnd={() => setDragId(null)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: dragId === item.id ? COLORS.accentSoft : "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 9,
            padding: 10,
            cursor: "grab",
            opacity: dragId === item.id ? 0.6 : 1,
            transition: "opacity .12s",
          }}
        >
          <span
            aria-hidden
            style={{
              fontSize: 14,
              color: COLORS.inkDim,
              padding: "0 4px",
              lineHeight: 1,
            }}
          >
            ⋮⋮
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>{renderItem(item, idx)}</div>
          {/* Mobile/keyboard fallback — up/down arrows */}
          <button
            type="button"
            aria-label={`Move ${item.id} up`}
            onClick={() => move(idx, idx - 1)}
            disabled={idx === 0}
            style={arrowBtnStyle(idx === 0)}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`Move ${item.id} down`}
            onClick={() => move(idx, idx + 1)}
            disabled={idx === items.length - 1}
            style={arrowBtnStyle(idx === items.length - 1)}
          >
            ↓
          </button>
        </div>
      ))}
    </div>
  );
}

const arrowBtnStyle = (disabled: boolean): React.CSSProperties => ({
  width: 24,
  height: 24,
  borderRadius: 5,
  border: "none",
  background: "transparent",
  color: disabled ? COLORS.inkDim : COLORS.inkMuted,
  cursor: disabled ? "default" : "pointer",
  fontSize: 12,
  opacity: disabled ? 0.3 : 1,
});

// ════════════════════════════════════════════════════════════════════
// #6 — DrawerCopyLink button (drop into DrawerShell toolbar slot)
// ════════════════════════════════════════════════════════════════════
/**
 * Copies the current URL to the clipboard. The drawer state already
 * lives in the URL (see ProtoProvider's drawer query-param sync), so
 * this gives users a one-click "share this exact view" affordance.
 */
export function DrawerCopyLink() {
  const { toast } = useProto();
  return (
    <button
      type="button"
      title="Copy link to this drawer"
      aria-label="Copy link to this drawer"
      onClick={() => {
        if (typeof window === "undefined") return;
        navigator.clipboard?.writeText(window.location.href);
        toast("Link copied — anyone with access lands here.");
      }}
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        border: `1px solid ${COLORS.borderSoft}`,
        background: "#fff",
        color: COLORS.inkMuted,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = COLORS.border;
        e.currentTarget.style.color = COLORS.ink;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.borderSoft;
        e.currentTarget.style.color = COLORS.inkMuted;
      }}
    >
      🔗
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════
// #7 — MentionTypeahead UI shell
// ════════════════════════════════════════════════════════════════════
/**
 * Lightweight @-typeahead. Watches a textarea's value; when the cursor
 * sits after an "@" + N alphanumeric chars, opens a dropdown of matched
 * teammates. Pick → splice the username into the textarea.
 *
 * Mock teammate list — production reads from `tenant_members`.
 */
const MOCK_MENTIONS = [
  { id: "u1", name: "Lina Park", role: "Coordinator" },
  { id: "u2", name: "Andrés López", role: "Editor" },
  { id: "u3", name: "Marta Reyes", role: "Talent" },
  { id: "u4", name: "Estudio Solé", role: "Client" },
];

export function MentionTypeahead({
  value,
  onChange,
  textareaRef,
}: {
  value: string;
  onChange: (next: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  // Detect @<chars> at the current cursor position.
  const match = useMemo(() => {
    if (typeof window === "undefined" || !textareaRef.current) return null;
    const ta = textareaRef.current;
    const upTo = value.slice(0, ta.selectionStart);
    const m = /@([\w]*)$/.exec(upTo);
    if (!m) return null;
    return { query: m[1] ?? "", offset: m.index, full: m[0] };
  }, [value, textareaRef]);

  if (!match) return null;
  const filtered = MOCK_MENTIONS.filter((u) =>
    u.name.toLowerCase().includes(match.query.toLowerCase()),
  );
  if (filtered.length === 0) return null;

  const insert = (name: string) => {
    const before = value.slice(0, match.offset);
    const after = value.slice(match.offset + match.full.length);
    onChange(`${before}@${name.replace(/\s+/g, "")} ${after}`);
  };

  return (
    <div
      style={{
        position: "absolute",
        bottom: "100%",
        left: 0,
        marginBottom: 6,
        background: "#fff",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(11,11,13,0.10)",
        minWidth: 220,
        zIndex: 4,
        fontFamily: FONTS.body,
      }}
    >
      {filtered.slice(0, 5).map((u) => (
        <button
          key={u.id}
          type="button"
          onClick={() => insert(u.name)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            padding: "8px 10px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            fontFamily: FONTS.body,
            fontSize: 13,
            color: COLORS.ink,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.04)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <Avatar initials={u.name.split(" ").map((p) => p[0]).join("").slice(0, 2)} hashSeed={u.name} size={22} tone="auto" />
          <span style={{ flex: 1 }}>{u.name}</span>
          <span style={{ fontSize: 11, color: COLORS.inkMuted }}>{u.role}</span>
        </button>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// #8 — QuickReplyButtons (offer-pending inline)
// ════════════════════════════════════════════════════════════════════
export function QuickReplyButtons({
  onAccept,
  onCounter,
  onDecline,
}: {
  onAccept: () => void;
  onCounter: () => void;
  onDecline: () => void;
}) {
  return (
    <div style={{ display: "inline-flex", gap: 6 }}>
      <button
        type="button"
        onClick={onAccept}
        style={quickReplyStyle("ink")}
      >
        Accept
      </button>
      <button
        type="button"
        onClick={onCounter}
        style={quickReplyStyle("ghost")}
      >
        Counter
      </button>
      <button
        type="button"
        onClick={onDecline}
        style={quickReplyStyle("red")}
      >
        Decline
      </button>
    </div>
  );
}

function quickReplyStyle(tone: "ink" | "ghost" | "red"): React.CSSProperties {
  const palette =
    tone === "ink"
      ? { bg: COLORS.ink, fg: "#fff", border: COLORS.ink }
      : tone === "red"
        ? { bg: "transparent", fg: COLORS.red, border: "rgba(176,48,58,0.30)" }
        : { bg: "#fff", fg: COLORS.ink, border: COLORS.border };
  return {
    background: palette.bg,
    color: palette.fg,
    border: `1px solid ${palette.border}`,
    borderRadius: 7,
    padding: "5px 10px",
    fontFamily: FONTS.body,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  };
}

// ════════════════════════════════════════════════════════════════════
// #9 — CSV export helper
// ════════════════════════════════════════════════════════════════════
/**
 * Convert an array of rows to a CSV string and trigger a download. No
 * dependencies; quote-escapes anything with comma/quote/newline.
 */
export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Array.from(
    rows.reduce((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  );
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ════════════════════════════════════════════════════════════════════
// #24 — WhatsNewDrawer (changelog)
// ════════════════════════════════════════════════════════════════════

const CHANGELOG: { date: string; title: string; body: string }[] = [
  {
    date: "Apr 26",
    title: "Command palette · ⌘K",
    body: "Jump to any surface, page, plan, or drawer. Press ? for the shortcut list.",
  },
  {
    date: "Apr 25",
    title: "Mobile bottom tab bar + native-feel swipe rows",
    body: "Drag inbox rows for Snooze / Pin / Archive. The page nav moved to the bottom on small screens.",
  },
  {
    date: "Apr 24",
    title: "Plan-compare drawer rebuilt",
    body: "Tooltip icons replace inline explainers. Sticky headers, pinned footer, mobile horizontal scroll.",
  },
  {
    date: "Apr 22",
    title: "Forest accent palette + mobile-first responsive layer",
    body: "Goodbye gold/rust. Drawers go full-bleed on phones; grids collapse to one column.",
  },
];

export function WhatsNewDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "whats-new";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="What's new"
      description="Recent product updates, newest first."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {CHANGELOG.map((item, idx) => (
          <div
            key={idx}
            data-tulala-row
            style={{
              display: "flex",
              gap: 14,
              paddingBottom: 12,
              borderBottom:
                idx === CHANGELOG.length - 1 ? "none" : `1px solid ${COLORS.borderSoft}`,
            }}
          >
            <div
              style={{
                width: 56,
                flexShrink: 0,
                fontFamily: FONTS.mono,
                fontSize: 11,
                color: COLORS.inkDim,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                paddingTop: 1,
              }}
            >
              {item.date}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
                {item.title}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: COLORS.inkMuted,
                  marginTop: 4,
                  lineHeight: 1.55,
                }}
              >
                {item.body}
              </div>
            </div>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// #25 — HelpDrawer
// ════════════════════════════════════════════════════════════════════
export function HelpDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "help";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Help"
      description="Keyboard shortcuts, getting-started videos, and how to reach support."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <section
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: 14,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.ink, marginBottom: 10 }}>
            Keyboard shortcuts
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontFamily: FONTS.body }}>
            {(
              [
                ["⌘K · Ctrl+K", "Command palette"],
                ["?", "Show this list"],
                ["Esc", "Close drawers / overlays"],
                ["j / k", "Navigate list rows"],
                ["Enter", "Open selected row"],
              ] as const
            ).map(([key, desc]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 11,
                    padding: "2px 7px",
                    background: "rgba(11,11,13,0.06)",
                    color: COLORS.ink,
                    borderRadius: 5,
                    minWidth: 80,
                  }}
                >
                  {key}
                </span>
                <span style={{ fontSize: 12.5, color: COLORS.inkMuted }}>{desc}</span>
              </div>
            ))}
          </div>
        </section>

        <section
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: 14,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.ink, marginBottom: 10 }}>
            Get help
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              type="button"
              onClick={() => toast("Docs site opens in production")}
              style={helpRowStyle}
            >
              Read the docs →
            </button>
            <button
              type="button"
              onClick={() => toast("Support chat — coming soon")}
              style={helpRowStyle}
            >
              Chat with support →
            </button>
            <button
              type="button"
              onClick={() => toast("Calendar booking — coming soon")}
              style={helpRowStyle}
            >
              Book onboarding call →
            </button>
          </div>
        </section>
      </div>
    </DrawerShell>
  );
}

const helpRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 12px",
  background: "rgba(11,11,13,0.02)",
  border: "none",
  borderRadius: 8,
  fontFamily: FONTS.body,
  fontSize: 13,
  fontWeight: 500,
  color: COLORS.ink,
  cursor: "pointer",
  textAlign: "left",
};

// ════════════════════════════════════════════════════════════════════
// Empty wrapper to keep file shape stable for future additions
// ════════════════════════════════════════════════════════════════════
export function _Wave2Marker(): ReactNode {
  return null;
}
