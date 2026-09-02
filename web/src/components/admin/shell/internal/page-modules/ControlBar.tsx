"use client";

import { useEffect, useState } from "react";
import { useDashboardText } from "../dashboard-i18n";
import { CLIENT_PAGES, CLIENT_PAGE_META, COLORS, ENTITY_TYPES, ENTITY_TYPE_META, FONTS, PAGE_META, PLANS, PLAN_META, ROLES, ROLE_META, SURFACES, SURFACE_META, TALENT_PAGES, TALENT_PAGE_META, TRANSITION, Z, useAdminShell } from "../state";
import type { ClientPage, EntityType, Plan, Role, Surface, TalentPage, WorkspacePage } from "../state";

// ════════════════════════════════════════════════════════════════════
// Prototype control bar
// ════════════════════════════════════════════════════════════════════

export function ControlBar() {
  const {
    state,
    setSurface,
    devSetPlan,
    setRole,
    setEntityType,
    setAlsoTalent,
    setPage,
    setTalentPage,
    setClientPage,
    setClientProfile,
    bridgeTenantIdentity,
  } = useAdminShell();
  const copy = useDashboardText();

  // Audit item #6 (hardened): real LIVE tenants never see the prototype
  // bar. Gated to standalone demo mode (no real bridged tenant) or an
  // explicit ?dev=1 engineer opt-in. `bridgeTenantIdentity` is the
  // canonical real-vs-demo signal (null = standalone demo). This is
  // defense-in-depth alongside the floating-toggle gate so a stale
  // `tulala_dev_controls=1` localStorage can't resurrect it for a real
  // signed-in user.
  const [devPermitted, setDevPermitted] = useState(!bridgeTenantIdentity);

  // Dev controls are only useful while building/demoing the prototype.
  // Hide them in non-dev environments unless the URL opts in via ?dev=1.
  // This lets us share the prototype with non-developers without the
  // dark debug strip dominating the screen.
  const [devVisible, setDevVisible] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const stored = window.localStorage.getItem("tulala_dev_controls");
    if (params.get("dev") === "0") {
      setDevVisible(false);
    } else if (params.get("dev") === "1") {
      setDevVisible(true);
      setDevPermitted(true);
      try { window.localStorage.setItem("tulala_dev_controls", "1"); } catch {}
    } else if (stored === "0") {
      setDevVisible(false);
    }
  }, []);
  if (!devPermitted || !devVisible) return null;

  return (
    <header
      role="banner"
      aria-label="Prototype control bar"
      style={{
        background: COLORS.fill,
        color: "#fff",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        padding: "6px 14px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        rowGap: 6,
        position: "sticky",
        top: 0,
        zIndex: Z.controlBar,
        fontFamily: FONTS.body,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 6 }}>
        <span
          style={{
            display: "inline-flex",
            width: 22,
            height: 22,
            borderRadius: 5,
            background: "rgba(255,255,255,0.10)",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
          }}
        >
          ◆
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.72)",
          }}
        >
          Prototype
        </span>
      </div>

      <SegmentedControl
        label="Surface"
        value={state.surface}
        options={SURFACES.map((s) => ({
          value: s,
          label: SURFACE_META[s].short,
          disabledHint: SURFACE_META[s].ready ? undefined : "stub",
        }))}
        onChange={(v) => setSurface(v as Surface)}
      />

      {state.surface === "workspace" && (
        <>
          {/* Plan switcher — prototype/demo ONLY. `devSetPlan` is a hard
              no-op once a real tenant is bridged in (their tier is
              `agencies.plan_tier`, and faking the client copy just produces a
              UI that lies until the next reload), so the control is hidden
              rather than rendered dead. Real tier changes go through the
              upgrade modal and Stripe Checkout. */}
          {!bridgeTenantIdentity && (
            <SegmentedControl
              label="Plan"
              value={state.plan}
              options={PLANS.map((p) => ({ value: p, label: PLAN_META[p].label }))}
              onChange={(v) => devSetPlan(v as Plan)}
            />
          )}
          <SegmentedControl
            label="Entity"
            value={state.entityType}
            options={ENTITY_TYPES.map((e) => ({ value: e, label: ENTITY_TYPE_META[e].label }))}
            onChange={(v) => setEntityType(v as EntityType)}
          />
          <SegmentedControl
            label="Role"
            value={state.role}
            options={ROLES.map((r) => ({ value: r, label: ROLE_META[r].label }))}
            onChange={(v) => setRole(v as Role)}
          />
          <ToggleControl
            label="Also on roster"
            on={state.alsoTalent}
            onChange={setAlsoTalent}
          />
          <SegmentedControl
            label="Page"
            value={state.page}
            options={state.visiblePages.map((p) => ({ value: p, label: PAGE_META[p].label }))}
            onChange={(v) => setPage(v as WorkspacePage)}
          />
        </>
      )}

      {state.surface === "talent" && (
        <SegmentedControl
          label="Page"
          value={state.talentPage}
          options={TALENT_PAGES.map((p) => ({ value: p, label: copy.t(TALENT_PAGE_META[p].label) }))}
          onChange={(v) => setTalentPage(v as TalentPage)}
        />
      )}



      <div style={{ flex: 1 }} />
      {/* Hide-controls toggle — sets localStorage so future visits stay
          hidden. Re-enable by appending ?dev=1 to the URL. */}
      <button
        type="button"
        onClick={() => {
          try { window.localStorage.setItem("tulala_dev_controls", "0"); } catch {}
          setDevVisible(false);
        }}
        title="Hide dev controls (re-enable with ?dev=1)"
        style={{
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,0.45)",
          fontFamily: FONTS.body,
          fontSize: 10,
          letterSpacing: 0.2,
          cursor: "pointer",
          padding: "4px 6px",
        }}
      >
        Hide
      </button>
    </header>
  );
}

function SegmentedControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; disabledHint?: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        style={{
          fontSize: 9.5,
          color: "rgba(255,255,255,0.45)",
          letterSpacing: 0.8,
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <div
        style={{
          display: "inline-flex",
          background: "rgba(255,255,255,0.06)",
          borderRadius: 6,
          padding: 1.5,
          gap: 0,
        }}
      >
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              style={{
                background: active ? "rgba(255,255,255,0.94)" : "transparent",
                color: active ? "#0F0F11" : "rgba(255,255,255,0.78)",
                border: "none",
                padding: "3px 8px",
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: 0.05,
                fontFamily: FONTS.body,
                cursor: "pointer",
                borderRadius: 4,
                whiteSpace: "nowrap",
                transition: `background ${TRANSITION.micro}, color ${TRANSITION.micro}`,
              }}
            >
              {opt.label}
              {opt.disabledHint && (
                <span style={{ marginLeft: 5, opacity: 0.5, fontSize: 10 }}>
                  · {opt.disabledHint}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ToggleControl({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: on ? "rgba(255,255,255,0.94)" : "rgba(255,255,255,0.06)",
        color: on ? "#0F0F11" : "rgba(255,255,255,0.78)",
        border: "none",
        padding: "4px 9px",
        fontSize: 11,
        fontWeight: 500,
        fontFamily: FONTS.body,
        cursor: "pointer",
        borderRadius: 6,
        transition: `background ${TRANSITION.micro}, color ${TRANSITION.micro}`,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: on ? COLORS.green : "rgba(255,255,255,0.30)",
        }}
      />
      {label}
    </button>
  );
}

// Time-aware greeting for the overview page header.
export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// Mock storefront analytics — centralised so the numbers aren't
// scattered as magic literals across multiple render calls.
export const MOCK_STOREFRONT_STATS = { views7d: 284, viewsGrowth: "+18%" };
const ME_EMAIL = "orantenemx@gmail.com";

// WS-3.2 — icon map updated for 6-page nav. Now mirrors PAGE_META.icon
// (kept local for the IconName cast). Legacy aliases still present so
// any path that references them doesn't blow up at runtime.
export const PAGE_ICON: Record<string, "bolt" | "mail" | "calendar" | "team" | "user" | "settings" | "globe" | "credit" | "arrow-right"> = {
  // ── canonical 6 ──
  overview:  "bolt",
  messages:  "mail",
  calendar:  "calendar",
  roster:    "team",
  clients:   "user",
  settings:  "settings",
  // ── legacy aliases ──
  inbox:     "mail",
  work:      "arrow-right",
  talent:    "team",
  site:      "globe",
  billing:   "credit",
  workspace: "settings",
};
