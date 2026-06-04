"use client";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  COLORS,
  CapsLabel,
  DrawerShell,
  EmptyState,
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
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "vacation-handover";
  // Honest stub — this feature has no backend yet; the previous body showed
  // hardcoded demo data. Surface a clear "coming soon" instead.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Vacation handover"
      description="Reassign your workload while you're away."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="calendar"
        title="Coming soon"
        body="Reassigning your workload while you're away isn't available yet. We'll add handover here when it ships."
      />
    </DrawerShell>
  );
}


export function OnCallRotationDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "on-call-rotation";
  // Honest stub — this feature has no backend yet; the previous body showed
  // hardcoded demo data. Surface a clear "coming soon" instead.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="On-call rotation"
      description="Weekly schedule and escalation ladder."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="calendar"
        title="Coming soon"
        body="On-call scheduling and the escalation ladder aren't available yet."
      />
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

