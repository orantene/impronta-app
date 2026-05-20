"use client";

import { useMemo, type CSSProperties } from "react";
import { useAdminShell, COLORS, FONTS, type InquiryRecord } from "../../state";
import { type Conversation } from "../../talent";
import { readConvNote, useNotesSubscription, useOfferStashSubscription, writeConvNote } from "../conversation-stash";
import { getOffer, useLiveLineupOverride } from "./machinery-10";
import { LiveLineupPanel } from "./machinery-11";
import { TalentBookingTab } from "./machinery-2";
import { ClientProjectViewTab } from "./machinery-3";
import { AdminParticipantsActions, buildConvFromInquiry } from "./machinery-4";
import { LogisticsTab } from "./machinery-6";
import { DetailField, DetailSection, LocationMapTile } from "./machinery-7";
import { MOCK_FILES_FOR_CONV } from "./machinery-9";
import type { Offer } from "./machinery-9";
import { ShellHeader, sourceChipMeta } from "../talent-1";


// ── AdminBookingTab — workspace-flavored mirror of TalentBookingTab +
// ClientProjectViewTab. Same card-grid silhouette so the workspace
// detail view reads with one design language across roles, but the
// content shifts to admin's operational voice:
//   • Action hero — what does this coordinator owe RIGHT NOW
//     (Send to client / Build call sheet / Nudge talent)?
//   • Project card — brief + client trust badge + source provenance
//   • When + Where 2-up
//   • Lineup card — full participant list + Add talent + Reassign
//     coordinator (uses AdminParticipantsActions)
//   • Files preview — top 3 files across both threads
//   • Internal notes — coordinator-only memory pad
//
// Plan-tier hooks (planTier prop) gate workspace-only affordances:
//   - Free: hide Reassign coordinator (no team to reassign to)
//   - Studio / Agency / Hub-Network: full surface
export function AdminBookingTab({
  inquiry, planTier = "agency",
}: {
  inquiry: InquiryRecord;
  /** Workspace plan tier — drives which admin-only affordances render.
   *  Defaults to "agency" so any unset caller gets the full surface. */
  planTier?: "free" | "studio" | "agency" | "hub-network";
}) {
  const { toast } = useAdminShell();
  useOfferStashSubscription();
  useNotesSubscription();
  const conv = useMemo(() => buildConvFromInquiry(inquiry), [inquiry]);
  const offer = getOffer(conv.id);
  const days = countdownLabel(inquiry.schedule.start);
  const coord = inquiry.coordinators[0];
  // 2026-05-12 fix S0.2: Project tab was reading legacy mock-derived
  // `inquiry.talent`. For real (UUID) inquiries override with the canonical
  // `inquiry_participants` lineup so the count + roster always match the
  // Live lineup chip at the top of the workspace.
  const liveLineupOverride = useLiveLineupOverride(inquiry.id);
  const lineup = liveLineupOverride ?? inquiry.talent;
  const lineupTotal = lineup.length;
  const lineupAccepted = lineup.filter(t => {
    const s = (t.state ?? "").toLowerCase();
    return s === "accepted" || s === "confirmed" || s === "booked";
  }).length;
  const lineupPending = lineup.filter(t => {
    const s = (t.state ?? "").toLowerCase();
    return s === "pending" || s === "invited";
  }).length;
  const canEdit = inquiry.status !== "wrapped" && inquiry.status !== "cancelled";
  // Resolve the source meta. InquiryRecord.source uses the simplified
  // schema (`hub` / `agency_referral` / `client_form` / `workspace_manual`);
  // map each to the conv-side sourceChipMeta input.
  const sourceMeta = (() => {
    const src = inquiry.source;
    if (!src) return null;
    if (src.kind === "hub")              return sourceChipMeta({ kind: "tulala-hub", label: src.label });
    if (src.kind === "agency_referral")  return sourceChipMeta({ kind: "agency-referral" });
    if (src.kind === "client_form")      return sourceChipMeta({ kind: "direct", label: src.label });
    if (src.kind === "workspace_manual") return sourceChipMeta({ kind: "email", from: src.label });
    return null;
  })();

  // Admin's "what do I do next" — drives the action hero. Single
  // primary CTA + one-line rationale, same shape the talent + client
  // hero use, but the labels speak admin's operational language.
  const adminAction: { label: string; sub: string; tone: "primary" | "amber" | "success" } | null = (() => {
    if (!canEdit) return null;
    const ofStage = offer?.stage;
    if (inquiry.status === "submitted" && lineupTotal === 0) {
      return { label: "Add talent", sub: "Build the shortlist before replying.", tone: "primary" };
    }
    if (inquiry.status === "submitted" || inquiry.status === "coordinating") {
      if (lineupAccepted < lineupTotal) {
        return { label: "Nudge talent", sub: `${lineupTotal - lineupAccepted} talent haven't responded yet.`, tone: "amber" };
      }
      if (ofStage === "no_offer" || ofStage === "client_budget" || !ofStage) {
        return { label: "Build the offer", sub: "Lineup confirmed — draft pricing.", tone: "primary" };
      }
      return { label: "Send to client", sub: "Offer is ready. Push it to the client.", tone: "primary" };
    }
    if (ofStage === "sent" || ofStage === "reviewing") {
      return { label: "Nudge client", sub: "Offer is with client — ping if it's been quiet.", tone: "amber" };
    }
    if (ofStage === "countered") {
      return { label: "Review counter", sub: "Client came back with a counter-offer.", tone: "primary" };
    }
    if (inquiry.status === "approved" || inquiry.status === "booked") {
      return { label: "Open logistics", sub: "Booked. Call sheet editing is coming soon.", tone: "success" };
    }
    return null;
  })();

  const cardStyle: CSSProperties = {
    background: "#fff",
    border: `1px solid ${COLORS.borderSoft}`,
    borderRadius: 12,
    padding: "12px 14px",
    boxShadow: "0 1px 0 rgba(11,11,13,0.02)",
    minWidth: 0, maxWidth: "100%", overflow: "hidden", boxSizing: "border-box",
  };
  const sectionTitle: CSSProperties = {
    fontSize: 10.5, fontWeight: 700, color: COLORS.inkMuted,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8,
  };
  const heroPalette = adminAction?.tone === "amber"
    ? { bg: `linear-gradient(135deg, ${COLORS.amber}18 0%, ${COLORS.amber}08 100%)`, border: `${COLORS.amber}40`, fg: COLORS.amber, icBg: `${COLORS.amber}28` }
    : adminAction?.tone === "success"
    ? { bg: `linear-gradient(135deg, ${COLORS.successSoft} 0%, ${COLORS.surfaceAlt} 100%)`, border: `${COLORS.success}30`, fg: COLORS.successDeep ?? COLORS.success, icBg: `${COLORS.success}20` }
    : { bg: `linear-gradient(135deg, ${COLORS.coral}14 0%, ${COLORS.surfaceAlt} 100%)`, border: `${COLORS.coral}40`, fg: COLORS.coral, icBg: `${COLORS.coral}28` };

  const allFiles = MOCK_FILES_FOR_CONV[conv.id] ?? [];
  const filePreview = allFiles.slice(0, 3);

  return (
    <div data-tulala-booking-tab style={{
      padding: 14,
      display: "flex", flexDirection: "column", gap: 10,
      fontFamily: FONTS.body,
    }}>
      <style dangerouslySetInnerHTML={{ __html:
        "@media (max-width: 720px){"
        + "[data-tulala-booking-tab]{padding:10px!important;gap:7px!important}"
        + "[data-tulala-booking-tab] [data-booking-grid]{gap:7px!important}"
        + "[data-tulala-booking-tab] [data-booking-card]{padding:9px 10px!important}"
        + "[data-tulala-booking-tab] [data-booking-section-title]{font-size:9.5px!important;margin-bottom:5px!important}"
        + "}"
        + "@media (max-width: 480px){"
        + "[data-tulala-booking-tab] [data-booking-grid]{grid-template-columns:1fr!important}"
        + "}"
      }} />

      {/* Action hero — admin-voice equivalent of the client's "Needs your
          decision" + talent's countdown banner. When no action is owed
          and a shoot is within 14 days, fall back to the same countdown
          banner the talent sees so booked workspaces get the same cue. */}
      {adminAction ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 14px",
          background: heroPalette.bg,
          border: `1px solid ${heroPalette.border}`,
          borderRadius: 12,
        }}>
          <span aria-hidden style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 36, height: 36, borderRadius: 10,
            background: heroPalette.icBg, color: heroPalette.fg, flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 4.5v3.5l2 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: heroPalette.fg }}>
              Your move
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }} className="text-admin-ink">
              {adminAction.label}
            </div>
            <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
              {adminAction.sub}
            </div>
          </div>
          <span style={{
            flexShrink: 0,
            padding: "8px 14px", borderRadius: 999,
            background: heroPalette.fg, color: "#fff",
            opacity: 0.72,
            fontFamily: FONTS.body, fontSize: 12, fontWeight: 700,
          }}>
            Use tabs
          </span>
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

      {/* The project — title, brief summary, source, coord-team read.
          Same atom set as TalentBookingTab's "The job" card so the
          two surfaces read consistently across roles — what differs
          is voice ("The project" for admin/client vs "The job" for
          talent), not structure. */}
      <div data-booking-card style={cardStyle}>
        <div data-booking-section-title style={sectionTitle}>The project</div>
        <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }} className="text-admin-ink">
          {inquiry.title}
        </div>
        {/* Slice 3 (Messages consolidation): identity line below the
            project title is suppressed when the same client + coord
            facts already live in ShellHeader above. Only the brief
            (summary + notes + coord read) stays here — it's the
            project-detail surface, not the identity surface. */}
        {!inquiry.client.name && !coord && (
          <div style={{ fontSize: 12, marginTop: 3 }} className="text-admin-ink-muted">
            (no client or coordinator linked yet)
          </div>
        )}
        {/* "Came in via" source chip removed — duplicates ShellHeader's
            source meta on every render. The header is the canonical
            source-of-truth display; if the user wants to dig into
            source detail, the header chip is already there. */}
        {inquiry.brief.summary && inquiry.brief.summary !== inquiry.title && (
          <div style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.55 }} className="text-admin-ink">
            {inquiry.brief.summary}
          </div>
        )}
        {inquiry.brief.notes && (
          <div style={{ fontSize: 12, lineHeight: 1.55, marginTop: 8, padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.borderSoft}` }} className="text-admin-ink-muted bg-admin-surface-alt">{inquiry.brief.notes}</div>
        )}
        {/* Coord-team read — admin counterpart of talent's "Sara's
            read" block. Same indigo quote silhouette so the two
            surfaces visually rhyme. Pulls from the same conv.pinned.
            coordinatorNote source so a coord's framing is visible to
            their team without writing it twice. */}
        {conv.pinned?.coordinatorNote && coord && (
          <div style={{ marginTop: 10, display: "flex", gap: 9, padding: "10px 12px", border: `1px solid rgba(91,107,160,0.18)`, borderRadius: 10 }} className="bg-admin-indigo-soft">
            <span aria-hidden style={{ flexShrink: 0, marginTop: 1, color: COLORS.indigoDeep }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M3 3h3v3H4l-1 2v-2H3V3zm5 0h3v3H9l-1 2v-2H8V3z" fill="currentColor"/>
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 2 }} className="text-admin-indigo-deep">
                {coord.name.split(" ")[0]}&apos;s read
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, fontStyle: "italic" }} className="text-admin-ink">
                &quot;{conv.pinned.coordinatorNote}&quot;
              </div>
            </div>
          </div>
        )}
      </div>

      {/* When + Where 2-up */}
      <div data-booking-grid style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div data-booking-card style={cardStyle}>
          <div data-booking-section-title style={sectionTitle}>When</div>
          <div className="text-admin-ink text-sm font-bold">
            {inquiry.schedule.start}
            {inquiry.schedule.end && ` → ${inquiry.schedule.end}`}
          </div>
          {inquiry.schedule.callTime && (
            <div style={{ fontSize: 12, marginTop: 4 }} className="text-admin-ink-muted">
              Call · <span style={{ fontWeight: 600 }} className="text-admin-ink">{inquiry.schedule.callTime}</span>
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

      {/* Slice 3 (Messages consolidation): the Lineup roster card +
          standalone Coordinator card both lived here AND in the shell
          surface — Lineup duplicated the compact LiveLineupPanel above
          the tab bar, Coordinator duplicated ShellHeader.metaExtras's
          coord row. Both removed. The compact LiveLineupPanel handles
          add/remove/reorder; ShellHeader handles coord identity.

          AdminParticipantsActions (the canonical add-talent + reassign
          control) is still reachable via the LiveLineupPanel's
          expanded state, which renders the same picker. */}

      {/* Files preview — same surface the client gets, with a "View all"
          jump when there's overflow. */}
      {allFiles.length > 0 && (
        <div data-booking-card style={cardStyle}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <div data-booking-section-title style={{ ...sectionTitle, marginBottom: 0 }}>Files</div>
            <span className="text-admin-ink-muted text-admin-10h">
              {allFiles.length} file{allFiles.length === 1 ? "" : "s"}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {filePreview.map(f => (
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
                    {f.thread === "client" ? "Client thread" : "Talent thread"} · {f.size} · added by {f.addedBy} · {f.addedAt}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {allFiles.length > filePreview.length && (
            <button type="button"
              onClick={() => toast("Open Files tab")}
              style={{
                marginTop: 8, width: "100%",
                padding: "6px 10px", borderRadius: 8,
                border: `1px solid ${COLORS.borderSoft}`, background: "transparent",
                color: COLORS.ink, cursor: "pointer",
                fontSize: 11.5, fontWeight: 600, fontFamily: FONTS.body,
              }}>
              View all {allFiles.length} files
            </button>
          )}
        </div>
      )}

      {/* Slice 4 (Messages consolidation): "Last activity" feed from
          inquiry.timeline — requested in the prior session as
          "Maybe can had last activities too under detailes." Shows
          the most recent 6 events so the user can see at a glance
          what's happened on the project without leaving the Project
          tab. Renders nothing when no timeline events exist. */}
      {inquiry.timeline.length > 0 && (
        <div data-booking-card style={cardStyle}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <div data-booking-section-title style={{ ...sectionTitle, marginBottom: 0 }}>Last activity</div>
            <span className="text-admin-ink-muted text-admin-10h">
              {inquiry.timeline.length} event{inquiry.timeline.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {/* Most recent first — the timeline is stored chronologically,
                so we slice from the end. */}
            {[...inquiry.timeline].slice(-6).reverse().map((ev) => {
              const toneColor = ev.tone === "success" ? (COLORS.successDeep ?? COLORS.success)
                : ev.tone === "warn" ? COLORS.amber
                : ev.tone === "info" ? COLORS.indigoDeep
                : COLORS.inkMuted;
              return (
                <div key={ev.id} style={{
                  display: "flex", gap: 9, alignItems: "flex-start",
                  fontSize: 12, lineHeight: 1.45,
                }}>
                  <span aria-hidden style={{
                    flexShrink: 0, marginTop: 5,
                    width: 6, height: 6, borderRadius: "50%",
                    background: toneColor,
                  }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-admin-ink">
                      <span className="font-semibold">{ev.actor}</span>
                      <span className="text-admin-ink-muted"> · </span>
                      <span>{ev.body}</span>
                    </div>
                    <div style={{ fontSize: 10.5, marginTop: 1 }} className="text-admin-ink-dim">
                      {ev.ts}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {inquiry.timeline.length > 6 && (
            <div style={{ marginTop: 8, fontSize: 11, textAlign: "center", fontStyle: "italic" }} className="text-admin-ink-muted">
              + {inquiry.timeline.length - 6} earlier event{inquiry.timeline.length - 6 === 1 ? "" : "s"}
            </div>
          )}
        </div>
      )}

      {/* Internal notes — coordinator's private memory pad. Distinct from
          the client's "Your notes" because admin notes are workspace-
          internal: nobody outside the coord team sees them. */}
      <div data-booking-card style={cardStyle}>
        <div data-booking-section-title style={sectionTitle}>
          {/* Free-tier copy: "coordinator only" implies a team that
              doesn't exist on solo workspaces. Just "Notes" reads
              correctly when there's no team to scope-gate them from. */}
          {planTier === "free" ? "Notes" : "Internal notes (coordinator only)"}
        </div>
        <textarea
          key={inquiry.id}
          defaultValue={readConvNote(inquiry.id)}
          placeholder="Anything the rest of your coordinator team needs to know about this project…"
          onBlur={(e) => { writeConvNote(inquiry.id, e.currentTarget.value); toast("Note saved"); }}
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
    </div>
  );
}

// ── TalentLogisticsTab — talent-flavored view of the call sheet. The
// generic LogisticsTab below is admin/client editor-shaped. Talent
// don't edit the call sheet, they READ it and add personal notes
// (driver name, hotel reservation, things-to-bring). This tab pulls
// from conv.pinned (the per-talent slot) plus inquiry.schedule. ──
export function TalentLogisticsTab({ conv, inquiry }: { conv: Conversation; inquiry: InquiryRecord }) {
  const { toast } = useAdminShell();
  const pinned = conv.pinned ?? {};
  const days = countdownLabel(inquiry.schedule.start);
  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, fontFamily: FONTS.body }}>
      {/* Countdown — only when within 14 days, hides for distant or past
          shoots. Visual register matches the in-thread action pin. */}
      {days && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 12px",
          background: days.urgent ? `${COLORS.amber}14` : COLORS.successSoft,
          border: `1px solid ${days.urgent ? `${COLORS.amber}40` : `${COLORS.success}30`}`,
          borderRadius: 10,
        }}>
          <span aria-hidden className="text-base">{days.urgent ? "⏱" : "📅"}</span>
          <div className="flex-1">
            <div style={{ fontSize: 13, fontWeight: 700, color: days.urgent ? COLORS.amber : (COLORS.successDeep ?? COLORS.success) }}>{days.headline}</div>
            <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">{days.subhead}</div>
          </div>
        </div>
      )}

      {/* Schedule — call time + wrap time, the questions a working
          talent asks first. */}
      <DetailSection title="Schedule">
        <div className="text-admin-ink text-sm font-bold">
          {inquiry.schedule.start}
          {inquiry.schedule.end && ` → ${inquiry.schedule.end}`}
        </div>
        {pinned.schedule && (
          <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5, whiteSpace: "pre-line" }} className="text-admin-ink-muted">
            {pinned.schedule}
          </div>
        )}
        {!pinned.schedule && pinned.callTime && (
          <DetailField label="Call time" value={pinned.callTime} />
        )}
      </DetailSection>

      {/* Location — uses the same map tile as Details, redundancy is OK
          here since Logistics is a one-stop "everything I need today". */}
      {(inquiry.location.city || inquiry.location.venue || inquiry.location.address) && (
        <DetailSection title="Where">
          <LocationMapTile
            venue={inquiry.location.venue}
            address={inquiry.location.address}
            city={inquiry.location.city}
            onOpenMaps={() => toast("Open map")}
          />
        </DetailSection>
      )}

      {/* Transport — driver, pickup, parking. Pulled from the
          talent-specific pinned data (set by coordinator). */}
      <DetailSection title="Transport">
        {pinned.transport ? (
          <div style={{ fontSize: 12.5, lineHeight: 1.5 }} className="text-admin-ink">
            {pinned.transport}
          </div>
        ) : (
          <div style={{ fontSize: 12, lineHeight: 1.5 }} className="text-admin-ink-muted">
            Coordinator hasn&apos;t shared transport details yet.
          </div>
        )}
      </DetailSection>

      {/* Hotel/lodging — if mentioned in pinned data. */}
      {(pinned as { hotel?: string }).hotel && (
        <DetailSection title="Lodging">
          <div style={{ fontSize: 12.5, lineHeight: 1.5 }} className="text-admin-ink">
            {(pinned as { hotel?: string }).hotel}
          </div>
        </DetailSection>
      )}

      {/* My notes — personal scratchpad. Saves to local state in the
          prototype; production: per-talent-per-job notes. */}
      <DetailSection title="My notes">
        <textarea
          placeholder="Things to bring, contacts, reminders…"
          onBlur={() => toast("Note saved")}
          style={{
            width: "100%", minHeight: 70, resize: "vertical",
            padding: 10, borderRadius: 8,
            border: `1px solid ${COLORS.borderSoft}`,
            background: COLORS.surfaceAlt,
            fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink,
            outline: "none",
          }}
        />
      </DetailSection>
    </div>
  );
}

// Compute a short countdown label from a date string. Best-effort —
// returns null when we can't parse the date or it's >14 days out / past.
export function countdownLabel(start: string): { headline: string; subhead: string; urgent: boolean } | null {
  if (!start) return null;
  const parsed = Date.parse(`${start} ${new Date().getFullYear()}`);
  if (isNaN(parsed)) return null;
  const ms = parsed - Date.now();
  const days = Math.floor(ms / 86_400_000);
  if (days < 0 || days > 14) return null;
  if (days === 0) return { headline: "Today is set day", subhead: "Make sure you've reviewed the call sheet.", urgent: true };
  if (days === 1) return { headline: "On set tomorrow", subhead: "Final check on transport, wardrobe, and call time.", urgent: true };
  if (days <= 3) return { headline: `On set in ${days} days`, subhead: "Confirm any open items with the coordinator.", urgent: true };
  return { headline: `On set in ${days} days`, subhead: "All set — we'll send a final reminder closer to the day.", urgent: false };
}

// ── TalentPaymentTab — talent's own slice of the financial picture.
// Used to be locked behind "Workspace-only". Talent care: did the
// client pay, when do I get paid, what method. We DON'T show the full
// invoice / commercial offer here — just the talent's own line. ──
export function TalentPaymentTab({ conv, yourRate }: { conv: Conversation; yourRate: string }) {
  const { toast } = useAdminShell();
  const isPast = conv.stage === "past";
  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, fontFamily: FONTS.body }}>
      {/* Headline — your take-home and the status. */}
      <div style={{
        background: isPast ? COLORS.surfaceAlt : COLORS.successSoft,
        border: `1px solid ${isPast ? COLORS.borderSoft : `${COLORS.success}30`}`,
        borderRadius: 12, padding: 16,
      }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, color: isPast ? COLORS.inkMuted : (COLORS.successDeep ?? COLORS.success), textTransform: "uppercase" }}>
          {isPast ? "Paid" : "Your take-home"}
        </div>
        <div style={{ fontFamily: FONTS.display, fontSize: 26, fontWeight: 700, marginTop: 4, letterSpacing: -0.4 }} className="text-admin-ink">
          {yourRate}
        </div>
        <div style={{ fontSize: 11.5, marginTop: 4 }} className="text-admin-ink-muted">
          {isPast ? "Receipt available below." : "Released 14 days after wrap, once the client invoice clears."}
        </div>
      </div>

      {/* Status timeline — what's happened so far. */}
      <DetailSection title="Status">
        <PaymentStep done label="Booking confirmed" detail="Contract signed and locked." />
        <PaymentStep done={isPast} label="Wrap" detail={isPast ? "Shoot wrapped on time." : "Pending — set day."} />
        <PaymentStep done={isPast} label="Client invoice" detail={isPast ? "Paid in full." : "Issued · awaiting client (NET 30)."} />
        <PaymentStep done={isPast} label="Talent payout" detail={isPast ? "Transferred to your bank." : "Released 14 days after wrap."} />
      </DetailSection>

      {/* Payment method — talent picks how they get paid. */}
      <DetailSection title="Pay me to">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10 }}>
          <span aria-hidden style={{
            width: 32, height: 32, borderRadius: 8,
            background: COLORS.surfaceAlt, color: COLORS.inkMuted,
            display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="4" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M2 7h12" stroke="currentColor" strokeWidth="1.4"/>
            </svg>
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-admin-ink text-admin-12h font-semibold">Bank transfer · ES•••• 4421</div>
            <div style={{ fontSize: 11, marginTop: 2 }} className="text-admin-ink-muted">Default · added Mar 2024</div>
          </div>
          <button type="button" onClick={() => toast("Change payment method")} style={{
            padding: "5px 11px", borderRadius: 999, fontSize: 11, fontWeight: 600,
            border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.ink, cursor: "pointer",
          }}>Change</button>
        </div>
      </DetailSection>

      {isPast && (
        <DetailSection title="Receipt">
          {/* Phase A C1 — dead-chrome sweep: was disabled with no
              feedback. Now click → toast about when it lands. */}
          <button
            type="button"
            onClick={() => toast("Receipt download lands with the Money phase (Stripe-issued PDF). Coming soon.")}
            title="Coming soon"
            style={{
              padding: "8px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
              border: `1.5px dashed ${COLORS.border}`,
              background: "rgba(214,158,46,0.06)", color: "#7C5A14",
              cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v9m0 0L4 7m3 3l3-3M2 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Receipt download
            <span style={{ fontSize: 10.5, opacity: 0.7 }}>· soon</span>
          </button>
        </DetailSection>
      )}
    </div>
  );
}

export function PaymentStep({ done, label, detail }: { done?: boolean; label: string; detail: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 0" }}>
      <span aria-hidden style={{
        flexShrink: 0, marginTop: 3,
        width: 14, height: 14, borderRadius: "50%",
        background: done ? COLORS.success : "rgba(11,11,13,0.10)",
        color: "#fff",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>
        {done && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1.5 4.2l1.7 1.6L6.5 2.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </span>
      <div className="flex-1">
        <div style={{ fontSize: 12.5, fontWeight: 600, color: done ? COLORS.ink : COLORS.inkMuted }}>{label}</div>
        <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">{detail}</div>
      </div>
    </div>
  );
}
