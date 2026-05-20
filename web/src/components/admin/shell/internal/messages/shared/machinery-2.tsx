"use client";

import { type CSSProperties } from "react";
import { useAdminShell, COLORS, FONTS, MY_TALENT_PROFILE, type InquiryRecord } from "../../state";
import { Avatar } from "../../primitives";
import { type Conversation } from "../../talent";
import { readConvNote, writeConvNote } from "../conversation-stash";
import { currentTalentId } from "../messages-shared";
import { CoordRoleBadge, PresenceDot } from "./inbox-identity-1";
import { buildInquiryTabs } from "./machinery-1";
import { MOCK_OFFER_FOR_CONV, UNIT_TYPE_LABEL, fmtMoney } from "./machinery-10";
import { OfferTab } from "./machinery-12";
import { TeamStrip } from "./machinery-15";
import { countdownLabel } from "./machinery-5";
import { LogisticsTab, PaymentTab } from "./machinery-6";
import { LocationMapTile, RosterMemberRow } from "./machinery-7";
import { sourceChipMeta } from "../talent-1";
import { TalentJobDetail } from "../talent-2";


// ════════════════════════════════════════════════════════════════════
// LogisticsTab + PaymentTab — the booking-stage tabs that swap in once
// inquiry.status flips to "booked". Same shell, evolved tab config —
// the user's mental model ("this is my Mango project") never breaks.
// ════════════════════════════════════════════════════════════════════

// ── TalentBookingTab — merged Logistics + Details for booked talent.
// Single comprehensive screen that replaces tab-hopping between two
// near-duplicate views. 2026 layout: 2-column grids on desktop where it
// makes sense (Schedule | Location, Transport | Lodging, Lineup |
// Coordinator), tighter card spacing, soft shadows, gradient countdown.
// On mobile the grids collapse to a single column, the gap shrinks,
// and the countdown banner stays full-width. ──
export function TalentBookingTab({
  conv, inquiry, isCoordinator, onOpenLineup,
}: {
  conv: Conversation;
  inquiry: InquiryRecord;
  isCoordinator: boolean;
  /** Opens the lineup drawer (managed by TalentJobDetail). When
   *  provided, the "Who's on this job" card renders an edit/view
   *  affordance. Coords see "Edit lineup" (add + remove); non-coord
   *  talent see "View lineup" (read-only). */
  onOpenLineup?: () => void;
}) {
  const { toast } = useAdminShell();
  const pinned = conv.pinned ?? {};
  const days = countdownLabel(inquiry.schedule.start);
  const coord = inquiry.coordinators[0];
  const teammates = inquiry.talent.length > 1;
  // Solo-coord case: when isCoordinator AND there's only 1 talent (the
  // coord themselves), we still render the lineup card so the coord has
  // an obvious surface to invite a teammate from. Without this they'd
  // get no affordance at all.
  const soloCoord = isCoordinator && inquiry.talent.length <= 1;
  const showLineupCard = teammates || soloCoord;
  const showCoord = !!coord;
  const hotel = (pinned as { hotel?: string }).hotel;
  // Historical offer reference — only at booked / past stages, when
  // the OfferTab is hidden by buildInquiryTabs. Pulls the talent's
  // accepted row + currency so the booking tab can surface the agreed
  // terms inline. Talent shouldn't have to dig into a hidden tab to
  // re-read what they agreed to.
  const histOffer = (conv.stage === "booked" || conv.stage === "past")
    ? MOCK_OFFER_FOR_CONV[conv.id]
    : undefined;
  const histRow = histOffer?.rows.find(r => r.talentId === currentTalentId());
  const histCurrency = histOffer?.clientBudget?.currency ?? "EUR";

  // Card style — compact 2026 surface. Soft hairline border, very
  // subtle shadow on desktop only (mobile keeps it flat to read more
  // like the iOS "list inset" pattern). 12px corners, 12-14px inner
  // padding to balance density against the new 8px gap between cards.
  const cardStyle: CSSProperties = {
    background: "#fff",
    border: `1px solid ${COLORS.borderSoft}`,
    borderRadius: 12,
    padding: "12px 14px",
    boxShadow: "0 1px 0 rgba(11,11,13,0.02)",
    // Cards must be able to shrink to fit their grid track without
    // letting their content (avatars + buttons + text) push the
    // border outline beyond the viewport. min-width:0 lets the flex/
    // grid track shrink; overflow:hidden + max-width:100% stop any
    // surviving content overflow from leaking past the card frame.
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
      {/* Mobile: KEEP the 2-column grids (per user request — denser
          info-card layout that mirrors desktop). The page-wide mobile
          CSS in page.tsx has a generic [style*="grid-template-columns:
          1fr 1fr"] rule that collapses every two-up grid to single
          column at ≤720px — we override it here with higher specificity
          so the booking-tab grids stay 2-up. Paddings + gaps tighten so
          cards still breathe at 360px. */}
      <style dangerouslySetInnerHTML={{ __html:
        "@media (max-width: 720px){"
        + "[data-tulala-booking-tab]{padding:10px!important;gap:7px!important}"
        + "[data-tulala-booking-tab] [data-booking-grid]{gap:7px!important}"
        + "[data-tulala-booking-tab] [data-booking-card]{padding:9px 10px!important}"
        + "[data-tulala-booking-tab] [data-booking-section-title]{font-size:9.5px!important;margin-bottom:5px!important}"
        + "[data-tulala-booking-tab] [data-booking-card] h1,"
        + "[data-tulala-booking-tab] [data-booking-card] [data-booking-headline]{font-size:13px!important}"
        + "}"
        // Below 480px every booking-grid row collapses to one column —
        // when the column track drops under ~160px the LocationMapTile
        // and the lineup card both truncate badly.
        + "@media (max-width: 480px){"
        + "[data-tulala-booking-tab] [data-booking-grid]{grid-template-columns:1fr!important}"
        + "}"
      }} />

      {/* Countdown — gradient banner that doubles as the visual anchor
          of the tab. Hidden when the shoot is more than 14 days out
          (countdownLabel returns null) so the banner stays meaningful. */}
      {days && (
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
            <div style={{
              fontSize: 13, fontWeight: 700,
              color: days.urgent ? COLORS.amber : (COLORS.successDeep ?? COLORS.success),
            }}>{days.headline}</div>
            <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
              {days.subhead}
            </div>
          </div>
        </div>
      )}

      {/* The job — title + brief + source. One row, no over-styled chrome.
          Source chip surfaces where the inquiry came from (Tulala Hub /
          Direct / Referral / IG DM / etc.) so the talent reads the
          relationship context next to the job they're looking at. */}
      <div data-booking-card style={cardStyle}>
        <div data-booking-section-title style={sectionTitle}>The job</div>
        <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }} className="text-admin-ink">
          {inquiry.title}
        </div>
        {inquiry.client.name && (
          <div style={{ fontSize: 12, marginTop: 3 }} className="text-admin-ink-muted">
            For {inquiry.client.name}
          </div>
        )}
        {/* Source chip — small inline pill that names the inbound
            channel (and the specific origin via tooltip). Falls back to
            no chip when the conversation has no source set. */}
        {(() => {
          const sourceMeta = conv.source ? sourceChipMeta(conv.source) : null;
          if (!sourceMeta) return null;
          return (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }} className="text-admin-ink-dim">Came in via</span>
              <span
                aria-label={`Source: ${sourceMeta.label}`}
                title={sourceMeta.tooltip}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "3px 9px", borderRadius: 999,
                  background: sourceMeta.bg, color: sourceMeta.fg,
                  fontSize: 11, fontWeight: 700,
                  letterSpacing: 0.2,
                }}
              >
                <span aria-hidden style={{ display: "inline-flex" }}>{sourceMeta.icon}</span>
                {sourceMeta.label}
              </span>
              {/* Origin label — additional human-readable detail
                  (e.g. "Tulala Hub · Hospitality vertical"). Hidden
                  when redundant with the chip label itself. The
                  property name varies per source kind, so we resolve
                  it via a small per-kind getter. */}
              {(() => {
                const src = conv.source;
                if (!src) return null;
                const detail =
                  (src.kind === "tulala-hub" || src.kind === "direct") ? src.label
                  : src.kind === "agency-referral" ? (src.via ? `via ${src.via}` : null)
                  : src.kind === "email" ? (src.from ? `from ${src.from}` : null)
                  : null;
                if (!detail || detail.toLowerCase() === sourceMeta.label.toLowerCase()) return null;
                return (
                  <span style={{ fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }} className="text-admin-ink-muted">{detail}</span>
                );
              })()}
            </div>
          );
        })()}
        {inquiry.brief.summary && inquiry.brief.summary !== inquiry.title && (
          <div style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.55 }} className="text-admin-ink">
            {inquiry.brief.summary}
          </div>
        )}
        {inquiry.brief.notes && (
          <div style={{ fontSize: 12, lineHeight: 1.55, marginTop: 8, padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.borderSoft}` }} className="text-admin-ink-muted bg-admin-surface-alt">
            {inquiry.brief.notes}
          </div>
        )}
        {/* Coordinator's framing — every conversation seeded a
            pinned.coordinatorNote with the agent's read of the deal
            ("Mango is keen", "Returning client", "Brand-new client").
            Surfaces here as a quoted strip so the talent reads the
            agency's perspective right next to the job context. */}
        {pinned.coordinatorNote && (
          <div style={{ marginTop: 10, display: "flex", gap: 9, padding: "10px 12px", border: `1px solid rgba(91,107,160,0.18)`, borderRadius: 10 }} className="bg-admin-indigo-soft">
            <span aria-hidden style={{ flexShrink: 0, marginTop: 1, color: COLORS.indigoDeep }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M3 3h3v3H4l-1 2v-2H3V3zm5 0h3v3H9l-1 2v-2H8V3z" fill="currentColor"/>
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 2 }} className="text-admin-indigo-deep">
                {coord ? `${coord.name.split(" ")[0]}'s read` : "Coordinator's read"}
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, fontStyle: "italic" }} className="text-admin-ink">
                &quot;{pinned.coordinatorNote}&quot;
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Booked-stage historical offer reference. Only renders when
          the offer tab is hidden (booked/past stages) and there's an
          accepted row for the talent. Surfaces the agreed rate +
          take-home so the talent can re-read the terms inline. */}
      {histOffer && histRow && histRow.costRate > 0 && (
        <div data-booking-card style={{
          ...cardStyle,
          // Soft success tint to mark this as "locked-in commercials"
          // (different visual register from the active info cards).
          background: `linear-gradient(180deg, ${COLORS.successSoft} 0%, #fff 60%)`,
          borderColor: `rgba(46,125,91,0.18)`,
        }}>
          <div data-booking-section-title style={{
            ...sectionTitle,
            color: COLORS.successDeep ?? COLORS.success,
          }}>
            {conv.stage === "past" ? "What you were paid" : "Your booking terms"}
          </div>
          <div style={{
            display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap",
          }}>
            <span style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: -0.4, lineHeight: 1 }} className="text-admin-ink">
              {fmtMoney(histRow.costRate * histRow.units, histCurrency)}
            </span>
            <span className="text-admin-ink-muted text-xs font-medium">
              {histRow.units} × {UNIT_TYPE_LABEL[histRow.unitType]}
            </span>
          </div>
          {histRow.notes && (
            <div style={{ fontSize: 11.5, marginTop: 6, fontStyle: "italic", lineHeight: 1.4 }} className="text-admin-ink-muted">
              &quot;{histRow.notes}&quot;
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 11 }} className="text-admin-ink-muted">
            <span aria-hidden style={{ color: COLORS.success }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="5" fill="currentColor" opacity="0.18"/>
                <path d="M3.5 6l1.7 1.7L8.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            {conv.stage === "past"
              ? "Receipt + invoice in Files."
              : "Locked. Contract signed."}
          </div>
        </div>
      )}

      {/* Schedule + Location — 2-up. Schedule is the most-asked
          question, Location the second. Side-by-side at desktop,
          stacked at mobile via the data-booking-grid media rule. */}
      <div data-booking-grid style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
      }}>
        <div data-booking-card style={cardStyle}>
          <div data-booking-section-title style={sectionTitle}>When</div>
          <div className="text-admin-ink text-sm font-bold">
            {inquiry.schedule.start}
            {inquiry.schedule.end && ` → ${inquiry.schedule.end}`}
          </div>
          {pinned.callTime && (
            <div style={{ fontSize: 12, marginTop: 4 }} className="text-admin-ink-muted">
              Call time · <span style={{ fontWeight: 600 }} className="text-admin-ink">{pinned.callTime}</span>
            </div>
          )}
          {pinned.schedule && (
            <div style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.5, whiteSpace: "pre-line" }} className="text-admin-ink-muted">
              {pinned.schedule}
            </div>
          )}
        </div>
        <div data-booking-card style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
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

      {/* Transport + Lodging — 2-up. Both pulled from pinned data set
          by the coordinator; falls back to "not shared yet" copy when
          missing so the slot doesn't read as broken. */}
      <div data-booking-grid style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
      }}>
        <div data-booking-card style={cardStyle}>
          <div data-booking-section-title style={sectionTitle}>Transport</div>
          {pinned.transport ? (
            <div style={{ fontSize: 12.5, lineHeight: 1.5 }} className="text-admin-ink">
              {pinned.transport}
            </div>
          ) : (
            <div style={{ fontSize: 12, lineHeight: 1.5 }} className="text-admin-ink-muted">
              Coordinator hasn&apos;t shared transport yet.
            </div>
          )}
        </div>
        <div data-booking-card style={cardStyle}>
          <div data-booking-section-title style={sectionTitle}>Lodging</div>
          {hotel ? (
            <div style={{ fontSize: 12.5, lineHeight: 1.5 }} className="text-admin-ink">
              {hotel}
            </div>
          ) : (
            <div style={{ fontSize: 12, lineHeight: 1.5 }} className="text-admin-ink-muted">
              No hotel needed for this job.
            </div>
          )}
        </div>
      </div>

      {/* Who's on this job + Coordinator — 2-up when both present.
          Lineup shows ALL teammates (not just self) with state pills so
          the talent reads the team's health at a glance. */}
      {(showLineupCard || showCoord) && (
        <div data-booking-grid style={{
          display: "grid",
          gridTemplateColumns: showLineupCard && showCoord ? "1.4fr 1fr" : "1fr",
          gap: 10,
        }}>
          {showLineupCard && (
            <div data-booking-card style={cardStyle}>
              <div data-booking-section-title style={sectionTitle}>
                {soloCoord && !teammates ? "On this job" : "Who's on this job"}
              </div>
              {inquiry.talent.map(t => (
                <RosterMemberRow
                  key={t.talentId}
                  talent={t}
                  isMe={t.talentId === currentTalentId() || t.name === MY_TALENT_PROFILE.name}
                  stagePast={inquiry.status === "wrapped" || inquiry.status === "cancelled"}
                />
              ))}
              {soloCoord && inquiry.talent.length === 0 && (
                <div style={{ fontSize: 12, padding: "8px 0" }} className="text-admin-ink-muted">
                  No talent on this job yet.
                </div>
              )}
              {/* Edit / view lineup affordance — opens the same lineup
                  drawer the conversation tab's TeamStrip uses, so the
                  user gets one canonical surface for adding/removing
                  talent. Coords get the full add/remove flow; non-coord
                  talent get a read-only view-all-members drawer. */}
              {onOpenLineup && (
                <button
                  type="button"
                  onClick={onOpenLineup}
                  style={{
                    marginTop: 10, width: "100%",
                    padding: "8px 10px", borderRadius: 8,
                    border: `1px ${isCoordinator ? "dashed" : "solid"} ${COLORS.border}`,
                    background: isCoordinator ? COLORS.accentSoft : "transparent",
                    color: isCoordinator ? COLORS.accentDeep : COLORS.ink,
                    cursor: "pointer",
                    fontSize: 11.5, fontWeight: 600, fontFamily: FONTS.body,
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                >
                  {isCoordinator ? (
                    <>
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                      </svg>
                      {soloCoord && !teammates ? "Invite a teammate" : "Edit lineup · add or remove talent"}
                    </>
                  ) : (
                    <>
                      View full lineup
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path d="M3.5 2L7.5 6L3.5 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </>
                  )}
                </button>
              )}
            </div>
          )}
          {showCoord && (
            <div data-booking-card data-booking-coord style={cardStyle}>
              <div data-booking-section-title style={sectionTitle}>Your coordinator</div>
              {/* Identity row — avatar + name. Stacks above the action
                  button so the card never has to fit avatar + name +
                  button on a single 42%-of-viewport horizontal track. */}
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
                    <CoordRoleBadge role={coord.role} />
                  </div>
                  <div style={{ fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink-muted">
                    {coord.role === "owner" ? "Workspace owner" : "Your coordinator"}
                  </div>
                </div>
              </div>
              {/* Action row — full-width Message button. Sits below the
                  identity row so it never competes with name truncation
                  for horizontal space. Same look as before, just wraps
                  underneath when the card is narrow. */}
              <button type="button" onClick={() => toast(`Messaging ${coord.name}…`)} style={{
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

      {/* My notes — personal scratchpad. Keyed by conv.id so each job
          has its own draft (no more shared note bleeding across all
          conversations). Saves on blur into the module-level notes
          stash; survives tab + conv switches within the session. */}
      <div data-booking-card style={cardStyle}>
        <div data-booking-section-title style={sectionTitle}>My notes</div>
        <textarea
          key={conv.id}
          defaultValue={readConvNote(conv.id)}
          placeholder="Things to bring, contacts, reminders…"
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
      {/* Suppress the unused-isCoordinator lint warning — kept in the
          prop list so future tweaks (e.g. coord-only billing summary)
          have it without re-threading from the parent. */}
      {void isCoordinator}
    </div>
  );
}
