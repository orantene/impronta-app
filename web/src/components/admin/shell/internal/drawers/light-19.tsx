"use client";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  COLORS,
  CapsLabel,
  DrawerShell,
  FONTS,
  Icon,
  RADIUS,
  SecondaryButton,
  TRANSITION,
  Toggle,
  useAdminShell
} from "./drawer-shared";

// Phase 1d (remediation §4): 6 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function CalendarSyncDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "calendar-sync";

  const ICAL_URL = "https://app.tulala.digital/cal/export/impronta-oran.ics?token=abc123";
  const INTEGRATIONS = [
    { name: "Google Calendar",       icon: "calendar" as const, connected: true,  note: "Two-way sync · Last synced 4 min ago" },
    { name: "Apple Calendar (iCal)", icon: "calendar" as const, connected: false, note: "Subscribe via URL below" },
    { name: "Outlook / Office 365",  icon: "calendar" as const, connected: false, note: "Connect via Microsoft OAuth" },
  ];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Calendar sync"
      description="Sync your Tulala bookings with your personal calendar. Changes appear within 5 minutes."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
      defaultSize="half"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>
        {/* Integrations */}
        <div>
          <CapsLabel>Connected calendars</CapsLabel>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {INTEGRATIONS.map((intg) => (
              <div
                key={intg.name}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 14px", background: COLORS.surfaceAlt,
                  borderRadius: RADIUS.md, border: `1px solid ${intg.connected ? COLORS.accent + "44" : COLORS.borderSoft}`,
                }}
              >
                <div className="flex items-center gap-2.5">
                  <Icon name={intg.icon} size={16} color={intg.connected ? COLORS.accent : COLORS.inkMuted} stroke={1.6} />
                  <div>
                    <div className="text-admin-ink text-admin-13 font-semibold">{intg.name}</div>
                    <div style={{ fontSize: 11, color: intg.connected ? COLORS.successDeep : COLORS.inkMuted, marginTop: 1 }}>
                      {intg.note}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled
                  style={{
                    padding: "5px 12px", fontFamily: FONTS.body, fontSize: 12, fontWeight: 600,
                    color: COLORS.inkMuted,
                    background: "transparent",
                    border: `1px solid ${COLORS.borderSoft}`,
                    borderRadius: RADIUS.sm, cursor: "default", opacity: 0.5,
                  }}
                >
                  {intg.connected ? "Disconnect" : "Connect"}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* iCal subscription URL */}
        <div>
          <CapsLabel>iCal subscription URL</CapsLabel>
          <div style={{ marginTop: 8, fontSize: 12.5, marginBottom: 8, lineHeight: 1.5 }} className="text-admin-ink-muted">
            Add this URL to any calendar app that supports iCal subscriptions (Apple Calendar, Outlook, Fantastical). Read-only, updates every 15 minutes.
          </div>
          <div className="flex gap-2">
            <div style={{ flex: 1, fontSize: 11.5, fontFamily: "monospace", border: `1px solid ${COLORS.border}`, padding: "8px 10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-admin-ink bg-admin-surface-alt rounded-admin-sm">
              {ICAL_URL}
            </div>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(ICAL_URL)
                  .then(() => toast("iCal URL copied"))
                  .catch(() => toast("Couldn't copy — copy manually"));
              }}
              style={{
                padding: "7px 12px", background: COLORS.fill, border: "none",
                borderRadius: RADIUS.sm, color: "#fff", fontFamily: FONTS.body,
                fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0,
              }}
            >
              Copy
            </button>
          </div>
        </div>
      </div>
    </DrawerShell>
  );
}


export function SystemStatusDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "system-status";

  type ComponentStatus = { name: string; status: "operational" | "degraded" | "outage"; latency?: string };
  const COMPONENTS: ComponentStatus[] = [
    { name: "API",                  status: "operational", latency: "42ms"  },
    { name: "Web app",              status: "operational", latency: "180ms" },
    { name: "Messaging service",    status: "operational", latency: "38ms"  },
    { name: "File storage",         status: "operational", latency: "95ms"  },
    { name: "Payment processing",   status: "operational", latency: "210ms" },
    { name: "Email delivery",       status: "degraded",    latency: "1.2s"  },
    { name: "Push notifications",   status: "operational", latency: "55ms"  },
    { name: "Search index",         status: "operational", latency: "88ms"  },
  ];

  const INCIDENTS = [
    { date: "Apr 26", title: "Email delivery latency spike",           resolved: false, impact: "Email sends delayed ~90 seconds" },
    { date: "Apr 18", title: "API slowdown during peak hours (15:00–16:30)", resolved: true,  impact: "P99 latency exceeded 500ms for 90 minutes" },
    { date: "Apr 05", title: "File upload errors in EU region",         resolved: true,  impact: "~8% of uploads failed over 30 minutes" },
  ];

  const statusColor = (s: ComponentStatus["status"]) =>
    s === "operational" ? COLORS.successDeep : s === "degraded" ? COLORS.coral : COLORS.red;
  const statusBg = (s: ComponentStatus["status"]) =>
    s === "operational" ? COLORS.successSoft : s === "degraded" ? COLORS.coralSoft : COLORS.criticalSoft;
  const allOperational = COMPONENTS.every((c) => c.status === "operational");

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="System status"
      description={`Real-time Tulala infrastructure health. Last updated ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}.`}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
      defaultSize="half"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>
        {/* Overall status banner */}
        <div style={{ padding: "12px 16px", background: allOperational ? COLORS.successSoft : COLORS.coralSoft, border: `1px solid ${allOperational ? "rgba(46,125,91,0.2)" : "rgba(194,106,69,0.2)"}`, display: "flex", alignItems: "center", gap: 10 }} className="rounded-admin-lg">
          <div style={{
            width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
            background: allOperational ? COLORS.success : COLORS.coral,
          }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: allOperational ? COLORS.successDeep : COLORS.coralDeep }}>
            {allOperational ? "All systems operational" : "Some systems degraded"}
          </div>
        </div>

        {/* Component grid */}
        <div>
          <CapsLabel>Components</CapsLabel>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {COMPONENTS.map((comp) => (
              <div
                key={comp.name}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "9px 14px", background: COLORS.surfaceAlt,
                  borderRadius: RADIUS.md, border: `1px solid ${COLORS.borderSoft}`,
                }}
              >
                <div className="text-admin-ink text-admin-13 font-medium">{comp.name}</div>
                <div className="flex items-center gap-2.5">
                  {comp.latency && (
                    <span className="text-admin-ink-muted text-admin-11">{comp.latency}</span>
                  )}
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: statusColor(comp.status), background: statusBg(comp.status), padding: "2px 7px", textTransform: "capitalize" }} className="rounded-admin-sm">
                    {comp.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Incident log */}
        <div>
          <CapsLabel>Recent incidents</CapsLabel>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {INCIDENTS.map((inc) => (
              <div
                key={inc.title}
                style={{
                  padding: "12px 14px", background: COLORS.surfaceAlt,
                  borderRadius: RADIUS.md, border: `1px solid ${COLORS.borderSoft}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div className="text-admin-ink text-admin-13 font-semibold">{inc.title}</div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, flexShrink: 0, color: inc.resolved ? COLORS.successDeep : COLORS.coral, background: inc.resolved ? COLORS.successSoft : COLORS.coralSoft, padding: "2px 7px" }} className="rounded-admin-sm">
                    {inc.resolved ? "Resolved" : "Ongoing"}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, marginTop: 4 }} className="text-admin-ink-muted">
                  {inc.date} · {inc.impact}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-24 — Quality & release engineering drawers
// ════════════════════════════════════════════════════════════════════


export function TelemetryDashboardDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "telemetry-dashboard";

  const METRICS = [
    { label: "Error rate (24h)",    value: "0.08%",  sub: "↓ from 0.12% yesterday",  tone: "green"  as const },
    { label: "P95 API latency",     value: "142ms",  sub: "Target: <200ms ✓",         tone: "green"  as const },
    { label: "LCP (Web Vital)",     value: "1.8s",   sub: "Good (<2.5s) ✓",           tone: "green"  as const },
    { label: "CLS (Web Vital)",     value: "0.04",   sub: "Good (<0.1) ✓",            tone: "green"  as const },
    { label: "DAU (last 7d avg)",   value: "412",    sub: "+14% WoW",                  tone: "indigo" as const },
    { label: "Sessions today",      value: "1,240",  sub: "Peak at 14:00",             tone: "indigo" as const },
  ];

  const EVENT_FUNNEL = [
    { label: "Sessions",             count: 1240, pct: 100 },
    { label: "Viewed roster",        count: 892,  pct: 72  },
    { label: "Opened inquiry form",  count: 203,  pct: 16  },
    { label: "Submitted inquiry",    count: 87,   pct: 7   },
  ];

  const toneColor = (t: "green" | "indigo") =>
    t === "green" ? COLORS.successDeep : COLORS.indigoDeep;
  const toneBg = (t: "green" | "indigo") =>
    t === "green" ? COLORS.successSoft : COLORS.indigoSoft;

  const FUNNEL_W = 280;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Telemetry dashboard"
      description="Production health, Web Vitals, and conversion funnel. Sampled at 10%. Updated every 5 minutes."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
      defaultSize="half"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONTS.body }}>
        {/* KPI grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {METRICS.map((m) => (
            <div key={m.label} style={{
              background: toneBg(m.tone), borderRadius: RADIUS.lg,
              padding: "12px 14px", border: `1px solid ${toneColor(m.tone)}22`,
            }}>
              <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }} className="text-admin-ink-muted">
                {m.label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: toneColor(m.tone), marginBottom: 2 }}>
                {m.value}
              </div>
              <div className="text-admin-ink-muted text-admin-10h">{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Event funnel */}
        <div style={{ padding: "14px 16px", border: `1px solid ${COLORS.border}` }} className="bg-admin-surface-alt rounded-admin-lg">
          <CapsLabel>Conversion funnel · today</CapsLabel>
          <div className="mt-3">
            {EVENT_FUNNEL.map((step, i) => (
              <div key={step.label} style={{ marginBottom: i < EVENT_FUNNEL.length - 1 ? 10 : 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12.5 }} className="text-admin-ink">
                  <span className="font-medium">{step.label}</span>
                  <span className="text-admin-ink-muted">{step.count.toLocaleString()} · {step.pct}%</span>
                </div>
                <div style={{ background: COLORS.border, borderRadius: 3, height: 6, overflow: "hidden" }}>
                  <div
                    style={{
                      '--progress-w': `${step.pct}%`,
                      '--progress-bg': i === 0 ? COLORS.accent : i === 1 ? COLORS.indigo : i === 2 ? COLORS.success : COLORS.green,
                    }}
                    className="w-[var(--progress-w)] h-full rounded-[3px] bg-[var(--progress-bg)] [transition:width_var(--transition-admin-layout)]"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          padding: "10px 14px", background: COLORS.indigoSoft,
          borderRadius: RADIUS.md, border: `1px solid rgba(91,107,160,0.2)`,
          fontSize: 11.5, color: COLORS.indigoDeep, lineHeight: 1.5,
        }}>
          Full telemetry in Vercel Analytics + Sentry. This drawer shows the subset surfaced to workspace admins. Error detail and traces require HQ access.
        </div>
      </div>
    </DrawerShell>
  );
}


export function BetaProgramDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "beta-program";

  type Flag = { id: string; name: string; description: string; rollout: number; enrolled: boolean };
  const [flags, setFlags] = useState<Flag[]>([
    { id: "ai-reply",      name: "AI reply suggestions",     description: "Smart reply suggestions in the messaging panel.",              rollout: 25,  enrolled: true  },
    { id: "bulk-edit",     name: "Bulk talent editor",       description: "Multi-select and edit multiple profiles at once.",             rollout: 10,  enrolled: false },
    { id: "calendar-v2",  name: "Calendar v2",              description: "Redesigned calendar with drag-to-book and conflict detection.", rollout: 50,  enrolled: true  },
    { id: "brief-builder", name: "Brief builder (client)",   description: "Structured brief authoring tool for clients.",                 rollout: 5,   enrolled: false },
    { id: "new-nav",       name: "Redesigned nav (2026)",    description: "Upcoming navigation overhaul — early access.",                rollout: 100, enrolled: false },
  ]);

  const toggle = (id: string) =>
    setFlags((prev) => prev.map((f) => f.id === id ? { ...f, enrolled: !f.enrolled } : f));

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Beta program"
      description="Opt your workspace into early-access features. You can leave any beta at any time."
      footer={
        <div className="flex gap-2">
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <button
            type="button"
            onClick={() => { toast("Beta preferences saved"); closeDrawer(); }}
            style={{
              padding: "9px 18px", background: COLORS.fill, border: "none",
              borderRadius: RADIUS.md, color: "#fff", fontFamily: FONTS.body,
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            Save
          </button>
        </div>
      }
      defaultSize="half"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: FONTS.body }}>
        {flags.map((flag) => (
          <div
            key={flag.id}
            style={{
              padding: "14px 16px", background: COLORS.surfaceAlt,
              borderRadius: RADIUS.lg, border: `1px solid ${flag.enrolled ? COLORS.accent + "44" : COLORS.borderSoft}`,
              display: "flex", gap: 12, alignItems: "flex-start",
            }}
          >
            <Toggle on={flag.enrolled} onChange={() => toggle(flag.id)} />
            <div className="flex-1">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <span className="text-admin-ink text-admin-13 font-semibold">{flag.name}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px" }} className="text-admin-indigo-deep bg-admin-indigo-soft rounded-admin-sm">
                  {flag.rollout}% rollout
                </span>
                {flag.enrolled && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px" }} className="text-admin-success-deep bg-admin-success-soft rounded-admin-sm">
                    Enrolled
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.45 }} className="text-admin-ink-muted">{flag.description}</div>
            </div>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-25 — Bulk operations + migration drawers
// ════════════════════════════════════════════════════════════════════


export function CsvImportDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "csv-import";
  const importType = (state.drawer.payload?.type as "talent" | "clients") ?? "talent";
  const [step, setStep] = useState<"upload" | "mapping" | "preview" | "done">("upload");

  const TALENT_COLUMNS  = ["First name", "Last name", "Email", "Height (cm)", "Shoe size", "Category", "Instagram"];
  const CLIENT_COLUMNS  = ["Company name", "Contact name", "Email", "Phone", "Country"];
  const columns = importType === "talent" ? TALENT_COLUMNS : CLIENT_COLUMNS;

  const PREVIEW_ROWS = importType === "talent" ? [
    ["Bella", "Moretti",  "bella@model.it",     "178", "39", "Editorial",   "@bellamoretti" ],
    ["Jasper","Klein",    "jasper@models.de",   "190", "44", "Commercial",  "@jasperklein"  ],
    ["Yuki",  "Tanaka",   "yuki@agency.jp",     "165", "37", "Runway",      "@yukitanaka"   ],
  ] : [
    ["Vogue Italia",  "Anna Rossi",   "anna@vogue.it",    "+39 02 1234",  "IT" ],
    ["H&M Studio",    "Lena Müller",  "lena@hm.com",      "+46 8 5678",   "SE" ],
  ];

  return (
    <DrawerShell
      open={open}
      onClose={() => { setStep("upload"); closeDrawer(); }}
      title={`Import ${importType}`}
      description={`Upload a CSV to bulk-import ${importType === "talent" ? "talent profiles" : "client records"}. Map columns, preview, then commit.`}
      footer={
        <div className="flex gap-2">
          {step !== "upload" && step !== "done" && (
            <SecondaryButton onClick={() => setStep(step === "mapping" ? "upload" : step === "preview" ? "mapping" : "preview")}>
              ← Back
            </SecondaryButton>
          )}
          {step === "done" ? (
            <SecondaryButton onClick={() => { setStep("upload"); closeDrawer(); }}>Close</SecondaryButton>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (step === "upload")   setStep("mapping");
                else if (step === "mapping")  setStep("preview");
                else if (step === "preview")  { setStep("done"); toast(`${PREVIEW_ROWS.length} rows imported`); }
              }}
              style={{
                padding: "9px 18px", background: COLORS.fill, border: "none",
                borderRadius: RADIUS.md, color: "#fff", fontFamily: FONTS.body,
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              {step === "upload" ? "Next: Map columns →" : step === "mapping" ? "Next: Preview →" : "Commit import"}
            </button>
          )}
        </div>
      }
      defaultSize="half"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>
        {/* Step indicator */}
        <div style={{ display: "flex", gap: 0 }}>
          {(["upload", "mapping", "preview", "done"] as const).map((s, i) => {
            const done = ["upload","mapping","preview","done"].indexOf(step) > i;
            const active = step === s;
            return (
              <div key={s} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                  background: done ? COLORS.accent : active ? COLORS.fill : COLORS.borderSoft,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700,
                  color: done || active ? "#fff" : COLORS.inkDim,
                }}>
                  {done ? "✓" : String(i + 1)}
                </div>
                {i < 3 && <div style={{ flex: 1, height: 2, background: done ? COLORS.accent : COLORS.borderSoft }} />}
              </div>
            );
          })}
        </div>

        {step === "upload" && (
          <div
            style={{
              padding: "32px 20px", textAlign: "center",
              background: COLORS.surfaceAlt, borderRadius: RADIUS.lg,
              border: `2px dashed ${COLORS.border}`,
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 10 }}>📂</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }} className="text-admin-ink">
              Drop your CSV here, or click to browse
            </div>
            <div style={{ fontSize: 11.5, marginBottom: 14 }} className="text-admin-ink-muted">
              Max 5 MB · UTF-8 encoding · First row = headers
            </div>
            <button
              type="button"
              onClick={() => setStep("mapping")}
              style={{
                padding: "8px 18px", background: COLORS.fill, border: "none",
                borderRadius: RADIUS.md, color: "#fff", fontFamily: FONTS.body,
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              Browse file
            </button>
          </div>
        )}

        {step === "mapping" && (
          <div>
            <CapsLabel>Map CSV columns to Tulala fields</CapsLabel>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {columns.map((col) => (
                <div key={col} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: COLORS.surfaceAlt, borderRadius: RADIUS.md, border: `1px solid ${COLORS.borderSoft}` }}>
                  <span className="text-admin-ink text-admin-12h font-medium">{col}</span>
                  <span className="text-admin-success-deep text-admin-11h">✓ Auto-matched</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === "preview" && (
          <div>
            <CapsLabel>Preview ({PREVIEW_ROWS.length} rows · sample)</CapsLabel>
            <div style={{ marginTop: 8, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: FONTS.body }}>
                <thead>
                  <tr>
                    {columns.slice(0, 4).map((col) => (
                      <th key={col} style={{ padding: "6px 10px", textAlign: "left", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.border}`, color: COLORS.inkMuted, fontWeight: 700, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PREVIEW_ROWS.map((row, i) => (
                    <tr key={i}>
                      {row.slice(0, 4).map((cell, j) => (
                        <td key={j} style={{ padding: "8px 10px", border: `1px solid ${COLORS.borderSoft}`, color: COLORS.ink }}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === "done" && (
          <div style={{ padding: "16px 18px", border: `1px solid rgba(46,125,91,0.2)` }} className="bg-admin-success-soft rounded-admin-lg">
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }} className="text-admin-success-deep">✓ Import complete</div>
            <div className="text-admin-success-deep text-admin-12h">
              {PREVIEW_ROWS.length} {importType} records imported successfully. They appear in your roster immediately.
            </div>
          </div>
        )}
      </div>
    </DrawerShell>
  );
}


export function MigrationAssistantDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "migration-assistant";
  const [source, setSource] = useState<"excel" | "whatsapp" | "airtable">("excel");
  const [analysed, setAnalysed] = useState(false);

  const SOURCE_META = {
    excel:     { label: "Excel / Google Sheets", icon: "📊", hint: "Export your spreadsheet as .xlsx or .csv" },
    whatsapp:  { label: "WhatsApp export",        icon: "💬", hint: "Go to WhatsApp Web → Export chat (without media)" },
    airtable:  { label: "Airtable",               icon: "🗃️", hint: "Export your base as CSV from Airtable → Download" },
  };
  const ANALYSIS_RESULT = source === "whatsapp"
    ? { found: 23, entities: "client conversations", notes: "Detected 23 client threads. AI will map each conversation to a contact + 3 draft inquiries." }
    : { found: 47, entities: source === "excel" ? "talent rows" : "records", notes: "AI detected 6 columns including 2 that look like measurements. Review the mapping before committing." };

  return (
    <DrawerShell
      open={open}
      onClose={() => { setAnalysed(false); closeDrawer(); }}
      title="Migration assistant"
      description="AI-assisted import from your existing tools. We parse the structure and map it to Tulala — you review and commit."
      footer={
        analysed ? (
          <div className="flex gap-2">
            <SecondaryButton onClick={() => setAnalysed(false)}>← Back</SecondaryButton>
            <button
              type="button"
              onClick={() => { toast("Migration queued — you'll receive an email when it's done"); closeDrawer(); }}
              style={{
                padding: "9px 18px", background: COLORS.fill, border: "none",
                borderRadius: RADIUS.md, color: "#fff", fontFamily: FONTS.body,
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              Confirm migration
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
            <button
              type="button"
              onClick={() => setAnalysed(true)}
              style={{
                padding: "9px 18px", background: COLORS.fill, border: "none",
                borderRadius: RADIUS.md, color: "#fff", fontFamily: FONTS.body,
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              Analyse file →
            </button>
          </div>
        )
      }
      defaultSize="compact"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
        {analysed ? (
          <>
            <div style={{ padding: "14px 16px", border: `1px solid rgba(95,75,139,0.2)`, display: "flex", gap: 10, alignItems: "flex-start" }} className="bg-admin-royal-soft rounded-admin-lg">
              <Icon name="sparkle" size={14} color={COLORS.royal} stroke={1.7} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }} className="text-admin-royal-deep">
                  AI analysis complete
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5 }} className="text-admin-royal-deep">
                  Found {ANALYSIS_RESULT.found} {ANALYSIS_RESULT.entities}. {ANALYSIS_RESULT.notes}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5 }} className="text-admin-ink-muted">
              Migration runs in the background. You can close this drawer — we&apos;ll notify you when it&apos;s done. Existing data is not affected.
            </div>
          </>
        ) : (
          <>
            <div>
              <CapsLabel>Data source</CapsLabel>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {(Object.entries(SOURCE_META) as [typeof source, typeof SOURCE_META[typeof source]][]).map(([key, meta]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSource(key)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 14px", background: source === key ? COLORS.accentSoft : COLORS.surfaceAlt,
                      border: `1px solid ${source === key ? COLORS.accent + "44" : COLORS.borderSoft}`,
                      borderRadius: RADIUS.md, cursor: "pointer", fontFamily: FONTS.body, textAlign: "left",
                      transition: TRANSITION.sm,
                    }}
                  >
                    <span className="text-xl">{meta.icon}</span>
                    <div>
                      <div className="text-admin-ink text-admin-13 font-semibold">{meta.label}</div>
                      <div style={{ fontSize: 11.5, marginTop: 1 }} className="text-admin-ink-muted">{meta.hint}</div>
                    </div>
                    {source === key && (
                      <Icon name="check" size={14} color={COLORS.accent} stroke={2.5} />
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ padding: "32px 20px", textAlign: "center", border: `2px dashed ${COLORS.border}` }} className="bg-admin-surface-alt rounded-admin-lg">
              <div style={{ fontSize: 22, marginBottom: 8 }}>{SOURCE_META[source].icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }} className="text-admin-ink">
                Drop your file here
              </div>
              <div className="text-admin-ink-muted text-admin-11h">or click to browse</div>
            </div>
          </>
        )}
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-26 — Brand & creative tools drawers
// ════════════════════════════════════════════════════════════════════

