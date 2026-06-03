"use client";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  COLORS,
  CapsLabel,
  DrawerShell,
  EmptyState,
  FONTS,
  FieldRow,
  GhostButton,
  Icon,
  Plan,
  RADIUS,
  SecondaryButton,
  TRANSITION,
  TextArea,
  TextInput,
  Toggle,
  useAdminShell,
  useSaveAndClose
} from "./drawer-shared";

// Phase 1d (remediation §4): 6 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function EmailTemplatesDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "email-templates";
  const [search, setSearch] = useState("");

  type EmailTemplate = { id: string; name: string; trigger: string; category: string; status: "live" | "draft" | "paused" };
  const TEMPLATES: EmailTemplate[] = [
    { id: "e01", name: "Welcome — new workspace",    trigger: "Workspace created",          category: "Onboarding",    status: "live"   },
    { id: "e02", name: "Invite team member",         trigger: "Team invite sent",           category: "Onboarding",    status: "live"   },
    { id: "e03", name: "Talent added to roster",     trigger: "Talent profile created",     category: "Onboarding",    status: "live"   },
    { id: "e04", name: "Inquiry received — client",  trigger: "Inquiry submitted",          category: "Inquiry",       status: "live"   },
    { id: "e05", name: "Offer sent — client",        trigger: "Offer created",              category: "Inquiry",       status: "live"   },
    { id: "e06", name: "Client approved offer",      trigger: "Offer approved",             category: "Inquiry",       status: "live"   },
    { id: "e07", name: "Booking confirmed",          trigger: "Booking status = confirmed", category: "Booking",       status: "live"   },
    { id: "e08", name: "Booking reminder — 24h",     trigger: "24h before booking start",   category: "Booking",       status: "live"   },
    { id: "e09", name: "Payment received",           trigger: "Payment succeeded",          category: "Payments",      status: "live"   },
    { id: "e10", name: "Payout sent",               trigger: "Payout processed",           category: "Payments",      status: "live"   },
    { id: "e11", name: "Payment failed — retry 1",   trigger: "Payment failed",             category: "Dunning",       status: "live"   },
    { id: "e12", name: "Payment failed — retry 2",   trigger: "+3 days after e11",          category: "Dunning",       status: "draft"  },
    { id: "e13", name: "Subscription paused",        trigger: "Plan paused",                category: "Dunning",       status: "draft"  },
    { id: "e14", name: "Win-back — 30 days inactive",trigger: "30d no login",              category: "Re-engagement", status: "paused" },
    { id: "e15", name: "Win-back — 60 days",         trigger: "60d no login",              category: "Re-engagement", status: "paused" },
  ];

  const filtered = TEMPLATES.filter(
    (t) => search === "" ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase()),
  );
  const categories = Array.from(new Set(TEMPLATES.map((t) => t.category)));

  const statusColor = (s: EmailTemplate["status"]) =>
    s === "live" ? COLORS.successDeep : s === "draft" ? COLORS.amber : COLORS.inkMuted;
  const statusBg = (s: EmailTemplate["status"]) =>
    s === "live" ? COLORS.successSoft : s === "draft" ? COLORS.amberSoft : COLORS.surfaceAlt;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Email templates"
      description={`${TEMPLATES.length} transactional email types. Templates are role-aware and workspace-branded.`}
      footer={
        <div className="flex gap-2">
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        </div>
      }
      defaultSize="half"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            { label: "Live",   value: String(TEMPLATES.filter((t) => t.status === "live").length),   color: COLORS.successDeep },
            { label: "Draft",  value: String(TEMPLATES.filter((t) => t.status === "draft").length),  color: COLORS.amber       },
            { label: "Paused", value: String(TEMPLATES.filter((t) => t.status === "paused").length), color: COLORS.inkMuted    },
          ].map((tile) => (
            <div key={tile.label} style={{
              background: COLORS.surfaceAlt, borderRadius: RADIUS.md,
              padding: "10px 12px", border: `1px solid ${COLORS.border}`, textAlign: "center",
            }}>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }} className="text-admin-ink-muted">{tile.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: tile.color }}>{tile.value}</div>
            </div>
          ))}
        </div>

        <TextInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates…"
        />

        {categories.map((cat) => {
          const catItems = filtered.filter((t) => t.category === cat);
          if (catItems.length === 0) return null;
          return (
            <div key={cat}>
              <CapsLabel>{cat}</CapsLabel>
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                {catItems.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 14px", background: COLORS.surfaceAlt,
                      borderRadius: RADIUS.md, border: `1px solid ${COLORS.borderSoft}`,
                    }}
                  >
                    <div>
                      <div className="text-admin-ink text-admin-13 font-semibold">{tmpl.name}</div>
                      <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">Trigger: {tmpl.trigger}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: statusColor(tmpl.status), background: statusBg(tmpl.status), padding: "2px 7px", textTransform: "capitalize" }} className="rounded-admin-sm">
                        {tmpl.status}
                      </span>
                      <button
                        type="button"
                        onClick={() => toast(`Editing "${tmpl.name}"`)}
                        style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, lineHeight: 0 }}
                      >
                        <Icon name="settings" size={13} color={COLORS.inkDim} stroke={1.7} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </DrawerShell>
  );
}


export function EmailBrandingDrawer() {
  const { state, closeDrawer, toast, effectiveTenant } = useAdminShell();
  const open = state.drawer.drawerId === "email-branding";
  const [senderName,  setSenderName]  = useState(effectiveTenant.name);
  const [senderEmail, setSenderEmail] = useState(`hello@${effectiveTenant.name.toLowerCase().replace(/\s/g, "")}.com`);
  const [footerText,  setFooterText]  = useState(`© ${new Date().getFullYear()} ${effectiveTenant.name}. All rights reserved.`);
  const [accentColor, setAccentColor] = useState("#0F4F3E");
  const save = useSaveAndClose("Email branding saved");

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Email branding"
      description="Customize how your emails look and who they're from. Changes apply to all outgoing emails."
      footer={
        <div className="flex gap-2">
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <button
            type="button" onClick={save}
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
      defaultSize="compact"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
        {/* Preview */}
        <div style={{ padding: "16px 18px", background: "#fff", border: `2px solid ${COLORS.border}` }} className="rounded-admin-lg">
          <div style={{
            borderBottom: `3px solid ${accentColor}`,
            paddingBottom: 12, marginBottom: 12,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 6,
              background: accentColor, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>
                {senderName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="text-admin-ink text-admin-13 font-bold">{senderName}</div>
          </div>
          <div style={{ fontSize: 12.5, marginBottom: 8 }} className="text-admin-ink">
            Hi [Talent Name], your booking for [Project] has been confirmed…
          </div>
          <div className="text-admin-ink-muted text-admin-11">{footerText}</div>
        </div>

        <FieldRow label="Sender name">
          <TextInput value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Your agency name" />
        </FieldRow>

        <FieldRow label="Sender email">
          <TextInput value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="hello@youragency.com" />
        </FieldRow>

        <FieldRow label="Accent color (hex)">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              style={{ width: 36, height: 36, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm, cursor: "pointer", padding: 2 }}
            />
            <TextInput value={accentColor} onChange={(e) => setAccentColor(e.target.value)} />
          </div>
        </FieldRow>

        <FieldRow label="Footer text">
          <TextArea
            value={footerText}
            onChange={(e) => setFooterText(e.target.value)}
            placeholder="© 2026 Your Agency. All rights reserved."
            rows={2}
          />
        </FieldRow>
      </div>
    </DrawerShell>
  );
}


export function EmailSequencesDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "email-sequences";
  // Honest stub — no backend yet; the previous body was hardcoded demo data.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Email sequences"
      description="Automated multi-step email flows."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <EmptyState
        icon="mail"
        title="Coming soon"
        body="Automated email sequences aren't available yet."
      />
    </DrawerShell>
  );
}


export function NotificationPrefsDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "notification-prefs";

  type PrefRow = { id: string; label: string; description: string; email: boolean; push: boolean; sms: boolean };
  const [prefs, setPrefs] = useState<PrefRow[]>([
    { id: "inquiry",    label: "New inquiry",         description: "When a client submits an inquiry.",          email: true,  push: true,  sms: false },
    { id: "offer",      label: "Offer update",        description: "When a client approves or rejects.",         email: true,  push: true,  sms: false },
    { id: "booking",    label: "Booking confirmed",   description: "When a booking is confirmed.",               email: true,  push: true,  sms: true  },
    { id: "message",    label: "New message",         description: "Unread message in any thread.",              email: false, push: true,  sms: false },
    { id: "payment",    label: "Payment",             description: "Successful payment or payout.",              email: true,  push: false, sms: false },
    { id: "reminder",   label: "Booking reminders",   description: "24h and 1h before scheduled bookings.",      email: true,  push: true,  sms: true  },
    { id: "team",       label: "Team activity",       description: "Colleague actions on your inquiries.",       email: false, push: false, sms: false },
    { id: "platform",   label: "Platform updates",    description: "New features, policy changes, maintenance.", email: true,  push: false, sms: false },
  ]);

  // WS-11.2 — batching: collapse "3 from Casa Pero" instead of 3 entries
  const [batchingEnabled, setBatchingEnabled] = useState(true);
  // WS-11.4 — DND / quiet hours
  const [dndEnabled, setDndEnabled] = useState(false);
  const [dndStart, setDndStart] = useState("22:00");
  const [dndEnd, setDndEnd] = useState("08:00");
  // WS-11.5 — preview vs lock-screen privacy
  const [previewMode, setPreviewMode] = useState<"full" | "sender-only" | "hidden">("full");

  const toggle = (id: string, channel: "email" | "push" | "sms") =>
    setPrefs((prev) => prev.map((p) => p.id === id ? { ...p, [channel]: !p[channel] } : p));

  const CHANNELS: ("email" | "push" | "sms")[] = ["email", "push", "sms"];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Notification preferences"
      description="Choose how and when you hear from Tulala. Email, push, and SMS can be toggled independently."
      footer={
        <div className="flex gap-2">
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <button
            type="button"
            onClick={() => { toast("Preferences saved"); closeDrawer(); }}
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
      <div style={{ fontFamily: FONTS.body }}>
        {/* Channel header row */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, paddingRight: 2, marginBottom: 8 }}>
          {CHANNELS.map((ch) => (
            <div key={ch} style={{ width: 38, textAlign: "center", fontSize: 10, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {ch}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {prefs.map((pref) => (
            <div
              key={pref.id}
              style={{
                display: "flex", alignItems: "center",
                padding: "11px 14px", background: COLORS.surfaceAlt,
                borderRadius: RADIUS.md, border: `1px solid ${COLORS.borderSoft}`,
                gap: 12, marginBottom: 4,
              }}
            >
              <div className="flex-1">
                <div className="text-admin-ink text-admin-13 font-semibold">{pref.label}</div>
                <div style={{ fontSize: 11.5, marginTop: 1 }} className="text-admin-ink-muted">{pref.description}</div>
              </div>
              <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
                {CHANNELS.map((ch) => (
                  <div key={ch} style={{ width: 38, display: "flex", justifyContent: "center" }}>
                    <Toggle on={pref[ch]} onChange={() => toggle(pref.id, ch)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── WS-11 advanced controls ── */}
        <div style={{ marginTop: 24, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }} className="text-admin-ink-muted">
          Delivery & quiet time
        </div>

        {/* WS-11.2 — Batching */}
        <div style={{ padding: "11px 14px", border: `1px solid ${COLORS.borderSoft}`, display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }} className="bg-admin-surface-alt rounded-admin-md">
          <div className="flex-1">
            <div className="text-admin-ink text-admin-13 font-semibold">Batch similar notifications</div>
            <div style={{ fontSize: 11.5, marginTop: 1 }} className="text-admin-ink-muted">
              Collapse &quot;3 new messages from Casa Pero&quot; instead of sending each separately.
            </div>
          </div>
          <Toggle on={batchingEnabled} onChange={setBatchingEnabled} />
        </div>

        {/* WS-11.4 — DND / quiet hours */}
        <div style={{ padding: "11px 14px", border: `1px solid ${COLORS.borderSoft}`, marginBottom: 4 }} className="bg-admin-surface-alt rounded-admin-md">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-admin-ink text-admin-13 font-semibold">Quiet hours</div>
              <div style={{ fontSize: 11.5, marginTop: 1 }} className="text-admin-ink-muted">
                Pause push and SMS during these hours. Email is always allowed.
              </div>
            </div>
            <Toggle on={dndEnabled} onChange={setDndEnabled} />
          </div>
          {dndEnabled && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12.5 }} className="text-admin-ink">
              <span>From</span>
              <input type="time" value={dndStart} onChange={(e) => setDndStart(e.target.value)} style={{
                padding: "4px 8px", borderRadius: RADIUS.sm,
                border: `1px solid ${COLORS.border}`, fontFamily: FONTS.body, fontSize: 12,
                background: "#fff", color: COLORS.ink, outline: "none",
              }} />
              <span>to</span>
              <input type="time" value={dndEnd} onChange={(e) => setDndEnd(e.target.value)} style={{
                padding: "4px 8px", borderRadius: RADIUS.sm,
                border: `1px solid ${COLORS.border}`, fontFamily: FONTS.body, fontSize: 12,
                background: "#fff", color: COLORS.ink, outline: "none",
              }} />
              <span style={{ fontSize: 11, marginLeft: "auto" }} className="text-admin-ink-muted">workspace timezone</span>
            </div>
          )}
        </div>

        {/* WS-11.5 — Preview / lock-screen privacy */}
        <div style={{ padding: "11px 14px", border: `1px solid ${COLORS.borderSoft}` }} className="bg-admin-surface-alt rounded-admin-md">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }} className="text-admin-ink">Lock-screen previews</div>
          <div style={{ fontSize: 11.5, marginBottom: 10 }} className="text-admin-ink-muted">
            What appears on your device&apos;s lock screen for push notifications.
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {([
              { value: "full",        label: "Full content",   sub: "Sender + message preview" },
              { value: "sender-only", label: "Sender only",     sub: "\"Sara Bianchi sent a message\"" },
              { value: "hidden",      label: "Hidden",          sub: "\"You have a notification\"" },
            ] as const).map(opt => {
              const active = previewMode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPreviewMode(opt.value)}
                  style={{
                    flex: 1, minWidth: 110,
                    padding: "8px 10px", borderRadius: RADIUS.sm,
                    background: active ? COLORS.fill : "#fff",
                    border: `1px solid ${active ? COLORS.fill : COLORS.border}`,
                    color: active ? "#fff" : COLORS.ink,
                    cursor: "pointer", textAlign: "left",
                    fontFamily: FONTS.body,
                  }}
                >
                  <div className="text-xs font-semibold">{opt.label}</div>
                  <div style={{ fontSize: 10.5, opacity: 0.85, marginTop: 1 }}>{opt.sub}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-23 — Marketing & growth drawers
// ════════════════════════════════════════════════════════════════════


export function InviteFlowDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "invite-flow";
  const [tab, setTab] = useState<"talent" | "client" | "agency">("talent");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();
  const tenantSlug = pathname?.split("/").filter(Boolean)[0] ?? "";

  const handleSend = async () => {
    setError(null);
    if (tab !== "talent") {
      setError(
        "Client and agency invites aren't wired up yet — use the Talent tab to invite roster talent.",
      );
      return;
    }
    if (!email.trim()) {
      setError("Enter an email address.");
      return;
    }
    if (!tenantSlug) {
      setError("Couldn't resolve the current workspace. Reload and try again.");
      return;
    }
    setBusy(true);
    try {
      const { inviteRosterTalent } = await import(
        "@/lib/server-actions/roster-invite"
      );
      const res = await inviteRosterTalent(tenantSlug, name, email);
      if (res.ok) {
        setSent(true);
        toast(`Invite sent to ${email}`);
      } else {
        setError(res.error);
      }
    } catch {
      setError("Something went wrong sending the invite. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const tabMeta: Record<typeof tab, { label: string; placeholder: string; note: string }> = {
    talent:  { label: "Talent",  placeholder: "talent@example.com", note: "They'll be invited to create a free talent profile on your roster." },
    client:  { label: "Client",  placeholder: "client@brand.com",   note: "They'll receive a link to set up a client account and start sending inquiries." },
    agency:  { label: "Agency",  placeholder: "ops@agency.com",     note: "Agency invite activates network collaboration — shared roster access on approval." },
  };

  return (
    <DrawerShell
      open={open}
      onClose={() => { setSent(false); setEmail(""); setName(""); setError(null); setBusy(false); closeDrawer(); }}
      title="Send invite"
      description="Invite talent, clients, or partner agencies to join your workspace network."
      footer={
        sent ? (
          <SecondaryButton onClick={() => { setSent(false); setEmail(""); setName(""); setError(null); }}>Send another</SecondaryButton>
        ) : (
          <div className="flex gap-2">
            <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
            <button
              type="button" onClick={handleSend} disabled={busy}
              style={{
                padding: "9px 18px", background: COLORS.fill, border: "none",
                borderRadius: RADIUS.md, color: "#fff", fontFamily: FONTS.body,
                fontSize: 13, fontWeight: 600,
                cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? "Sending…" : "Send invite"}
            </button>
          </div>
        )
      }
      defaultSize="compact"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
        {sent ? (
          <div style={{ padding: "16px 18px", border: `1px solid rgba(46,125,91,0.2)`, display: "flex", flexDirection: "column", gap: 6 }} className="bg-admin-success-soft rounded-admin-lg">
            <div className="text-admin-success-deep text-admin-13 font-bold">✓ Invite sent</div>
            <div className="text-admin-success-deep text-admin-12h">
              {name ? name : email} has been added to your roster as Invited. We&apos;ve emailed {email} a link to claim their profile.
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-admin-surface-alt rounded-admin-md border px-3 py-2 text-admin-12h font-semibold">
                {error}
              </div>
            )}
            {/* Tab */}
            <div style={{ display: "flex", gap: 4, padding: 3 }} className="bg-admin-surface-alt rounded-admin-md">
              {(["talent", "client", "agency"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  style={{
                    flex: 1, padding: "6px 10px",
                    background: tab === t ? "#fff" : "transparent",
                    border: `1px solid ${tab === t ? COLORS.border : "transparent"}`,
                    borderRadius: RADIUS.sm, fontFamily: FONTS.body,
                    fontSize: 12.5, fontWeight: tab === t ? 600 : 400,
                    color: tab === t ? COLORS.ink : COLORS.inkMuted,
                    cursor: "pointer", transition: TRANSITION.sm,
                  }}
                >
                  {tabMeta[t].label}
                </button>
              ))}
            </div>

            <FieldRow label="Name (optional)">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name" />
            </FieldRow>

            <FieldRow label="Email address">
              <TextInput value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tabMeta[tab].placeholder} />
            </FieldRow>

            <div style={{ padding: "10px 14px", border: `1px solid rgba(91,107,160,0.2)`, fontSize: 11.5, lineHeight: 1.5 }} className="bg-admin-indigo-soft rounded-admin-md text-admin-indigo-deep">
              {tabMeta[tab].note}
            </div>
          </>
        )}
      </div>
    </DrawerShell>
  );
}


export function ReferralDashboardDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "referral-dashboard";

  const REFERRAL_CODE = "IMPRONTA-4X9Z";
  const REFERRAL_URL  = `https://tulala.digital/join?ref=${REFERRAL_CODE}`;

  type ReferralRow = { name: string; status: "joined" | "pending" | "rewarded"; date: string; reward: string };
  const REFERRALS: ReferralRow[] = [
    { name: "Bella Moretti",     status: "rewarded", date: "Apr 14",  reward: "€50 credit" },
    { name: "Jasper Klein",      status: "joined",   date: "Apr 22",  reward: "Pending 30d" },
    { name: "Invited via link",  status: "pending",  date: "Apr 26",  reward: "—" },
    { name: "Invited via link",  status: "pending",  date: "Apr 27",  reward: "—" },
  ];

  const statusColor = (s: ReferralRow["status"]) =>
    s === "rewarded" ? COLORS.successDeep : s === "joined" ? COLORS.indigoDeep : COLORS.inkMuted;
  const statusBg = (s: ReferralRow["status"]) =>
    s === "rewarded" ? COLORS.successSoft : s === "joined" ? COLORS.indigoSoft : COLORS.surfaceAlt;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Referral program"
      description="Earn €50 credit for every new workspace that subscribes through your link."
      footer={
        <div className="flex gap-2">
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
          <GhostButton onClick={() => {
            void navigator.clipboard
              .writeText(REFERRAL_URL)
              .then(() => toast("Referral link copied"))
              .catch(() => toast("Couldn't copy — copy manually"));
          }}>Copy link</GhostButton>
        </div>
      }
      defaultSize="half"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>
        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            { label: "Total referred",  value: String(REFERRALS.length), color: COLORS.ink },
            { label: "Converted",       value: "1",                      color: COLORS.successDeep },
            { label: "Credits earned",  value: "€50",                    color: COLORS.accentDeep  },
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

        {/* Referral link */}
        <div style={{ padding: "12px 14px", border: `1px solid rgba(15,79,62,0.2)` }} className="bg-admin-accent-soft rounded-admin-lg">
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }} className="text-admin-accent-deep">
            Your referral link
          </div>
          <div className="flex items-center gap-2">
            <div style={{ flex: 1, fontSize: 12.5, fontFamily: "monospace", background: "#fff", border: `1px solid rgba(15,79,62,0.2)`, padding: "7px 10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-admin-accent rounded-admin-sm">
              {REFERRAL_URL}
            </div>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(REFERRAL_URL)
                  .then(() => toast("Copied"))
                  .catch(() => toast("Couldn't copy — copy manually"));
              }}
              style={{
                padding: "7px 12px", background: COLORS.accent, border: "none",
                borderRadius: RADIUS.sm, color: "#fff", fontFamily: FONTS.body,
                fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0,
              }}
            >
              Copy
            </button>
          </div>
        </div>

        {/* Referral list */}
        <div>
          <CapsLabel>Referral history</CapsLabel>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
            {REFERRALS.map((ref, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px", background: COLORS.surfaceAlt,
                borderRadius: RADIUS.md, border: `1px solid ${COLORS.borderSoft}`,
              }}>
                <div>
                  <div className="text-admin-ink text-admin-13 font-semibold">{ref.name}</div>
                  <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">{ref.date} · {ref.reward}</div>
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: statusColor(ref.status), background: statusBg(ref.status), padding: "2px 8px", textTransform: "capitalize" }} className="rounded-admin-sm">
                  {ref.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DrawerShell>
  );
}

