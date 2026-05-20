"use client";

import { type CSSProperties } from "react";
import { useAdminShell, COLORS, FONTS, type InquiryRecord } from "../../state";
import { Avatar } from "../../primitives";
import { type Conversation } from "../../talent";
import { CLIENT_NEXT_ACTION_FOR_CONV } from "../ClientProjectShell";
import { readConvNote, useNotesSubscription, useOfferStashSubscription, writeConvNote } from "../conversation-stash";
import { CoordRoleBadge, PresenceDot } from "./inbox-identity-1";
import { LiveLineupPanel } from "./machinery-11";
import { disabledBtn } from "./machinery-13";
import { TalentBookingTab } from "./machinery-2";
import { countdownLabel } from "./machinery-5";
import { ClientTalentCard, LocationMapTile } from "./machinery-7";
import { MOCK_FILES_FOR_CONV } from "./machinery-9";
import type { Offer } from "./machinery-9";
import { sourceChipMeta } from "../talent-1";


// ── ClientProjectViewTab ──
// Client-flavored mirror of TalentBookingTab. Same 2-column card grid
// pattern (so the look/feel reads identically across roles) but the
// content shifts to what a client cares about:
//   • Project status hero — what's happening NOW + the next decision
//     they own (Approve / Sign / Pay / Add note)
//   • The project — title, brief, source where the inquiry came in
//   • When + Where 2-up
//   • Your talent (commissioned lineup) + Your contact (coordinator)
//   • Files + your notes
//
// No "submit rate" flow (talent-only) and no commercial breakdown
// (handled by the dedicated Offer tab when they're approving / paying).
export function ClientProjectViewTab({
  conv, inquiry, onOpenClientThread, onOpenOffer,
}: {
  conv: Conversation;
  inquiry: InquiryRecord;
  onOpenClientThread: () => void;
  onOpenOffer: () => void;
}) {
  const { toast } = useAdminShell();
  const pinned = conv.pinned ?? {};
  const days = countdownLabel(inquiry.schedule.start);
  const coord = inquiry.coordinators[0];
  const lineup = inquiry.talent;
  const teammates = lineup.length > 0;
  const showCoord = !!coord;
  const action = CLIENT_NEXT_ACTION_FOR_CONV[conv.id];
  // Subscribe to offer-stash + notes so this view re-renders when
  // the client approves something or edits their notes.
  useOfferStashSubscription();
  useNotesSubscription();
  const canOpenOfferAction = !!action?.primary && /approve|review|counter/i.test(action.label);
  // Lineup drawer RETIRED (S0.3). Add/Swap actions now toast the client
  // toward the Lineup tab where the canonical LiveLineupPanel handles
  // talent management with real DB-backed engine writes.
  const openLineupTab = () => toast("Tap the Lineup tab above to manage talent");

  // Same compact card surface as the talent's TalentBookingTab so
  // the patterns look identical across roles.
  const cardStyle: CSSProperties = {
    background: "#fff",
    border: `1px solid ${COLORS.borderSoft}`,
    borderRadius: 12,
    padding: "12px 14px",
    boxShadow: "0 1px 0 rgba(11,11,13,0.02)",
    minWidth: 0,
    maxWidth: "100%",
    overflow: "hidden",
    boxSizing: "border-box",
  };
  const sectionTitle: CSSProperties = {
    fontSize: 10.5,
    fontWeight: 700,
    color: COLORS.inkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  };

  return (
    <div data-tulala-booking-tab style={{
      padding: 14,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      fontFamily: FONTS.body,
    }}>
      <style dangerouslySetInnerHTML={{ __html:
        "@media (max-width: 720px){"
        + "[data-tulala-booking-tab]{padding:10px!important;gap:7px!important}"
        + "[data-tulala-booking-tab] [data-booking-grid]{gap:7px!important}"
        + "[data-tulala-booking-tab] [data-booking-card]{padding:9px 10px!important}"
        + "[data-tulala-booking-tab] [data-booking-section-title]{font-size:9.5px!important;margin-bottom:5px!important}"
        + "}"
        // Below 480px the side-by-side cards squash to <160px wide and
        // the LocationMapTile + talent rows truncate aggressively. Stack
        // every booking-grid row to a single column so each card gets
        // the full width. !important is needed because the inline
        // gridTemplateColumns (e.g. "1.4fr 1fr") on the JSX would
        // otherwise win.
        + "@media (max-width: 480px){"
        + "[data-tulala-booking-tab] [data-booking-grid]{grid-template-columns:1fr!important}"
        + "}"
      }} />

      {/* Action hero — when the client owes a decision, this banner
          carries it front-and-center so they can act without hunting
          for the right tab. Replaces the talent's "On set in N days"
          countdown (which doesn't apply for client). When no action,
          falls back to the countdown for booked projects. */}
      {action?.primary ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 14px",
          background: `linear-gradient(135deg, ${COLORS.coral}14 0%, ${COLORS.surfaceAlt} 100%)`,
          border: `1px solid ${COLORS.coral}40`,
          borderRadius: 12,
        }}>
          <span aria-hidden style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 36, height: 36, borderRadius: 10,
            background: `${COLORS.coral}28`,
            color: COLORS.coral, flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 4.5v3.5l2 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }} className="text-admin-coral">
              Needs your decision
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }} className="text-admin-ink">
              {action.label}
            </div>
          </div>
          <button
            type="button"
            disabled={!canOpenOfferAction}
            title={canOpenOfferAction ? undefined : "This client action needs a live workflow before it can run here."}
            onClick={canOpenOfferAction ? onOpenOffer : undefined}
            style={canOpenOfferAction ? {
              flexShrink: 0,
              padding: "8px 14px", borderRadius: 999,
              background: COLORS.coral, color: "#fff",
              border: "none", cursor: "pointer",
              fontFamily: FONTS.body, fontSize: 12, fontWeight: 700,
            } : disabledBtn({
              flexShrink: 0,
              padding: "8px 14px", borderRadius: 999,
              background: COLORS.coral, color: "#fff",
              border: "none", cursor: "pointer",
              fontFamily: FONTS.body, fontSize: 12, fontWeight: 700,
            })}
          >
            {canOpenOfferAction ? "Open offer" : "Coming soon"}
          </button>
        </div>
      ) : days ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 14px",
          background: days.urgent
            ? `linear-gradient(135deg, ${COLORS.amber}18 0%, ${COLORS.amber}08 100%)`
            : `linear-gradient(135deg, ${COLORS.successSoft} 0%, ${COLORS.surfaceAlt} 100%)`,
          border: `1px solid ${days.urgent ? `${COLORS.amber}40` : `${COLORS.success}30`}`,
          borderRadius: 12,
        }}>
          <span aria-hidden style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 36, height: 36, borderRadius: 10,
            background: days.urgent ? `${COLORS.amber}28` : `${COLORS.success}20`,
            color: days.urgent ? COLORS.amber : (COLORS.successDeep ?? COLORS.success),
            flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M2.5 6.5h11M5 2v3M11 2v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </span>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 13, fontWeight: 700, color: days.urgent ? COLORS.amber : (COLORS.successDeep ?? COLORS.success) }}>
              {days.headline}
            </div>
            <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
              {days.subhead}
            </div>
          </div>
        </div>
      ) : null}

      {/* The project — title + brief + source. Client wants context:
          what they commissioned, who's doing it, what stage it's at. */}
      <div data-booking-card style={cardStyle}>
        <div data-booking-section-title style={sectionTitle}>The project</div>
        <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }} className="text-admin-ink">
          {inquiry.title}
        </div>
        <div style={{ fontSize: 12, marginTop: 3 }} className="text-admin-ink-muted">
          With {conv.agency} · {conv.leader.name} coordinating
        </div>
        {(() => {
          const sourceMeta = conv.source ? sourceChipMeta(conv.source) : null;
          if (!sourceMeta) return null;
          return (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }} className="text-admin-ink-dim">You sent this via</span>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "3px 9px", borderRadius: 999,
                background: sourceMeta.bg, color: sourceMeta.fg,
                fontSize: 11, fontWeight: 700,
              }}>
                <span aria-hidden style={{ display: "inline-flex" }}>{sourceMeta.icon}</span>
                {sourceMeta.label}
              </span>
            </div>
          );
        })()}
        {inquiry.brief.summary && inquiry.brief.summary !== inquiry.title && (
          <div style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.55 }} className="text-admin-ink">
            {inquiry.brief.summary}
          </div>
        )}
        {/* Coordinator's note for the client — same atom as talent's
            "Sara's read" + admin's "Sara's read", framed for the
            client as a personal note from the coord rather than an
            internal-team read. Pulls from the same conv.pinned.
            coordinatorNote source so a coord writes once and both
            audiences see it (with appropriate framing). */}
        {conv.pinned?.coordinatorNote && coord && (
          <div style={{ marginTop: 10, display: "flex", gap: 9, padding: "10px 12px", border: `1px solid rgba(91,107,160,0.18)`, borderRadius: 10 }} className="bg-admin-indigo-soft">
            <span aria-hidden style={{ flexShrink: 0, marginTop: 1, color: COLORS.indigoDeep }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M3 3h3v3H4l-1 2v-2H3V3zm5 0h3v3H9l-1 2v-2H8V3z" fill="currentColor"/>
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 2 }} className="text-admin-indigo-deep">
                {coord.name.split(" ")[0]}&apos;s note for you
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, fontStyle: "italic" }} className="text-admin-ink">
                &quot;{conv.pinned.coordinatorNote}&quot;
              </div>
            </div>
          </div>
        )}
      </div>

      {/* When + Where — same 2-up layout the talent gets so the
          patterns mirror across roles. */}
      <div data-booking-grid style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div data-booking-card style={cardStyle}>
          <div data-booking-section-title style={sectionTitle}>When</div>
          <div className="text-admin-ink text-sm font-bold">
            {inquiry.schedule.start}
            {inquiry.schedule.end && ` → ${inquiry.schedule.end}`}
          </div>
          {pinned.callTime && (
            <div style={{ fontSize: 12, marginTop: 4 }} className="text-admin-ink-muted">
              Call · <span style={{ fontWeight: 600 }} className="text-admin-ink">{pinned.callTime}</span>
            </div>
          )}
        </div>
        <div data-booking-card style={{ ...cardStyle, padding: 0 }}>
          <div data-booking-section-title style={{ ...sectionTitle, padding: "12px 14px 0" }}>Where</div>
          {(inquiry.location.city || inquiry.location.venue || inquiry.location.address) ? (
            <div style={{ padding: "8px 14px 12px" }}>
              <LocationMapTile
                venue={inquiry.location.venue}
                address={inquiry.location.address}
                city={inquiry.location.city}
                onOpenMaps={() => toast("Open map")}
              />
            </div>
          ) : (
            <div style={{ padding: "0 14px 12px", fontSize: 12 }} className="text-admin-ink-muted">
              Location TBC.
            </div>
          )}
        </div>
      </div>

      {/* Your talent + Your contact — 2-up. Lineup uses the
          ClientTalentCard component (which has add-talent + swap
          affordances baked in). Coordinator card shows who's running
          this with a Message CTA. */}
      {(teammates || showCoord) && (
        <div data-booking-grid style={{
          display: "grid",
          gridTemplateColumns: teammates && showCoord ? "1.4fr 1fr" : "1fr",
          gap: 10,
        }}>
          {teammates && (
            <div data-booking-card style={cardStyle}>
              <div data-booking-section-title style={sectionTitle}>Your talent</div>
              {lineup
                .filter(t => {
                  const s = (t.state ?? "").toLowerCase();
                  if (inquiry.status === "submitted" || inquiry.status === "coordinating") {
                    return s === "accepted" || s === "confirmed" || s === "booked";
                  }
                  return s !== "declined" && s !== "rejected" && s !== "withdrew";
                })
                .map(t => (
                  <ClientTalentCard
                    key={t.talentId} talent={t}
                    stagePast={inquiry.status === "wrapped"}
                    canEdit={inquiry.status !== "wrapped" && inquiry.status !== "cancelled"}
                    onSwap={openLineupTab}
                  />
                ))}
              {/* Add-talent footer — only when this lineup is still
                  editable (not past / cancelled). Opens the same drawer
                  the coordinator uses, with the client's "Favorites /
                  Recent / All Tulala" tab labels via the picker pov. */}
              {inquiry.status !== "wrapped" && inquiry.status !== "cancelled" && (
                <button type="button" onClick={openLineupTab} style={{
                  marginTop: 4, width: "100%",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "8px 10px", borderRadius: 8,
                  border: `1px dashed ${COLORS.border}`,
                  background: "transparent", color: COLORS.ink,
                  cursor: "pointer", fontSize: 11.5, fontWeight: 600, fontFamily: FONTS.body,
                }}>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                  Add talent
                </button>
              )}
            </div>
          )}
          {showCoord && (
            <div data-booking-card data-booking-coord style={cardStyle}>
              <div data-booking-section-title style={sectionTitle}>Your contact</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                  <Avatar size={36} tone="auto" hashSeed={coord.name} initials={coord.initials} />
                  <PresenceDot name={coord.name} />
                </span>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }} className="text-admin-ink">
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {coord.name}
                    </span>
                    <CoordRoleBadge role={(coord as { role?: string }).role} />
                  </div>
                  <div style={{ fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink-muted">
                    {(coord as { role?: string }).role === "owner"
                      ? `Workspace owner · ${conv.agency}`
                      : `Coordinator · ${conv.agency}`}
                  </div>
                </div>
                {/* Coordinator-change requests need a persisted agency-ops
                    queue before we can safely expose them to clients.
                    Phase A C1 — kebab now toasts on click instead of
                    just sitting inert. */}
                {inquiry.status !== "wrapped" && inquiry.status !== "cancelled" && (
                  <button type="button"
                    onClick={() => toast("Coordinator change requests land with the agency-ops queue in a future phase. For now, message the coordinator directly.")}
                    title="Coming soon"
                    aria-label="Coordinator management — coming soon"
                    style={{
                      flexShrink: 0,
                      width: 28, height: 28, borderRadius: 8,
                      border: `1px solid ${COLORS.borderSoft}`,
                      background: "transparent", color: COLORS.inkMuted,
                      cursor: "pointer",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                    }}>
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                      <circle cx="3" cy="7" r="1" fill="currentColor"/>
                      <circle cx="7" cy="7" r="1" fill="currentColor"/>
                      <circle cx="11" cy="7" r="1" fill="currentColor"/>
                    </svg>
                  </button>
                )}
              </div>
              <button type="button" onClick={onOpenClientThread} style={{
                marginTop: 10, width: "100%",
                padding: "7px 10px", borderRadius: 8,
                border: `1px solid ${COLORS.border}`, background: "transparent",
                color: COLORS.ink, cursor: "pointer",
                fontSize: 11.5, fontWeight: 600, fontFamily: FONTS.body,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path d="M2 3.5h10v6H6L3 12v-2.5H2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                </svg>
                Message
              </button>
            </div>
          )}
        </div>
      )}

      {/* Files preview — top 3 client-thread files so the client can
          spot a callsheet / contract / selects link without leaving the
          Project tab. "View all" jumps to the dedicated Files tab. */}
      {(() => {
        const clientFiles = (MOCK_FILES_FOR_CONV[conv.id] ?? []).filter(f => f.thread === "client");
        if (clientFiles.length === 0) return null;
        const preview = clientFiles.slice(0, 3);
        return (
          <div data-booking-card style={cardStyle}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
              <div data-booking-section-title style={{ ...sectionTitle, marginBottom: 0 }}>Files</div>
              <span className="text-admin-ink-muted text-admin-10h">
                {clientFiles.length} file{clientFiles.length === 1 ? "" : "s"}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {preview.map((f) => (
                <button key={f.name} type="button"
                  onClick={() => toast(`Opening ${f.name}`)}
                  style={{
                    display: "flex", alignItems: "center", gap: 9,
                    padding: "7px 9px", borderRadius: 8,
                    background: COLORS.surfaceAlt,
                    border: `1px solid ${COLORS.borderSoft}`,
                    cursor: "pointer", textAlign: "left", fontFamily: FONTS.body,
                  }}>
                  <span aria-hidden style={{
                    flexShrink: 0,
                    width: 24, height: 24, borderRadius: 6,
                    background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    color: COLORS.inkMuted,
                  }}>
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M3 1h4l2 2v8H3V1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                      <path d="M7 1v2h2" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                    </svg>
                  </span>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink">{f.name}</div>
                    <div style={{ fontSize: 10.5, marginTop: 1 }} className="text-admin-ink-muted">
                      {f.size} · added by {f.addedBy} · {f.addedAt}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {clientFiles.length > preview.length && (
              <button type="button"
                onClick={() => toast("Open Files tab")}
                style={{
                  marginTop: 8, width: "100%",
                  padding: "6px 10px", borderRadius: 8,
                  border: `1px solid ${COLORS.borderSoft}`, background: "transparent",
                  color: COLORS.ink, cursor: "pointer",
                  fontSize: 11.5, fontWeight: 600, fontFamily: FONTS.body,
                }}>
                View all {clientFiles.length} files
              </button>
            )}
          </div>
        );
      })()}

      {/* Your notes — reminders for the brand contact ("ask about
          shoot prep call", "remind to share selects by Fri"). Keyed
          by conv.id so each project has its own note. */}
      <div data-booking-card style={cardStyle}>
        <div data-booking-section-title style={sectionTitle}>Your notes</div>
        <textarea
          key={conv.id}
          defaultValue={readConvNote(conv.id)}
          placeholder="Reminders, follow-ups, things to ask the coordinator…"
          onBlur={(e) => { writeConvNote(conv.id, e.currentTarget.value); toast("Note saved"); }}
          style={{
            width: "100%", minHeight: 64, resize: "vertical",
            padding: 10, borderRadius: 8,
            border: `1px solid ${COLORS.borderSoft}`,
            background: COLORS.surfaceAlt,
            fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink,
            outline: "none", boxSizing: "border-box",
          }}
        />
      </div>
      {/* Lineup drawer — same component the coordinator sees, but with
          the client's pov so picker tabs read "Favorites / Recent /
          All Tulala". Add / swap / remove all flow through here. */}
      {/* LineupDrawer retired (S0.3). Swap + Add toasts above route the
          client to the Lineup tab where LiveLineupPanel is canonical. */}
    </div>
  );
}
