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
  Plan,
  RADIUS,
  SecondaryButton,
  TextInput,
  Toggle,
  downloadCsv,
  openSupportEmail,
  useAdminShell
} from "./drawer-shared";

// Phase 1d (remediation §4): 9 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function CrewBookingDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "crew-booking";
  // Honest stub — no backend yet; the previous body was hardcoded demo data.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Crew booking"
      description="Book crew and freelancers for a project."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="team"
        title="Coming soon"
        body="Crew booking isn't available yet."
      />
    </DrawerShell>
  );
}


export function ProductionTimelineDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "production-timeline";

  const events = [
    { time: "06:30", label: "Crew call", who: "Photographer, HMU", type: "crew" },
    { time: "07:00", label: "Studio open", who: "Studio One, Shoreditch", type: "location" },
    { time: "07:30", label: "HMU begins", who: "Amara Osei, Chiara Bianchi", type: "talent" },
    { time: "09:00", label: "First look — Editorial", who: "Look 1 of 4 · White backdrop", type: "shoot" },
    { time: "10:30", label: "Break", who: "15 min", type: "break" },
    { time: "10:45", label: "Second look — Product", who: "Look 2 of 4 · Seamless grey", type: "shoot" },
    { time: "12:00", label: "Lunch", who: "45 min", type: "break" },
    { time: "12:45", label: "Third & fourth looks", who: "Looks 3–4 · Location exterior", type: "shoot" },
    { time: "15:00", label: "Wrap", who: "Strike set · Return equipment", type: "crew" },
  ];

  const typeColor = (t: string) => t === "shoot" ? COLORS.accent : t === "talent" ? COLORS.indigo : t === "location" ? COLORS.success : t === "break" ? COLORS.amber : COLORS.inkMuted;

  const footer = (
    <div className="flex gap-2">
      <GhostButton onClick={closeDrawer}>Close</GhostButton>
      <SecondaryButton
        onClick={() => {
          downloadCsv("production-call-sheet.csv", events);
          toast("Downloaded call sheet CSV");
        }}
      >
        Export call sheet
      </SecondaryButton>
    </div>
  );

  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Production timeline" description="Call-sheet order of events for the shoot day." footer={footer} defaultSize="half">
      <div style={{ display: "flex", flexDirection: "column", gap: 0, fontFamily: FONTS.body }}>
        {events.map((ev, i) => (
          <div key={i} style={{ display: "flex", gap: 14, paddingBottom: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 48, flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, paddingTop: 10 }} className="text-admin-ink-muted">{ev.time}</div>
              {i < events.length - 1 && <div style={{ width: 2, flex: 1, background: COLORS.border, margin: "4px 0" }} />}
            </div>
            <div style={{ flex: 1, padding: "10px 0 12px 0", borderBottom: i < events.length - 1 ? `1px solid ${COLORS.borderSoft}` : "none" }}>
              <div className="flex items-center gap-2">
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: typeColor(ev.type), flexShrink: 0 }} />
                <span className="text-admin-ink text-admin-13 font-semibold">{ev.label}</span>
              </div>
              <div style={{ fontSize: 11, marginTop: 3, marginLeft: 16 }} className="text-admin-ink-muted">{ev.who}</div>
            </div>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-30 — Image rights & post-booking lifecycle
// ════════════════════════════════════════════════════════════════════


export function UsageTrackerDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "usage-tracker";
  // Honest stub — no backend yet; the previous body was hardcoded demo data.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Usage rights"
      description="Track usage-rights windows and expiry."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="calendar"
        title="Coming soon"
        body="Usage-rights tracking isn't available yet."
      />
    </DrawerShell>
  );
}


export function RelicenseFlowDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "relicense-flow";
  // Honest stub — no backend yet; the previous body was hardcoded demo data.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Re-license"
      description="Extend or renew usage rights."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="info"
        title="Coming soon"
        body="Re-licensing isn't available yet."
      />
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-31 — Account lifecycle
// ════════════════════════════════════════════════════════════════════


export function OwnershipTransferDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "ownership-transfer";
  // Honest stub — no backend yet; the previous body was hardcoded demo data.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Ownership transfer"
      description="Transfer workspace ownership."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="info"
        title="Coming soon"
        body="Self-serve ownership transfer isn't available yet — contact support to transfer a workspace."
      />
    </DrawerShell>
  );
}


export function MinorAccountDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "minor-account";
  // Honest stub — no backend yet; the previous body was hardcoded demo data.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Minor account"
      description="Guardian consent for under-18 talent."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="user"
        title="Coming soon"
        body="Guardian / minor-account records aren't available yet."
      />
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-32 — Discovery & marketplace
// ════════════════════════════════════════════════════════════════════


export function DiscoveryFeedDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "discovery-feed";
  const [view, setView] = React.useState<"trending" | "editorial">("trending");

  const trending = [
    { name: "Amara Osei", tags: ["commercial", "editorial"], bookings: 14, trend: "+3 this week" },
    { name: "Yuki Tanaka", tags: ["beauty", "luxury"], bookings: 11, trend: "+5 this week" },
    { name: "Marco Dias", tags: ["fitness", "sport"], bookings: 9, trend: "+2 this week" },
    { name: "Lena Voss", tags: ["fashion", "editorial"], bookings: 8, trend: "–1 this week" },
    { name: "Chiara Bianchi", tags: ["lifestyle", "commercial"], bookings: 7, trend: "+1 this week" },
  ];

  const editorial = [
    { title: "New faces: March 2026", talent: ["Amara Osei", "Lucas Dias"], type: "Spotlight" },
    { title: "Luxury beauty roster", talent: ["Yuki Tanaka", "Lena Voss"], type: "Curated" },
    { title: "Active & fitness", talent: ["Marco Dias", "Chiara Bianchi"], type: "Category" },
  ];

  const footer = (
    <div className="flex gap-2">
      <GhostButton onClick={closeDrawer}>Close</GhostButton>
    </div>
  );

  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Discovery feed" description="Trending talent and editorial picks for client browsing." footer={footer} defaultSize="half">
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>

        <div className="flex gap-1.5">
          {(["trending", "editorial"] as const).map(v => (
            <div key={v} onClick={() => setView(v)} style={{
              padding: "6px 16px", borderRadius: RADIUS.sm, cursor: "pointer", fontSize: 12, fontWeight: 600, textTransform: "capitalize",
              background: view === v ? COLORS.accent : COLORS.surface,
              color: view === v ? "#fff" : COLORS.inkMuted,
              border: `1px solid ${view === v ? COLORS.accent : COLORS.border}`,
            }}>
              {v}
            </div>
          ))}
        </div>

        {view === "trending" && (
          <div className="flex flex-col gap-1.5">
            {trending.map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: COLORS.surface, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}` }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0 }} className="bg-admin-accent">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-admin-ink text-admin-13 font-semibold">{t.name}</div>
                  <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
                    {t.tags.map(tag => (
                      <span key={tag} style={{ fontSize: 10, color: COLORS.inkMuted, background: COLORS.borderSoft, padding: "1px 6px", borderRadius: RADIUS.sm }}>{tag}</span>
                    ))}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div className="text-admin-ink text-admin-13 font-bold">{t.bookings}</div>
                  <div style={{ fontSize: 10, color: t.trend.startsWith("+") ? COLORS.success : COLORS.coral, marginTop: 1 }}>{t.trend}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {view === "editorial" && (
          <div className="flex flex-col gap-2">
            {editorial.map((e, i) => (
              <div key={i} style={{ padding: "14px 16px", background: COLORS.surface, borderRadius: RADIUS.md, border: `1px solid ${COLORS.border}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div className="text-admin-ink text-admin-13 font-bold">{e.title}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, background: `${COLORS.indigo}18`, padding: "2px 7px" }} className="text-admin-indigo rounded-admin-sm">{e.type}</span>
                </div>
                <div className="flex gap-1.5">
                  {e.talent.map(name => (
                    <div key={name} style={{ fontSize: 11, color: COLORS.inkMuted, background: COLORS.borderSoft, padding: "3px 8px", borderRadius: RADIUS.sm }}>{name}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DrawerShell>
  );
}


export function AvailSearchDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "avail-search";
  const [startDate, setStartDate] = React.useState("2026-05-20");
  const [endDate, setEndDate] = React.useState("2026-05-22");
  const [location, setLocation] = React.useState("London");
  const [searched, setSearched] = React.useState(false);

  const results = [
    { name: "Amara Osei", avail: "Full", type: "Commercial / Editorial", rate: "£2,400/day" },
    { name: "Chiara Bianchi", avail: "Partial", type: "Lifestyle", rate: "£1,200/day" },
    { name: "Yuki Tanaka", avail: "Full", type: "Beauty / Luxury", rate: "£1,800/day" },
  ];

  const footer = (
    <div className="flex gap-2">
      <GhostButton onClick={closeDrawer}>Cancel</GhostButton>
      <SecondaryButton onClick={() => { setSearched(true); toast("Availability checked"); }}>Search availability</SecondaryButton>
    </div>
  );

  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Availability search" description="Find talent available for a given date range and location." footer={footer} defaultSize="half">
      <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONTS.body }}>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <FieldRow label="From">
            <TextInput value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="YYYY-MM-DD" />
          </FieldRow>
          <FieldRow label="To">
            <TextInput value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="YYYY-MM-DD" />
          </FieldRow>
        </div>
        <FieldRow label="Location / region">
          <TextInput value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. London, Manchester" />
        </FieldRow>

        {searched && (
          <div className="flex flex-col gap-1.5">
            <CapsLabel>{results.length} talent available</CapsLabel>
            {results.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: COLORS.surface, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}` }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: COLORS.borderStrong, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span className="text-admin-ink-muted text-admin-11 font-bold">{r.name.split(" ").map(n => n[0]).join("")}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-admin-ink text-admin-13 font-semibold">{r.name}</div>
                  <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">{r.type}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div className="text-admin-ink text-xs font-bold">{r.rate}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: r.avail === "Full" ? COLORS.success : COLORS.amber, background: r.avail === "Full" ? COLORS.successSoft : `${COLORS.amber}18`, padding: "1px 6px" }} className="rounded-admin-sm">
                    {r.avail}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {!searched && (
          <div style={{ textAlign: "center", padding: "32px 16px", fontSize: 12 }} className="text-admin-ink-dim">
            Enter dates and location, then tap Search
          </div>
        )}
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-33 — On-set / production-day live
// ════════════════════════════════════════════════════════════════════


export function CallSheetDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "call-sheet";
  // Honest stub — no backend yet; the previous body was hardcoded demo data.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Call sheet"
      description="On-the-day crew, call times and status."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="calendar"
        title="Coming soon"
        body="Call sheets aren't available yet."
      />
    </DrawerShell>
  );
}

