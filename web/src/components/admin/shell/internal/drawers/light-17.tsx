"use client";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  COLORS,
  CapsLabel,
  DrawerShell,
  FONTS,
  FieldRow,
  GhostButton,
  Icon,
  RADIUS,
  SecondaryButton,
  TRANSITION,
  TextArea,
  TextInput,
  downloadCsv,
  openSupportEmail,
  useAdminShell
} from "./drawer-shared";

// Phase 1d (remediation §4): 6 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function VacationHandoverDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "vacation-handover";
  const [fromDate, setFromDate] = useState("2026-05-12");
  const [toDate,   setToDate]   = useState("2026-05-19");
  const [handoverTo, setHandoverTo] = useState("Sara Mendes");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  const TEAM = ["Sara Mendes", "Luca Ferretti", "Alina Popescu"];
  const OPEN_COUNT = 6;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Vacation handover"
      description="Reassign your active inquiries and set an out-of-office while you're away."
      footer={
        <div className="flex gap-2">
          {saved
            ? <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
            : (
              <>
                <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
                <button
                  type="button"
                  onClick={() => { setSaved(true); toast(`Handover set — ${OPEN_COUNT} inquiries reassigned to ${handoverTo}`); }}
                  style={{
                    padding: "9px 18px", background: COLORS.fill, border: "none",
                    borderRadius: RADIUS.md, color: "#fff", fontFamily: FONTS.body,
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Save handover
                </button>
              </>
            )}
        </div>
      }
      defaultSize="compact"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>
        {saved ? (
          <div style={{ padding: "16px 18px", border: `1px solid rgba(46,125,91,0.2)`, display: "flex", flexDirection: "column", gap: 6 }} className="bg-admin-success-soft rounded-admin-lg">
            <div className="text-admin-success-deep text-admin-13 font-bold">✓ Handover active</div>
            <div className="text-admin-success-deep text-admin-12h">
              {OPEN_COUNT} inquiries reassigned to <strong>{handoverTo}</strong> · {fromDate} – {toDate}
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }} className="text-admin-ink-muted">
              Auto-reply enabled. You&apos;ll be re-assigned automatically when you return.
            </div>
          </div>
        ) : (
          <>
            {/* Date range */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <FieldRow label="From"><TextInput value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></FieldRow>
              <FieldRow label="To"><TextInput value={toDate}   onChange={(e) => setToDate(e.target.value)} /></FieldRow>
            </div>

            {/* Handover assignee */}
            <FieldRow label="Hand over to">
              <select
                value={handoverTo}
                onChange={(e) => setHandoverTo(e.target.value)}
                style={{
                  fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink,
                  background: "#fff", border: `1px solid ${COLORS.border}`,
                  borderRadius: RADIUS.sm, padding: "7px 10px", width: "100%",
                }}
              >
                {TEAM.map((m) => <option key={m}>{m}</option>)}
              </select>
            </FieldRow>

            {/* Impact summary */}
            <div style={{ padding: "10px 14px", border: `1px solid rgba(82,96,109,0.2)`, fontSize: 12.5, lineHeight: 1.5 }} className="bg-admin-amber-soft rounded-admin-md text-admin-amber-deep">
              <strong>{OPEN_COUNT} active inquiries</strong> will be reassigned to {handoverTo}. They&apos;ll receive a notification with context on each.
            </div>

            {/* Out-of-office note */}
            <FieldRow label="Out-of-office message (optional)">
              <TextArea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="I'm away 12–19 May. For urgent matters contact Sara Mendes."
                rows={3}
              />
            </FieldRow>
          </>
        )}
      </div>
    </DrawerShell>
  );
}


export function OnCallRotationDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "on-call-rotation";
  const [activeTab, setActiveTab] = useState<"schedule" | "escalation">("schedule");

  type Slot = { day: string; name: string; hours: string; isToday: boolean };
  const SCHEDULE: Slot[] = [
    { day: "Mon", name: "Oran Tene",     hours: "09:00–18:00", isToday: false },
    { day: "Tue", name: "Sara Mendes",   hours: "09:00–18:00", isToday: false },
    { day: "Wed", name: "Luca Ferretti", hours: "09:00–18:00", isToday: false },
    { day: "Thu", name: "Sara Mendes",   hours: "09:00–18:00", isToday: false },
    { day: "Fri", name: "Oran Tene",     hours: "09:00–18:00", isToday: true  },
    { day: "Sat", name: "On-call only",  hours: "Emergency",   isToday: false },
    { day: "Sun", name: "On-call only",  hours: "Emergency",   isToday: false },
  ];
  const ESCALATION = [
    { level: "L1", label: "First response",  target: "Assigned coordinator",  sla: "2h" },
    { level: "L2", label: "Escalate if no response", target: "Team admin (Oran)", sla: "+4h" },
    { level: "L3", label: "Critical breach", target: "All admins + SMS alert", sla: "+8h" },
  ];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="On-call rotation"
      description="Who's responsible today and how unresolved inquiries escalate over time."
      footer={
        <div className="flex gap-2">
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        </div>
      }
      defaultSize="half"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>
        {/* Tab toggle */}
        <div style={{ display: "flex", gap: 4, padding: 3 }} className="bg-admin-surface-alt rounded-admin-md">
          {(["schedule", "escalation"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              style={{
                flex: 1, padding: "6px 12px",
                background: activeTab === t ? "#fff" : "transparent",
                border: `1px solid ${activeTab === t ? COLORS.border : "transparent"}`,
                borderRadius: RADIUS.sm,
                fontFamily: FONTS.body,
                fontSize: 12.5, fontWeight: activeTab === t ? 600 : 400,
                color: activeTab === t ? COLORS.ink : COLORS.inkMuted,
                cursor: "pointer",
                transition: TRANSITION.sm,
              }}
            >
              {t === "schedule" ? "Schedule" : "Escalation"}
            </button>
          ))}
        </div>

        {/* Schedule tab */}
        {activeTab === "schedule" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {SCHEDULE.map((slot) => (
              <div
                key={slot.day}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 14px", background: slot.isToday ? COLORS.accentSoft : COLORS.surfaceAlt,
                  borderRadius: RADIUS.md,
                  border: `1px solid ${slot.isToday ? COLORS.accent + "44" : COLORS.borderSoft}`,
                }}
              >
                <div className="flex items-center gap-2.5">
                  <span style={{
                    width: 32, fontSize: 11, fontWeight: 700,
                    color: slot.isToday ? COLORS.accent : COLORS.inkMuted,
                    textTransform: "uppercase", letterSpacing: "0.05em",
                  }}>
                    {slot.day}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: slot.isToday ? 700 : 500 }} className="text-admin-ink">
                    {slot.name}
                  </span>
                  {slot.isToday && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", textTransform: "uppercase" }} className="text-admin-accent bg-admin-accent-soft rounded-admin-sm">
                      Today
                    </span>
                  )}
                </div>
                <span className="text-admin-ink-muted text-admin-11h">{slot.hours}</span>
              </div>
            ))}
          </div>
        )}

        {/* Escalation tab */}
        {activeTab === "escalation" && (
          <div className="flex flex-col gap-2">
            {ESCALATION.map((step, i) => (
              <div key={step.level} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                {/* Connector */}
                <div className="flex flex-col items-center">
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    background: i === 0 ? COLORS.success : i === 1 ? COLORS.amber : COLORS.red,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 800, color: "#fff",
                  }}>
                    {step.level}
                  </div>
                  {i < ESCALATION.length - 1 && (
                    <div style={{ width: 2, height: 20, background: COLORS.borderSoft, marginTop: 2 }} />
                  )}
                </div>
                <div style={{ flex: 1, paddingTop: 4 }}>
                  <div className="text-admin-ink text-admin-12h font-semibold">{step.label}</div>
                  <div style={{ fontSize: 12, marginTop: 2 }} className="text-admin-ink-muted">{step.target}</div>
                  <div style={{ fontSize: 11, marginTop: 2 }} className="text-admin-indigo-deep">SLA: {step.sla}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-21 — Compliance, legal, audit drawers
// ════════════════════════════════════════════════════════════════════


export function GdprExportDrawer() {
  const { state, closeDrawer, toast, effectiveTenant } = useAdminShell();
  const open = state.drawer.drawerId === "gdpr-export";

  type DataType = { id: string; label: string; description: string; size: string; selected: boolean };
  const [types, setTypes] = useState<DataType[]>([
    { id: "profile",  label: "Profile & measurements", description: "Name, photos, body data, skills, credits.",  size: "~2 MB",  selected: true  },
    { id: "messages", label: "Messages & threads",     description: "All inquiry and booking conversations.",     size: "~18 MB", selected: true  },
    { id: "bookings", label: "Bookings & contracts",   description: "Confirmed bookings, offers, signed PDFs.",   size: "~4 MB",  selected: true  },
    { id: "payments", label: "Payment history",        description: "Invoices, payouts, transaction log.",        size: "~1 MB",  selected: false },
    { id: "activity", label: "Audit & activity log",   description: "All login events, edits, access records.",   size: "~3 MB",  selected: false },
    { id: "consents", label: "Consent history",        description: "Marketing opt-ins, cookie preferences.",     size: "<1 MB",  selected: false },
  ]);
  const [format, setFormat] = useState<"zip" | "json" | "csv">("zip");
  const selectedCount = types.filter((t) => t.selected).length;
  const selectedLabels = types.filter((t) => t.selected).map((t) => t.label);

  const toggleType = (id: string) =>
    setTypes((prev) => prev.map((t) => t.id === id ? { ...t, selected: !t.selected } : t));

  const requestExport = () => {
    openSupportEmail(
      "Tulala data export request",
      `Please start a ${format.toUpperCase()} data export for: ${selectedLabels.join(", ")}.\n\nWorkspace: ${effectiveTenant.name}`,
    );
    toast("Opening email request");
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Export your data"
      description="GDPR / CCPA data portability. Automated exports are not connected yet, so support handles these requests."
      footer={
        <div className="flex gap-2">
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <button
            type="button"
            disabled={selectedCount === 0}
            onClick={requestExport}
            title="Opens an email to support with your selected export scope."
            style={{
              padding: "9px 18px",
              background: selectedCount === 0 ? COLORS.inkDim : COLORS.fill,
              border: "none", borderRadius: RADIUS.md, color: "#fff",
              fontFamily: FONTS.body, fontSize: 13, fontWeight: 600,
              cursor: selectedCount === 0 ? "not-allowed" : "pointer",
              opacity: selectedCount === 0 ? 0.45 : 1,
            }}
          >
            Email support ({selectedCount} types)
          </button>
        </div>
      }
      defaultSize="half"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>
        {/* Format picker */}
        <div>
          <CapsLabel>Export format</CapsLabel>
          <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
            {(["zip", "json", "csv"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                style={{
                  padding: "6px 14px",
                  background: format === f ? COLORS.fill : COLORS.surfaceAlt,
                  border: `1px solid ${format === f ? COLORS.accent : COLORS.border}`,
                  borderRadius: RADIUS.sm, fontFamily: FONTS.body,
                  fontSize: 12.5, fontWeight: format === f ? 600 : 400,
                  color: format === f ? "#fff" : COLORS.inkMuted,
                  cursor: "pointer", transition: TRANSITION.sm,
                }}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Data type checklist */}
        <div>
          <CapsLabel>Data types · select to include</CapsLabel>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
            {types.map((dt) => (
              <button
                key={dt.id}
                type="button"
                onClick={() => toggleType(dt.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 14px", width: "100%", textAlign: "left",
                  background: dt.selected ? COLORS.accentSoft : COLORS.surfaceAlt,
                  border: `1px solid ${dt.selected ? COLORS.accent + "44" : COLORS.borderSoft}`,
                  borderRadius: RADIUS.md, cursor: "pointer",
                  fontFamily: FONTS.body, transition: TRANSITION.sm,
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                  background: dt.selected ? COLORS.accent : "#fff",
                  border: `1.5px solid ${dt.selected ? COLORS.accent : COLORS.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {dt.selected && <Icon name="check" size={11} color="#fff" stroke={2.5} />}
                </div>
                <div className="flex-1">
                  <div className="text-admin-ink text-admin-13 font-semibold">{dt.label}</div>
                  <div style={{ fontSize: 11.5, marginTop: 1 }} className="text-admin-ink-muted">{dt.description}</div>
                </div>
                <div style={{ fontSize: 11, flexShrink: 0 }} className="text-admin-ink-muted">{dt.size}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: "10px 14px", border: `1px solid rgba(91,107,160,0.2)`, fontSize: 11.5, lineHeight: 1.5 }} className="bg-admin-indigo-soft rounded-admin-md text-admin-indigo-deep">
          Support will confirm scope, identity, and delivery timing by email before preparing the export.
        </div>
      </div>
    </DrawerShell>
  );
}


export function ConsentLogDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "consent-log";

  type ConsentEntry = { channel: string; status: "opted-in" | "opted-out" | "pending"; timestamp: string; method: string };
  const CONSENTS: ConsentEntry[] = [
    { channel: "Marketing emails",     status: "opted-in",  timestamp: "2024-11-14 · 09:32", method: "Signup form"        },
    { channel: "Product updates",      status: "opted-in",  timestamp: "2024-11-14 · 09:32", method: "Signup form"        },
    { channel: "SMS notifications",    status: "opted-out", timestamp: "2025-02-08 · 14:11", method: "Preferences center" },
    { channel: "Partner offers",       status: "opted-out", timestamp: "2024-11-14 · 09:32", method: "Signup form"        },
    { channel: "In-app announcements", status: "opted-in",  timestamp: "2025-01-21 · 11:05", method: "Banner"             },
    { channel: "Booking reminders",    status: "opted-in",  timestamp: "2024-11-14 · 09:32", method: "Signup form"        },
    { channel: "Research & surveys",   status: "pending",   timestamp: "—",                  method: "Not yet presented"  },
  ];

  const toneFor = (s: ConsentEntry["status"]) =>
    s === "opted-in" ? COLORS.successDeep : s === "opted-out" ? COLORS.inkMuted : COLORS.amber;
  const bgFor = (s: ConsentEntry["status"]) =>
    s === "opted-in" ? COLORS.successSoft : s === "opted-out" ? COLORS.surfaceAlt : COLORS.amberSoft;
  const labelFor = (s: ConsentEntry["status"]) =>
    s === "opted-in" ? "Opted in" : s === "opted-out" ? "Opted out" : "Pending";

  const exportCsv = () => {
    downloadCsv("consent-log.csv", CONSENTS.map((entry) => ({
      channel: entry.channel,
      status: labelFor(entry.status),
      timestamp: entry.timestamp,
      method: entry.method,
    })));
    toast("Downloaded consent log CSV");
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Consent log"
      description="Marketing and communication preferences — timestamped and auditable."
      footer={
        <div className="flex gap-2">
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
          <GhostButton onClick={exportCsv}>Export CSV</GhostButton>
        </div>
      }
      defaultSize="half"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            { label: "Opted in",  value: String(CONSENTS.filter((c) => c.status === "opted-in").length),  color: COLORS.successDeep },
            { label: "Opted out", value: String(CONSENTS.filter((c) => c.status === "opted-out").length), color: COLORS.inkMuted    },
            { label: "Pending",   value: String(CONSENTS.filter((c) => c.status === "pending").length),   color: COLORS.amber       },
          ].map((tile) => (
            <div key={tile.label} style={{
              background: COLORS.surfaceAlt, borderRadius: RADIUS.lg,
              padding: "12px 14px", border: `1px solid ${COLORS.border}`, textAlign: "center",
            }}>
              <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }} className="text-admin-ink-muted">
                {tile.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: tile.color }}>{tile.value}</div>
            </div>
          ))}
        </div>

        <div>
          <CapsLabel>Per-channel consent history</CapsLabel>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
            {CONSENTS.map((entry) => (
              <div
                key={entry.channel}
                style={{
                  padding: "10px 14px", background: bgFor(entry.status),
                  borderRadius: RADIUS.md, border: `1px solid ${COLORS.borderSoft}`,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}
              >
                <div>
                  <div className="text-admin-ink text-admin-13 font-semibold">{entry.channel}</div>
                  <div style={{ fontSize: 11, marginTop: 2 }} className="text-admin-ink-muted">{entry.timestamp} · {entry.method}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: toneFor(entry.status), padding: "2px 8px", background: `${toneFor(entry.status)}18` }} className="rounded-admin-sm">
                  {labelFor(entry.status)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "10px 14px", border: `1px solid rgba(91,107,160,0.2)`, fontSize: 11.5, lineHeight: 1.5 }} className="bg-admin-indigo-soft rounded-admin-md text-admin-indigo-deep">
          Consent records are immutable. Withdrawals update future sends — they do not erase prior consent events. Records retained 7 years per GDPR Recital 42.
        </div>
      </div>
    </DrawerShell>
  );
}


export function ContractTemplatesDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "contract-templates";
  const [activeId, setActiveId] = useState<string | null>(null);

  type Template = { id: string; name: string; category: string; fields: string[]; body: string };
  const TEMPLATES: Template[] = [
    {
      id: "t1", name: "Standard model agreement", category: "Talent",
      fields: ["{{talent_name}}", "{{agency_name}}", "{{contract_date}}", "{{day_rate}}", "{{usage_rights}}"],
      body: "This agreement is entered into between {{agency_name}} and {{talent_name}} (\"Talent\"). The Talent agrees to provide services as detailed in each booking brief, at a day rate of {{day_rate}}.",
    },
    {
      id: "t2", name: "Client booking contract", category: "Client",
      fields: ["{{client_name}}", "{{project_name}}", "{{talent_name}}", "{{booking_date}}", "{{total_fee}}"],
      body: "This booking confirmation is issued by {{agency_name}} to {{client_name}} for the project '{{project_name}}'. Services to be provided by {{talent_name}} on {{booking_date}}.",
    },
    {
      id: "t3", name: "Exclusivity clause addendum", category: "Legal",
      fields: ["{{talent_name}}", "{{exclusivity_period}}", "{{market}}", "{{competitor_clause}}"],
      body: "During the exclusivity period of {{exclusivity_period}}, {{talent_name}} agrees not to represent or appear for {{competitor_clause}} within the {{market}} market.",
    },
    {
      id: "t4", name: "Usage rights license", category: "Legal",
      fields: ["{{usage_type}}", "{{territory}}", "{{duration}}", "{{fee}}"],
      body: "This license grants {{client_name}} the right to use approved images/footage for {{usage_type}} purposes within {{territory}} for a period of {{duration}}.",
    },
  ];

  const active = TEMPLATES.find((t) => t.id === activeId) ?? null;
  const categories = Array.from(new Set(TEMPLATES.map((t) => t.category)));

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Contract templates"
      description="Workspace-wide reusable templates. Variables in {{brackets}} are filled at generation time."
      footer={
        <div className="flex gap-2">
          {activeId ? (
            <>
              <SecondaryButton onClick={() => setActiveId(null)}>← Back</SecondaryButton>
              <button
                type="button"
                onClick={() => toast(`Template "${active?.name}" used`)}
                style={{
                  padding: "9px 18px", background: COLORS.fill, border: "none",
                  borderRadius: RADIUS.md, color: "#fff", fontFamily: FONTS.body,
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Use template
              </button>
            </>
          ) : (
            <>
              <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
            </>
          )}
        </div>
      }
      defaultSize="half"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
        {active ? (
          <>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }} className="text-admin-ink">{active.name}</div>
              <div style={{ display: "inline-block", fontSize: 10.5, fontWeight: 700, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.05em" }} className="text-admin-indigo-deep bg-admin-indigo-soft rounded-admin-sm">
                {active.category}
              </div>
            </div>

            <div>
              <CapsLabel>Merge fields ({active.fields.length})</CapsLabel>
              <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 5 }}>
                {active.fields.map((f) => (
                  <span key={f} style={{
                    fontSize: 11.5, fontFamily: "monospace",
                    background: COLORS.amberSoft, color: COLORS.amberDeep,
                    padding: "3px 8px", borderRadius: RADIUS.sm,
                    border: `1px solid rgba(82,96,109,0.2)`,
                  }}>
                    {f}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ padding: "14px 16px", border: `1px solid ${COLORS.border}`, fontSize: 12.5, lineHeight: 1.65 }} className="bg-admin-surface-alt rounded-admin-md text-admin-ink">
              {active.body} <span className="text-admin-ink-dim">…[continues]</span>
            </div>

            <div style={{ padding: "10px 14px", border: `1px solid rgba(91,107,160,0.2)`, fontSize: 11.5, lineHeight: 1.5 }} className="bg-admin-indigo-soft rounded-admin-md text-admin-indigo-deep">
              Templates are not legal advice. Have your legal counsel review before use in production.
            </div>
          </>
        ) : (
          <>
            {categories.map((cat) => (
              <div key={cat}>
                <CapsLabel>{cat}</CapsLabel>
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 5 }}>
                  {TEMPLATES.filter((t) => t.category === cat).map((tmpl) => (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => setActiveId(tmpl.id)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "12px 14px", background: COLORS.surfaceAlt, width: "100%",
                        borderRadius: RADIUS.md, border: `1px solid ${COLORS.borderSoft}`,
                        cursor: "pointer", fontFamily: FONTS.body, textAlign: "left",
                        transition: TRANSITION.sm,
                      }}
                    >
                      <div>
                        <div className="text-admin-ink text-admin-13 font-semibold">{tmpl.name}</div>
                        <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
                          {tmpl.fields.length} merge fields
                        </div>
                      </div>
                      <Icon name="arrow-right" size={14} color={COLORS.inkDim} stroke={1.8} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </DrawerShell>
  );
}


export function ReportContentDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "report-content";
  const [category, setCategory] = useState("Fake or misleading profile");
  const [detail, setDetail] = useState("");

  const targetName = (state.drawer.payload?.targetName as string) ?? "this profile";
  const targetType = (state.drawer.payload?.targetType as string) ?? "profile";

  const CATEGORIES = [
    "Fake or misleading profile",
    "AI-generated or stolen photos",
    "Harassment or threatening behavior",
    "Spam or unsolicited contact",
    "Fraudulent booking or payment",
    "Copyright / image rights violation",
    "Other",
  ];

  const emailReport = () => {
    openSupportEmail(
      `Report ${targetType}: ${targetName}`,
      [
        `Target: ${targetName}`,
        `Type: ${targetType}`,
        `Category: ${category}`,
        "",
        "Additional detail:",
        detail.trim() || "(none provided)",
      ].join("\n"),
    );
    toast("Opening report email");
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={`Report ${targetType}`}
      description={`Email a confidential report about ${targetName} to Tulala support.`}
      footer={
        <div className="flex gap-2">
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <button
            type="button"
            onClick={emailReport}
            title="Opens an email to support. No automatic report is filed from this drawer yet."
            style={{
              padding: "9px 18px", background: COLORS.red, border: "none",
              borderRadius: RADIUS.md, color: "#fff", fontFamily: FONTS.body,
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            Email report
          </button>
        </div>
      }
      defaultSize="compact"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
        <FieldRow label="Category">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink,
              background: "#fff", border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.sm, padding: "7px 10px", width: "100%",
            }}
          >
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </FieldRow>

        <FieldRow label="Additional detail (optional)">
          <TextArea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Describe what you observed. Be specific — screenshots help."
            rows={4}
          />
        </FieldRow>

        <div style={{ padding: "10px 14px", border: `1px solid rgba(82,96,109,0.2)`, fontSize: 11.5, lineHeight: 1.5 }} className="bg-admin-amber-soft rounded-admin-md text-admin-amber-deep">
          Reports are confidential. This opens an email to support; no automatic trust-and-safety case is created from the product yet.
        </div>
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-22 — Email + transactional comms drawers
// ════════════════════════════════════════════════════════════════════

