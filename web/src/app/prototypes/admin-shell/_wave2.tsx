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

import { useState, type ReactNode } from "react";
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
            <Avatar initials={e.actorInitials} size={28} tone="auto" />
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
  return (
    <div style={{ padding: "12px 14px", background: "rgba(11,11,13,0.02)", borderRadius: 9 }}>
      <div
        style={{
          fontFamily: FONTS.display,
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: -0.4,
          color: COLORS.ink,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>{label}</div>
      {trend && (
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: positive ? COLORS.green : COLORS.red,
            marginTop: 4,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {trend} vs prior 7d
        </div>
      )}
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

function FunnelRow({ inquiry, idx }: { inquiry: RichInquiry; idx: number }) {
  // Anonymized peer count + stage. Mock — in production read from the
  // inquiry's lineup.
  const peers = idx === 0 ? 3 : idx === 1 ? 2 : 4;
  const acceptedPeers = idx === 0 ? 1 : idx === 1 ? 0 : 2;
  const summary = inquiry.brief.length > 40 ? `${inquiry.brief.slice(0, 38)}…` : inquiry.brief;
  return (
    <div
      data-tulala-row
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        background: "rgba(11,11,13,0.02)",
        borderRadius: 9,
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
          {inquiry.clientName} — {summary}
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
          You + {peers} other talent · {acceptedPeers} accepted so far
        </div>
      </div>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          padding: "3px 7px",
          background: COLORS.accentSoft,
          color: COLORS.accentDeep,
          borderRadius: 999,
        }}
      >
        Pending
      </span>
    </div>
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
            <Avatar initials={s.initials} size={18} tone="auto" />
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
              {!done && step.onOpen && (
                <GhostButton
                  size="sm"
                  onClick={() => {
                    markComplete(step.id);
                    step.onOpen?.();
                  }}
                >
                  Open →
                </GhostButton>
              )}
              {!done && !step.onOpen && (
                <GhostButton
                  size="sm"
                  onClick={() => {
                    markComplete(step.id);
                    toast(`Marked "${step.label}" complete`);
                  }}
                >
                  Mark complete
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
// Empty wrapper to keep file shape stable for future additions
// ════════════════════════════════════════════════════════════════════
export function _Wave2Marker(): ReactNode {
  return null;
}
