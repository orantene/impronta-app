"use client";

/**
 * DetailsTab — canonical 9-section Details tab component.
 *
 * Details Tab Redesign Plan v3 §3 (9 sections) + §4 (role visibility) + §8 (layout).
 *
 * Role-visibility gating is caller-driven: the caller passes only the
 * fields appropriate for the pov (e.g. missingItems/atRiskFlags = []
 * for client + talent; offerLabel/paymentLabel shaped per role).
 *
 * No internal technical terms are ever rendered to the user.
 * Used by admin / coord / talent / talent_coord / client surfaces.
 * Wired into specific shells in a later session.
 */

import { useState } from "react";

/* ─── Types ─────────────────────────────────────────────────────────── */

export type DetailsTabPov =
  | "admin"
  | "coord"
  | "talent"
  | "talent_coord"
  | "client";

export type DetailsTabData = {
  // Section 1: Status Summary
  stage: string; // "Inquiry" | "Offer sent" | "Booked" | "Today" | "Wrapped"
  nextAction?: string;
  // Section 2: Job Brief
  title: string;
  brief?: string;
  category?: string;
  talentCount?: number;
  notes?: string;
  // Section 3: Schedule
  date?: string;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  deadline?: string;
  // Section 4: Location
  venue?: string;
  address?: string;
  city?: string;
  mapUrl?: string;
  meetingPoint?: string;
  accessNotes?: string;
  isRemote?: boolean;
  // Section 5: People
  clientName?: string;
  coordinators?: Array<{ name: string; role?: string }>;
  lineup?: {
    invited: number;
    accepted: number;
    hold: number;
    declined: number;
    total: number;
  };
  onSiteContact?: string;
  // Section 6: Offer & Payment (role-shaped — caller passes only what's appropriate)
  offerLabel?: string;
  offerStatus?: string;
  paymentLabel?: string;
  paymentStatus?: string;
  // Section 7: Operational Requirements (logistics)
  wardrobe?: string;
  equipment?: string;
  transport?: string;
  lodging?: string;
  meals?: string;
  callTime?: string;
  specialInstructions?: string;
  // Section 8: Risk & Missing Info (admin/coord only — caller passes [] for other roles)
  missingItems?: string[];
  atRiskFlags?: string[];
  // Section 9: Activity Log
  activity?: Array<{
    id: string;
    actor: string;
    summary: string;
    ts: string;
    tone?: "info" | "warn" | "success";
  }>;
};

/* ─── Palette (mirrors ChatCard.tsx) ────────────────────────────────── */

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.08)",
  surface:    "#ffffff",
  surfaceAlt: "rgba(11,11,13,0.025)",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  green:      "#1A7348",
  greenSoft:  "rgba(26,115,72,0.10)",
  amber:      "#8A6F1A",
  amberSoft:  "rgba(138,111,26,0.10)",
  indigo:     "#2B3FA3",
  indigoSoft: "rgba(43,63,163,0.07)",
  coral:      "#A33A3A",
  coralSoft:  "rgba(214,89,89,0.10)",
  bg:         "#F7F8F8",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

const CARD_STYLE: React.CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.borderSoft}`,
  borderRadius: 12,
  padding: "16px 18px",
  fontFamily: FONT,
  boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

/* ─── Small primitives ──────────────────────────────────────────────── */

function CardHeading({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: C.accent,
      marginBottom: 2,
    }}>
      {label}
    </div>
  );
}

function Field({
  label,
  value,
  href,
}: {
  label: string;
  value?: string | null;
  href?: string;
}) {
  const empty = !value;
  return (
    <div>
      <div style={{
        fontSize: 10.5,
        fontWeight: 600,
        color: C.inkMuted,
        marginBottom: 2,
        letterSpacing: 0.2,
      }}>
        {label}
      </div>
      {empty ? (
        <div style={{ fontSize: 13, color: C.inkDim, fontStyle: "italic" }}>
          Not set yet
        </div>
      ) : href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 13,
            color: C.accent,
            fontWeight: 500,
            textDecoration: "underline",
            wordBreak: "break-word",
          }}
        >
          {value}
        </a>
      ) : (
        <div style={{
          fontSize: 13,
          color: C.ink,
          lineHeight: 1.5,
          wordBreak: "break-word",
        }}>
          {value}
        </div>
      )}
    </div>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "10px 16px",
    }}>
      {children}
    </div>
  );
}

function StageChip({ stage }: { stage: string }) {
  const stageColors: Record<string, { bg: string; fg: string }> = {
    Inquiry:    { bg: C.indigoSoft, fg: C.indigo },
    "Offer sent": { bg: C.amberSoft, fg: C.amber },
    Booked:     { bg: C.greenSoft,  fg: C.green },
    Today:      { bg: C.accentSoft, fg: C.accent },
    Wrapped:    { bg: C.surfaceAlt, fg: C.inkMuted },
  };
  const colors = stageColors[stage] ?? { bg: C.surfaceAlt, fg: C.inkMuted };
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 10px",
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 700,
      background: colors.bg,
      color: colors.fg,
      letterSpacing: 0.2,
    }}>
      {stage}
    </span>
  );
}

function WarningChip({ label }: { label: string }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "3px 9px",
      borderRadius: 6,
      fontSize: 11.5,
      fontWeight: 600,
      background: C.coralSoft,
      color: C.coral,
      border: `1px solid rgba(163,58,58,0.15)`,
    }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
        <path d="M5 1L9 9H1L5 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
        <path d="M5 5V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        <circle cx="5" cy="8" r="0.5" fill="currentColor"/>
      </svg>
      {label}
    </span>
  );
}

function AmberChip({ label }: { label: string }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "3px 9px",
      borderRadius: 6,
      fontSize: 11.5,
      fontWeight: 600,
      background: C.amberSoft,
      color: C.amber,
      border: `1px solid rgba(138,111,26,0.15)`,
    }}>
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
        <circle cx="4.5" cy="4.5" r="3.5" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M4.5 3v2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        <circle cx="4.5" cy="6.5" r="0.4" fill="currentColor"/>
      </svg>
      {label}
    </span>
  );
}

function Divider() {
  return (
    <div style={{
      height: 1,
      background: C.borderSoft,
      marginTop: 2,
      marginBottom: 2,
    }} />
  );
}

/* ─── Section 1: Status Summary ─────────────────────────────────────── */

function StatusSummaryCard({ stage, nextAction }: Pick<DetailsTabData, "stage" | "nextAction">) {
  return (
    <div style={CARD_STYLE}>
      <CardHeading label="Status" />
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <StageChip stage={stage} />
      </div>
      {nextAction && (
        <div style={{
          fontSize: 13,
          color: C.accent,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {nextAction}
        </div>
      )}
    </div>
  );
}

/* ─── Section 2: Job Brief ──────────────────────────────────────────── */

function JobBriefCard({
  title, brief, category, talentCount, notes,
}: Pick<DetailsTabData, "title" | "brief" | "category" | "talentCount" | "notes">) {
  return (
    <div style={CARD_STYLE}>
      <CardHeading label="Job Brief" />
      <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, lineHeight: 1.35 }}>
        {title}
      </div>
      {brief && (
        <div style={{ fontSize: 13, color: C.inkMuted, lineHeight: 1.6 }}>
          {brief}
        </div>
      )}
      <Divider />
      <FieldRow>
        <Field label="Category" value={category} />
        <Field
          label="Talent needed"
          value={talentCount != null ? String(talentCount) : undefined}
        />
      </FieldRow>
      {notes && (
        <Field label="Notes" value={notes} />
      )}
    </div>
  );
}

/* ─── Section 3: Schedule ───────────────────────────────────────────── */

function ScheduleCard({
  date, startTime, endTime, timezone, deadline,
}: Pick<DetailsTabData, "date" | "startTime" | "endTime" | "timezone" | "deadline">) {
  const timeRange =
    startTime && endTime
      ? `${startTime} – ${endTime}${timezone ? ` (${timezone})` : ""}`
      : startTime
      ? `From ${startTime}${timezone ? ` (${timezone})` : ""}`
      : undefined;

  return (
    <div style={CARD_STYLE}>
      <CardHeading label="Schedule" />
      <FieldRow>
        <Field label="Date" value={date} />
        <Field label="Time" value={timeRange} />
      </FieldRow>
      <Field label="Confirmation deadline" value={deadline} />
    </div>
  );
}

/* ─── Section 4: Location ───────────────────────────────────────────── */

function LocationCard({
  venue, address, city, mapUrl, meetingPoint, accessNotes, isRemote,
}: Pick<DetailsTabData, "venue" | "address" | "city" | "mapUrl" | "meetingPoint" | "accessNotes" | "isRemote">) {
  if (isRemote) {
    return (
      <div style={CARD_STYLE}>
        <CardHeading label="Location" />
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 13, fontWeight: 600, color: C.accent,
        }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
            <rect x="1.5" y="3" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M4.5 3V2a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v1" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M1.5 7.5h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          Remote / Online
        </div>
      </div>
    );
  }

  const fullAddress = [address, city].filter(Boolean).join(", ") || undefined;

  return (
    <div style={CARD_STYLE}>
      <CardHeading label="Location" />
      <Field label="Venue" value={venue} />
      <Field
        label="Address"
        value={fullAddress}
        href={mapUrl || (fullAddress ? `https://maps.google.com/?q=${encodeURIComponent(fullAddress)}` : undefined)}
      />
      <FieldRow>
        <Field label="Meeting point" value={meetingPoint} />
        <Field label="Access / parking" value={accessNotes} />
      </FieldRow>
    </div>
  );
}

/* ─── Section 5: People ─────────────────────────────────────────────── */

function PeopleCard({
  pov, clientName, coordinators, lineup, onSiteContact,
}: Pick<DetailsTabData, "clientName" | "coordinators" | "lineup" | "onSiteContact"> & { pov: DetailsTabPov }) {
  const showClient = pov !== "client";
  const showLineupDetail = pov === "admin" || pov === "coord" || pov === "talent_coord";

  return (
    <div style={CARD_STYLE}>
      <CardHeading label="People" />
      {showClient && (
        <Field label="Client" value={clientName} />
      )}
      {coordinators && coordinators.length > 0 ? (
        <div>
          <div style={{
            fontSize: 10.5, fontWeight: 600, color: C.inkMuted, marginBottom: 6, letterSpacing: 0.2,
          }}>
            {coordinators.length === 1 ? "Coordinator" : "Coordinators"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {coordinators.map((c, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 8,
                fontSize: 13, color: C.ink,
              }}>
                <span style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: C.accentSoft,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, color: C.accent, flexShrink: 0,
                }}>
                  {c.name.charAt(0).toUpperCase()}
                </span>
                <span style={{ fontWeight: 500 }}>{c.name}</span>
                {c.role && (
                  <span style={{ fontSize: 11, color: C.inkDim }}>· {c.role}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Field label="Coordinator" value={undefined} />
      )}
      {lineup && (
        <>
          <Divider />
          <div>
            <div style={{
              fontSize: 10.5, fontWeight: 600, color: C.inkMuted, marginBottom: 8, letterSpacing: 0.2,
            }}>
              Talent lineup
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: showLineupDetail ? "1fr 1fr 1fr 1fr" : "1fr 1fr",
              gap: "6px 12px",
            }}>
              <LineupStat label="Accepted" value={lineup.accepted} color={C.green} />
              {showLineupDetail && (
                <LineupStat label="On hold" value={lineup.hold} color={C.amber} />
              )}
              {showLineupDetail && (
                <LineupStat label="Declined" value={lineup.declined} color={C.coral} />
              )}
              <LineupStat label="Invited" value={lineup.invited} color={C.indigo} />
            </div>
            {lineup.accepted < lineup.total && (
              <div style={{ marginTop: 8 }}>
                <AmberChip label={`${lineup.total - lineup.accepted} spot${lineup.total - lineup.accepted !== 1 ? "s" : ""} still open`} />
              </div>
            )}
          </div>
        </>
      )}
      <Field label="On-site contact" value={onSiteContact} />
    </div>
  );
}

function LineupStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: C.inkMuted, marginTop: 2 }}>{label}</div>
    </div>
  );
}

/* ─── Section 6: Offer & Payment ────────────────────────────────────── */

function OfferPaymentCard({
  pov, offerLabel, offerStatus, paymentLabel, paymentStatus,
}: Pick<DetailsTabData, "offerLabel" | "offerStatus" | "paymentLabel" | "paymentStatus"> & { pov: DetailsTabPov }) {
  // Role-shaped copy per spec §3 §6
  let offerLine: string | undefined;
  let paymentLine: string | undefined;

  if (pov === "client") {
    if (paymentLabel) offerLine = `You pay ${paymentLabel}`;
    if (paymentStatus) paymentLine = paymentStatus;
  } else if (pov === "talent") {
    if (offerLabel) offerLine = `Your rate: ${offerLabel}`;
  } else if (pov === "talent_coord") {
    if (offerLabel) offerLine = `Your rate: ${offerLabel}`;
    if (paymentLabel) paymentLine = `Commission: ${paymentLabel}`;
  } else {
    // admin | coord
    if (offerLabel) offerLine = `Offer: ${offerLabel}`;
    if (offerStatus) paymentLine = `Status: ${offerStatus}`;
  }

  const statusColor = (s?: string): string => {
    if (!s) return C.inkMuted;
    const l = s.toLowerCase();
    if (l.includes("paid") || l.includes("accepted") || l.includes("confirmed")) return C.green;
    if (l.includes("pending") || l.includes("sent") || l.includes("requested")) return C.amber;
    if (l.includes("declined") || l.includes("failed")) return C.coral;
    return C.inkMuted;
  };

  return (
    <div style={CARD_STYLE}>
      <CardHeading label={pov === "client" ? "Payment" : pov === "talent" || pov === "talent_coord" ? "Your Rate" : "Offer & Payment"} />
      {offerLine ? (
        <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>
          {offerLine}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: C.inkDim, fontStyle: "italic" }}>
          Not set yet
        </div>
      )}
      {paymentLine && (
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: statusColor(paymentLine),
          display: "flex", alignItems: "center", gap: 5,
        }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M3.5 5l1 1 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {paymentLine}
        </div>
      )}
    </div>
  );
}

/* ─── Section 7: Logistics ──────────────────────────────────────────── */

function LogisticsCard({
  wardrobe, equipment, transport, lodging, meals, callTime, specialInstructions,
}: Pick<DetailsTabData,
  "wardrobe" | "equipment" | "transport" | "lodging" | "meals" | "callTime" | "specialInstructions"
>) {
  const hasAny = !!(wardrobe || equipment || transport || lodging || meals || callTime || specialInstructions);
  return (
    <div style={CARD_STYLE}>
      <CardHeading label="Operational Requirements" />
      {!hasAny ? (
        <div style={{ fontSize: 13, color: C.inkDim, fontStyle: "italic" }}>
          No requirements specified yet
        </div>
      ) : (
        <>
          <FieldRow>
            <Field label="Call time" value={callTime} />
            <Field label="Wardrobe" value={wardrobe} />
          </FieldRow>
          <FieldRow>
            <Field label="Equipment" value={equipment} />
            <Field label="Transport" value={transport} />
          </FieldRow>
          <FieldRow>
            <Field label="Lodging" value={lodging} />
            <Field label="Meals" value={meals} />
          </FieldRow>
          {specialInstructions && (
            <Field label="Special instructions" value={specialInstructions} />
          )}
        </>
      )}
    </div>
  );
}

/* ─── Section 8: Risk & Missing Info ────────────────────────────────── */

function RiskCard({
  missingItems, atRiskFlags,
}: Required<Pick<DetailsTabData, "missingItems" | "atRiskFlags">>) {
  const hasMissing = missingItems.length > 0;
  const hasRisk = atRiskFlags.length > 0;
  if (!hasMissing && !hasRisk) return null;

  return (
    <div style={{
      ...CARD_STYLE,
      border: `1px solid rgba(163,58,58,0.18)`,
      background: "rgba(214,89,89,0.03)",
    }}>
      <CardHeading label="Missing Info & Risks" />
      {hasMissing && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.inkMuted, marginBottom: 6 }}>
            Missing information
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {missingItems.map((item, i) => (
              <WarningChip key={i} label={item} />
            ))}
          </div>
        </div>
      )}
      {hasMissing && hasRisk && <Divider />}
      {hasRisk && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.inkMuted, marginBottom: 6 }}>
            At risk
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {atRiskFlags.map((flag, i) => (
              <AmberChip key={i} label={flag} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Section 9: Activity Log ───────────────────────────────────────── */

function ActivityCard({
  activity,
}: Pick<DetailsTabData, "activity">) {
  const [expanded, setExpanded] = useState(false);
  const items = activity ?? [];

  const toneColor = (tone?: "info" | "warn" | "success"): string => {
    if (tone === "success") return C.green;
    if (tone === "warn") return C.amber;
    return C.inkMuted;
  };

  return (
    <div style={CARD_STYLE}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          width: "100%",
          textAlign: "left",
          fontFamily: FONT,
        }}
        aria-expanded={expanded}
      >
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: C.accent,
        }}>
          Activity {items.length > 0 && `(${items.length})`}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden
          style={{
            color: C.inkMuted,
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
            flexShrink: 0,
          }}
        >
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
          {items.length === 0 ? (
            <div style={{ fontSize: 12, color: C.inkDim, fontStyle: "italic" }}>
              No activity recorded yet
            </div>
          ) : (
            items.map((entry) => (
              <div key={entry.id} style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                paddingBottom: 10,
                borderBottom: `1px solid ${C.borderSoft}`,
              }}>
                <div style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: toneColor(entry.tone),
                  flexShrink: 0,
                  marginTop: 5,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 600 }}>{entry.actor}</span>
                    {" · "}
                    {entry.summary}
                  </div>
                  <div style={{ fontSize: 11, color: C.inkDim, marginTop: 2 }}>
                    {entry.ts}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────── */

export function DetailsTab({ pov, data }: { pov: DetailsTabPov; data: DetailsTabData }) {
  // Section 8 visibility: admin, coord, and talent_coord (coord-active)
  const showRisk = pov === "admin" || pov === "coord" || pov === "talent_coord";

  // Left column cards (mobile: top of stack)
  const leftCol = (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StatusSummaryCard stage={data.stage} nextAction={data.nextAction} />
      <JobBriefCard
        title={data.title}
        brief={data.brief}
        category={data.category}
        talentCount={data.talentCount}
        notes={data.notes}
      />
      <ScheduleCard
        date={data.date}
        startTime={data.startTime}
        endTime={data.endTime}
        timezone={data.timezone}
        deadline={data.deadline}
      />
      <LocationCard
        venue={data.venue}
        address={data.address}
        city={data.city}
        mapUrl={data.mapUrl}
        meetingPoint={data.meetingPoint}
        accessNotes={data.accessNotes}
        isRemote={data.isRemote}
      />
      <LogisticsCard
        wardrobe={data.wardrobe}
        equipment={data.equipment}
        transport={data.transport}
        lodging={data.lodging}
        meals={data.meals}
        callTime={data.callTime}
        specialInstructions={data.specialInstructions}
      />
    </div>
  );

  // Right column cards (mobile: bottom of stack)
  const rightCol = (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <PeopleCard
        pov={pov}
        clientName={data.clientName}
        coordinators={data.coordinators}
        lineup={data.lineup}
        onSiteContact={data.onSiteContact}
      />
      <OfferPaymentCard
        pov={pov}
        offerLabel={data.offerLabel}
        offerStatus={data.offerStatus}
        paymentLabel={data.paymentLabel}
        paymentStatus={data.paymentStatus}
      />
      {showRisk && (
        <RiskCard
          missingItems={data.missingItems ?? []}
          atRiskFlags={data.atRiskFlags ?? []}
        />
      )}
      <ActivityCard activity={data.activity} />
    </div>
  );

  return (
    <div
      style={{
        padding: "16px 12px",
        background: C.bg,
        minHeight: "100%",
        fontFamily: FONT,
      }}
    >
      {/*
        Mobile-first single column at ≤640px.
        Two-column at ≥1024px via CSS class injection.
        We use an inline style + a style tag since this component
        ships without a CSS module dependency by design.
      */}
      <style>{`
        .dt-grid {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        @media (min-width: 1024px) {
          .dt-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            align-items: start;
          }
        }
      `}</style>
      <div className="dt-grid">
        {leftCol}
        {rightCol}
      </div>
    </div>
  );
}
