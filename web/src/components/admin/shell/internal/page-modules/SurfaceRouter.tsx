"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { COLORS, FONTS, PLAN_META, useAdminShell } from "../state";
import type { Plan, Surface } from "../state";
import { ControlBar } from "./ControlBar";
import { HybridShell, WorkspaceShell } from "./WorkspaceShell";
import { TalentSurface } from "../talent";
import { PlatformSurface } from "./pages-dynamic";


// ════════════════════════════════════════════════════════════════════
// Surface router
// ════════════════════════════════════════════════════════════════════

export function SurfaceRouter() {
  const { state } = useAdminShell();
  const t = useT();
  // Wrap each surface in a <main> landmark so screen readers can jump
  // directly past the dark prototype ControlBar (which is treated as a
  // toolbar/header in the page composition). Each surface has only one
  // <main> at a time — surfaces are mutually exclusive.
  const inner = (() => {
    switch (state.surface) {
      case "workspace":
        // WorkspaceShell wraps with HybridShell internally so the
        // persistent identity bar renders above the inner shell.
        return <WorkspaceShell />;
      case "talent":
        // Wrap talent here at the router level — avoids a circular
        // import that would happen if _talent.tsx pulled HybridShell
        // from _pages.tsx (since _pages.tsx imports TalentSurface).
        return (
          <HybridShell>
            <TalentSurface />
          </HybridShell>
        );
      case "platform":
        return <PlatformSurface />;
    }
  })();
  return (
    <main id="tulala-main" tabIndex={-1} aria-label={interpolate(t("dashboard.adminShell.surfaceLandmark"), { surface: state.surface })} style={{ display: "contents", outline: "none" }}>
      {inner}
      <UpgradeCelebration />
    </main>
  );
}

// ════════════════════════════════════════════════════════════════════
// UpgradeCelebration — fires when plan ranks up (Free → Studio → Agency
// → Network). Shows a brief, premium overlay listing the new unlocks.
// Auto-dismisses after 6s; the user can also tap to skip.
// ════════════════════════════════════════════════════════════════════
function UpgradeCelebration() {
  const { state } = useAdminShell();
  const t = useT();
  const planRanks: Record<Plan, number> = {
    free: 0, website: 1, studio: 2, agency: 3, network: 4,
  };
  const SS_KEY = "tulala_prev_plan";
  const [showing, setShowing] = useState<Plan | null>(null);

  // 2026 redesign — fire on any "first time seeing this plan this session"
  // where the plan rank increased. Uses sessionStorage as the source of
  // truth so URL navigation, in-app setPlan, or page reload all trigger
  // consistently. Side-effect-free guard via a ref + timeout.
  const checkedRef = useRef<string | null>(null);
  useEffect(() => {
    const key = state.plan;
    if (checkedRef.current === key) return; // already checked this plan in this mount
    checkedRef.current = key;
    let prev: Plan | null = null;
    try { prev = window.sessionStorage.getItem(SS_KEY) as Plan | null; } catch {}
    // Persist the "last seen plan" each time, regardless of celebration.
    try { window.sessionStorage.setItem(SS_KEY, key); } catch {}
    if (!prev) return; // first time in session — don't celebrate
    if (prev === key) return;
    if (planRanks[key] <= planRanks[prev]) return; // downgrade or sideways
    setShowing(key);
    const t = setTimeout(() => setShowing(null), 6000);
    return () => clearTimeout(t);
  }, [state.plan]);

  if (!showing) return null;

  const unlockKeys: Record<Plan, string[]> = {
    free:    [],
    website: ["customDomain", "bilingualSite", "formsInbox", "acceptPayments"],
    studio:  ["customDomain", "ownedClientList", "upTo50Talents", "privateInquiryInbox"],
    agency:  ["brandedDesignSystem", "customRosterFields", "teamRoles25", "upTo200Talents"],
    network: ["multiBrandWorkspaces", "crossRosterPool", "hubAnalytics", "unlimitedEverything"],
  };
  const tier = showing;
  const tierMeta: Record<Plan, { color: string; soft: string; emoji: string }> = {
    free:    { color: COLORS.inkMuted,  soft: "rgba(11,11,13,0.05)",   emoji: "🌱" },
    website: { color: "#166F65",         soft: "rgba(20,120,110,0.12)", emoji: "◈" },
    studio:  { color: "#3B4A75",         soft: "rgba(91,107,160,0.12)", emoji: "✦" },
    agency:  { color: "#7A5A1F",         soft: "rgba(184,135,49,0.16)", emoji: "★" },
    network: { color: COLORS.accentDeep, soft: "rgba(15,79,62,0.12)",   emoji: "◆" },
  };
  const meta = tierMeta[tier];
  const items = (unlockKeys[tier] ?? []).map((k) =>
    t(`dashboard.adminShell.upgradeCelebration.unlocks.${tier}.${k}`),
  );

  return (
    <div
      onClick={() => setShowing(null)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 250,
        background: "rgba(11,11,13,0.45)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "tulala-celebrate-fade-in 0.3s ease",
      }}
    >
      <style>{`
        @keyframes tulala-celebrate-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes tulala-celebrate-pop {
          0%   { transform: scale(0.92) translateY(12px); opacity: 0; }
          60%  { transform: scale(1.02) translateY(0); opacity: 1; }
          100% { transform: scale(1)    translateY(0); opacity: 1; }
        }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "calc(100% - 48px)",
          maxWidth: 420,
          background: "#fff",
          borderRadius: 20,
          padding: 28,
          fontFamily: FONTS.body,
          boxShadow: "0 24px 80px -20px rgba(11,11,13,0.45)",
          animation: "tulala-celebrate-pop 0.45s cubic-bezier(.2,.9,.3,1.2)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: meta.soft,
            color: meta.color,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 30,
            margin: "0 auto 16px",
            boxShadow: `0 8px 32px -8px ${meta.soft}`,
          }}
        >
          {meta.emoji}
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.4,
            color: meta.color,
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          {interpolate(t("dashboard.adminShell.upgradeCelebration.welcomeTo"), {
            plan: PLAN_META[tier].label,
          })}
        </div>
        <h2 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 22, fontWeight: 600, letterSpacing: -0.3, lineHeight: 1.2, marginBottom: 12 }} className="text-admin-ink">
          {interpolate(
            t(
              items.length === 1
                ? "dashboard.adminShell.upgradeCelebration.unlockedOne"
                : "dashboard.adminShell.upgradeCelebration.unlockedOther",
            ),
            { count: items.length },
          )}
        </h2>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            margin: "0 0 20px",
            textAlign: "left",
          }}
        >
          {items.map((u) => (
            <div
              key={u}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderRadius: 10,
                background: meta.soft,
                fontSize: 13,
                color: COLORS.ink,
                fontWeight: 500,
              }}
            >
              <span style={{ color: meta.color, fontSize: 13, lineHeight: 1, fontWeight: 700 }}>✓</span>
              {u}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowing(null)}
          style={{
            padding: "10px 22px",
            borderRadius: 999,
            border: "none",
            background: COLORS.fill,
            color: "#fff",
            fontFamily: FONTS.body,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {t("dashboard.adminShell.upgradeCelebration.takeMeIn")}
        </button>
        <div style={{ marginTop: 8, fontSize: 10.5 }} className="text-admin-ink-dim">
          {t("dashboard.adminShell.upgradeCelebration.dismissHint")}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Mobile bottom tab bar
// ════════════════════════════════════════════════════════════════════
/**
 * Native-app-style bottom tab bar — only visible at mobile widths via
 * page.tsx CSS. Mirrors a curated 5-tab subset of the active surface's
 * pages. The "More" tab opens a sheet listing remaining pages.
 *
 * On wider viewports the bar is `display: none` so desktop UX is
 * untouched (page nav still lives in the topbar there).
 */
export const MOBILE_TAB_LIMIT = 5;
