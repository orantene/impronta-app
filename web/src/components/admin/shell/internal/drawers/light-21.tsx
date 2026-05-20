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
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "crew-booking";
  const [projectName, setProjectName] = React.useState("Spring Campaign 2026");
  const [shootDate, setShootDate] = React.useState("2026-05-20");

  const resources = [
    { role: "Lead talent", name: "Amara Osei", fee: "£2,400", status: "confirmed" },
    { role: "Photographer", name: "Lucas Ferreira", fee: "£800", status: "confirmed" },
    { role: "HMU artist", name: "Nia Clarkson", fee: "£350", status: "pending" },
    { role: "Stylist", name: "TBD", fee: "£400", status: "unfilled" },
    { role: "Studio hire", name: "Studio One, Shoreditch", fee: "£600", status: "confirmed" },
  ];

  const total = resources.reduce((acc, r) => {
    const num = parseInt(r.fee.replace(/[^0-9]/g, ""), 10);
    return acc + (isNaN(num) ? 0 : num);
  }, 0);

  const statusColor = (s: string) => s === "confirmed" ? COLORS.success : s === "unfilled" ? COLORS.coral : COLORS.amber;
  const statusBg = (s: string) => s === "confirmed" ? COLORS.successSoft : s === "unfilled" ? `${COLORS.coral}18` : `${COLORS.amber}18`;

  const footer = (
    <div className="flex gap-2">
      <GhostButton onClick={closeDrawer}>Cancel</GhostButton>
      <SecondaryButton onClick={() => { toast("Crew booking saved"); closeDrawer(); }}>Save booking</SecondaryButton>
    </div>
  );

  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Crew booking" description="Book talent, crew, and resources for a production day." footer={footer} defaultSize="half">
      <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONTS.body }}>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <FieldRow label="Project">
            <TextInput value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Project name" />
          </FieldRow>
          <FieldRow label="Shoot date">
            <TextInput value={shootDate} onChange={(e) => setShootDate(e.target.value)} placeholder="YYYY-MM-DD" />
          </FieldRow>
        </div>

        <div>
          <CapsLabel>Resources</CapsLabel>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {resources.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: COLORS.surface, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}` }}>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }} className="text-admin-ink-muted">{r.role}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: r.status === "unfilled" ? COLORS.inkDim : COLORS.ink, marginTop: 2 }}>{r.name}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, minWidth: 50, textAlign: "right" }} className="text-admin-ink">{r.fee}</div>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "capitalize", color: statusColor(r.status), background: statusBg(r.status), padding: "2px 8px" }} className="rounded-admin-sm">
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ border: `1px solid ${COLORS.border}`, padding: 14 }} className="bg-admin-surface rounded-admin-md">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="text-admin-ink-muted text-admin-13 font-semibold">Estimated total</span>
            <span className="text-admin-accent text-admin-22 font-extrabold">£{total.toLocaleString()}</span>
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            {["confirmed", "pending", "unfilled"].map(s => {
              const n = resources.filter(r => r.status === s).length;
              return (
                <div key={s} style={{ flex: 1, textAlign: "center", padding: "6px 4px", background: statusBg(s), borderRadius: RADIUS.sm }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: statusColor(s) }}>{n}</div>
                  <div style={{ fontSize: 10, color: statusColor(s), textTransform: "capitalize" }}>{s}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
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
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "usage-tracker";
  const [filter, setFilter] = React.useState<"all" | "active" | "expiring" | "expired">("all");

  const usages = [
    { talent: "Amara Osei", campaign: "Spring 2025", regions: "UK, EU", media: "Digital, OOH", expires: "2026-06-30", daysLeft: 63, status: "active" },
    { talent: "Lena Voss", campaign: "Winter 2024", regions: "Global", media: "Digital", expires: "2026-05-15", daysLeft: 17, status: "expiring" },
    { talent: "Marco Dias", campaign: "SS24 editorial", regions: "UK", media: "Print", expires: "2026-04-01", daysLeft: -27, status: "expired" },
    { talent: "Yuki Tanaka", campaign: "Awards 2025", regions: "UK, APAC", media: "Social, Digital", expires: "2027-01-01", daysLeft: 248, status: "active" },
  ];

  const filtered = filter === "all" ? usages : usages.filter(u => u.status === filter);

  const statusColor = (s: string) => s === "active" ? COLORS.success : s === "expiring" ? COLORS.amber : COLORS.coral;
  const statusBg = (s: string) => s === "active" ? COLORS.successSoft : s === "expiring" ? `${COLORS.amber}18` : `${COLORS.coral}18`;

  const footer = (
    <div className="flex gap-2">
      <GhostButton onClick={closeDrawer}>Close</GhostButton>
      <SecondaryButton
        onClick={() => {
          downloadCsv("usage-rights-report.csv", filtered);
          toast("Downloaded usage report CSV");
        }}
      >
        Export report
      </SecondaryButton>
    </div>
  );

  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Usage tracker" description="Monitor image rights and usage licence expiry across bookings." footer={footer} defaultSize="half">
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {[{ label: "Active", key: "active" as const }, { label: "Expiring soon", key: "expiring" as const }, { label: "Expired", key: "expired" as const }].map(tab => {
            const count = usages.filter(u => u.status === tab.key).length;
            return (
              <div
                key={tab.key}
                onClick={() => setFilter(f => f === tab.key ? "all" : tab.key)}
                style={{
                  padding: "10px 12px", borderRadius: RADIUS.md, cursor: "pointer", textAlign: "center",
                  border: `1.5px solid ${filter === tab.key ? statusColor(tab.key) : COLORS.border}`,
                  background: filter === tab.key ? statusBg(tab.key) : COLORS.surface,
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 800, color: statusColor(tab.key) }}>{count}</div>
                <div style={{ fontSize: 10.5, marginTop: 2 }} className="text-admin-ink-muted">{tab.label}</div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-1.5">
          {filtered.map((u, i) => (
            <div key={i} style={{ padding: "12px 14px", background: COLORS.surface, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}` }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div className="text-admin-ink text-admin-13 font-bold">{u.talent}</div>
                  <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">{u.campaign}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "capitalize", color: statusColor(u.status), background: statusBg(u.status), padding: "2px 8px", flexShrink: 0 }} className="rounded-admin-sm">
                  {u.status}
                </span>
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 16 }}>
                {[{ k: "Regions", v: u.regions }, { k: "Media", v: u.media }, { k: "Expires", v: u.expires }].map(f => (
                  <div key={f.k}>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em" }} className="text-admin-ink-dim">{f.k}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, marginTop: 1 }} className="text-admin-ink">{f.v}</div>
                  </div>
                ))}
              </div>
              {u.status === "expiring" && (
                <div style={{ marginTop: 8, fontSize: 11, fontWeight: 600 }} className="text-admin-amber">
                  ⚠ Expires in {u.daysLeft} days — renew now
                </div>
              )}
              {u.status === "expired" && (
                <div style={{ marginTop: 8, fontSize: 11, fontWeight: 600 }} className="text-admin-coral">
                  ✕ Expired {Math.abs(u.daysLeft)} days ago — rights no longer valid
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </DrawerShell>
  );
}


export function RelicenseFlowDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "relicense-flow";
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [regions, setRegions] = React.useState("UK, EU");
  const [media, setMedia] = React.useState("Digital, Social");
  const [duration, setDuration] = React.useState("12");
  const [fee, setFee] = React.useState("800");

  const steps = ["Select scope", "Set terms", "Send offer"];

  const footer = (
    <div className="flex gap-2">
      <GhostButton onClick={() => { if (step > 1) setStep(s => (s - 1) as 1 | 2 | 3); else closeDrawer(); }}>
        {step > 1 ? "Back" : "Cancel"}
      </GhostButton>
      <SecondaryButton onClick={() => {
        if (step < 3) setStep(s => (s + 1) as 1 | 2 | 3);
        else { toast("Relicence offer sent"); closeDrawer(); }
      }}>
        {step === 3 ? "Send offer" : "Next"}
      </SecondaryButton>
    </div>
  );

  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Relicence flow" description="Extend or expand usage rights for an existing booking." footer={footer} defaultSize="half">
      <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONTS.body }}>

        <div style={{ display: "flex", gap: 0 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                background: step > i + 1 ? COLORS.success : step === i + 1 ? COLORS.accent : COLORS.border,
                color: step >= i + 1 ? "#fff" : COLORS.inkMuted,
                fontSize: 12, fontWeight: 700,
              }}>
                {step > i + 1 ? "✓" : i + 1}
              </div>
              <div style={{ fontSize: 10, color: step === i + 1 ? COLORS.accent : COLORS.inkDim, fontWeight: step === i + 1 ? 700 : 400 }}>{s}</div>
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-3.5">
            <div style={{ border: `1px solid ${COLORS.accent}`, padding: 14 }} className="bg-admin-accent-soft rounded-admin-md">
              <div className="text-admin-accent text-admin-13 font-bold">Lena Voss — Winter 2024</div>
              <div style={{ fontSize: 11, marginTop: 2 }} className="text-admin-ink-muted">Current: Digital · UK only · Expires 15 May 2026</div>
            </div>
            <div className="text-admin-ink text-xs">You are extending the licence for this talent and campaign. Select the new scope below.</div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3.5">
            <FieldRow label="Regions">
              <TextInput value={regions} onChange={(e) => setRegions(e.target.value)} placeholder="e.g. UK, EU, Global" />
            </FieldRow>
            <FieldRow label="Media types">
              <TextInput value={media} onChange={(e) => setMedia(e.target.value)} placeholder="e.g. Digital, Print, OOH" />
            </FieldRow>
            <FieldRow label="Duration (months)">
              <TextInput value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 12" />
            </FieldRow>
            <FieldRow label="Relicence fee (£)">
              <TextInput value={fee} onChange={(e) => setFee(e.target.value)} placeholder="e.g. 800" />
            </FieldRow>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-3.5">
            <div style={{ border: `1px solid ${COLORS.border}`, padding: 16 }} className="bg-admin-surface rounded-admin-md">
              <CapsLabel>Offer summary</CapsLabel>
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { k: "Talent", v: "Lena Voss" },
                  { k: "Campaign", v: "Winter 2024" },
                  { k: "New regions", v: regions },
                  { k: "Media", v: media },
                  { k: "Duration", v: `${duration} months` },
                  { k: "Fee", v: `£${fee}` },
                ].map(row => (
                  <div key={row.k} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="text-admin-ink-muted text-xs">{row.k}</span>
                    <span className="text-admin-ink text-xs font-semibold">{row.v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-admin-ink-muted text-xs">
              An offer will be sent to Lena Voss for acceptance. Once accepted, the new usage terms will be recorded automatically.
            </div>
          </div>
        )}
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-31 — Account lifecycle
// ════════════════════════════════════════════════════════════════════


export function OwnershipTransferDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "ownership-transfer";
  const [newOwnerEmail, setNewOwnerEmail] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const [step, setStep] = React.useState<1 | 2>(1);
  const emailTransferRequest = () => {
    openSupportEmail(
      "Tulala ownership transfer request",
      `Please review this workspace ownership transfer request.\n\nNew owner email: ${newOwnerEmail}`,
    );
    toast("Opening ownership support email");
  };

  const footer = (
    <div className="flex gap-2">
      <GhostButton onClick={() => { if (step === 2) setStep(1); else closeDrawer(); }}>
        {step === 2 ? "Back" : "Cancel"}
      </GhostButton>
      <SecondaryButton
        onClick={() => {
          if (step === 1 && newOwnerEmail) setStep(2);
          else if (step === 2 && confirmed) emailTransferRequest();
        }}
      >
        {step === 1 ? "Review transfer" : "Email transfer request"}
      </SecondaryButton>
    </div>
  );

  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Ownership transfer" description="Email support to start a reviewed ownership transfer." footer={footer} defaultSize="half">
      <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONTS.body }}>

        <div style={{ background: `${COLORS.coral}12`, border: `1px solid ${COLORS.coral}40`, padding: 14 }} className="rounded-admin-md">
          <div className="text-admin-coral text-xs font-bold">⚠ Irreversible action</div>
          <div style={{ fontSize: 11, marginTop: 4 }} className="text-admin-ink-muted">
            Ownership transfers require support review. This drawer does not change account access automatically.
          </div>
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-3.5">
            <div style={{ border: `1px solid ${COLORS.border}`, padding: 14 }} className="bg-admin-surface rounded-admin-md">
              <CapsLabel>Current workspace</CapsLabel>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                {[{ k: "Workspace", v: "Tulala Agency" }, { k: "Current owner", v: "orantene@gmail.com" }, { k: "Plan", v: "Studio" }, { k: "Members", v: "7" }].map(row => (
                  <div key={row.k} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="text-admin-ink-muted text-xs">{row.k}</span>
                    <span className="text-admin-ink text-xs font-semibold">{row.v}</span>
                  </div>
                ))}
              </div>
            </div>
            <FieldRow label="New owner email">
              <TextInput value={newOwnerEmail} onChange={(e) => setNewOwnerEmail(e.target.value)} placeholder="newowner@example.com" />
            </FieldRow>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3.5">
            <div style={{ border: `1px solid ${COLORS.border}`, padding: 14 }} className="bg-admin-surface rounded-admin-md">
              <CapsLabel>Transfer summary</CapsLabel>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                {[{ k: "From", v: "orantene@gmail.com" }, { k: "To", v: newOwnerEmail }, { k: "Workspace", v: "Tulala Agency" }].map(row => (
                  <div key={row.k} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="text-admin-ink-muted text-xs">{row.k}</span>
                    <span className="text-admin-ink text-xs font-semibold">{row.v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", border: `1px solid ${COLORS.border}`, cursor: "pointer" }} onClick={() => setConfirmed(c => !c)}>
              <Toggle on={confirmed} onChange={() => setConfirmed(c => !c)} />
              <span className="bg-admin-surface rounded-admin-sm text-admin-ink text-xs">I understand this action is permanent and cannot be undone</span>
            </div>
          </div>
        )}
      </div>
    </DrawerShell>
  );
}


export function MinorAccountDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "minor-account";
  const [guardianName, setGuardianName] = React.useState("");
  const [guardianEmail, setGuardianEmail] = React.useState("");
  const [guardianPhone, setGuardianPhone] = React.useState("");
  const [consentGiven, setConsentGiven] = React.useState(false);
  const [marketingConsent, setMarketingConsent] = React.useState(false);

  const footer = (
    <div className="flex gap-2">
      <GhostButton onClick={closeDrawer}>Cancel</GhostButton>
      <SecondaryButton onClick={() => { toast("Guardian record saved — verification email sent"); closeDrawer(); }}>Save guardian record</SecondaryButton>
    </div>
  );

  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Minor account setup" description="Attach a parent or guardian co-pilot to this talent account." footer={footer} defaultSize="half">
      <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONTS.body }}>

        <div style={{ background: `${COLORS.indigo}12`, border: `1px solid ${COLORS.indigo}40`, padding: 14 }} className="rounded-admin-md">
          <div className="text-admin-indigo text-xs font-bold">ℹ Under-18 account</div>
          <div style={{ fontSize: 11, marginTop: 4 }} className="text-admin-ink-muted">
            A parent or legal guardian must be registered as co-pilot. They will receive booking notifications and must approve all paid engagements.
          </div>
        </div>

        <div style={{ border: `1px solid ${COLORS.border}`, padding: 14 }} className="bg-admin-surface rounded-admin-md">
          <CapsLabel>Talent (minor)</CapsLabel>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            <div className="text-admin-ink text-admin-13 font-semibold">Sofia Chen</div>
            <div className="text-admin-ink-muted text-admin-11">sofia.chen@example.com · Age: 16</div>
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          <CapsLabel>Guardian details</CapsLabel>
          <FieldRow label="Full name">
            <TextInput value={guardianName} onChange={(e) => setGuardianName(e.target.value)} placeholder="Parent / legal guardian name" />
          </FieldRow>
          <FieldRow label="Email">
            <TextInput value={guardianEmail} onChange={(e) => setGuardianEmail(e.target.value)} placeholder="guardian@example.com" />
          </FieldRow>
          <FieldRow label="Phone">
            <TextInput value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} placeholder="+44 7700 000000" />
          </FieldRow>
        </div>

        <div className="flex flex-col gap-2">
          <CapsLabel>Consent</CapsLabel>
          {[
            { key: "legal", label: "I confirm I am the legal parent or guardian and have authority to consent", value: consentGiven, setter: () => setConsentGiven(c => !c) },
            { key: "marketing", label: "Receive email updates about new opportunities (optional)", value: marketingConsent, setter: () => setMarketingConsent(c => !c) },
          ].map(item => (
            <div key={item.key} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: COLORS.surface, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`, cursor: "pointer" }} onClick={item.setter}>
              <Toggle on={item.value} onChange={item.setter} />
              <span style={{ fontSize: 12, lineHeight: "1.4" }} className="text-admin-ink">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
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
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "call-sheet";

  const crew = [
    { name: "Amara Osei", role: "Lead talent", callTime: "07:30", status: "on-set" },
    { name: "Chiara Bianchi", role: "Supporting talent", callTime: "07:30", status: "in-transit" },
    { name: "Lucas Ferreira", role: "Photographer", callTime: "06:30", status: "on-set" },
    { name: "Nia Clarkson", role: "HMU artist", callTime: "06:30", status: "on-set" },
    { name: "TBD (Stylist)", role: "Stylist", callTime: "07:00", status: "unfilled" },
    { name: "Studio One", role: "Studio (Shoreditch)", callTime: "07:00", status: "confirmed" },
  ];

  const statusColor = (s: string) => s === "on-set" ? COLORS.success : s === "unfilled" ? COLORS.coral : s === "in-transit" ? COLORS.amber : COLORS.indigo;
  const statusBg = (s: string) => s === "on-set" ? COLORS.successSoft : s === "unfilled" ? `${COLORS.coral}18` : s === "in-transit" ? `${COLORS.amber}18` : `${COLORS.indigo}18`;
  const statusLabel = (s: string) => s === "on-set" ? "On set" : s === "unfilled" ? "Unfilled" : s === "in-transit" ? "In transit" : "Confirmed";

  const footer = (
    <div className="flex gap-2">
      <GhostButton onClick={closeDrawer}>Close</GhostButton>
      <SecondaryButton onClick={() => { toast("Call sheet shared"); closeDrawer(); }}>Share call sheet</SecondaryButton>
    </div>
  );

  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Call sheet" description="Live production day roster with real-time check-in status." footer={footer} defaultSize="half">
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>

        <div style={{ border: `1px solid ${COLORS.accent}`, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }} className="bg-admin-accent-soft rounded-admin-md">
          <div>
            <div className="text-admin-accent text-admin-13 font-bold">Spring Campaign 2026</div>
            <div style={{ fontSize: 11, marginTop: 2 }} className="text-admin-ink-muted">Studio One, Shoreditch · Tue 20 May 2026</div>
          </div>
          <div className="text-right">
            <div className="text-admin-success text-admin-22 font-extrabold">{crew.filter(c => c.status === "on-set").length}</div>
            <div className="text-admin-ink-muted text-admin-10">on set now</div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          {crew.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: COLORS.surface, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}` }}>
              <div style={{ textAlign: "center", minWidth: 36, flexShrink: 0 }}>
                <div className="text-admin-ink-muted text-admin-11 font-bold">{c.callTime}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-admin-ink text-admin-13 font-semibold">{c.name}</div>
                <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">{c.role}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "capitalize", color: statusColor(c.status), background: statusBg(c.status), padding: "2px 8px", flexShrink: 0 }} className="rounded-admin-sm">
                {statusLabel(c.status)}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {["on-set", "in-transit", "confirmed", "unfilled"].map(s => {
            const n = crew.filter(c => c.status === s).length;
            return (
              <div key={s} style={{ textAlign: "center", padding: "8px 4px", background: statusBg(s), borderRadius: RADIUS.sm }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: statusColor(s) }}>{n}</div>
                <div style={{ fontSize: 9.5, color: statusColor(s), marginTop: 1 }}>{statusLabel(s)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </DrawerShell>
  );
}

