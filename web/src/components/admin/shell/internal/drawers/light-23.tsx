"use client";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  COLORS,
  CapsLabel,
  DrawerShell,
  FEATURE_GROUPS,
  FONTS,
  FieldRow,
  GhostButton,
  Icon,
  MOCK_CIRCLE,
  RADIUS,
  SecondaryButton,
  TRANSITION,
  TextArea,
  Toggle,
  audienceColor,
  audienceLabel,
  useAdminShell
} from "./drawer-shared";

// Phase 1d (remediation §4): 3 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function FeatureControlsDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "feature-controls";

  // Initialise toggle state from defaults
  const initToggles = () => {
    const m: Record<string, boolean> = {};
    for (const g of FEATURE_GROUPS) {
      for (const f of g.features) {
        m[f.key] = f.defaultOn;
      }
    }
    return m;
  };

  const [toggles, setToggles] = useState<Record<string, boolean>>(initToggles);
  const [activeGroup, setActiveGroup] = useState<string>("agency-ops");
  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState(false);

  const flip = (key: string) => {
    setToggles(prev => ({ ...prev, [key]: !prev[key] }));
    setDirty(true);
  };

  const group = FEATURE_GROUPS.find(g => g.id === activeGroup) ?? FEATURE_GROUPS[0];

  const visibleFeatures = search.trim()
    ? FEATURE_GROUPS.flatMap(g => g.features.filter(f =>
        f.label.toLowerCase().includes(search.toLowerCase()) ||
        f.desc.toLowerCase().includes(search.toLowerCase())
      ))
    : group.features;

  const onCount = Object.values(toggles).filter(Boolean).length;
  const totalCount = Object.values(toggles).length;

  const footer = (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{ flex: 1, fontSize: 11 }} className="text-admin-ink-muted">{onCount}/{totalCount} features enabled</span>
      <GhostButton onClick={closeDrawer}>Cancel</GhostButton>
      <SecondaryButton onClick={() => { toast("Feature settings saved"); setDirty(false); closeDrawer(); }}>
        {dirty ? "Save changes" : "Close"}
      </SecondaryButton>
    </div>
  );

  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Feature controls" description="Turn platform capabilities on or off. Changes take effect immediately for all users in this workspace." footer={footer} defaultSize="full">
      <div style={{ display: "flex", gap: 0, height: "100%", fontFamily: FONTS.body }}>

        {/* Left sidebar — group nav */}
        <div style={{
          width: 200, flexShrink: 0, borderRight: `1px solid ${COLORS.border}`,
          paddingRight: 0, display: "flex", flexDirection: "column",
        }}>
          {/* Search */}
          <div style={{ padding: "0 0 12px 0" }}>
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search features…"
                style={{
                  width: "100%", boxSizing: "border-box", padding: "7px 12px 7px 30px",
                  borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`,
                  background: COLORS.surface, fontSize: 12, color: COLORS.ink,
                  fontFamily: FONTS.body, outline: "none",
                }}
              />
              <div style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                <Icon name="search" size={13} color={COLORS.inkDim} />
              </div>
            </div>
          </div>

          {/* Group list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {FEATURE_GROUPS.map(g => {
              const isActive = !search && activeGroup === g.id;
              const enabledCount = g.features.filter(f => toggles[f.key]).length;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => { setActiveGroup(g.id); setSearch(""); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 10px", border: "none", background: isActive ? COLORS.accentSoft : "transparent",
                    borderRadius: RADIUS.sm, cursor: "pointer", textAlign: "left",
                    borderLeft: `3px solid ${isActive ? COLORS.accent : "transparent"}`,
                    transition: TRANSITION.sm,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? COLORS.accent : COLORS.ink }}>{g.label}</div>
                    <div style={{ fontSize: 10, color: audienceColor(g.audience), marginTop: 1 }}>{audienceLabel(g.audience)}</div>
                  </div>
                  <span className="text-admin-ink-muted text-admin-10 font-bold">{enabledCount}/{g.features.length}</span>
                </button>
              );
            })}
          </div>

          {/* Summary stats */}
          <div style={{ marginTop: "auto", paddingTop: 16, borderTop: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 11, marginBottom: 6 }} className="text-admin-ink-muted">Summary</div>
            <div className="flex justify-between">
              <span className="text-admin-ink-muted text-admin-11">Enabled</span>
              <span className="text-admin-success text-xs font-bold">{onCount}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
              <span className="text-admin-ink-muted text-admin-11">Disabled</span>
              <span className="text-admin-coral text-xs font-bold">{totalCount - onCount}</span>
            </div>
            <div style={{ marginTop: 8, height: 4, background: COLORS.border, borderRadius: 2, overflow: "hidden" }}>
              <div style={{ '--progress-w': `${(onCount / totalCount) * 100}%` }} className="w-[var(--progress-w)] h-full rounded-[2px] bg-admin-success [transition:width_var(--transition-admin-md)]" />
            </div>
          </div>
        </div>

        {/* Right — feature list */}
        <div style={{ flex: 1, paddingLeft: 20, overflowY: "auto", minHeight: 0 }}>
          {search && (
            <div className="mb-3">
              <CapsLabel>Search results for &quot;{search}&quot;</CapsLabel>
            </div>
          )}
          {!search && (
            <div className="mb-4">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span className="text-admin-ink text-admin-15 font-bold">{group.label}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: audienceColor(group.audience), background: `${audienceColor(group.audience)}16`, padding: "2px 8px" }} className="rounded-admin-sm">
                  {audienceLabel(group.audience)}
                </span>
              </div>
              <div className="flex gap-2">
                <GhostButton onClick={() => {
                  const next = { ...toggles };
                  group.features.forEach(f => { next[f.key] = true; });
                  setToggles(next); setDirty(true);
                }}>
                  Enable all
                </GhostButton>
                <GhostButton onClick={() => {
                  const next = { ...toggles };
                  group.features.forEach(f => { next[f.key] = false; });
                  setToggles(next); setDirty(true);
                }}>
                  Disable all
                </GhostButton>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            {visibleFeatures.map(f => {
              const isOn = toggles[f.key] ?? false;
              // For search results, find which group this feature belongs to
              const parentGroup = FEATURE_GROUPS.find(g => g.features.some(gf => gf.key === f.key));
              return (
                <div
                  key={f.key}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "12px 14px",
                    background: isOn ? COLORS.surface : `${COLORS.coral}06`,
                    borderRadius: RADIUS.md,
                    border: `1px solid ${isOn ? COLORS.border : `${COLORS.coral}25`}`,
                    transition: TRANSITION.sm,
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span className="text-admin-ink text-admin-13 font-semibold">{f.label}</span>
                      {f.badge && (
                        <span style={{ fontSize: 9.5, fontWeight: 700, background: `${COLORS.amber}18`, padding: "1px 6px" }} className="text-admin-amber rounded-admin-sm">
                          {f.badge}
                        </span>
                      )}
                      {search && parentGroup && (
                        <span style={{ fontSize: 9.5, fontWeight: 600, color: audienceColor(parentGroup.audience), background: `${audienceColor(parentGroup.audience)}14`, padding: "1px 6px" }} className="rounded-admin-sm">
                          {parentGroup.label}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, marginTop: 3, lineHeight: "1.45" }} className="text-admin-ink-muted">{f.desc}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: isOn ? COLORS.success : COLORS.coral }}>
                      {isOn ? "On" : "Off"}
                    </span>
                    <Toggle on={isOn} onChange={() => flip(f.key)} />
                  </div>
                </div>
              );
            })}
          </div>

          {visibleFeatures.length === 0 && (
            <div style={{ padding: "40px 0", textAlign: "center", fontSize: 12 }} className="text-admin-ink-dim">
              No features match &quot;{search}&quot;
            </div>
          )}
        </div>
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// CHARTER — Messages, Coordinator Authority & Talent Circle
// ════════════════════════════════════════════════════════════════════
//
// MESSAGE SURFACE PARITY (decision):
// • All three pov surfaces (Workspace · Talent · Client) use the SAME
//   underlying components for the conversation thread, composer, and
//   right rail. The differences are role-driven, not surface-driven.
// • Workspace pov sees TWO threads per inquiry (private with client +
//   group with talent) via the WorkspaceBody tab switcher.
// • Talent + Client pov see ONE thread (their conversation with the
//   coordinator). Underlying component: ConversationList + ConversationThread
//   from _talent.tsx (client reuses verbatim with a banner).
// • The visual language matches across all three: pill segmented tabs,
//   participant stack, trust badge, status chip, minimal composer
//   (+ / ✦ / pill input / mic / send), Details/Activity rail tabs.
//
// COORDINATOR AUTHORITY MODEL (decision):
// • Agency owner can: assign a coordinator, BE the coordinator
//   themselves, add/remove talent at any time.
// • A coordinator (when assigned) can: add new talent to the inquiry
//   or booking, talk to the client directly (gated by agency setting).
// • Hub freelancers (talent without an agency, on a hub directly):
//   automatically become coordinator on inbound inquiries. The hub
//   owner acts in the agency-owner role and can intervene/escalate.
// • Setting `agency.autoAssignOwnerAsCoordinator` (default ON) — when
//   on, the owner is auto-set as primary coordinator on new inquiries
//   and can later re-assign. When off, the coordinator role auto-falls
//   to the most-relevant talent (typically the lead talent on the brief).
//   Owner retains the right to remove a talent from the coordinator
//   role at any time.
// • Setting `agency.allowTalentClientDirectChat` (default OFF for
//   agencies; ON for hubs) — controls whether talent in the coordinator
//   role can DM the client directly. When OFF, talent can see the
//   client thread but cannot send. Hub freelancers (chefs, designers,
//   hosts who add their own crew to a booking) need this ON.
//
// TALENT CIRCLE (new feature):
// • Each talent maintains a personal "Circle" — a curated address book
//   of collaborators they've worked with and trust (other talent, HMU,
//   photographers, stylists, studio managers).
// • Use cases: (1) recommend a circle member to a coordinator when a
//   booking needs more roles filled, (2) quickly find a known partner
//   when adding crew to a self-coordinated booking (hub freelancer).
// • Each circle entry: name, role, last-collab snippet, trust note.
// • Search > Add talent to inquiry: when a coordinator is talent-on-hub,
//   their Circle is the first source surfaced before the global roster.
//
// FUTURE WORK (not in this prototype slice):
// • Per-thread coordinator role display (inline avatar with "Coordinator"
//   label) so all three povs see who's leading the conversation.
// • "Hand off to coordinator" affordance for talent who need to escalate.
// • Per-message permissions audit log for compliance.
//


export function CircleManageDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "circle-manage";
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");

  const roleFilters = ["all", "Talent", "Photographer", "HMU artist", "Stylist", "Studio (venue)"];
  const filtered = MOCK_CIRCLE.filter(m => {
    if (filterRole !== "all" && m.role !== filterRole) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!m.name.toLowerCase().includes(q) && !m.role.toLowerCase().includes(q) && !m.tags.some(t => t.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const footer = (
    <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
      <span className="text-admin-ink-muted text-admin-11">{MOCK_CIRCLE.length} people in your circle</span>
      <SecondaryButton onClick={() => toast("Find someone to add…")}>Add person</SecondaryButton>
    </div>
  );

  return (
    <DrawerShell open={open} onClose={closeDrawer} title="My Circle" description="People you trust to work with — quickly recommend them into bookings." footer={footer} defaultSize="half">
      <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>

        {/* Why this exists */}
        <div style={{ border: `1px solid ${COLORS.royalSoft}`, padding: 12 }} className="bg-admin-royal-soft rounded-admin-md">
          <div className="flex items-center gap-1.5">
            <Icon name="sparkle" size={12} color={COLORS.royal} stroke={1.7} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }} className="text-admin-royal">About your Circle</span>
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 12, lineHeight: 1.45 }} className="text-admin-ink-muted">
            When a coordinator needs more crew, you can recommend someone from your Circle in one tap.
            They get an invite with your endorsement attached. No more digging through 2,000 profiles.
          </p>
        </div>

        {/* Search + filters */}
        <div className="flex flex-col gap-2">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, role, or tag…"
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "9px 12px 9px 32px", borderRadius: 8,
                border: `1px solid ${COLORS.border}`, background: COLORS.surface,
                fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink, outline: "none",
              }}
            />
            <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}>
              <Icon name="search" size={13} color={COLORS.inkDim} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 2 }}>
            {roleFilters.map(r => {
              const active = filterRole === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setFilterRole(r)}
                  style={{
                    flexShrink: 0,
                    padding: "5px 11px", borderRadius: 999,
                    border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                    background: active ? COLORS.fill : "transparent",
                    color: active ? "#fff" : COLORS.inkMuted,
                    fontSize: 11.5, fontWeight: active ? 600 : 500, fontFamily: FONTS.body,
                    cursor: "pointer", textTransform: "capitalize",
                  }}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </div>

        {/* List */}
        <div className="flex flex-col gap-1.5">
          {filtered.length === 0 && (
            <div style={{ padding: "24px 12px", textAlign: "center", fontSize: 12 }} className="text-admin-ink-dim">
              No matches. Try a different search.
            </div>
          )}
          {filtered.map(m => (
            <div key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", background: COLORS.surface, borderRadius: RADIUS.md, border: `1px solid ${COLORS.border}` }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: COLORS.borderStrong, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span className="text-admin-ink-muted text-xs font-bold">{m.name.split(" ").map(w => w[0]).join("").slice(0, 2)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-admin-ink text-admin-13 font-semibold">{m.name}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 600, background: "rgba(11,11,13,0.05)", padding: "1px 7px", borderRadius: 999 }} className="text-admin-ink-muted">{m.role}</span>
                </div>
                <div style={{ fontSize: 11.5, marginTop: 3 }} className="text-admin-ink-muted">{m.lastCollab}</div>
                {m.note && (
                  <div style={{ fontSize: 11.5, marginTop: 3, fontStyle: "italic" }} className="text-admin-ink-muted">&quot;{m.note}&quot;</div>
                )}
                <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
                  {m.tags.map(t => (
                    <span key={t} style={{ fontSize: 10, color: COLORS.inkMuted, background: COLORS.borderSoft, padding: "1px 6px", borderRadius: 4 }}>{t}</span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toast(`${m.name} removed from circle`)}
                aria-label={`Remove ${m.name}`}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 6, color: COLORS.inkDim, alignSelf: "flex-start" }}
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </DrawerShell>
  );
}

// ── Recommend from circle drawer ──
// Used by a coordinator to invite a circle member into a current booking.

export function CircleRecommendDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "circle-recommend";
  const inquiryId = (state.drawer.payload?.inquiryId as string) ?? "RI-201";
  const role = (state.drawer.payload?.role as string) ?? "any";

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");

  const filtered = MOCK_CIRCLE.filter(m => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!m.name.toLowerCase().includes(q) && !m.role.toLowerCase().includes(q)) return false;
    }
    if (role !== "any" && !m.role.toLowerCase().includes(role.toLowerCase())) return false;
    return true;
  });

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const send = () => {
    toast(`Recommended ${selected.size} ${selected.size === 1 ? "person" : "people"} to ${inquiryId}`);
    closeDrawer();
  };

  const footer = (
    <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
      <span className="text-admin-ink-muted text-admin-11">{selected.size} selected</span>
      <div className="flex gap-2">
        <GhostButton onClick={closeDrawer}>Cancel</GhostButton>
        <SecondaryButton onClick={send}>Send recommendation</SecondaryButton>
      </div>
    </div>
  );

  return (
    <DrawerShell open={open} onClose={closeDrawer} title="Recommend from your Circle" description={`Invite trusted collaborators into ${inquiryId}.`} footer={footer} defaultSize="half">
      <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your circle…"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "9px 12px 9px 32px", borderRadius: 8,
              border: `1px solid ${COLORS.border}`, background: COLORS.surface,
              fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink, outline: "none",
            }}
          />
          <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}>
            <Icon name="search" size={13} color={COLORS.inkDim} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          {filtered.map(m => {
            const isSelected = selected.has(m.id);
            return (
              <div
                key={m.id}
                onClick={() => toggle(m.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "11px 14px", borderRadius: RADIUS.md,
                  background: isSelected ? COLORS.accentSoft : COLORS.surface,
                  border: `1.5px solid ${isSelected ? COLORS.accent : COLORS.border}`,
                  cursor: "pointer", transition: TRANSITION.sm,
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: "50%",
                  border: `2px solid ${isSelected ? COLORS.accent : COLORS.border}`,
                  background: isSelected ? COLORS.accent : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {isSelected && <span style={{ fontSize: 11, color: "#fff" }}>✓</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-admin-ink text-admin-13 font-semibold">{m.name}</div>
                  <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">{m.role} · {m.lastCollab}</div>
                </div>
              </div>
            );
          })}
        </div>

        <FieldRow label="Note to coordinator (optional)">
          <TextArea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why these people for this brief?" rows={2} />
        </FieldRow>
      </div>
    </DrawerShell>
  );
}

