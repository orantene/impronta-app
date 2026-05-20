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
  RADIUS,
  SecondaryButton,
  TRANSITION,
  TextArea,
  TextInput,
  Toggle,
  useAdminShell
} from "./drawer-shared";

// Phase 1d (remediation §4): 5 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function OnsetCheckinDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "onset-checkin";
  const [checkedIn, setCheckedIn] = React.useState<Set<string>>(new Set(["Lucas Ferreira", "Nia Clarkson"]));

  const crew = [
    { name: "Amara Osei", role: "Lead talent", callTime: "07:30" },
    { name: "Chiara Bianchi", role: "Supporting talent", callTime: "07:30" },
    { name: "Lucas Ferreira", role: "Photographer", callTime: "06:30" },
    { name: "Nia Clarkson", role: "HMU artist", callTime: "06:30" },
  ];

  const toggle = (name: string) => {
    setCheckedIn(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const footer = (
    <div className="flex gap-2">
      <GhostButton onClick={closeDrawer}>Close</GhostButton>
      <SecondaryButton onClick={() => { toast(`Check-in saved — ${checkedIn.size} confirmed`); closeDrawer(); }}>Save check-ins</SecondaryButton>
    </div>
  );

  return (
    <DrawerShell open={open} onClose={closeDrawer} title="On-set check-in" description="Mark talent and crew as arrived on set." footer={footer} defaultSize="half">
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>

        <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", border: `1px solid ${COLORS.accent}` }} className="bg-admin-accent-soft rounded-admin-md">
          <div className="flex-1">
            <div style={{ fontSize: 12, fontWeight: 700 }} className="text-admin-accent">Spring Campaign 2026</div>
            <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">Tue 20 May · Studio One</div>
          </div>
          <div className="text-right">
            <div style={{ fontSize: 24, fontWeight: 800 }} className="text-admin-accent">{checkedIn.size}/{crew.length}</div>
            <div style={{ fontSize: 10 }} className="text-admin-ink-muted">checked in</div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          {crew.map((c, i) => {
            const isIn = checkedIn.has(c.name);
            return (
              <div
                key={i}
                onClick={() => toggle(c.name)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: RADIUS.sm, cursor: "pointer",
                  background: isIn ? COLORS.successSoft : COLORS.surface,
                  border: `1.5px solid ${isIn ? COLORS.success : COLORS.border}`,
                  transition: TRANSITION.sm,
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: "50%", border: `2px solid ${isIn ? COLORS.success : COLORS.border}`,
                  background: isIn ? COLORS.success : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {isIn && <span style={{ fontSize: 11, color: "#fff" }}>✓</span>}
                </div>
                <div className="flex-1">
                  <div style={{ fontSize: 13, fontWeight: 600 }} className="text-admin-ink">{c.name}</div>
                  <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">{c.role} · Call: {c.callTime}</div>
                </div>
                {isIn && <span style={{ fontSize: 11, fontWeight: 700 }} className="text-admin-success">Checked in</span>}
              </div>
            );
          })}
        </div>

        {checkedIn.size === crew.length && (
          <div style={{ border: `1px solid ${COLORS.success}`, padding: 14, textAlign: "center" }} className="bg-admin-success-soft rounded-admin-md">
            <div style={{ fontSize: 13, fontWeight: 700 }} className="text-admin-success">Full crew on set ✓</div>
            <div style={{ fontSize: 11, marginTop: 3 }} className="text-admin-ink-muted">All {crew.length} members checked in</div>
          </div>
        )}
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-34 — Safety, disputes, incident handling
// ════════════════════════════════════════════════════════════════════


export function IncidentReportDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "incident-report";
  const [incidentType, setIncidentType] = React.useState<string>("safety");
  const [severity, setSeverity] = React.useState<"low" | "medium" | "high">("medium");
  const [description, setDescription] = React.useState("");
  const [anonymous, setAnonymous] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const incidentTypes = [
    { key: "safety", label: "On-set safety", icon: "⚠" },
    { key: "conduct", label: "Unprofessional conduct", icon: "🚫" },
    { key: "payment", label: "Payment dispute", icon: "💸" },
    { key: "other", label: "Other", icon: "📝" },
  ];

  const footer = (
    <div className="flex gap-2">
      <GhostButton onClick={closeDrawer}>Cancel</GhostButton>
      <SecondaryButton onClick={() => { setSubmitted(true); toast("Incident report submitted"); }}>Submit report</SecondaryButton>
    </div>
  );

  if (submitted) {
    return (
      <DrawerShell open={open} onClose={closeDrawer} title="Incident report" description="" footer={<GhostButton onClick={closeDrawer}>Close</GhostButton>} defaultSize="half">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "40px 24px", fontFamily: FONTS.body, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }} className="bg-admin-success-soft">✓</div>
          <div style={{ fontSize: 16, fontWeight: 700 }} className="text-admin-ink">Report submitted</div>
          <div style={{ fontSize: 12, maxWidth: 280 }} className="text-admin-ink-muted">
            Your report has been logged securely. {anonymous ? "Submitted anonymously. " : ""}An admin will review within 24 hours and may reach out if further information is needed.
          </div>
          <div style={{ border: `1px solid ${COLORS.border}`, padding: "8px 14px" }} className="bg-admin-surface rounded-admin-sm">
            <div style={{ fontSize: 11 }} className="text-admin-ink-muted">Reference</div>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace" }} className="text-admin-ink">INC-{Date.now().toString().slice(-6)}</div>
          </div>
        </div>
      </DrawerShell>
    );
  }

  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Report an incident" description="All reports are treated confidentially. You may submit anonymously." footer={footer} defaultSize="half">
      <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONTS.body }}>

        <div>
          <CapsLabel>Incident type</CapsLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
            {incidentTypes.map(t => (
              <div
                key={t.key}
                onClick={() => setIncidentType(t.key)}
                style={{
                  padding: "10px 12px", borderRadius: RADIUS.sm, cursor: "pointer", textAlign: "center",
                  border: `1.5px solid ${incidentType === t.key ? COLORS.coral : COLORS.border}`,
                  background: incidentType === t.key ? `${COLORS.coral}10` : COLORS.surface,
                }}
              >
                <div style={{ fontSize: 18, marginBottom: 4 }}>{t.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: incidentType === t.key ? COLORS.coral : COLORS.ink }}>{t.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <CapsLabel>Severity</CapsLabel>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {(["low", "medium", "high"] as const).map(s => {
              const color = s === "low" ? COLORS.success : s === "medium" ? COLORS.amber : COLORS.coral;
              return (
                <div
                  key={s}
                  onClick={() => setSeverity(s)}
                  style={{
                    flex: 1, padding: "8px 12px", borderRadius: RADIUS.sm, cursor: "pointer", textAlign: "center",
                    border: `1.5px solid ${severity === s ? color : COLORS.border}`,
                    background: severity === s ? `${color}14` : COLORS.surface,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: "capitalize", color: severity === s ? color : COLORS.inkMuted }}>{s}</div>
                </div>
              );
            })}
          </div>
        </div>

        <FieldRow label="Description">
          <TextArea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what happened, when, and who was involved (optional)." rows={4} />
        </FieldRow>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `1px solid ${COLORS.border}`, cursor: "pointer" }} onClick={() => setAnonymous(a => !a)}>
          <Toggle on={anonymous} onChange={() => setAnonymous(a => !a)} />
          <span style={{ fontSize: 12 }} className="bg-admin-surface rounded-admin-sm text-admin-ink">Submit anonymously</span>
        </div>
      </div>
    </DrawerShell>
  );
}


export function DisputeResolutionDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "dispute-resolution";
  const [selectedDispute, setSelectedDispute] = React.useState<string | null>(null);

  const disputes = [
    { id: "D-001", parties: "Amara Osei vs. Brand Co.", type: "Late payment", stage: "Mediation", opened: "12 Apr", amount: "£1,200" },
    { id: "D-002", parties: "Lucas Ferreira vs. Agency", type: "Usage overreach", stage: "Filed", opened: "20 Apr", amount: "£800" },
    { id: "D-003", parties: "Yuki Tanaka vs. Client X", type: "Contract breach", stage: "Decision", opened: "5 Mar", amount: "£3,400" },
  ];

  const stageColor = (s: string) => s === "Filed" ? COLORS.coral : s === "Mediation" ? COLORS.amber : s === "Decision" ? COLORS.indigo : COLORS.success;
  const stages = ["Filed", "Mediation", "Decision", "Resolved"];

  const selected = disputes.find(d => d.id === selectedDispute);

  const footer = (
    <div className="flex gap-2">
      <GhostButton onClick={() => { if (selectedDispute) setSelectedDispute(null); else closeDrawer(); }}>
        {selectedDispute ? "Back" : "Close"}
      </GhostButton>
      {selectedDispute && (
        <SecondaryButton onClick={() => { toast("Stage advanced"); setSelectedDispute(null); }}>Advance stage</SecondaryButton>
      )}
    </div>
  );

  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Dispute resolution" description="Track and manage disputes through staged resolution." footer={footer} defaultSize="half">
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>

        {!selectedDispute && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {["Filed", "Mediation", "Decision"].map(s => {
                const n = disputes.filter(d => d.stage === s).length;
                return (
                  <div key={s} style={{ textAlign: "center", padding: "10px 8px", background: `${stageColor(s)}12`, borderRadius: RADIUS.sm, border: `1px solid ${stageColor(s)}30` }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: stageColor(s) }}>{n}</div>
                    <div style={{ fontSize: 10, color: stageColor(s), fontWeight: 600, marginTop: 2 }}>{s}</div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-1.5">
              {disputes.map(d => (
                <div
                  key={d.id}
                  onClick={() => setSelectedDispute(d.id)}
                  style={{ padding: "12px 14px", background: COLORS.surface, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`, cursor: "pointer" }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontSize: 12, fontFamily: "monospace" }} className="text-admin-ink-muted">{d.id}</div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: stageColor(d.stage), background: `${stageColor(d.stage)}18`, padding: "2px 7px" }} className="rounded-admin-sm">{d.stage}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600 }} className="text-admin-ink">{d.parties}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontSize: 11 }} className="text-admin-ink-muted">{d.type} · {d.opened}</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }} className="text-admin-ink">{d.amount}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {selectedDispute && selected && (
          <>
            <div style={{ border: `1px solid ${COLORS.border}`, padding: 14 }} className="bg-admin-surface rounded-admin-md">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontFamily: "monospace" }} className="text-admin-ink-muted">{selected.id}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }} className="text-admin-ink">{selected.parties}</div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800 }} className="text-admin-ink">{selected.amount}</div>
              </div>
              <div style={{ fontSize: 12 }} className="text-admin-ink-muted">{selected.type} · Opened {selected.opened}</div>
            </div>

            <div>
              <CapsLabel>Stage pipeline</CapsLabel>
              <div style={{ display: "flex", marginTop: 12, alignItems: "center" }}>
                {stages.map((s, i) => {
                  const active = s === selected.stage;
                  const past = stages.indexOf(selected.stage) > i;
                  const color = past ? COLORS.success : active ? stageColor(s) : COLORS.border;
                  return (
                    <React.Fragment key={s}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 24, height: 24, borderRadius: "50%", background: past ? COLORS.success : active ? stageColor(s) : COLORS.borderSoft, border: `2px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {past && <span style={{ fontSize: 10, color: "#fff" }}>✓</span>}
                          {!past && active && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
                        </div>
                        <div style={{ fontSize: 9, color: active ? stageColor(s) : COLORS.inkDim, fontWeight: active ? 700 : 400, textAlign: "center" }}>{s}</div>
                      </div>
                      {i < stages.length - 1 && <div style={{ flex: 1, height: 2, background: past ? COLORS.success : COLORS.borderSoft, marginBottom: 14 }} />}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md, padding: 14 }}>
              <CapsLabel>Advance to next stage</CapsLabel>
              <div style={{ marginTop: 8, fontSize: 12 }} className="text-admin-ink-muted">
                Moving from <strong>{selected.stage}</strong> to <strong>{stages[stages.indexOf(selected.stage) + 1] || "Resolved"}</strong> will notify both parties and update the dispute record.
              </div>
            </div>
          </>
        )}
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-35 — Production-feature reconciliation
// ════════════════════════════════════════════════════════════════════


export function LocationsDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "locations-drawer";
  const [view, setView] = React.useState<"list" | "add">("list");
  const [newName, setNewName] = React.useState("");
  const [newAddress, setNewAddress] = React.useState("");
  const [newType, setNewType] = React.useState<"studio" | "outdoor" | "venue" | "client">("studio");

  const locations = [
    { name: "Studio One", address: "12 Shoreditch High St, London E1", type: "studio", capacity: 12, bookings: 34 },
    { name: "Canary Wharf Rooftop", address: "1 Canada Square, London E14", type: "outdoor", capacity: 8, bookings: 12 },
    { name: "Soho Loft", address: "45 Wardour St, London W1", type: "studio", capacity: 6, bookings: 19 },
    { name: "Burlington Arcade", address: "Burlington Arcade, London W1J", type: "venue", capacity: 20, bookings: 7 },
  ];

  const typeColor = (t: string) => t === "studio" ? COLORS.accent : t === "outdoor" ? COLORS.success : t === "venue" ? COLORS.indigo : COLORS.amber;

  const footer = (
    <div className="flex gap-2">
      <GhostButton onClick={() => { if (view === "add") setView("list"); else closeDrawer(); }}>
        {view === "add" ? "Back" : "Close"}
      </GhostButton>
      {view === "add" && (
        <SecondaryButton onClick={() => { toast(`Location "${newName}" saved`); setView("list"); setNewName(""); setNewAddress(""); }}>Save location</SecondaryButton>
      )}
      {view === "list" && (
        <SecondaryButton onClick={() => setView("add")}>Add location</SecondaryButton>
      )}
    </div>
  );

  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Locations" description="Manage shoot studios, venues, and outdoor locations." footer={footer} defaultSize="half">
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>

        {view === "list" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {["studio", "outdoor", "venue", "client"].map(t => {
                const n = locations.filter(l => l.type === t).length;
                return (
                  <div key={t} style={{ textAlign: "center", padding: "8px 4px", background: `${typeColor(t)}12`, borderRadius: RADIUS.sm }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: typeColor(t) }}>{n}</div>
                    <div style={{ fontSize: 10, color: typeColor(t), textTransform: "capitalize", marginTop: 1 }}>{t}</div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-1.5">
              {locations.map((loc, i) => (
                <div key={i} style={{ padding: "12px 14px", background: COLORS.surface, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}` }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span style={{ fontSize: 13, fontWeight: 700 }} className="text-admin-ink">{loc.name}</span>
                        <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "capitalize", color: typeColor(loc.type), background: `${typeColor(loc.type)}18`, padding: "1px 6px" }} className="rounded-admin-sm">{loc.type}</span>
                      </div>
                      <div style={{ fontSize: 11, marginTop: 2 }} className="text-admin-ink-muted">{loc.address}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }} className="text-admin-ink">{loc.bookings}</div>
                      <div style={{ fontSize: 10 }} className="text-admin-ink-muted">bookings</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {view === "add" && (
          <div className="flex flex-col gap-3.5">
            <FieldRow label="Location name">
              <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Studio Two" />
            </FieldRow>
            <FieldRow label="Address">
              <TextInput value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="Full address" />
            </FieldRow>
            <div>
              <CapsLabel>Type</CapsLabel>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                {(["studio", "outdoor", "venue", "client"] as const).map(t => (
                  <div
                    key={t}
                    onClick={() => setNewType(t)}
                    style={{
                      padding: "10px 12px", borderRadius: RADIUS.sm, cursor: "pointer", textAlign: "center",
                      border: `1.5px solid ${newType === t ? typeColor(t) : COLORS.border}`,
                      background: newType === t ? `${typeColor(t)}12` : COLORS.surface,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, textTransform: "capitalize", color: newType === t ? typeColor(t) : COLORS.ink }}>{t}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </DrawerShell>
  );
}


export function AiWorkspaceDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "ai-workspace";
  const [activeTab, setActiveTab] = React.useState<"providers" | "usage" | "console">("providers");
  const [consoleInput, setConsoleInput] = React.useState("");

  const providers = [
    { name: "Anthropic Claude", model: "claude-opus-4", status: "active", calls: 1847, cost: "£23.40" },
    { name: "OpenAI GPT-4o", model: "gpt-4o", status: "inactive", calls: 0, cost: "£0.00" },
    { name: "Stability AI", model: "stable-diffusion-3", status: "active", calls: 312, cost: "£8.90" },
  ];

  const usageTrend = [320, 280, 410, 390, 450, 480, 520, 610, 590, 640, 700, 720];
  const maxUsage = Math.max(...usageTrend);

  const consoleLog = [
    { ts: "14:22:01", type: "info", msg: "Talent match query · 12 results" },
    { ts: "14:21:47", type: "success", msg: "Bio generation complete · 142 tokens" },
    { ts: "14:20:33", type: "warn", msg: "Rate limit 80% reached on Anthropic" },
    { ts: "14:18:11", type: "info", msg: "Image caption batch · 8 images" },
  ];

  const logColor = (t: string) => t === "success" ? COLORS.success : t === "warn" ? COLORS.amber : t === "error" ? COLORS.coral : COLORS.indigo;

  const footer = (
    <div className="flex gap-2">
      <GhostButton onClick={closeDrawer}>Close</GhostButton>
      <SecondaryButton onClick={() => { toast("AI settings saved"); closeDrawer(); }}>Save settings</SecondaryButton>
    </div>
  );

  return (
    <DrawerShell open={open} onClose={closeDrawer} title="AI workspace" description="Manage AI providers, usage controls, and the prompt console." footer={footer} defaultSize="half">
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>

        <div className="flex gap-1">
          {(["providers", "usage", "console"] as const).map(tab => (
            <div key={tab} onClick={() => setActiveTab(tab)} style={{
              flex: 1, padding: "7px 12px", borderRadius: RADIUS.sm, cursor: "pointer", textAlign: "center", fontSize: 12, fontWeight: 600, textTransform: "capitalize",
              background: activeTab === tab ? COLORS.royal : COLORS.surface,
              color: activeTab === tab ? "#fff" : COLORS.inkMuted,
              border: `1px solid ${activeTab === tab ? COLORS.royal : COLORS.border}`,
            }}>
              {tab}
            </div>
          ))}
        </div>

        {activeTab === "providers" && (
          <div className="flex flex-col gap-2">
            {providers.map((p, i) => (
              <div key={i} style={{ padding: "12px 14px", background: COLORS.surface, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }} className="text-admin-ink">{p.name}</div>
                    <div style={{ fontSize: 11, fontFamily: "monospace", marginTop: 1 }} className="text-admin-ink-muted">{p.model}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "capitalize", color: p.status === "active" ? COLORS.success : COLORS.inkDim, background: p.status === "active" ? COLORS.successSoft : COLORS.borderSoft, padding: "2px 8px" }} className="rounded-admin-sm">
                    {p.status}
                  </span>
                </div>
                <div className="flex gap-4">
                  <div>
                    <div style={{ fontSize: 10 }} className="text-admin-ink-dim">Calls this month</div>
                    <div style={{ fontSize: 13, fontWeight: 700 }} className="text-admin-ink">{p.calls.toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10 }} className="text-admin-ink-dim">Cost this month</div>
                    <div style={{ fontSize: 13, fontWeight: 700 }} className="text-admin-ink">{p.cost}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "usage" && (
          <div className="flex flex-col gap-4">
            <div>
              <CapsLabel>API calls — last 12 days</CapsLabel>
              <div style={{ marginTop: 12, display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
                {usageTrend.map((v, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <div style={{ width: "100%", background: COLORS.royal, borderRadius: "2px 2px 0 0", height: `${(v / maxUsage) * 64}px`, opacity: 0.7 + (i / usageTrend.length) * 0.3 }} />
                    <div style={{ fontSize: 8.5 }} className="text-admin-ink-dim">{i + 1}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "Total calls", value: "2,159" },
                { label: "Total cost", value: "£32.30" },
                { label: "Avg/day", value: "180" },
              ].map(stat => (
                <div key={stat.label} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm, padding: "10px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800 }} className="text-admin-royal">{stat.value}</div>
                  <div style={{ fontSize: 10, marginTop: 2 }} className="text-admin-ink-muted">{stat.label}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <CapsLabel>Controls</CapsLabel>
              {[
                { label: "Enable AI-generated bios", key: "bios" },
                { label: "AI talent match suggestions", key: "match" },
                { label: "Smart reply drafts", key: "reply" },
                { label: "Auto-tag uploaded images", key: "tags" },
              ].map(item => (
                <div key={item.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: COLORS.surface, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}` }}>
                  <span style={{ fontSize: 12 }} className="text-admin-ink">{item.label}</span>
                  <Toggle on={true} onChange={() => toast(`${item.label} toggled`)} />
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "console" && (
          <div className="flex flex-col gap-3">
            <div style={{ background: "#0f1117", padding: 14, display: "flex", flexDirection: "column", gap: 6, minHeight: 160 }} className="rounded-admin-md">
              {consoleLog.map((entry, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                  <span style={{ fontSize: 10, color: "#666", fontFamily: "monospace", flexShrink: 0 }}>{entry.ts}</span>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: logColor(entry.type), flexShrink: 0, marginTop: 3 }} />
                  <span style={{ fontSize: 11, color: "#ccc", fontFamily: "monospace" }}>{entry.msg}</span>
                </div>
              ))}
            </div>

            <FieldRow label="Prompt test">
              <TextArea value={consoleInput} onChange={(e) => setConsoleInput(e.target.value)} placeholder="Enter a test prompt to send to the active provider…" rows={3} />
            </FieldRow>
            <SecondaryButton onClick={() => { toast("Prompt sent — check console for response"); setConsoleInput(""); }}>Run prompt</SecondaryButton>
          </div>
        )}
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Feature Controls — agency-admin on/off for every platform feature
// ════════════════════════════════════════════════════════════════════

