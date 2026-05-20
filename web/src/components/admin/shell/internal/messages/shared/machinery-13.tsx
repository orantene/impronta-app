"use client";

import React, { type CSSProperties } from "react";
import { COLORS, FONTS } from "../../state";
import { Avatar } from "../../primitives";
import { UNIT_TYPE_LABEL, fmtMoney, rowSubtotal } from "./machinery-10";
import type { OfferPov } from "./machinery-10";
import { OfferTab } from "./machinery-12";
import { RateField, SubmitRateSheet } from "./machinery-14";
import type { LineupRow, Offer, TimelineEvent } from "./machinery-9";


// ── DealSummaryCard ──
// Single hero summary that replaces the prior 3-tile grid. Tells a
// coherent money-story per POV:
//
//   talent (non-coord): "Your take-home: €X" + tiny context strip
//   talent (coord):     "Total offer: €X · your slice €Y" + budget
//   client:             "Proposed total: €X" + cap context
//   admin:              "Total / Cost / Margin" all visible
//
// Layout: hero number (huge, color-themed) + status chip + 2-col
// "deal context" rows underneath. One card. One story. No ambiguity.
export function DealSummaryCard({
  offer, pov, totalCost, totalRevenue, totalMargin, currency, onEditBudget,
}: {
  offer: Offer;
  pov: OfferPov;
  totalCost: number;
  totalRevenue: number;
  totalMargin: number;
  currency: string;
  onEditBudget?: () => void;
}) {
  const isClient = pov.kind === "client";
  const isAdmin = pov.kind === "admin";
  const isTalent = pov.kind === "talent";
  const isOfferLive = offer.stage !== "no_offer" && offer.stage !== "client_budget";

  // Resolve hero data per POV. The "hero" is the single number this
  // viewer cares about most — splash it big and let everything else
  // be context underneath.
  const myRow = isTalent ? offer.rows.find(r => r.talentId === pov.talentId) : null;
  type HeroSpec = { label: string; value: string; unit: string; tone: "accent" | "success" | "ink"; subtitle?: string };
  const hero: HeroSpec = (() => {
    if (isTalent && myRow) {
      const myTotal = rowSubtotal(myRow, "cost");
      return {
        label: "Your take-home",
        value: myRow.costRate ? fmtMoney(myTotal, currency) : "Not set",
        unit: myRow.costRate ? `${myRow.units} × ${UNIT_TYPE_LABEL[myRow.unitType]}` : "Submit your rate to see this",
        tone: "accent",
        subtitle: myRow.costRate
          ? (offer.stage === "accepted" ? "Confirmed · paid 14d after wrap"
            : offer.stage === "sent" ? "Sent to client · awaiting decision"
            : offer.stage === "countered" ? "Client countered · review the offer"
            : offer.stage === "talent_submitted" ? "Submitted · coordinator finalizing"
            : "Awaiting send")
          : undefined,
      };
    }
    if (isClient) {
      return {
        label: "Proposed total",
        value: isOfferLive ? fmtMoney(totalRevenue, currency) : "—",
        unit: offer.clientBudget ? UNIT_TYPE_LABEL[offer.clientBudget.unitType] : "",
        tone: "accent",
        subtitle: !isOfferLive
          ? "Add a budget so the team can build your offer"
          : `${offer.rows.length} talent · ${offer.coordinators.length} coordinator${offer.coordinators.length === 1 ? "" : "s"}`,
      };
    }
    return {
      label: "Offer total",
      value: isOfferLive ? fmtMoney(totalRevenue, currency) : "—",
      unit: offer.clientBudget ? UNIT_TYPE_LABEL[offer.clientBudget.unitType] : "",
      tone: "accent",
      subtitle: isOfferLive ? `${offer.rows.length} talent on the lineup` : "Build the offer to send to client",
    };
  })();

  // Context rows — the "everything else" beneath the hero.
  type ContextRow = { label: string; value: string; tooltip?: string; emphasis?: boolean };
  const contextRows: ContextRow[] = (() => {
    const rows: ContextRow[] = [];
    if (offer.clientBudget) {
      rows.push({
        label: "Client budget",
        value: `${fmtMoney(offer.clientBudget.amount, offer.clientBudget.currency)} ${UNIT_TYPE_LABEL[offer.clientBudget.unitType]}`,
        tooltip: offer.clientBudget.note,
      });
    }
    if (isAdmin) {
      rows.push({
        label: "Talent cost",
        value: fmtMoney(totalCost, currency),
        tooltip: "What goes to talent · before agency fee",
      });
      rows.push({
        label: "Margin",
        value: fmtMoney(totalMargin, currency),
        emphasis: true,
        tooltip: `Agency fee + lineup margin · ${offer.coordinatorPct}% to coordinator`,
      });
    }
    // Coord-talent: also show the offer total as supporting context
    if (isTalent && pov.isCoordinator && isOfferLive) {
      rows.push({
        label: "Total offer",
        value: `${fmtMoney(totalRevenue, currency)}${offer.clientBudget ? " " + UNIT_TYPE_LABEL[offer.clientBudget.unitType] : ""}`,
      });
    }
    return rows;
  })();

  const heroColor = hero.tone === "accent" ? COLORS.accentDeep
    : hero.tone === "success" ? (COLORS.successDeep ?? COLORS.success)
    : COLORS.ink;

  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${COLORS.borderSoft}`,
      borderRadius: 14,
      padding: "16px 18px",
      boxShadow: "0 1px 0 rgba(11,11,13,0.02)",
      fontFamily: FONTS.body,
      maxWidth: "100%",
      boxSizing: "border-box",
      overflow: "hidden",
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }} className="text-admin-ink-muted">{hero.label}</div>
      <div style={{
        marginTop: 4,
        display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap",
      }}>
        <span style={{
          fontFamily: FONTS.display,
          fontSize: 32, fontWeight: 700, color: heroColor,
          letterSpacing: -0.6, lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}>
          {hero.value}
        </span>
        {hero.unit && (
          <span className="text-admin-ink-muted text-admin-12h font-medium">
            {hero.unit}
          </span>
        )}
      </div>
      {hero.subtitle && (
        <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.4 }} className="text-admin-ink-muted">
          {hero.subtitle}
        </div>
      )}

      {contextRows.length > 0 && (
        <>
          <div style={{
            height: 1, background: COLORS.borderSoft,
            margin: "14px 0 10px",
          }} />
          <div className="flex flex-col gap-1.5">
            {contextRows.map((row, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "baseline",
                justifyContent: "space-between", gap: 12,
                fontSize: 12.5,
              }}>
                <span style={{ fontWeight: 500, flexShrink: 0, }} title={row.tooltip}>
                  {row.label}
                </span>
                <span style={{
                  color: COLORS.ink, fontWeight: row.emphasis ? 700 : 600, fontVariantNumeric: "tabular-nums", textAlign: "right", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink-muted">
                  {row.value}
                </span>
              </div>
            ))}
            {isClient && offer.clientBudget && (offer.stage === "no_offer" || offer.stage === "client_budget") && (
              <button
                type="button"
                disabled={!onEditBudget}
                onClick={onEditBudget}
                title={onEditBudget ? undefined : "Budget editing needs a live client-brief workflow."}
                style={onEditBudget ? {
                  alignSelf: "flex-start",
                  marginTop: 4,
                  padding: 0, border: "none", background: "transparent",
                  color: COLORS.accent, cursor: "pointer",
                  fontSize: 11.5, fontWeight: 600, fontFamily: FONTS.body,
                } : {
                  alignSelf: "flex-start",
                  marginTop: 4,
                  padding: 0, border: "none", background: "transparent",
                  color: COLORS.inkMuted, cursor: "not-allowed", opacity: 0.45,
                  fontSize: 11.5, fontWeight: 600, fontFamily: FONTS.body,
                }}
              >
                Edit budget →
              </button>
            )}
            {offer.clientBudget?.note && (
              <div style={{ marginTop: 4, fontSize: 11, fontStyle: "italic", lineHeight: 1.4 }} className="text-admin-ink-dim">
                &ldquo;{offer.clientBudget.note}&rdquo;
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function SummaryTile({
  label, primary, secondary, note, editable, onEdit, tone,
}: {
  label: string; primary: string; secondary?: string; note?: string;
  editable?: boolean; onEdit?: () => void;
  tone?: "accent" | "success";
}) {
  const primaryColor = tone === "accent" ? COLORS.accent : tone === "success" ? COLORS.success : COLORS.ink;
  return (
    <div style={{
      padding: "12px 14px", borderRadius: 10,
      border: `1px solid ${COLORS.border}`, background: "#fff",
      position: "relative",
    }}>
      <div className="text-admin-ink-dim text-admin-10h font-semibold">
        {label}
      </div>
      <div style={{ marginTop: 4, fontSize: 17, fontWeight: 700, color: primaryColor, fontFamily: FONTS.display }}>
        {primary}
      </div>
      {secondary && (
        <div style={{ fontSize: 11, marginTop: 2 }} className="text-admin-ink-muted">{secondary}</div>
      )}
      {note && (
        <div style={{ fontSize: 11, marginTop: 6, fontStyle: "italic" }} className="text-admin-ink-dim">“{note}”</div>
      )}
      {editable && onEdit && (
        <button type="button" onClick={onEdit} aria-label="Edit"
          style={{
            position: "absolute", top: 8, right: 8,
            padding: 4, borderRadius: 6, border: "none", background: "transparent",
            color: COLORS.inkMuted, cursor: "pointer",
          }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M9.5 2.5l2 2L4 12H2v-2l7.5-7.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}

export function ParticipantRow({
  initials, name, role, tone, note,
}: { initials: string; name: string; role: string; tone: "royal" | "ink"; note?: string }) {
  const palette = tone === "royal"
    ? { bg: COLORS.royalSoft, fg: COLORS.royalDeep }
    : { bg: COLORS.accentSoft, fg: COLORS.accentDeep };
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 12px", borderRadius: 10,
      border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
    }}>
      <Avatar size={28} tone="auto" hashSeed={name} initials={initials} />
      <div className="flex-1 min-w-0">
        <div className="text-admin-ink text-admin-13 font-semibold">{name}</div>
        {note && <div className="text-admin-ink-muted text-admin-11">{note}</div>}
      </div>
      <span style={{
        fontSize: 9.5, fontWeight: 700,         padding: "2px 8px", borderRadius: 999, background: palette.bg, color: palette.fg,
      }}>{role}</span>
    </div>
  );
}

export function TimelineRow({ event, last }: { event: TimelineEvent; last: boolean }) {
  const dotColor =
      event.tone === "success" ? COLORS.success
    : event.tone === "warn"    ? COLORS.coral
    : event.tone === "info"    ? COLORS.indigo
    :                            COLORS.inkDim;
  return (
    <div style={{ display: "flex", gap: 10, padding: "6px 0" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 14 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, marginTop: 4 }} />
        {!last && <span style={{ flex: 1, width: 1, background: COLORS.borderSoft, marginTop: 2 }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: 6 }}>
        <div style={{ fontSize: 12.5, lineHeight: 1.4 }} className="text-admin-ink">{event.body}</div>
        <div style={{ fontSize: 10.5, marginTop: 1 }} className="text-admin-ink-muted">{event.actor} · {event.ts}</div>
      </div>
    </div>
  );
}

export function primaryBtn(bg: string): React.CSSProperties {
  return {
    padding: "7px 14px", borderRadius: 999, border: "none",
    background: bg, color: "#fff",
    fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0,
  };
}
export function ghostBtn(): React.CSSProperties {
  return {
    padding: "7px 14px", borderRadius: 999,
    background: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.ink,
    fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0,
  };
}
export function disabledBtn(base: React.CSSProperties): React.CSSProperties {
  return { ...base, opacity: 0.45, cursor: "not-allowed" };
}

/** C9 — small shimmer-rows placeholder used while panel data hydrates.
 *  Renders N stacked light-grey bars with a subtle shimmer animation so
 *  the panel doesn't flash blank → populated. */
export function PanelSkeleton({ lines = 3 }: { lines?: number }) {
  const rows = Array.from({ length: Math.max(1, Math.min(lines, 8)) });
  return (
    <div
      role="status"
      aria-label="Loading"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      {rows.map((_, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            display: "block",
            height: 14,
            width: i === 0 ? "60%" : i === rows.length - 1 ? "40%" : "85%",
            borderRadius: 6,
            background:
              "linear-gradient(90deg, rgba(11,11,13,0.06), rgba(11,11,13,0.10), rgba(11,11,13,0.06))",
            backgroundSize: "200% 100%",
            animation: "tulala-skel-shimmer 1.6s ease-in-out infinite",
          }}
        />
      ))}
      <style>{`
        @keyframes tulala-skel-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
export function dashedBtn(_label: string): React.CSSProperties {
  return {
    padding: "10px 14px", borderRadius: 10,
    border: `1.5px dashed ${COLORS.border}`, background: "transparent",
    color: COLORS.inkMuted, fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600,
    cursor: "pointer", textAlign: "left",
  } as React.CSSProperties;
}

export function TotalCell({ label, value, accent, tone }: { label: string; value: string; accent?: boolean; tone?: string }) {
  return (
    <div>
      <div className="text-admin-ink-dim text-admin-10h font-semibold">
        {label}
      </div>
      <div style={{
        fontSize: 18, fontWeight: 700, marginTop: 4,
        color: tone ?? (accent ? COLORS.accent : COLORS.ink),
        fontFamily: FONTS.display,
      }}>
        {value}
      </div>
    </div>
  );
}

export function LineupRowCard({
  row, offer, pov, showCost, showRevenue, showMargin, onOpenRateSheet, onCounterRate,
}: {
  row: LineupRow; offer: Offer; pov: OfferPov;
  showCost: boolean; showRevenue: boolean; showMargin: boolean;
  /** Called by the per-row Submit / Counter buttons to open the
   *  SubmitRateSheet at the OfferTab level. mode="submit" for first
   *  rate, "edit" for an already-submitted rate the talent wants to
   *  change before the offer reaches the client. */
  onOpenRateSheet?: (mode: "submit" | "edit") => void;
  /** B7 — when the offer has been SENT and the talent wants to counter
   *  their already-submitted rate (engine locks line-item edits at that
   *  point). Sends a `[Counter request]` tagged message into the talent
   *  group thread so the coordinator can re-draft. When undefined the
   *  Counter button hides. */
  onCounterRate?: () => void;
}) {
  const subCost = rowSubtotal(row, "cost");
  const subRevenue = rowSubtotal(row, "client");
  const subMargin = subRevenue - subCost;
  const editable =
    pov.kind === "admin"
    || (pov.kind === "talent" && pov.talentId === row.talentId)
    || (pov.kind === "talent" && pov.isCoordinator);
  const isMine = pov.kind === "talent" && pov.talentId === row.talentId;
  const rowStatusTone =
      row.status === "submitted" ? { bg: COLORS.successSoft, fg: COLORS.successDeep, label: "Submitted" }
    : row.status === "approved"  ? { bg: COLORS.accentSoft,  fg: COLORS.accentDeep,  label: "Approved" }
    : row.status === "countered" ? { bg: COLORS.amberSoft,   fg: COLORS.amberDeep,   label: "Countered" }
    : row.status === "declined"  ? { bg: COLORS.coralSoft,   fg: COLORS.coralDeep,   label: "Declined" }
                                 : { bg: "rgba(11,11,13,0.05)", fg: COLORS.inkMuted, label: "Pending rate" };

  return (
    <div style={{
      border: `1px solid ${COLORS.border}`, borderRadius: 10, background: "#fff",
      padding: "12px 14px",
    }}>
      <div className="flex items-center gap-2.5">
        <Avatar size={32} tone="auto" hashSeed={row.talentName} initials={row.initials} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-admin-ink text-admin-13h font-bold">
              {pov.kind === "talent" && !pov.isCoordinator && !isMine ? "Hidden talent" : row.talentName}
            </span>
            {offer.coordinators.some(c => c.alsoTalentId === row.talentId) && (
              <span aria-label="Coordinator" title="Coordinator" style={{
                fontSize: 9.5, fontWeight: 700,                 padding: "1px 6px", borderRadius: 4,
                background: COLORS.royalSoft, color: COLORS.royalDeep,
              }}>Coord</span>
            )}
            {isMine && (
              <span style={{ fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 4 }} className="bg-admin-accent-soft text-admin-accent-deep">You</span>
            )}
          </div>
          <div style={{ fontSize: 12, marginTop: 1 }} className="text-admin-ink-muted">{row.role}</div>
        </div>
        <span style={{
          fontSize: 10.5, fontWeight: 700,           padding: "2px 8px", borderRadius: 999,
          background: rowStatusTone.bg, color: rowStatusTone.fg,
        }}>{rowStatusTone.label}</span>
      </div>

      {/* Rate grid */}
      <div style={{
        marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${COLORS.borderSoft}`,
        display: "grid", gridTemplateColumns: "1fr 80px 1fr 1fr", gap: 10,
      }}>
        <RateField label="Unit" value={row.unitType} editable={editable && pov.kind === "admin"} />
        <RateField label="Units" value={String(row.units)} editable={editable} />
        {showCost  && <RateField label="Cost rate"   value={fmtMoney(row.costRate, (offer.clientBudget?.currency ?? "EUR"))}   editable={editable && (pov.kind === "admin" || isMine)} />}
        {showRevenue && <RateField label="Client rate" value={fmtMoney(row.clientRate, (offer.clientBudget?.currency ?? "EUR"))} editable={editable && (pov.kind === "admin" || (pov.kind === "talent" && pov.isCoordinator))} />}
      </div>

      {/* Subtotals */}
      <div style={{ marginTop: 8, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", fontSize: 11.5 }}>
        {showCost && (
          <span className="text-admin-ink-muted">
            Cost <strong style={{ marginLeft: 4 }} className="text-admin-ink">{fmtMoney(subCost, (offer.clientBudget?.currency ?? "EUR"))}</strong>
          </span>
        )}
        {showRevenue && (
          <span className="text-admin-ink-muted">
            {pov.kind === "client" ? "Subtotal" : "Revenue"} <strong style={{ marginLeft: 4 }} className="text-admin-ink">{fmtMoney(subRevenue, (offer.clientBudget?.currency ?? "EUR"))}</strong>
          </span>
        )}
        {showMargin && (
          <span className="text-admin-ink-muted">
            Margin <strong style={{ marginLeft: 4 }} className="text-admin-success">{fmtMoney(subMargin, (offer.clientBudget?.currency ?? "EUR"))}</strong>
          </span>
        )}
        {row.notes && (
          <span style={{ fontStyle: "italic", flex: "1 1 100%", marginTop: 4 }} className="text-admin-ink-dim">
            “{row.notes}”
          </span>
        )}
      </div>

      {/* Per-row actions for talent on their own row. Pending → opens
          submit-rate sheet (first time). Submitted → "Edit" reopens
          the same sheet pre-filled so the talent can adjust before the
          coord sends to client. Withdraw is visible but disabled until
          there is a persisted workflow that can notify the coordinator. */}
      {isMine && (
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {row.status === "pending" && (
            <button
              type="button"
              onClick={onOpenRateSheet ? () => onOpenRateSheet("submit") : undefined}
              disabled={!onOpenRateSheet}
              title={onOpenRateSheet ? undefined : "Rate submission needs a live offer workflow."}
              style={onOpenRateSheet
                ? tinyBtn(COLORS.accent, "#fff")
                : disabledBtn(tinyBtn(COLORS.accent, "#fff"))}
            >
              Submit my rate
            </button>
          )}
          {row.status === "submitted" && (
            <>
              <button
                type="button"
                onClick={onOpenRateSheet ? () => onOpenRateSheet("edit") : undefined}
                disabled={!onOpenRateSheet}
                title={onOpenRateSheet ? undefined : "Rate edits need a live offer workflow."}
                style={onOpenRateSheet
                  ? tinyBtn(COLORS.accentSoft, COLORS.accentDeep, `rgba(15,79,62,0.18)`)
                  : disabledBtn(tinyBtn(COLORS.accentSoft, COLORS.accentDeep, `rgba(15,79,62,0.18)`))}
              >
                Edit rate
              </button>
              {onCounterRate ? (
                <button
                  type="button"
                  onClick={onCounterRate}
                  title="Send a counter rate to the coordinator (used after the offer has been sent to the client)."
                  style={tinyBtn(COLORS.amberSoft, COLORS.amberDeep, `${COLORS.amber}40`)}
                >
                  Counter rate
                </button>
              ) : null}
            </>
          )}
          {row.status === "countered" && (
            <button
              type="button"
              onClick={onOpenRateSheet ? () => onOpenRateSheet("edit") : undefined}
              disabled={!onOpenRateSheet}
              title={onOpenRateSheet ? undefined : "Counter review needs a live offer workflow."}
              style={onOpenRateSheet
                ? tinyBtn(COLORS.amberSoft, COLORS.amberDeep, `${COLORS.amber}40`)
                : disabledBtn(tinyBtn(COLORS.amberSoft, COLORS.amberDeep, `${COLORS.amber}40`))}
            >
              Review counter
            </button>
          )}
          {row.status === "approved" && (
            <span className="text-admin-success-deep text-admin-11h">✓ You&apos;re booked at this rate.</span>
          )}
        </div>
      )}
    </div>
  );
}

export function tinyBtn(bg: string, color: string, border?: string): React.CSSProperties {
  return {
    padding: "6px 12px", borderRadius: 999,
    background: bg, color,
    border: border ? `1px solid ${border}` : "none",
    fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
  };
}
