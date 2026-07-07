"use client";

import React, { useTransition, useRef, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { uploadInquiryAttachmentAsTalent, acceptInquiryInvitation, declineInquiryInvitation, submitMyRateForInquiry, sendInquiryMessageAsTalent } from "@/lib/server-actions/talent-pipeline";
import { useAdminShell, COLORS, FONTS, MY_TALENT_PROFILE, TRANSITION } from "../../state";
import { Avatar } from "../../primitives";
import { MOCK_THREAD, type Conversation } from "../../talent";
import { currentTalentId } from "../messages-shared";
import { LiveLineupPanel } from "./machinery-11";
import { disabledBtn } from "./machinery-13";
import { LiveFilesPanel, resolveFileKey } from "./machinery-14";
import { ConversationTab } from "./machinery-16";
import { MOCK_FILES_FOR_CONV } from "./machinery-9";


export function FilesTab({ conv, povCanSeeTalentFiles, pov }: { conv: Conversation; povCanSeeTalentFiles: boolean; pov?: "talent" }) {
  const { toast } = useAdminShell();
  const t = useT();
  const [talentUploadPending, startTalentUploadTransition] = useTransition();
  const talentFileInputRef = useRef<HTMLInputElement | null>(null);
  const isUuidConv = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conv.id);
  const isTalentUpload = pov === "talent" && isUuidConv;

  const onTalentPickFile = (file: File) => {
    if (file.size > 100 * 1024 * 1024) { toast(t("dashboard.adminTabs.files.fileOver100")); return; }
    startTalentUploadTransition(async () => {
      const fd = new FormData();
      fd.set("inquiryId", conv.id);
      fd.set("file", file);
      const r = await uploadInquiryAttachmentAsTalent(fd);
      if (!r.ok) toast(interpolate(t("dashboard.adminTabs.files.uploadFailed"), { error: r.error }));
      else toast(t("dashboard.adminTabs.files.fileUploaded"));
    });
  };

  const all = MOCK_FILES_FOR_CONV[resolveFileKey(conv.id)] ?? [];
  // Per-thread visibility: client only sees client-thread files (call
  // sheets, briefs, contract). Coordinator + talent see both client
  // thread files AND the booking-team's internal files (counter
  // history, polaroids, etc.). Sort newest first by addedAt heuristic.
  const visible = povCanSeeTalentFiles ? all : all.filter(f => f.thread === "client");
  const clientFiles = visible.filter(f => f.thread === "client");
  const talentFiles = visible.filter(f => f.thread === "talent");
  // Crude "freshness" heuristic — files with "ago" or recent dates
  // sort to top of their group. Real production would parse + sort
  // by an ISO timestamp.
  const sortByFresh = (arr: typeof visible) => [...arr].sort((a, b) => {
    const aAgo = /ago|h$/i.test(a.addedAt) ? 1 : 0;
    const bAgo = /ago|h$/i.test(b.addedAt) ? 1 : 0;
    return bAgo - aAgo;
  });
  const sortedClient = sortByFresh(clientFiles);
  const sortedTalent = sortByFresh(talentFiles);

  // Extension-aware file icon + image-thumbnail render. Lifts the
  // file row from "all files look identical" to "I can spot the
  // call sheet vs the polaroids zip vs the contract at a glance".
  // Image files render a tinted square with photo glyph (mock); a
  // future iteration can swap the glyph for an actual thumbnail
  // pulled from the file CDN.
  const fileVisual = (filename: string) => {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const isImage = ["jpg", "jpeg", "png", "heic", "webp", "gif"].includes(ext);
    const isZip = ["zip", "rar", "7z", "tar", "gz"].includes(ext);
    const isSheet = ["csv", "xlsx", "xls", "numbers"].includes(ext);
    const isCal = ["ics"].includes(ext);
    const palette = isImage ? { bg: "rgba(91,107,160,0.14)", fg: "#3B4A7C" }
      : isZip               ? { bg: "rgba(214,158,46,0.16)", fg: "#9C6B14" }
      : isSheet             ? { bg: "rgba(46,125,91,0.14)",  fg: "#1F5C40" }
      : isCal               ? { bg: "rgba(176,48,58,0.10)",  fg: COLORS.coralDeep }
      : { bg: COLORS.surfaceAlt, fg: COLORS.inkMuted };
    const glyph = isImage ? (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1.5" y="2.5" width="11" height="9" rx="1.4" stroke="currentColor" strokeWidth="1.3"/>
        <circle cx="5" cy="6" r="1" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M2 11l3.5-3 2.5 2 2-2 2.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      </svg>
    ) : isZip ? (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M3 1.5h6l3 3v8a1 1 0 01-1 1H3a1 1 0 01-1-1v-10a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M6 2v2h1v1h-1v1h1v1h-1v1h1v1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ) : isSheet ? (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="2" y="2" width="10" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M2 5.5h10M2 8.5h10M5 2v10M9 2v10" stroke="currentColor" strokeWidth="1.1"/>
      </svg>
    ) : isCal ? (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1.5" y="3" width="11" height="9.5" rx="1.4" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M1.5 6h11M5 1.5v3M9 1.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ) : (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M3 1.5h6l3 3v8a1 1 0 01-1 1H3a1 1 0 01-1-1v-10a1 1 0 011-1zM9 1.5v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      </svg>
    );
    return (
      <div aria-hidden style={{
        width: 36, height: 36, borderRadius: 8,
        background: palette.bg, color: palette.fg,
        display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {glyph}
      </div>
    );
  };

  // File-card row. Extracted so the two threads can render the same
  // visual for each file with a thread chip when relevant.
  const fileCard = (f: typeof visible[number], showThreadChip: boolean) => (
    <div key={f.name} style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px", background: "#fff",
      border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10,
      fontFamily: FONTS.body,
    }}>
      {fileVisual(f.name)}
      <div className="flex-1 min-w-0">
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink">
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</span>
          {showThreadChip && (
            <span style={{
              flexShrink: 0,
              fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 999,
              background: f.thread === "client" ? COLORS.indigoSoft : COLORS.surfaceAlt,
              color: f.thread === "client" ? COLORS.indigoDeep : COLORS.inkMuted,
              letterSpacing: 0.3, textTransform: "uppercase",
            }}>{f.thread === "client" ? t("dashboard.adminTabs.files.clientChip") : t("dashboard.adminTabs.files.teamChip")}</span>
          )}
        </div>
        <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">
          {f.size} · {f.addedBy} · {f.addedAt}
        </div>
      </div>
      <button type="button" onClick={() => toast(interpolate(t("dashboard.adminTabs.files.downloading"), { name: f.name }))} aria-label={t("dashboard.adminTabs.files.download")} title={t("dashboard.adminTabs.files.download")} style={{
        padding: 7, borderRadius: 7, border: "none", background: "transparent",
        color: COLORS.inkMuted, cursor: "pointer",
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1.5v9M3.5 7.5L7 11l3.5-3.5M2 12.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  );

  // Group header — small uppercase eyebrow above each thread's files
  // when BOTH threads have content. Single-thread views skip the
  // eyebrow (no need to disambiguate when there's one group).
  const groupTitle = (label: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginTop: 8, marginBottom: 2 }} className="text-admin-ink-muted">{label}</div>
  );

  const showGroupHeaders = povCanSeeTalentFiles && sortedClient.length > 0 && sortedTalent.length > 0;

  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
      <LiveFilesPanel inquiryId={conv.id} />
      {/* Add-file affordance — at top so the talent can upload polaroids,
          signed contracts, references without leaving this tab. */}
      {isTalentUpload && (
        <input
          ref={talentFileInputRef}
          type="file"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onTalentPickFile(f);
            e.target.value = "";
          }}
        />
      )}
      <button
        type="button"
        disabled={talentUploadPending}
        onClick={() => {
          if (isTalentUpload) talentFileInputRef.current?.click();
          else toast(t("dashboard.adminTabs.files.chooseFile"));
        }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "10px 12px", marginBottom: 4,
          background: "transparent",
          border: `1.5px dashed ${COLORS.border}`, borderRadius: 10,
          color: COLORS.ink, cursor: talentUploadPending ? "wait" : "pointer",
          fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600,
          opacity: talentUploadPending ? 0.6 : 1,
        }}
        onMouseEnter={(e) => { if (!talentUploadPending) { e.currentTarget.style.borderColor = COLORS.accent; e.currentTarget.style.color = COLORS.accentDeep; } }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.ink; }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
        {talentUploadPending ? t("dashboard.adminTabs.files.uploading") : t("dashboard.adminTabs.files.addFile")}
        <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 11 }} className="text-admin-ink-muted">
          {t("dashboard.adminTabs.files.addFileHint")}
        </span>
      </button>

      {visible.length === 0 ? (
        <div style={{ padding: "24px 12px", textAlign: "center", fontSize: 12, fontFamily: FONTS.body }} className="text-admin-ink-dim">
          {t("dashboard.adminTabs.files.emptyState")}
        </div>
      ) : (
        <>
          {showGroupHeaders && groupTitle(interpolate(t("dashboard.adminTabs.files.fromClient"), { count: sortedClient.length }))}
          {sortedClient.map(f => fileCard(f, !showGroupHeaders && povCanSeeTalentFiles))}
          {showGroupHeaders && groupTitle(interpolate(t("dashboard.adminTabs.files.bookingTeam"), { count: sortedTalent.length }))}
          {sortedTalent.map(f => fileCard(f, !showGroupHeaders))}
        </>
      )}
    </div>
  );
}

// Render text with @mentions highlighted in accent color.
export function renderWithMentions(body: string, mine: boolean): React.ReactNode {
  const parts = body.split(/(@[A-Z][\w-]*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("@")) {
      return (
        <span key={i} style={{
          color: mine ? "#9ED6C2" : COLORS.accent,
          fontWeight: 600,
        }}>{p}</span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

// Extract day prefix from a `ts` like "Apr 28 · 10:18" → "Apr 28".
export function dayKey(ts: string): string {
  const sep = ts.indexOf(" · ");
  return sep >= 0 ? ts.slice(0, sep) : ts;
}

export function DaySeparator({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
      <span style={{ flex: 1, height: 1, background: COLORS.borderSoft }} />
      <span style={{
        fontSize: 10.5, fontWeight: 600, padding: "2px 8px" }} className="text-admin-ink-dim">{label}</span>
      <span style={{ flex: 1, height: 1, background: COLORS.borderSoft }} />
    </div>
  );
}

// ── ConversationActionPin — sticky in-thread callout for the current
// most-urgent action. One pin at a time so the surface stays calm.
//   - hold stage  → red/amber "Hold expires in {h}h" with Manage button
//   - inquiry pending → indigo "Coordinator invited you" with Accept/Decline
//   - everything else → no pin
// Lives at the top of ConversationTab so it's pinned-feeling and remains
// visible while the talent scrolls older messages.
// ── TeamStrip — compact horizontal lineup at the top of every chat.
// Replaces the prior stack of pinned notes (action pin + coordinator
// note + cross-thread bridge) which ate too much vertical space.
//
// Shows: avatar stack (overlapping) · count summary · open chevron.
// Click → opens LineupDrawer for view/edit. Permission rules:
//   - Admin / coordinator / talent_coord / client → can edit
//   - Regular talent → read-only (still gets the drawer but no actions)
// ──
export function TeamStrip({
  lineup, canEdit, povLabel, onOpen,
}: {
  lineup: Array<{ talentId: string; name: string; initials: string; state: string; photoUrl?: string }>;
  canEdit: boolean;
  /** Subtle role marker shown on the right ("Edit" or "View"). */
  povLabel: "edit" | "view";
  onOpen: () => void;
}) {
  const t = useT();
  if (lineup.length === 0) return null;
  // Discriminant->label map: keep switching on the raw povLabel union for
  // the icon; resolve the SR-only label via t().
  const povLabelKey: Record<"edit" | "view", string> = {
    edit: "dashboard.adminTabs.teamStrip.editLineup",
    view: "dashboard.adminTabs.teamStrip.viewLineup",
  };
  const accepted = lineup.filter(tal => {
    const s = (tal.state || "").toLowerCase();
    return s === "accepted" || s === "confirmed" || s === "booked";
  }).length;
  const pending = lineup.filter(tal => {
    const s = (tal.state || "").toLowerCase();
    return s === "pending" || s === "invited";
  }).length;
  const declined = lineup.filter(tal => {
    const s = (tal.state || "").toLowerCase();
    return s === "declined" || s === "rejected" || s === "withdrew" || s === "withdrawn";
  }).length;
  // Show up to 6 faces in the strip — premium messaging apps
  // (Notion, Linear, Slack huddle) lead with people, not text.
  const visible = lineup.slice(0, 6);
  const overflow = Math.max(0, lineup.length - visible.length);
  const allConfirmed = accepted === lineup.length;
  // Smart single-person copy — for solo lineups show the talent's
  // name (or "Just you") instead of the awkward "1/1 person".
  const isSolo = lineup.length === 1;
  const soloIsMe = isSolo && (
    lineup[0]?.talentId === currentTalentId() ||
    lineup[0]?.name === MY_TALENT_PROFILE.name
  );
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("dashboard.adminTabs.teamStrip.openLineup")}
      style={{
        position: "relative",
        display: "flex", alignItems: "center", gap: 10,
        width: "100%",
        // Locked banners get a feather-soft success tint so the eye
        // immediately knows "deal complete". Active lineups stay white.
        padding: "5px 10px 5px 6px",
        minHeight: 42,
        background: allConfirmed && lineup.length > 1
          ? `linear-gradient(90deg, ${COLORS.successSoft} 0%, #FFFFFF 60%)`
          : "#fff",
        border: `1px solid ${allConfirmed && lineup.length > 1 ? `${COLORS.success}30` : COLORS.borderSoft}`,
        borderRadius: 999,
        cursor: "pointer", textAlign: "left",
        fontFamily: FONTS.body,
        transition: `border-color ${TRANSITION.micro}, box-shadow ${TRANSITION.micro}`,
        // Prevent inner wrapping — Locked pill was bouncing to a
        // second line on long lineups, causing inconsistent heights.
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = allConfirmed && lineup.length > 1 ? `${COLORS.success}55` : COLORS.border;
        e.currentTarget.style.boxShadow = "0 4px 14px -8px rgba(11,11,13,0.14)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = allConfirmed && lineup.length > 1 ? `${COLORS.success}30` : COLORS.borderSoft;
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Avatar stack — the hero. Tight overlap (-10px) makes the row
          read as ONE pill of faces. Status-tinted ring on each avatar
          carries the lineup-health signal that used to need a side rail
          + counts row. Premium messaging-app convention. */}
      <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
        {visible.map((tal, i) => {
          const s = (tal.state || "").toLowerCase();
          const ring = (s === "accepted" || s === "confirmed" || s === "booked") ? COLORS.success
            : (s === "pending" || s === "invited") ? COLORS.amber
            : (s === "declined" || s === "rejected" || s === "withdrew" || s === "withdrawn") ? "rgba(11,11,13,0.18)"
            : "rgba(11,11,13,0.18)";
          return (
            <div key={tal.talentId} style={{
              // inline-flex collapses phantom line-box space the
              // inline-block Avatar otherwise creates (was 36px tall
              // for a 28px avatar, leaving an awkward gap below).
              display: "inline-flex",
              marginLeft: i > 0 ? -10 : 0,
              borderRadius: "50%",
              boxShadow: `0 0 0 2px #fff, 0 0 0 3px ${ring}`,
              position: "relative",
              zIndex: visible.length - i,
            }}>
              <Avatar size={28} tone="auto" hashSeed={tal.name} initials={tal.initials} photoUrl={tal.photoUrl} />
            </div>
          );
        })}
        {overflow > 0 && (
          <span style={{ marginLeft: -10, width: 28, height: 28, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 700, boxShadow: "0 0 0 2px #fff, 0 0 0 3px rgba(11,11,13,0.10)", fontFamily: FONTS.body }} className="bg-admin-surface-alt text-admin-ink-muted">+{overflow}</span>
        )}
      </div>
      {/* Tight summary — single line. Smart copy per cardinality:
          - solo + me     → "Just you"
          - solo + other  → name only
          - group         → "X/Y"
          + Locked pill when fully confirmed (group only). */}
      <div style={{ flex: 1, minWidth: 0, display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "nowrap", fontSize: 12, fontWeight: 600, letterSpacing: -0.05, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink">
        {isSolo ? (
          <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink">
            {soloIsMe ? t("dashboard.adminTabs.teamStrip.justYou") : (lineup[0]?.name ?? "")}
          </span>
        ) : (
          <>
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {accepted}/{lineup.length}
            </span>
            <span style={{ fontWeight: 500 }} className="text-admin-ink-muted">
              {t("dashboard.adminTabs.teamStrip.onLineup")}
            </span>
          </>
        )}
        {allConfirmed && lineup.length > 1 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "#fff", textTransform: "uppercase", letterSpacing: 0.4, border: `1px solid ${COLORS.success}30`, flexShrink: 0 }} className="text-admin-success">
            <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
              <path d="M1.5 4.2l1.7 1.6L6.5 2.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {t("dashboard.adminTabs.teamStrip.locked")}
          </span>
        )}
      </div>
      {/* Right-side affordance:
          - coord/admin/client (canEdit) → small pencil icon = "edit"
          - regular talent → simple chevron = "view"
          The icon difference makes permissions readable at a glance
          without adding text chrome. */}
      <span aria-hidden style={{
        flexShrink: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 22, height: 22, borderRadius: "50%",
        color: COLORS.inkMuted,
        background: povLabel === "edit" ? "rgba(11,11,13,0.05)" : "transparent",
        marginRight: 2,
      }}>
        {povLabel === "edit" ? (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M8 2l2 2-6 6H2v-2l6-6zM7 3l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </span>
      {/* Screen-reader edit/view cue */}
      <span style={{
        position: "absolute", width: 1, height: 1, padding: 0,
        margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)",
        whiteSpace: "nowrap", border: 0,
      }}>{t(povLabelKey[povLabel])}</span>
    </button>
  );
}

// LineupDrawer + LineupMemberRow + CoordinatorRow + AddTalentPicker
// were retired 2026-05-15 (commit ae47a8a24) and physically purged
// 2026-05-15 followup (~491 LOC). All open-triggers route to the
// Lineup tab where the canonical LiveLineupPanel handles add/remove/
// swap with real engine writes. Git history preserves the retired
// implementation if it ever needs to be reconstructed.

export function ConversationActionPin({ conv }: { conv: Conversation }) {
  const { toast } = useAdminShell();
  const t = useT();
  const router = useRouter();
  // C4 — capture `pending` so we can no-op duplicate clicks during an
  // in-flight Accept / Decline / Submit-rate call. Without this, a
  // double-tap would fire two engine round-trips and produce confusing
  // toast pairs ("Inquiry accepted" + "version_conflict").
  const [pending, startTransition] = useTransition();
  // Look at the most recent action message in the thread to figure out
  // what's actually being asked. Beats stage-based heuristics — the
  // pin reflects the conversation, not just the funnel position.
  const messages = MOCK_THREAD[`${conv.id}:talent`] ?? MOCK_THREAD[conv.id] ?? [];
  const lastAction = [...messages].reverse().find(m =>
    (m.kind === "action-rate" || m.kind === "action-confirm" || m.kind === "action-transport" || m.kind === "polaroid-request" || m.kind === "contract-sign") &&
    !("resolved" in m && m.resolved)
  );

  // F-pass — when the conv id is a real inquiry UUID, route the talent
  // CTAs through the engine. Synthetic mock conv ids (c1..c12) keep the
  // toast-only stub behavior so the demo flow continues to work.
  const isRealInquiry = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conv.id);
  const realAccept = isRealInquiry ? () => {
    if (pending) return;
    startTransition(async () => {
      const r = await acceptInquiryInvitation(conv.id);
      if (!r.ok) toast(interpolate(t("dashboard.adminTabs.actionPin.acceptFailed"), { error: r.error }));
      else { toast(t("dashboard.adminTabs.actionPin.inquiryAccepted")); router.refresh(); }
    });
  } : null;
  const realDecline = isRealInquiry ? () => {
    if (pending) return;
    startTransition(async () => {
      const r = await declineInquiryInvitation(conv.id);
      if (!r.ok) toast(interpolate(t("dashboard.adminTabs.actionPin.declineFailed"), { error: r.error }));
      else { toast(t("dashboard.adminTabs.actionPin.inquiryDeclined")); router.refresh(); }
    });
  } : null;
  const realSubmitRate = isRealInquiry ? () => {
    const raw = window.prompt(t("dashboard.adminTabs.actionPin.ratePrompt"));
    if (raw == null) return;
    const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(num) || num < 0) { toast(t("dashboard.adminTabs.actionPin.invalidRate")); return; }
    startTransition(async () => {
      const r = await submitMyRateForInquiry(conv.id, num);
      if (!r.ok) toast(interpolate(t("dashboard.adminTabs.actionPin.submitRateFailed"), { error: r.error }));
      else { toast(t("dashboard.adminTabs.actionPin.rateSubmitted")); router.refresh(); }
    });
  } : null;

  // COORD-SIDE — Marta is the coordinator and there's an outstanding
  // ask from the client that needs to be dispatched to the team. Used
  // when the booking-team thread carries a "client wants X by Y" cue
  // and Marta hasn't closed the loop yet (e.g. c7 crew assets, c10
  // pending NDAs). Surfaces in BOTH threads so the coord can act from
  // wherever they are.
  if (conv.iAmCoordinator && conv.stage === "booked") {
    if (conv.id === "c7") {
      return (
        <ActionPinShell tone="amber" icon="📝"
          title={t("dashboard.adminTabs.actionPin.crewAssetsTitle")}
          body={t("dashboard.adminTabs.actionPin.crewAssetsBody")}
          primary={{ label: t("dashboard.adminTabs.actionPin.nudgeCrew"), disabled: true, title: t("dashboard.adminTabs.actionPin.nudgeCrewTitle") }}
          secondary={{ label: t("dashboard.adminTabs.actionPin.uploadMine"), disabled: true, title: t("dashboard.adminTabs.actionPin.uploadMineTitle") }}
        />
      );
    }
  }

  // F-remainder — quick post-message helper for action-confirm style CTAs
  // that don't have a dedicated engine action. The talent's confirmation
  // gets sent as a message into the group thread so the coordinator sees
  // the explicit acknowledgement in audit + activity.
  const realPostConfirm = isRealInquiry ? (label: string) => {
    startTransition(async () => {
      const r = await sendInquiryMessageAsTalent(conv.id, interpolate(t("dashboard.adminTabs.actionPin.confirmedMessage"), { label }));
      if (!r.ok) toast(interpolate(t("dashboard.adminTabs.actionPin.confirmFailed"), { error: r.error }));
      else { toast(t("dashboard.adminTabs.actionPin.confirmed")); router.refresh(); }
    });
  } : null;

  // HOLD — deadline countdown takes priority over generic actions.
  // "Confirm hold" maps to acceptTalentInvitation (the talent commits);
  // "Release" maps to declineTalentInvitation. Both via the same engine
  // path as the inquiry-stage Accept/Decline.
  if (conv.stage === "hold") {
    return (
      <ActionPinShell tone="amber" icon="⏰"
        title={t("dashboard.adminTabs.actionPin.holdTitle")}
        body={t("dashboard.adminTabs.actionPin.holdBody")}
        primary={realAccept
          ? { label: t("dashboard.adminTabs.actionPin.confirmHold"), onClick: realAccept }
          : { label: t("dashboard.adminTabs.actionPin.confirmHold"), disabled: true, title: t("dashboard.adminTabs.actionPin.confirmHoldDisabled") }}
        secondary={realDecline
          ? { label: t("dashboard.adminTabs.actionPin.release"), onClick: realDecline }
          : { label: t("dashboard.adminTabs.actionPin.release"), disabled: true, title: t("dashboard.adminTabs.actionPin.releaseDisabled") }}
      />
    );
  }

  // BOOKED — surface unresolved action-confirm (e.g. call sheet).
  if (conv.stage === "booked" && lastAction?.kind === "action-confirm") {
    const label = lastAction.label || t("dashboard.adminTabs.actionPin.actionFallback");
    return (
      <ActionPinShell tone="indigo" icon="📋"
        title={label}
        body={t("dashboard.adminTabs.actionPin.signoffBody")}
        primary={realPostConfirm
          ? { label: t("dashboard.adminTabs.actionPin.confirm"), onClick: () => realPostConfirm(label) }
          : { label: t("dashboard.adminTabs.actionPin.confirm"), disabled: true, title: t("dashboard.adminTabs.actionPin.confirmDisabled") }}
        secondary={{ label: t("dashboard.adminTabs.actionPin.question"), disabled: true, title: t("dashboard.adminTabs.actionPin.questionDisabled") }}
      />
    );
  }

  // INQUIRY — pick the right ask based on the freshest action.
  if (conv.stage === "inquiry") {
    if (lastAction?.kind === "action-rate") {
      return (
        <ActionPinShell tone="indigo" icon="💸"
          title={t("dashboard.adminTabs.actionPin.submitRateTitle")}
          body={interpolate(t("dashboard.adminTabs.actionPin.submitRateBody"), { name: conv.leader?.name?.split(" ")[0] ?? t("dashboard.adminTabs.actionPin.theCoordinator") })}
          primary={realSubmitRate
            ? { label: t("dashboard.adminTabs.actionPin.submitRate"), onClick: realSubmitRate }
            : { label: t("dashboard.adminTabs.actionPin.submitRate"), disabled: true, title: t("dashboard.adminTabs.actionPin.submitRateDisabled") }}
          secondary={{ label: t("dashboard.adminTabs.actionPin.askCoordSet"), disabled: true, title: t("dashboard.adminTabs.actionPin.askCoordSetDisabled") }}
        />
      );
    }
    if (lastAction?.kind === "polaroid-request") {
      return (
        <ActionPinShell tone="indigo" icon="📸"
          title={t("dashboard.adminTabs.actionPin.polaroidsTitle")}
          body={t("dashboard.adminTabs.actionPin.polaroidsBody")}
          primary={{ label: t("dashboard.adminTabs.actionPin.uploadPolaroids"), disabled: true, title: t("dashboard.adminTabs.actionPin.uploadPolaroidsDisabled") }}
        />
      );
    }
    return (
      <ActionPinShell tone="indigo" icon="✋"
        title={t("dashboard.adminTabs.actionPin.invitedTitle")}
        body={interpolate(t("dashboard.adminTabs.actionPin.invitedBody"), { name: conv.leader?.name ?? t("dashboard.adminTabs.actionPin.invitedBodyFallback") })}
        primary={realAccept
          ? { label: t("dashboard.adminTabs.actionPin.accept"), onClick: realAccept }
          : { label: t("dashboard.adminTabs.actionPin.accept"), disabled: true, title: t("dashboard.adminTabs.actionPin.acceptDisabled") }}
        secondary={realDecline
          ? { label: t("dashboard.adminTabs.actionPin.decline"), onClick: realDecline }
          : { label: t("dashboard.adminTabs.actionPin.decline"), disabled: true, title: t("dashboard.adminTabs.actionPin.declineDisabled") }}
      />
    );
  }
  return null;
}

export function ActionPinShell({
  tone, icon, title, body, primary, secondary,
}: {
  tone: "amber" | "indigo" | "coral";
  icon: string;
  title: string;
  body: string;
  primary?: { label: string; onClick?: () => void; disabled?: boolean; title?: string };
  secondary?: { label: string; onClick?: () => void; disabled?: boolean; title?: string };
}) {
  const palette = tone === "amber"
    ? { bg: `${COLORS.amber}14`, border: `${COLORS.amber}40`, fg: COLORS.amber, primaryBg: COLORS.amber }
    : tone === "coral"
    ? { bg: `${COLORS.coral}14`, border: `${COLORS.coral}40`, fg: COLORS.coral, primaryBg: COLORS.coral }
    : { bg: COLORS.indigoSoft, border: `${COLORS.indigo}40`, fg: COLORS.indigoDeep, primaryBg: COLORS.indigoDeep };
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "10px 12px",
      background: palette.bg, border: `1px solid ${palette.border}`,
      borderRadius: 10, fontFamily: FONTS.body,
    }}>
      <span aria-hidden style={{
        flexShrink: 0, fontSize: 14, lineHeight: 1,
        width: 24, height: 24, borderRadius: 6,
        background: "rgba(255,255,255,0.6)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 12.5, fontWeight: 700, color: palette.fg, lineHeight: 1.3 }}>{title}</div>
        <div style={{ fontSize: 11.5, marginTop: 2, lineHeight: 1.45 }} className="text-admin-ink">{body}</div>
        {(primary || secondary) && (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {primary && (() => {
              const primaryDisabled = primary.disabled || !primary.onClick;
              const style = {
                padding: "5px 11px", borderRadius: 999, fontSize: 11.5, fontWeight: 600,
                border: "none", background: palette.primaryBg, color: "#fff", cursor: "pointer",
              } satisfies React.CSSProperties;
              return (
                <button
                  type="button"
                  onClick={primaryDisabled ? undefined : primary.onClick}
                  disabled={primaryDisabled}
                  title={primary.title}
                  style={primaryDisabled ? disabledBtn(style) : style}
                >
                  {primary.label}
                </button>
              );
            })()}
            {secondary && (() => {
              const secondaryDisabled = secondary.disabled || !secondary.onClick;
              const style = {
                padding: "5px 11px", borderRadius: 999, fontSize: 11.5, fontWeight: 600,
                border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.ink, cursor: "pointer",
              } satisfies React.CSSProperties;
              return (
                <button
                  type="button"
                  onClick={secondaryDisabled ? undefined : secondary.onClick}
                  disabled={secondaryDisabled}
                  title={secondary.title}
                  style={secondaryDisabled ? disabledBtn(style) : style}
                >
                  {secondary.label}
                </button>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
