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
  useAdminShell
} from "./drawer-shared";

// Phase 1d (remediation §4): 7 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function BriefBuilderDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "brief-builder";
  const [projectName, setProjectName] = useState("");
  const [category, setCategory] = useState("Editorial");
  const [dates, setDates] = useState("");
  const [deliverables, setDeliverables] = useState("");
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Brief builder"
      description="Structured brief for clients. Fill in scope, dates, and requirements — generates a clean PDF and pre-fills the inquiry form."
      footer={
        <div className="flex gap-2">
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <button
            type="button"
            onClick={() => { toast("Brief saved — pre-filling inquiry form"); closeDrawer(); }}
            style={{
              padding: "9px 18px", background: COLORS.fill, border: "none",
              borderRadius: RADIUS.md, color: "#fff", fontFamily: FONTS.body,
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            Save brief
          </button>
        </div>
      }
      defaultSize="half"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
        <FieldRow label="Project name">
          <TextInput value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. SS26 Campaign — Bvlgari" />
        </FieldRow>

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
            {["Editorial", "Commercial", "Runway", "Campaign", "E-commerce", "Event"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </FieldRow>

        <FieldRow label="Dates / timeline">
          <TextInput value={dates} onChange={(e) => setDates(e.target.value)} placeholder="e.g. May 14–16, 2026 · Milan" />
        </FieldRow>

        <FieldRow label="Budget (approx.)">
          <TextInput value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. €8,000 total · €2,000/talent" />
        </FieldRow>

        <FieldRow label="Deliverables">
          <TextArea
            value={deliverables}
            onChange={(e) => setDeliverables(e.target.value)}
            placeholder="2× full-day talent · 10–15 final images · usage: digital + print EU 12 months"
            rows={3}
          />
        </FieldRow>

        <FieldRow label="Additional notes">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Hair/makeup provided. Talent must be fluent in Italian. No prior exclusivity conflicts with competitor brands."
            rows={3}
          />
        </FieldRow>
      </div>
    </DrawerShell>
  );
}


export function BrandAssetsDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "brand-assets";
  const [filter, setFilter] = useState<"all" | "logo" | "photo" | "doc">("all");

  type Asset = { id: string; name: string; type: "logo" | "photo" | "doc"; size: string; date: string };
  const ASSETS: Asset[] = [
    { id: "a1", name: "Logo — primary (SVG)",      type: "logo",  size: "12 KB",   date: "Apr 10" },
    { id: "a2", name: "Logo — white on dark",      type: "logo",  size: "14 KB",   date: "Apr 10" },
    { id: "a3", name: "Logo — mark only",          type: "logo",  size: "8 KB",    date: "Apr 10" },
    { id: "a4", name: "Campaign — Spring 2026",    type: "photo", size: "4.2 MB",  date: "Mar 28" },
    { id: "a5", name: "HeroImage — homepage",      type: "photo", size: "2.8 MB",  date: "Apr 02" },
    { id: "a6", name: "Agency overview deck",      type: "doc",   size: "1.6 MB",  date: "Apr 15" },
    { id: "a7", name: "Rate card template",        type: "doc",   size: "45 KB",   date: "Apr 18" },
  ];

  const filtered = filter === "all" ? ASSETS : ASSETS.filter((a) => a.type === filter);
  const typeIcon = (t: Asset["type"]) =>
    t === "logo" ? "🖼️" : t === "photo" ? "📸" : "📄";

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Brand assets"
      description="Central library for logos, photography, and documents. Shared across all workspace surfaces."
      footer={
        <div className="flex gap-2">
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        </div>
      }
      defaultSize="half"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 4, padding: 3 }} className="bg-admin-surface-alt rounded-admin-md">
          {(["all", "logo", "photo", "doc"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                flex: 1, padding: "6px 10px",
                background: filter === f ? "#fff" : "transparent",
                border: `1px solid ${filter === f ? COLORS.border : "transparent"}`,
                borderRadius: RADIUS.sm, fontFamily: FONTS.body,
                fontSize: 12.5, fontWeight: filter === f ? 600 : 400,
                color: filter === f ? COLORS.ink : COLORS.inkMuted,
                cursor: "pointer", transition: TRANSITION.sm,
                textTransform: "capitalize",
              }}
            >
              {f === "all" ? "All" : f === "logo" ? "Logos" : f === "photo" ? "Photos" : "Docs"}
            </button>
          ))}
        </div>

        {/* Asset list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {filtered.map((asset) => (
            <div
              key={asset.id}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px", background: COLORS.surfaceAlt,
                borderRadius: RADIUS.md, border: `1px solid ${COLORS.borderSoft}`,
              }}
            >
              <span style={{ fontSize: 20, flexShrink: 0 }}>{typeIcon(asset.type)}</span>
              <div className="flex-1">
                <div className="text-admin-ink text-admin-13 font-semibold">{asset.name}</div>
                <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">{asset.size} · Added {asset.date}</div>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    // Asset.url isn't always available in this UI prototype; copy
                    // the canonical media URL pattern when present, otherwise the name.
                    const url = (asset as { url?: string }).url ?? asset.name;
                    void navigator.clipboard
                      .writeText(url)
                      .then(() => toast(`Copied link to "${asset.name}"`))
                      .catch(() => toast("Couldn't copy — copy manually"));
                  }}
                  style={{ background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm, padding: "4px 10px", fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, cursor: "pointer" }}
                >
                  Copy link
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DrawerShell>
  );
}


export function ApprovalFlowDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "approval-flow";

  type ApprovalItem = { id: string; title: string; requester: string; type: string; status: "pending" | "approved" | "rejected"; daysAgo: number };
  const [items, setItems] = useState<ApprovalItem[]>([
    { id: "ap1", title: "Bvlgari SS26 brief",         requester: "Lena Müller (Client)",    type: "Brief",    status: "pending",  daysAgo: 0 },
    { id: "ap2", title: "Offer v3 — Vogue Italia",    requester: "Sara Mendes (Coord)",     type: "Offer",    status: "pending",  daysAgo: 1 },
    { id: "ap3", title: "Rate card 2026",              requester: "Alina Popescu (Editor)",  type: "Document", status: "approved", daysAgo: 3 },
    { id: "ap4", title: "Campaign proposal — Chanel", requester: "Oran Tene (Admin)",       type: "Brief",    status: "rejected", daysAgo: 5 },
  ]);

  const pending  = items.filter((i) => i.status === "pending");
  const resolved = items.filter((i) => i.status !== "pending");

  const decide = (id: string, decision: "approved" | "rejected") => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, status: decision } : i));
    toast(decision === "approved" ? "Approved ✓" : "Rejected");
  };

  const statusColor = (s: ApprovalItem["status"]) =>
    s === "approved" ? COLORS.successDeep : s === "rejected" ? COLORS.red : COLORS.amber;
  const statusBg = (s: ApprovalItem["status"]) =>
    s === "approved" ? COLORS.successSoft : s === "rejected" ? COLORS.criticalSoft : COLORS.amberSoft;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Approval queue"
      description="Briefs, offers, and documents waiting for your sign-off."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
      defaultSize="half"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>
        {/* Summary */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            { label: "Pending",  value: String(pending.length),                                         color: COLORS.amber       },
            { label: "Approved", value: String(items.filter((i) => i.status === "approved").length),    color: COLORS.successDeep },
            { label: "Rejected", value: String(items.filter((i) => i.status === "rejected").length),    color: COLORS.red         },
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

        {pending.length > 0 && (
          <div>
            <CapsLabel>Needs your approval</CapsLabel>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {pending.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: "14px 16px", background: COLORS.surfaceAlt,
                    borderRadius: RADIUS.lg, border: `1px solid ${COLORS.amberSoft}`,
                  }}
                >
                  <div className="mb-2">
                    <div className="text-admin-ink text-admin-13 font-semibold">{item.title}</div>
                    <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
                      {item.type} · From {item.requester} · {item.daysAgo === 0 ? "Today" : `${item.daysAgo}d ago`}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => decide(item.id, "approved")}
                      style={{
                        flex: 1, padding: "7px", background: COLORS.successSoft,
                        border: `1px solid rgba(46,125,91,0.3)`, borderRadius: RADIUS.sm,
                        color: COLORS.successDeep, fontFamily: FONTS.body, fontSize: 12.5,
                        fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      Approve ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(item.id, "rejected")}
                      style={{
                        flex: 1, padding: "7px", background: COLORS.criticalSoft,
                        border: `1px solid rgba(176,48,58,0.2)`, borderRadius: RADIUS.sm,
                        color: COLORS.red, fontFamily: FONTS.body, fontSize: 12.5,
                        fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      Reject ✗
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {resolved.length > 0 && (
          <div>
            <CapsLabel>Resolved</CapsLabel>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
              {resolved.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", background: COLORS.surfaceAlt,
                    borderRadius: RADIUS.md, border: `1px solid ${COLORS.borderSoft}`,
                  }}
                >
                  <div>
                    <div className="text-admin-ink-muted text-admin-13 font-semibold">{item.title}</div>
                    <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-dim">{item.type} · {item.daysAgo}d ago</div>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: statusColor(item.status), background: statusBg(item.status), padding: "2px 8px", textTransform: "capitalize" }} className="rounded-admin-sm">
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-27 — Site & page-builder management
// ════════════════════════════════════════════════════════════════════


export function SiteContextSwitcherDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "site-context-switcher";
  const [active, setActive] = React.useState<string>("agency");

  const contexts = [
    { id: "agency", label: "Agency HQ", url: "tulala.digital", kind: "Agency site", pages: 12, lastEdit: "2h ago", status: "live" },
    { id: "talent", label: "Model roster", url: "roster.tulala.digital", kind: "Talent hub", pages: 8, lastEdit: "1d ago", status: "live" },
    { id: "client", label: "Client portal", url: "app.tulala.digital", kind: "Client portal", pages: 5, lastEdit: "3d ago", status: "live" },
    { id: "casting", label: "Open casting", url: "casting.tulala.digital", kind: "Campaign page", pages: 3, lastEdit: "5d ago", status: "draft" },
  ] as const;

  const current = contexts.find(c => c.id === active)!;

  const footer = (
    <div className="flex gap-2">
      <GhostButton onClick={closeDrawer}>Close</GhostButton>
      <SecondaryButton onClick={() => { toast("Switched context"); closeDrawer(); }}>Open editor</SecondaryButton>
    </div>
  );

  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Site context" description="Switch between your managed web properties." footer={footer} defaultSize="half">
      <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONTS.body }}>
        <div className="flex flex-col gap-1.5">
          {contexts.map(ctx => (
            <div
              key={ctx.id}
              onClick={() => setActive(ctx.id)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 14px", borderRadius: RADIUS.md, cursor: "pointer",
                border: `1.5px solid ${active === ctx.id ? COLORS.accent : COLORS.border}`,
                background: active === ctx.id ? COLORS.accentSoft : COLORS.surface,
                transition: TRANSITION.sm,
              }}
            >
              <div className="flex items-center gap-3">
                <div style={{ width: 36, height: 36, background: active === ctx.id ? COLORS.accent : COLORS.borderStrong, display: "flex", alignItems: "center", justifyContent: "center" }} className="rounded-admin-sm">
                  <Icon name="globe" size={16} color={active === ctx.id ? "#fff" : COLORS.inkMuted} />
                </div>
                <div>
                  <div className="text-admin-ink text-admin-13 font-semibold">{ctx.label}</div>
                  <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">{ctx.url}</div>
                </div>
              </div>
              <div className="text-right">
                <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: ctx.status === "live" ? COLORS.success : COLORS.amber, background: ctx.status === "live" ? COLORS.successSoft : `${COLORS.amber}18`, padding: "2px 7px" }} className="rounded-admin-sm">
                  {ctx.status}
                </span>
                <div style={{ fontSize: 10, marginTop: 3 }} className="text-admin-ink-dim">{ctx.pages} pages · {ctx.lastEdit}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ border: `1px solid ${COLORS.border}`, padding: 16 }} className="bg-admin-surface rounded-admin-md">
          <CapsLabel>Selected: {current.label}</CapsLabel>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Type", value: current.kind },
              { label: "Domain", value: current.url },
              { label: "Pages", value: String(current.pages) },
              { label: "Last edit", value: current.lastEdit },
            ].map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="text-admin-ink-muted text-xs">{row.label}</span>
                <span className="text-admin-ink text-xs font-semibold">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DrawerShell>
  );
}


export function PageSchedulerDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "page-scheduler";
  const [publishDate, setPublishDate] = React.useState("2026-05-15");
  const [publishTime, setPublishTime] = React.useState("09:00");
  const [unpublishDate, setUnpublishDate] = React.useState("");
  const [timezone, setTimezone] = React.useState("Europe/London");

  const scheduled = [
    { title: "Spring campaign landing", action: "Publish", when: "15 May · 09:00", status: "pending" },
    { title: "Winter roster archive", action: "Unpublish", when: "30 Apr · 23:59", status: "pending" },
    { title: "Awards 2025 recap", action: "Publish", when: "20 Apr · 10:00", status: "published" },
  ];

  const footer = (
    <div className="flex gap-2">
      <GhostButton onClick={closeDrawer}>Cancel</GhostButton>
      <SecondaryButton onClick={() => { toast("Schedule saved"); closeDrawer(); }}>Save schedule</SecondaryButton>
    </div>
  );

  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Page scheduler" description="Queue publish and unpublish events for any page." footer={footer} defaultSize="half">
      <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONTS.body }}>
        <div style={{ border: `1px solid ${COLORS.accent}`, padding: 14 }} className="bg-admin-accent-soft rounded-admin-md">
          <div className="text-admin-accent text-xs font-semibold">Scheduling: Spring campaign landing</div>
          <div style={{ fontSize: 11, marginTop: 2 }} className="text-admin-ink-muted">tulala.digital/spring-2026</div>
        </div>

        <div className="flex flex-col gap-3.5">
          <CapsLabel>Publish date & time</CapsLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <FieldRow label="Date">
              <TextInput value={publishDate} onChange={(e) => setPublishDate(e.target.value)} placeholder="YYYY-MM-DD" />
            </FieldRow>
            <FieldRow label="Time">
              <TextInput value={publishTime} onChange={(e) => setPublishTime(e.target.value)} placeholder="HH:MM" />
            </FieldRow>
          </div>
          <FieldRow label="Timezone">
            <TextInput value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="e.g. Europe/London" />
          </FieldRow>
        </div>

        <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <CapsLabel>Auto-unpublish (optional)</CapsLabel>
          <FieldRow label="Unpublish date">
            <TextInput value={unpublishDate} onChange={(e) => setUnpublishDate(e.target.value)} placeholder="YYYY-MM-DD (optional)" />
          </FieldRow>
        </div>

        <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 16 }}>
          <CapsLabel>Upcoming schedule</CapsLabel>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {scheduled.map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: COLORS.surface, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}` }}>
                <div>
                  <div className="text-admin-ink text-xs font-semibold">{item.title}</div>
                  <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">{item.action} · {item.when}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: item.status === "published" ? COLORS.success : COLORS.amber, background: item.status === "published" ? COLORS.successSoft : `${COLORS.amber}18`, padding: "2px 7px" }} className="rounded-admin-sm">
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-28 — Casting director
// ════════════════════════════════════════════════════════════════════


export function CastingFlowDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "casting-flow";
  const [castingType, setCastingType] = React.useState<"open" | "closed">("open");
  const [rounds, setRounds] = React.useState(2);
  const [roundCounts, setRoundCounts] = React.useState([50, 12]);

  const updateCount = (idx: number, val: number) => {
    const next = [...roundCounts];
    next[idx] = val;
    setRoundCounts(next);
  };

  const footer = (
    <div className="flex gap-2">
      <GhostButton onClick={closeDrawer}>Cancel</GhostButton>
      <SecondaryButton onClick={() => { toast("Casting flow saved"); closeDrawer(); }}>Save casting config</SecondaryButton>
    </div>
  );

  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Casting flow" description="Configure casting type, rounds, and throughput targets." footer={footer} defaultSize="half">
      <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONTS.body }}>

        <div>
          <CapsLabel>Casting type</CapsLabel>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {(["open", "closed"] as const).map(t => (
              <div
                key={t}
                onClick={() => setCastingType(t)}
                style={{
                  flex: 1, padding: "12px 16px", borderRadius: RADIUS.md, cursor: "pointer",
                  border: `1.5px solid ${castingType === t ? COLORS.accent : COLORS.border}`,
                  background: castingType === t ? COLORS.accentSoft : COLORS.surface,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: castingType === t ? COLORS.accent : COLORS.ink, textTransform: "capitalize" }}>{t}</div>
                <div style={{ fontSize: 11, marginTop: 3 }} className="text-admin-ink-muted">
                  {t === "open" ? "Anyone may submit" : "Invite-only applicants"}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <CapsLabel>Rounds ({rounds})</CapsLabel>
            <div className="flex gap-1.5">
              <GhostButton onClick={() => { if (rounds > 1) { setRounds(r => r - 1); setRoundCounts(rc => rc.slice(0, -1)); } }}>–</GhostButton>
              <GhostButton onClick={() => { if (rounds < 5) { setRounds(r => r + 1); setRoundCounts(rc => [...rc, 10]); } }}>+</GhostButton>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {Array.from({ length: rounds }, (_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: COLORS.surface, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}` }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} className="bg-admin-accent">
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{i + 1}</span>
                </div>
                <div className="flex-1">
                  <div className="text-admin-ink text-xs font-semibold">Round {i + 1}</div>
                  <div className="text-admin-ink-muted text-admin-11">
                    {i === 0 ? "Initial applications" : `Callbacks from round ${i}`}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-admin-ink-muted text-admin-11">Target:</span>
                  <GhostButton onClick={() => updateCount(i, Math.max(1, (roundCounts[i] || 10) - 5))}>–</GhostButton>
                  <span style={{ fontSize: 13, fontWeight: 700, minWidth: 28, textAlign: "center" }} className="text-admin-ink">{roundCounts[i] ?? 10}</span>
                  <GhostButton onClick={() => updateCount(i, (roundCounts[i] || 10) + 5)}>+</GhostButton>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 16 }}>
          <CapsLabel>Summary</CapsLabel>
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[
              { label: "Type", value: castingType === "open" ? "Open casting" : "Closed/invite" },
              { label: "Rounds", value: String(rounds) },
              { label: "Final spots", value: String(roundCounts[rounds - 1] ?? 10) },
            ].map(item => (
              <div key={item.label} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm, padding: "10px 12px", textAlign: "center" }}>
                <div className="text-admin-accent text-lg font-extrabold">{item.value}</div>
                <div style={{ fontSize: 10.5, marginTop: 2 }} className="text-admin-ink-muted">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DrawerShell>
  );
}


export function CallbackTrackerDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "callback-tracker";
  const [selectedRound, setSelectedRound] = React.useState(1);

  const talentByRound: Record<number, Array<{ name: string; status: "invited" | "confirmed" | "declined" | "pending"; notes: string }>> = {
    1: [
      { name: "Amara Osei", status: "confirmed", notes: "Strong presence, great range" },
      { name: "Lena Voss", status: "confirmed", notes: "Exactly the brief aesthetic" },
      { name: "Marco Dias", status: "pending", notes: "Awaiting availability check" },
      { name: "Yuki Tanaka", status: "declined", notes: "Schedule conflict" },
      { name: "Chiara Bianchi", status: "invited", notes: "" },
    ],
    2: [
      { name: "Amara Osei", status: "confirmed", notes: "Advance to final" },
      { name: "Lena Voss", status: "pending", notes: "" },
    ],
  };

  const statusColor = (s: string) => s === "confirmed" ? COLORS.success : s === "declined" ? COLORS.coral : s === "invited" ? COLORS.indigo : COLORS.amber;
  const statusBg = (s: string) => s === "confirmed" ? COLORS.successSoft : s === "declined" ? `${COLORS.coral}18` : s === "invited" ? `${COLORS.indigo}18` : `${COLORS.amber}18`;

  const footer = (
    <div className="flex gap-2">
      <GhostButton onClick={closeDrawer}>Close</GhostButton>
      <SecondaryButton onClick={() => { toast("Callbacks saved"); closeDrawer(); }}>Save callbacks</SecondaryButton>
    </div>
  );

  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Callback tracker" description="Track talent progress and feedback across casting rounds." footer={footer} defaultSize="half">
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>

        <div className="flex gap-1.5">
          {[1, 2].map(r => (
            <div
              key={r}
              onClick={() => setSelectedRound(r)}
              style={{
                padding: "6px 16px", borderRadius: RADIUS.sm, cursor: "pointer", fontSize: 12, fontWeight: 600,
                background: selectedRound === r ? COLORS.accent : COLORS.surface,
                color: selectedRound === r ? "#fff" : COLORS.inkMuted,
                border: `1px solid ${selectedRound === r ? COLORS.accent : COLORS.border}`,
              }}
            >
              Round {r}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          {(talentByRound[selectedRound] || []).map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: COLORS.surface, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}` }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: COLORS.borderStrong, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span className="text-admin-ink-muted text-admin-11 font-bold">{t.name.split(" ").map(n => n[0]).join("")}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-admin-ink text-admin-13 font-semibold">{t.name}</div>
                {t.notes && <div style={{ fontSize: 11, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-admin-ink-muted">{t.notes}</div>}
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "capitalize", color: statusColor(t.status), background: statusBg(t.status), padding: "2px 8px", flexShrink: 0 }} className="rounded-admin-sm">
                {t.status}
              </span>
            </div>
          ))}
        </div>

        <div style={{ border: `1px solid ${COLORS.border}`, padding: 14 }} className="bg-admin-surface rounded-admin-md">
          <CapsLabel>Round {selectedRound} summary</CapsLabel>
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {["confirmed", "pending", "invited", "declined"].map(s => {
              const count = (talentByRound[selectedRound] || []).filter(t => t.status === s).length;
              return (
                <div key={s} style={{ textAlign: "center", padding: "8px 4px", background: statusBg(s), borderRadius: RADIUS.sm }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: statusColor(s) }}>{count}</div>
                  <div style={{ fontSize: 10, color: statusColor(s), textTransform: "capitalize", marginTop: 1 }}>{s}</div>
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
// WS-29 — Production team & multi-discipline bookings
// ════════════════════════════════════════════════════════════════════

