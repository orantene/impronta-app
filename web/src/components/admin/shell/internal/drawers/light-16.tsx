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
  TextInput,
  Toggle,
  useAdminShell
} from "./drawer-shared";

// Phase 1d (remediation §4): 6 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function TopPerformersDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "top-performers";
  const [tab, setTab] = useState<"talent" | "clients">("talent");

  const TALENT_ROWS = [
    { name: "Marta Reyes",    bookings: 11, revenue: 28400, trend: "+18%" },
    { name: "Kai Lin",        bookings: 8,  revenue: 21000, trend: "+7%"  },
    { name: "Sofia Andrade",  bookings: 7,  revenue: 17600, trend: "+3%"  },
    { name: "Tomás Navarro",  bookings: 5,  revenue: 12200, trend: "−2%"  },
    { name: "Hana Matsumoto", bookings: 4,  revenue: 9800,  trend: "+11%" },
  ];
  const CLIENT_ROWS = [
    { name: "Vogue Italia",  bookings: 6, spend: 18200, trend: "+22%" },
    { name: "Bvlgari",       bookings: 4, spend: 14600, trend: "+5%"  },
    { name: "H&M Studio",    bookings: 5, spend: 11400, trend: "−8%"  },
    { name: "Zara Campaign", bookings: 3, spend: 9200,  trend: "+16%" },
    { name: "L'Oréal Paris", bookings: 2, spend: 7800,  trend: "0%"   },
  ];
  const maxRevenue = Math.max(...TALENT_ROWS.map((r) => r.revenue));
  const maxSpend   = Math.max(...CLIENT_ROWS.map((r) => r.spend));

  const trendColor = (t: string) =>
    t.startsWith("+") ? COLORS.successDeep : t === "0%" ? COLORS.inkMuted : COLORS.coral;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Top performers"
      description="Ranked by YTD revenue · last 12 months."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
      defaultSize="half"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>
        {/* Tab toggle */}
        <div style={{ display: "flex", gap: 4, padding: 3 }} className="bg-admin-surface-alt rounded-admin-md">
          {(["talent", "clients"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: "6px 12px",
                background: tab === t ? "#fff" : "transparent",
                border: `1px solid ${tab === t ? COLORS.border : "transparent"}`,
                borderRadius: RADIUS.sm,
                fontFamily: FONTS.body,
                fontSize: 12.5, fontWeight: tab === t ? 600 : 400,
                color: tab === t ? COLORS.ink : COLORS.inkMuted,
                cursor: "pointer",
                transition: TRANSITION.sm,
              }}
            >
              {t === "talent" ? "Talent" : "Clients"}
            </button>
          ))}
        </div>

        {/* Talent ranked rows */}
        {tab === "talent" && (
          <div className="flex flex-col gap-1.5">
            {TALENT_ROWS.map((row, i) => (
              <div
                key={row.name}
                style={{
                  padding: "12px 14px", background: COLORS.surfaceAlt,
                  borderRadius: RADIUS.md, border: `1px solid ${COLORS.borderSoft}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div className="flex items-center gap-2">
                    <span style={{
                      width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                      background: i === 0 ? COLORS.accent : COLORS.surfaceAlt,
                      border: `1px solid ${i === 0 ? COLORS.accent : COLORS.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 700,
                      color: i === 0 ? "#fff" : COLORS.inkMuted,
                    }}>
                      {i + 1}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600 }} className="text-admin-ink">{row.name}</span>
                  </div>
                  <div className="text-right">
                    <div style={{ fontSize: 13, fontWeight: 700 }} className="text-admin-ink">€{row.revenue.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: trendColor(row.trend) }}>{row.trend} YoY</div>
                  </div>
                </div>
                <div style={{ background: COLORS.border, borderRadius: 3, height: 4, overflow: "hidden" }}>
                  <div style={{ background: i === 0 ? COLORS.accent : COLORS.indigo, width: `${Math.round((row.revenue / maxRevenue) * 100)}%`, height: "100%", borderRadius: 3, }} />
                </div>
                <div style={{ fontSize: 11, marginTop: 4 }} className="text-admin-ink-muted">{row.bookings} bookings YTD</div>
              </div>
            ))}
          </div>
        )}

        {/* Client ranked rows */}
        {tab === "clients" && (
          <div className="flex flex-col gap-1.5">
            {CLIENT_ROWS.map((row, i) => (
              <div
                key={row.name}
                style={{
                  padding: "12px 14px", background: COLORS.surfaceAlt,
                  borderRadius: RADIUS.md, border: `1px solid ${COLORS.borderSoft}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div className="flex items-center gap-2">
                    <span style={{
                      width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                      background: i === 0 ? COLORS.indigo : COLORS.surfaceAlt,
                      border: `1px solid ${i === 0 ? COLORS.indigo : COLORS.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 700,
                      color: i === 0 ? "#fff" : COLORS.inkMuted,
                    }}>
                      {i + 1}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600 }} className="text-admin-ink">{row.name}</span>
                  </div>
                  <div className="text-right">
                    <div style={{ fontSize: 13, fontWeight: 700 }} className="text-admin-ink">€{row.spend.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: trendColor(row.trend) }}>{row.trend} YoY</div>
                  </div>
                </div>
                <div style={{ background: COLORS.border, borderRadius: 3, height: 4, overflow: "hidden" }}>
                  <div style={{ background: i === 0 ? COLORS.indigo : COLORS.accent, width: `${Math.round((row.spend / maxSpend) * 100)}%`, height: "100%", borderRadius: 3, }} />
                </div>
                <div style={{ fontSize: 11, marginTop: 4 }} className="text-admin-ink-muted">{row.bookings} bookings YTD</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DrawerShell>
  );
}


export function CoordinatorWorkloadDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "coordinator-workload";

  const COORDINATORS = [
    { name: "Oran Tene",     role: "Admin",       active: 6, messages: 38, avgReply: "1.2h", closed: 4, load: 85 },
    { name: "Sara Mendes",   role: "Coordinator", active: 4, messages: 22, avgReply: "2.4h", closed: 3, load: 62 },
    { name: "Luca Ferretti", role: "Coordinator", active: 3, messages: 17, avgReply: "4.1h", closed: 1, load: 44 },
    { name: "Alina Popescu", role: "Editor",      active: 1, messages: 9,  avgReply: "3.8h", closed: 2, load: 22 },
  ];
  const totalActive   = COORDINATORS.reduce((s, c) => s + c.active, 0);
  const totalMessages = COORDINATORS.reduce((s, c) => s + c.messages, 0);

  const loadColor = (load: number) =>
    load >= 80 ? COLORS.coral : load >= 50 ? COLORS.amber : COLORS.success;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Coordinator workload"
      description="Active inquiry load per team member. Updated every 15 minutes."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
      defaultSize="half"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>
        {/* Summary tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            { label: "Team members",     value: String(COORDINATORS.length) },
            { label: "Total active",     value: String(totalActive) },
            { label: "Messages this wk", value: String(totalMessages) },
          ].map((tile) => (
            <div
              key={tile.label}
              style={{
                background: COLORS.surfaceAlt, borderRadius: RADIUS.lg,
                padding: "12px 14px", border: `1px solid ${COLORS.border}`,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }} className="text-admin-ink-muted">
                {tile.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800 }} className="text-admin-ink">{tile.value}</div>
            </div>
          ))}
        </div>

        {/* Per-coordinator rows */}
        <div>
          <CapsLabel>Per-coordinator breakdown</CapsLabel>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            {COORDINATORS.map((coord) => {
              const color = loadColor(coord.load);
              return (
                <div
                  key={coord.name}
                  style={{
                    padding: "14px 16px", background: COLORS.surfaceAlt,
                    borderRadius: RADIUS.lg, border: `1px solid ${COLORS.borderSoft}`,
                  }}
                >
                  {/* Header row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }} className="text-admin-ink">{coord.name}</div>
                      <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">{coord.role}</div>
                    </div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: color, background: `${color}1A`, padding: "3px 8px" }} className="rounded-admin-sm">
                      {coord.load}% load
                    </div>
                  </div>

                  {/* Load bar */}
                  <div style={{ background: COLORS.border, borderRadius: 4, height: 6, marginBottom: 10, overflow: "hidden" }}>
                    <div style={{
                      width: `${coord.load}%`, height: "100%",
                      borderRadius: 4, background: color,
                      transition: TRANSITION.layout,
                    }} />
                  </div>

                  {/* Stat row */}
                  <div className="flex gap-5">
                    {[
                      { label: "Active",    value: String(coord.active) },
                      { label: "Messages",  value: String(coord.messages) },
                      { label: "Avg reply", value: coord.avgReply },
                      { label: "Closed wk", value: String(coord.closed) },
                    ].map((stat) => (
                      <div key={stat.label}>
                        <div style={{ fontSize: 10, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          {stat.label}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }} className="text-admin-ink">
                          {stat.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-20 — Operations & workflow automation drawers
// ════════════════════════════════════════════════════════════════════


export function MyQueueDrawer() {
  const { state, closeDrawer, openDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "my-queue";

  type QueueItem = {
    id: string;
    client: string;
    talent: string;
    stage: string;
    slaLabel: string;
    slaUrgent: boolean;
    age: string;
  };
  const QUEUE: QueueItem[] = [
    { id: "RI-201", client: "Vogue Italia",  talent: "Marta Reyes",   stage: "Awaiting client", slaLabel: "Due in 2h",  slaUrgent: true,  age: "4d" },
    { id: "RI-203", client: "Bvlgari",       talent: "Kai Lin",       stage: "Offer draft",     slaLabel: "Due in 6h",  slaUrgent: true,  age: "1d" },
    { id: "RI-205", client: "H&M Studio",    talent: "Sofia Andrade", stage: "Negotiating",     slaLabel: "On track",   slaUrgent: false, age: "2d" },
    { id: "RI-207", client: "Zara Campaign", talent: "Tomás Navarro", stage: "Hold requested",  slaLabel: "Due in 12h", slaUrgent: false, age: "3d" },
    { id: "RI-209", client: "L'Oréal Paris", talent: "Hana Matsumoto",stage: "First contact",   slaLabel: "On track",   slaUrgent: false, age: "6h" },
  ];
  const urgent = QUEUE.filter((q) => q.slaUrgent);

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="My queue"
      description="Your assigned inquiries sorted by SLA urgency. Tap any row to open the workspace."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
      defaultSize="half"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>
        {/* Summary */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            { label: "Assigned to me", value: String(QUEUE.length) },
            { label: "SLA at risk",    value: String(urgent.length), warn: true },
            { label: "Avg age",        value: "2.4d" },
          ].map((tile) => (
            <div key={tile.label} style={{
              background: COLORS.surfaceAlt, borderRadius: RADIUS.lg,
              padding: "12px 14px", border: `1px solid ${COLORS.border}`,
              textAlign: "center",
            }}>
              <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }} className="text-admin-ink-muted">
                {tile.label}
              </div>
              <div style={{
                fontSize: 22, fontWeight: 800,
                color: (tile as { warn?: boolean }).warn && urgent.length > 0 ? COLORS.coral : COLORS.ink,
              }}>
                {tile.value}
              </div>
            </div>
          ))}
        </div>

        {/* Queue rows */}
        <div>
          <CapsLabel>Inquiries · sorted by urgency</CapsLabel>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {QUEUE.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => { closeDrawer(); openDrawer("inquiry-workspace", { inquiryId: item.id, pov: "admin" }); }}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "12px 14px", background: COLORS.surfaceAlt,
                  borderRadius: RADIUS.md,
                  border: `1px solid ${item.slaUrgent ? COLORS.coral + "55" : COLORS.borderSoft}`,
                  cursor: "pointer", transition: TRANSITION.sm,
                  fontFamily: FONTS.body,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <div className="flex items-center gap-1.5">
                    <span style={{ fontSize: 10.5, fontWeight: 700 }} className="text-admin-ink-muted">{item.id}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }} className="text-admin-ink">{item.client}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: item.slaUrgent ? COLORS.coral : COLORS.inkMuted, background: item.slaUrgent ? COLORS.coralSoft : COLORS.surfaceAlt, padding: "2px 7px" }} className="rounded-admin-sm">
                    {item.slaLabel}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 10, fontSize: 11.5 }} className="text-admin-ink-muted">
                  <span>{item.talent}</span>
                  <span>·</span>
                  <span>{item.stage}</span>
                  <span>·</span>
                  <span>{item.age} old</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </DrawerShell>
  );
}


export function SlaTimersDrawer() {
  const { state, closeDrawer, openDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "sla-timers";

  type SlaRow = { id: string; client: string; stage: string; hoursLeft: number; assignee: string };
  const ROWS: SlaRow[] = [
    { id: "RI-201", client: "Vogue Italia",  stage: "Awaiting client reply",    hoursLeft: 2,  assignee: "Oran" },
    { id: "RI-203", client: "Bvlgari",       stage: "Offer draft overdue",      hoursLeft: 0,  assignee: "Oran" },
    { id: "RI-207", client: "Zara Campaign", stage: "Hold confirmation pending", hoursLeft: 12, assignee: "Sara" },
    { id: "RI-210", client: "Chanel",        stage: "Initial response due",      hoursLeft: 18, assignee: "Luca" },
    { id: "RI-212", client: "Prada",         stage: "Negotiation follow-up",    hoursLeft: 36, assignee: "Sara" },
  ];

  const breached   = ROWS.filter((r) => r.hoursLeft === 0);
  const critical   = ROWS.filter((r) => r.hoursLeft > 0 && r.hoursLeft <= 6);
  const onTrack    = ROWS.filter((r) => r.hoursLeft > 6);

  const slaTone = (h: number): string =>
    h === 0 ? COLORS.red : h <= 6 ? COLORS.coral : h <= 24 ? COLORS.amber : COLORS.success;

  const slaLabel = (h: number): string =>
    h === 0 ? "Breached" : h < 1 ? "<1h left" : `${h}h left`;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="SLA timers"
      description="Response deadline tracker across all active inquiries. Auto-escalates at breach."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
      defaultSize="half"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>
        {/* Summary strip */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            { label: "Breached",  value: String(breached.length),  color: breached.length > 0 ? COLORS.red : COLORS.ink },
            { label: "At risk",   value: String(critical.length),  color: critical.length > 0 ? COLORS.coral : COLORS.ink },
            { label: "On track",  value: String(onTrack.length),   color: COLORS.successDeep },
          ].map((tile) => (
            <div key={tile.label} style={{
              background: COLORS.surfaceAlt, borderRadius: RADIUS.lg,
              padding: "12px 14px", border: `1px solid ${COLORS.border}`,
              textAlign: "center",
            }}>
              <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }} className="text-admin-ink-muted">
                {tile.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: tile.color }}>{tile.value}</div>
            </div>
          ))}
        </div>

        {/* SLA rows */}
        <div>
          <CapsLabel>Active SLA timers</CapsLabel>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
            {ROWS.map((row) => {
              const tone = slaTone(row.hoursLeft);
              const pct = row.hoursLeft === 0 ? 100
                : row.hoursLeft <= 6  ? Math.round(((6 - row.hoursLeft) / 6) * 60) + 40
                : Math.round((1 - Math.min(row.hoursLeft, 48) / 48) * 40);
              return (
                <div
                  key={row.id}
                  style={{
                    padding: "12px 14px", background: COLORS.surfaceAlt,
                    borderRadius: RADIUS.md,
                    border: `1px solid ${row.hoursLeft === 0 ? COLORS.red + "44" : COLORS.borderSoft}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div>
                      <span style={{ fontSize: 10.5, fontWeight: 700, marginRight: 6 }} className="text-admin-ink-muted">{row.id}</span>
                      <span style={{ fontSize: 13, fontWeight: 600 }} className="text-admin-ink">{row.client}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: tone }}>{slaLabel(row.hoursLeft)}</span>
                  </div>
                  {/* Timer bar */}
                  <div style={{ background: COLORS.border, borderRadius: 3, height: 4, overflow: "hidden", marginBottom: 6 }}>
                    <div style={{ background: tone, width: `${pct}%`, height: "100%", borderRadius: 3, transition: TRANSITION.layout }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }} className="text-admin-ink-muted">
                    <span>{row.stage}</span>
                    <span>{row.assignee}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </DrawerShell>
  );
}


export function RulesBuilderDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "rules-builder";
  const [showNew, setShowNew] = useState(false);

  type Rule = { id: string; name: string; trigger: string; action: string; active: boolean };
  const [rules, setRules] = useState<Rule[]>([
    { id: "r1", name: "Auto-assign new inquiries",   trigger: "Inquiry created",            action: "Assign to Oran Tene",               active: true  },
    { id: "r2", name: "Escalate stale offers",       trigger: "Offer unseen > 48h",         action: "Notify admin + flag as urgent",     active: true  },
    { id: "r3", name: "Archive expired inquiries",   trigger: "Inquiry stage = expired",    action: "Move to archived + close thread",   active: true  },
    { id: "r4", name: "Welcome message on inquiry",  trigger: "New inquiry from new client", action: "Send saved reply: 'Client welcome'",active: false },
  ]);

  const TRIGGER_OPTIONS = [
    "Inquiry created", "Offer sent", "Offer unseen > 48h", "Booking confirmed",
    "Inquiry stage = expired", "New inquiry from new client", "Payment received",
  ];
  const ACTION_OPTIONS = [
    "Assign to coordinator", "Notify admin", "Send saved reply", "Flag as urgent",
    "Move to archived", "Add tag", "Send webhook",
  ];
  const [newTrigger, setNewTrigger] = useState(TRIGGER_OPTIONS[0]);
  const [newAction,  setNewAction]  = useState(ACTION_OPTIONS[0]);
  const [newName,    setNewName]    = useState("");

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Automation rules"
      description="Trigger-action rules that run automatically. Changes apply within 60 seconds."
      footer={
        <div className="flex gap-2">
          <SecondaryButton onClick={closeDrawer}>Done</SecondaryButton>
          <GhostButton onClick={() => setShowNew(true)}>+ New rule</GhostButton>
        </div>
      }
      defaultSize="half"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>
        {/* New rule form */}
        {showNew && (
          <div style={{ padding: "14px 16px", border: `1px solid rgba(95,75,139,0.2)`, display: "flex", flexDirection: "column", gap: 10 }} className="bg-admin-royal-soft rounded-admin-lg">
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 2 }} className="text-admin-royal-deep">New rule</div>
            <FieldRow label="Rule name">
              <TextInput
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Auto-archive stale drafts"
              />
            </FieldRow>
            <FieldRow label="When">
              <select
                value={newTrigger}
                onChange={(e) => setNewTrigger(e.target.value)}
                style={{
                  fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink,
                  background: "#fff", border: `1px solid ${COLORS.border}`,
                  borderRadius: RADIUS.sm, padding: "7px 10px", width: "100%",
                }}
              >
                {TRIGGER_OPTIONS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </FieldRow>
            <FieldRow label="Then">
              <select
                value={newAction}
                onChange={(e) => setNewAction(e.target.value)}
                style={{
                  fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink,
                  background: "#fff", border: `1px solid ${COLORS.border}`,
                  borderRadius: RADIUS.sm, padding: "7px 10px", width: "100%",
                }}
              >
                {ACTION_OPTIONS.map((a) => <option key={a}>{a}</option>)}
              </select>
            </FieldRow>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!newName.trim()) { toast("Give the rule a name"); return; }
                  setRules((prev) => [...prev, { id: `r${Date.now()}`, name: newName.trim(), trigger: newTrigger, action: newAction, active: true }]);
                  setNewName("");
                  setShowNew(false);
                  toast("Rule created");
                }}
                style={{
                  padding: "8px 16px", background: COLORS.fill, border: "none",
                  borderRadius: RADIUS.sm, color: "#fff", fontFamily: FONTS.body,
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowNew(false)}
                style={{
                  padding: "8px 14px", background: "transparent",
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: RADIUS.sm, color: COLORS.inkMuted, fontFamily: FONTS.body,
                  fontSize: 13, cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Rule list */}
        <div>
          <CapsLabel>{rules.length} rules configured</CapsLabel>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {rules.map((rule) => (
              <div
                key={rule.id}
                style={{
                  padding: "12px 14px", background: COLORS.surfaceAlt,
                  borderRadius: RADIUS.md, border: `1px solid ${COLORS.borderSoft}`,
                  display: "flex", alignItems: "flex-start", gap: 12,
                }}
              >
                <Toggle
                  on={rule.active}
                  onChange={(v) => setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, active: v } : r))}
                />
                <div className="flex-1">
                  <div style={{ fontSize: 13, fontWeight: 600, color: rule.active ? COLORS.ink : COLORS.inkMuted }}>{rule.name}</div>
                  <div style={{ fontSize: 11.5, marginTop: 3 }} className="text-admin-ink-muted">
                    <span className="font-medium">When</span> {rule.trigger} → <span className="font-medium">then</span> {rule.action}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setRules((prev) => prev.filter((r) => r.id !== rule.id)); toast("Rule deleted"); }}
                  style={{ background: "transparent", border: "none", color: COLORS.inkDim, cursor: "pointer", padding: 0, lineHeight: 0 }}
                  aria-label="Delete rule"
                >
                  <Icon name="x" size={14} stroke={1.8} color={COLORS.inkDim} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Info note */}
        <div style={{ padding: "10px 14px", border: `1px solid rgba(91,107,160,0.2)`, fontSize: 12, lineHeight: 1.5 }} className="bg-admin-indigo-soft rounded-admin-md text-admin-indigo-deep">
          Rules run in order. Toggle off to pause without deleting. Webhooks require an endpoint configured in Settings → Integrations.
        </div>
      </div>
    </DrawerShell>
  );
}


export function SavedRepliesDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "saved-replies";
  const [search, setSearch] = useState("");

  type Reply = { id: string; name: string; body: string; category: string };
  const REPLIES: Reply[] = [
    { id: "sr1", name: "Client welcome",    category: "Onboarding",    body: "Hi {{client_name}}, thank you for reaching out to {{agency_name}}. We've received your inquiry and will get back to you with availability and rates within 24 hours." },
    { id: "sr2", name: "Hold confirmation", category: "Scheduling",    body: "We've placed a hold on {{talent_name}}'s calendar for {{dates}}. Please confirm within 48 hours to secure the booking." },
    { id: "sr3", name: "Rate negotiation",  category: "Commercial",    body: "Thank you for the brief. Our rate for this type of project typically starts at {{rate}}. Happy to discuss based on usage and exclusivity requirements." },
    { id: "sr4", name: "Booking confirmed", category: "Confirmation",  body: "Great news — {{talent_name}} is confirmed for {{project}}. You'll receive the contract shortly. Please let us know if you have any questions." },
    { id: "sr5", name: "Counter-offer",     category: "Commercial",    body: "Thank you for your offer. After reviewing the brief, we're proposing {{counter_rate}} to reflect {{reason}}. Let us know if that works." },
    { id: "sr6", name: "Follow-up",         category: "Chase",         body: "Just following up on our previous message regarding {{project}}. Please let us know if you need any additional information to proceed." },
  ];
  const [copied, setCopied] = useState<string | null>(null);
  const filtered = REPLIES.filter(
    (r) => search === "" || r.name.toLowerCase().includes(search.toLowerCase()) || r.category.toLowerCase().includes(search.toLowerCase()),
  );
  const categories = Array.from(new Set(REPLIES.map((r) => r.category)));

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Saved replies"
      description="Reusable message templates. Variables in {{brackets}} are filled at send time."
      footer={
        <div className="flex gap-2">
          <SecondaryButton onClick={closeDrawer}>Done</SecondaryButton>
        </div>
      }
      defaultSize="half"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
        {/* Search */}
        <TextInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search replies…"
        />

        {/* Grouped by category */}
        {categories.map((cat) => {
          const catReplies = filtered.filter((r) => r.category === cat);
          if (catReplies.length === 0) return null;
          return (
            <div key={cat}>
              <CapsLabel>{cat}</CapsLabel>
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                {catReplies.map((reply) => (
                  <div
                    key={reply.id}
                    style={{
                      padding: "12px 14px", background: COLORS.surfaceAlt,
                      borderRadius: RADIUS.md, border: `1px solid ${COLORS.borderSoft}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }} className="text-admin-ink">{reply.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setCopied(reply.id);
                          toast(`Copied "${reply.name}"`);
                          setTimeout(() => setCopied(null), 1500);
                        }}
                        style={{
                          fontSize: 11.5, fontWeight: 600,
                          color: copied === reply.id ? COLORS.successDeep : COLORS.accent,
                          background: "transparent", border: "none", cursor: "pointer",
                          fontFamily: FONTS.body,
                        }}
                      >
                        {copied === reply.id ? "Copied ✓" : "Copy"}
                      </button>
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.5, maxHeight: 44, overflow: "hidden" }} className="text-admin-ink-muted">
                      {reply.body.slice(0, 120)}{reply.body.length > 120 ? "…" : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <EmptyState
            icon="mail"
            title="No replies found"
            body="Try a different search term."
            compact
          />
        )}
      </div>
    </DrawerShell>
  );
}

