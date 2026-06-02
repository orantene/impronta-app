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
  // Honest stub — per-talent / per-client revenue rankings need a real
  // analytics aggregation that isn't wired yet. Showing fabricated revenue
  // (e.g. "Marta Reyes €28,400") would misrepresent business numbers.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Top performers"
      description="Talent and client rankings by booking revenue."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
      defaultSize="half"
    >
      <EmptyState
        icon="sparkle"
        title="Coming soon"
        body="Revenue-ranked talent and client leaderboards aren't live yet. They'll appear here once booking analytics are wired up."
      />
    </DrawerShell>
  );
}


export function CoordinatorWorkloadDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "coordinator-workload";
  // Honest stub — per-coordinator load / reply-time metrics have no real
  // source yet; the old hardcoded percentages (e.g. "Oran 85%") were demo data.
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Team workload"
      description="Active load, messages, and reply time per coordinator."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
      defaultSize="half"
    >
      <EmptyState
        icon="team"
        title="Coming soon"
        body="Per-coordinator workload and response-time analytics aren't live yet. We'll surface them here once the data is tracked."
      />
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
                    <span className="text-admin-ink-muted text-admin-10h font-bold">{item.id}</span>
                    <span className="text-admin-ink text-admin-13 font-semibold">{item.client}</span>
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
                      <span className="text-admin-ink text-admin-13 font-semibold">{row.client}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: tone }}>{slaLabel(row.hoursLeft)}</span>
                  </div>
                  {/* Timer bar */}
                  <div style={{ background: COLORS.border, borderRadius: 3, height: 4, overflow: "hidden", marginBottom: 6 }}>
                    <div style={{ '--progress-w': `${pct}%`, '--progress-bg': tone }} className="w-[var(--progress-w)] h-full rounded-[3px] bg-[var(--progress-bg)] [transition:width_var(--transition-admin-layout)]" />
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
                      <span className="text-admin-ink text-admin-13 font-semibold">{reply.name}</span>
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

