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
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "onset-checkin";
  // Honest stub — no backend yet; the previous body was hardcoded demo data.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="On-set check-in"
      description="Confirm who's arrived on set."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="team"
        title="Coming soon"
        body="On-set check-in isn't available yet."
      />
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-34 — Safety, disputes, incident handling
// ════════════════════════════════════════════════════════════════════


export function IncidentReportDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "incident-report";
  // Honest stub — no backend yet; the previous body was hardcoded demo data.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Incident report"
      description="Report an on-set or platform incident."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="info"
        title="Coming soon"
        body="Incident reporting isn't available yet."
      />
    </DrawerShell>
  );
}


export function DisputeResolutionDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "dispute-resolution";
  // Honest stub — no backend yet; the previous body was hardcoded demo data.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Dispute resolution"
      description="Track and resolve booking disputes."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="info"
        title="Coming soon"
        body="Dispute resolution isn't available yet."
      />
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
                        <span className="text-admin-ink text-admin-13 font-bold">{loc.name}</span>
                        <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "capitalize", color: typeColor(loc.type), background: `${typeColor(loc.type)}18`, padding: "1px 6px" }} className="rounded-admin-sm">{loc.type}</span>
                      </div>
                      <div style={{ fontSize: 11, marginTop: 2 }} className="text-admin-ink-muted">{loc.address}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                      <div className="text-admin-ink text-admin-13 font-bold">{loc.bookings}</div>
                      <div className="text-admin-ink-muted text-admin-10">bookings</div>
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
                    <div className="text-admin-ink text-admin-13 font-bold">{p.name}</div>
                    <div style={{ fontSize: 11, fontFamily: "monospace", marginTop: 1 }} className="text-admin-ink-muted">{p.model}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "capitalize", color: p.status === "active" ? COLORS.success : COLORS.inkDim, background: p.status === "active" ? COLORS.successSoft : COLORS.borderSoft, padding: "2px 8px" }} className="rounded-admin-sm">
                    {p.status}
                  </span>
                </div>
                <div className="flex gap-4">
                  <div>
                    <div className="text-admin-ink-dim text-admin-10">Calls this month</div>
                    <div className="text-admin-ink text-admin-13 font-bold">{p.calls.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-admin-ink-dim text-admin-10">Cost this month</div>
                    <div className="text-admin-ink text-admin-13 font-bold">{p.cost}</div>
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
                  <div className="text-admin-royal text-lg font-extrabold">{stat.value}</div>
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
                  <span className="text-admin-ink text-xs">{item.label}</span>
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

