"use client";

// ════════════════════════════════════════════════════════════════════
// talent-drawers/network — Phase 1d body chunk.
// Owns: TalentNetworkDrawer, TalentVoiceReplyDrawer,
// TalentMultiAgencyPickerDrawer, ReplyTemplatesDrawer,
// TalentChatArchiveDrawer.
// Private helpers: NetworkRow + NETWORK_TALENTS / MY_NETWORK_AGENCIES /
// REPLY_TEMPLATES data.
// Bodies copied byte-for-byte from talent-drawers.tsx; no behavior change.
// ════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { COLORS, FONTS, TRANSITION, useAdminShell } from "../state";
import {
  CapsLabel,
  Divider,
  DrawerShell,
  EmptyState,
  SecondaryButton,
} from "../primitives";
import { KvRow } from "./shared";

// ─── Talent-to-talent network (E4) ──────────────────────────────
//
// Lightweight network where talents follow each other, see who's working
// where, and trade casting recommendations. NOT a chat product — that
// would invite spam. Instead: read-only activity feed + one-click "I'm
// not free, try her" referral.

export function TalentNetworkDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-network";
  // Honest stub — the talent-to-talent network has no backend yet. Showing a
  // fabricated peer list (with dead follow/refer buttons) would misrepresent a
  // feature that isn't live, so we surface a clear "coming soon" instead.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Your network"
      description="Follow other talents, see who's working where, and hand off briefs you can't take."
      width={620}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="team"
        title="Coming soon"
        body="The talent network — following peers and one-tap, fully-attributed brief hand-offs — isn't live yet. We'll let you know when it opens."
      />
    </DrawerShell>
  );
}

// ─── Voice replies (E5) ─────────────────────────────────────────
//
// Mobile-first hold-to-talk. Drawer shows the recording UI (waveform +
// transcript preview) and submits the audio + transcript to the inquiry
// as a normal message. Default privacy position taken: transcripts are
// stored alongside audio; talent can delete either independently.

export function TalentVoiceReplyDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-voice-reply";
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [done, setDone] = useState(false);

  return (
    <DrawerShell
      open={open}
      onClose={() => {
        closeDrawer();
        setTimeout(() => { setRecording(false); setSeconds(0); setDone(false); }, 200);
      }}
      title="Voice reply"
      description="Hold to talk · we transcribe automatically. Both audio + transcript go to the inquiry; you can delete either."
      width={460}
      footer={
        done ? (
          <>
            <SecondaryButton onClick={() => { setDone(false); setSeconds(0); }}>Re-record</SecondaryButton>
            <button
              type="button"
              disabled
              style={{
                padding: "9px 16px",
                background: "rgba(11,11,13,0.12)",
                border: "none",
                borderRadius: 8,
                fontFamily: FONTS.body,
                fontSize: 13,
                fontWeight: 500,
                color: COLORS.inkMuted,
                cursor: "not-allowed",
              }}
              title="Voice replies coming soon"
            >
              Send reply
            </button>
          </>
        ) : (
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
        )
      }
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "20px 0" }}>
        {!done ? (
          <button
            type="button"
            onPointerDown={() => { setRecording(true); setSeconds(0); }}
            onPointerUp={() => {
              if (recording) {
                setRecording(false);
                if (seconds > 0) setDone(true);
              }
            }}
            onPointerLeave={() => {
              if (recording) {
                setRecording(false);
                if (seconds > 0) setDone(true);
              }
            }}
            aria-label={recording ? "Recording — release to stop" : "Hold to record"}
            style={{
              width: 96,
              height: 96,
              borderRadius: "50%",
              background: recording ? COLORS.coral : COLORS.accent,
              border: "none",
              color: "#fff",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: recording ? `0 0 0 12px rgba(194,106,69,0.18)` : `0 0 0 0 rgba(15,79,62,0)`,
              transition: `background ${TRANSITION.sm}, box-shadow .25s`,
            }}
          >
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="3" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </button>
        ) : (
          <div
            style={{
              width: "100%",
              padding: "16px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 12,
              fontFamily: FONTS.body,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.green }} />
              <CapsLabel>Transcript · {Math.max(seconds, 8)}s</CapsLabel>
            </div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }} className="text-admin-ink">
              &quot;Hi Mango — yes, available May 14, day rate is twelve hundred euros. Sending quote now.&quot;
            </p>
            <div style={{ marginTop: 12, fontSize: 11.5 }} className="text-admin-ink-muted">
              Edit transcript before sending if you want — the audio still goes through as-is.
            </div>
          </div>
        )}
        {!done && (
          <div style={{ fontFamily: FONTS.body, fontSize: 13, textAlign: "center" }} className="text-admin-ink-muted">
            {recording ? `Recording · ${seconds}s` : "Hold to record · max 60s"}
          </div>
        )}
      </div>
    </DrawerShell>
  );
}

// ─── Network plan multi-agency picker (X6) ──────────────────────
//
// For talents on the Network plan (workspace owner with multi-agency
// reach). Switches the active workspace context across agencies the
// talent owns — Studio → Agency upgrade picker if they want to add a
// new one. Default position on commission cross-routing: each agency
// keeps its own contracted rate; the picker is only about WHO sees the
// inquiry first, not who gets paid.

export function TalentMultiAgencyPickerDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-multi-agency-picker";
  // Honest stub — the in-drawer multi-agency picker was demo-only (it never
  // actually switched workspace). Real workspace switching already lives in
  // the top-bar workspace switcher; this dedicated picker isn't built yet.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Switch workspace"
      description="On the Network plan you can own multiple agencies, each with its own roster and commission."
      width={520}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="team"
        title="Coming soon"
        body="Switching between agencies you own from here isn't live yet. For now, use the workspace switcher in the top bar."
      />
    </DrawerShell>
  );
}

// ─── Chat archive (F8) ──────────────────────────────────────────
//
// Closed-booking → "Download chat" generates a PDF mock with the full
// thread + attachments index. Useful for talents who want a record of
// what was agreed before contract.

/**
 * Audit #53 — reply templates drawer. Pre-written common responses
 * the talent can insert with one click. Edit before send. The list is
 * mock; production reads from `talent_reply_templates` table.
 */
const REPLY_TEMPLATES = [
  { id: "rt1", title: "Yes — confirm availability", body: "Hi! Yes — I'm available on the dates you mentioned. Sending availability and rate card. Looking forward to hearing more about the brief." },
  { id: "rt2", title: "Need more info", body: "Hi — thanks for reaching out. Before I confirm, could you share: usage scope, location, hair/makeup, and call time? Happy to move quickly once I have those." },
  { id: "rt3", title: "Polite decline — rate", body: "Thank you for thinking of me. Unfortunately the rate offered isn't aligned with my current bookings. Happy to revisit if there's flexibility." },
  { id: "rt4", title: "Polite decline — schedule", body: "Thank you so much for the offer. Unfortunately I'm already booked on those dates. Hope we can work together soon." },
  { id: "rt5", title: "Hold response", body: "Got it — happy to hold these dates for 48h. If you need more time, just let me know and I'll see what I can do." },
];

export function ReplyTemplatesDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "reply-templates";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Reply with template"
      description="Tap a template to insert it into the reply box. You can still edit before sending."
      width={560}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {REPLY_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={closeDrawer}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              gap: 4,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              fontFamily: FONTS.body,
              cursor: "pointer",
              textAlign: "left",
              transition: `border-color ${TRANSITION.micro}`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.accent)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.borderSoft)}
          >
            <div className="text-admin-ink text-admin-13 font-semibold">{t.title}</div>
            <div style={{ fontSize: 11.5, marginTop: 2, lineHeight: 1.5 }} className="text-admin-ink-muted">
              {t.body.length > 120 ? `${t.body.slice(0, 118)}…` : t.body}
            </div>
          </button>
        ))}
      </div>
    </DrawerShell>
  );
}

export function TalentChatArchiveDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-chat-archive";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Archive this thread"
      description="Generate a timestamped PDF with the full message history + attachments index. Yours to keep — outside Tulala."
      width={520}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <button
            type="button"
            disabled
            style={{
              padding: "9px 16px",
              background: "rgba(11,11,13,0.12)",
              border: "none",
              borderRadius: 8,
              fontFamily: FONTS.body,
              fontSize: 13,
              fontWeight: 500,
              color: COLORS.inkMuted,
              cursor: "not-allowed",
            }}
            title="PDF export coming soon"
          >
            Generate PDF
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <KvRow label="Thread" value="Mango · Spring campaign" />
        <KvRow label="Messages" value="42 · April 2 to April 19" />
        <KvRow label="Attachments" value="3 files · 2 PDFs + 1 image" />
        <KvRow label="Format" value="PDF · sealed timestamp" />
        <Divider label="Includes" />
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            "Full message history with timestamps + sender labels",
            "All client + agency replies in original order",
            "Attachment index with filenames + upload dates",
            "Booking summary card (dates, rate, scope, status)",
          ].map((line, idx) => (
            <li key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink }}>
              <span style={{ marginTop: 4, width: 4, height: 4, borderRadius: "50%", flexShrink: 0 }} />
              {line}
            </li>
          ))}
        </ul>
        <div
          style={{
            marginTop: 4,
            padding: "10px 12px",
            background: "rgba(46,125,91,0.08)",
            border: `1px solid rgba(46,125,91,0.20)`,
            borderRadius: 8,
            fontFamily: FONTS.body,
            fontSize: 11.5,
            color: COLORS.green,
            lineHeight: 1.5, }} className="bg-admin-green">
          The PDF is generated server-side and signed with a timestamp hash — useful as evidence if there&apos;s a dispute.
        </div>
      </div>
    </DrawerShell>
  );
}
