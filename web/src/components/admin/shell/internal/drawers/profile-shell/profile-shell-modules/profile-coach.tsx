// Phase-1f decomp — onboarding & coach surfaces: required-fields coach
// (inline + header pill), the popover "More actions" mobile menu, the
// first-time hero card (3-step new-profile prompt), and the growth-metric
// strip shown to published talent.
"use client";
import React, { useState, useEffect, useRef, useId } from "react";
import {
  COLORS,
  FONTS,
  SizeIcon,
  type DrawerSize,
  useDashboardText,
} from "../../drawer-shared";
import { ProfileSectionId } from "./profile-state";

export function RequiredCoach({ missing, onJump }: {
  missing: { id: string; label: string; met: boolean }[];
  onJump: (id: string) => void;
}) {
  const copy = useDashboardText();
  return (
    <div style={{ borderRadius: 12, border: `1px solid rgba(91,107,160,0.18)`, padding: 14, fontFamily: FONTS.body }} className="bg-admin-indigo-soft">
      <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6 }} className="text-admin-indigo-deep">
        {copy.addToPublish(missing.length)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {missing.map(m => (
          <button key={m.id} type="button" onClick={() => onJump(m.id)} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 8px", borderRadius: 8, border: "none",
            background: "rgba(255,255,255,0.6)", cursor: "pointer", textAlign: "left",
            fontFamily: FONTS.body,
          }}>
            <span style={{ width: 16, height: 16, borderRadius: "50%", border: `1.5px solid ${COLORS.indigoDeep}`, flexShrink: 0, }} />
            <span style={{ fontSize: 12, flex: 1 }} className="text-admin-ink">{copy.isSpanish ? `Agregar ${copy.t(m.label)}` : `Add ${m.label}`}</span>
            <span className="text-admin-indigo-deep text-sm">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Compact header chip — same data as RequiredCoach, but lives in the
// drawer header next to the title. Click opens a small popover anchored
// below with the missing items + jump-to actions. Replaces the bulky
// in-form banner that used to push the form down on every drawer open.

export function HeaderPublishCoach({ missing, onJump }: {
  missing: { id: string; label: string; met: boolean }[];
  onJump: (id: string) => void;
}) {
  const copy = useDashboardText();
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (missing.length === 0) return null;
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = "rgba(91,107,160,0.20)"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = COLORS.indigoSoft; }}
        style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          padding: "6px 8px 6px 11px", borderRadius: 999,
          border: `1px solid rgba(91,107,160,0.40)`,
          background: open ? "rgba(91,107,160,0.20)" : COLORS.indigoSoft, color: COLORS.indigoDeep,
          fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 600,
          cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.55)",
        }}
      >
        {/* A checklist icon, not a bare dot — the old 6px circle was the same
            indigo as the pill and read as meaningless noise. This says, at a
            glance, "there's a list of things to finish before publishing"
            (which is exactly what the dropdown shows). */}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m3 17 2 2 4-4" />
          <path d="m3 7 2 2 4-4" />
          <path d="M13 6h8" />
          <path d="M13 12h8" />
          <path d="M13 18h8" />
        </svg>
        {copy.addToPublish(missing.length)}
        {/* Split-control divider + a real chevron that rotates when open. The
            old 9px ▾ at 70% opacity was invisible, so the pill read as a static
            badge — users couldn't tell it opens a menu. The divider + caret make
            the dropdown affordance unmistakable. */}
        <span aria-hidden className="ml-0.5 h-3.5 w-px bg-current opacity-30" />
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          className={"transition-transform duration-150 " + (open ? "rotate-180" : "")}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div role="menu" style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0,
          minWidth: 240, zIndex: 20,
          background: "#fff", borderRadius: 12,
          border: `1px solid ${COLORS.borderSoft}`,
          boxShadow: "0 12px 32px -8px rgba(11,11,13,0.18)",
          padding: 6, fontFamily: FONTS.body,
        }}>
          {missing.map(m => (
            <button key={m.id} type="button" role="menuitem"
              onClick={() => { onJump(m.id); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 10px", width: "100%",
                borderRadius: 8, border: "none",
                background: "transparent", cursor: "pointer", textAlign: "left",
                fontFamily: FONTS.body,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(11,11,13,0.04)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span aria-hidden style={{
                width: 14, height: 14, borderRadius: "50%",
                border: `1.5px solid ${COLORS.indigoDeep}`, flexShrink: 0,
              }} />
              <span style={{ fontSize: 12.5, flex: 1 }} className="text-admin-ink">{copy.isSpanish ? `Agregar ${copy.t(m.label)}` : `Add ${m.label}`}</span>
              <span aria-hidden style={{ color: COLORS.indigoDeep, fontSize: 13 }}>›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Overflow menu — the single home for every secondary action, shown at
// ALL drawer widths (the old desktop-only header strip is gone, so there's
// no more desktop/mobile duplication and the toolbar can't overflow into a
// "mobile menu" at the default width). Carries: View as client · Review
// changes · Full editor · Drawer size · Save & exit · Remove from roster.
// The primary actions (status chip, undo/redo, Save, publish) keep their
// permanent slots in the header.

export function ProfileShellMobileMenu({
  adminVisible, isSelf, primaryTypeSet,
  onViewAsClient, onSaveAndExit,
  onOpenFullEditor, onRemoveFromRoster,
  onReviewChanges,
  drawerSize, customWidth, onSetDrawerSize,
}: {
  adminVisible: boolean;
  isSelf: boolean;
  primaryTypeSet: boolean;
  onViewAsClient: () => void;
  onSaveAndExit: () => void;
  /** Phase 3 — admin-only escape hatch to the canonical /{slug}/admin/
   *  roster/[id] page. Provided as a callback so the menu doesn't need
   *  to know how URLs are built. */
  onOpenFullEditor?: () => void;
  /** Phase 3 — admin-only destructive action. Severs the agency
   *  relationship; talent keeps Tulala account. Confirmation handled
   *  by the parent component. */
  onRemoveFromRoster?: () => void;
  /** #3 redesign — admin-only diff modal trigger. Now reachable at every
   *  drawer width (it used to live only in the desktop-only strip that
   *  this menu replaces). */
  onReviewChanges?: () => void;
  /** #3 redesign — drawer size presets, relocated from the header into
   *  this menu so the toolbar stays uncluttered at every width. */
  drawerSize: DrawerSize;
  customWidth: number | null;
  onSetDrawerSize: (sz: DrawerSize) => void;
}) {
  const copy = useDashboardText();
  const [open, setOpen] = useState(false);
  // Native popover migration: browser handles outside-click + escape via
  // popover="auto". Position is computed against the trigger when the
  // toggle event fires, since top-layer elements don't inherit
  // containing-block positioning from their parent.
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverId = useId().replace(/:/g, "");
  const fullId = `pshell-menu-${popoverId}`;
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  useEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    const onToggle = (e: Event) => {
      const isOpen = (e as ToggleEvent).newState === "open";
      setOpen(isOpen);
      if (isOpen && triggerRef.current) {
        const r = triggerRef.current.getBoundingClientRect();
        // Option A — anchor the menu's right edge a few pixels OUTSIDE the
        // trigger's right edge so the trigger sits flush at the top-right
        // corner of the menu. Visually reads as "menu drops straight from
        // the dots", not "menu floats off to the left".
        const offsetRight = -2; // negative = menu extends further right
        setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right + offsetRight) });
      }
    };
    el.addEventListener("toggle", onToggle);
    return () => el.removeEventListener("toggle", onToggle);
  }, []);
  // Helper: close the native popover from inside (menu-item clicks).
  // Browser clears top-layer + fires the toggle event which clears React state.
  const close = () => {
    const el = popoverRef.current;
    if (el && typeof (el as HTMLElement & { hidePopover?: () => void }).hidePopover === "function") {
      try { (el as HTMLElement & { hidePopover: () => void }).hidePopover(); return; } catch {}
    }
    setOpen(false);
  };
  return (
    <div data-pshell-mobile-menu style={{ position: "relative", display: "inline-block", flexShrink: 0 }}>
      <button
        ref={triggerRef}
        type="button"
        {...({ popoverTarget: fullId, popoverTargetAction: "toggle" } as Record<string, string>)}
        aria-label={copy.t("More actions")}
        aria-expanded={open}
        aria-controls={fullId}
        style={{
          width: 28, height: 28, borderRadius: 8,
          border: "none",
          background: open ? "rgba(11,11,13,0.06)" : "transparent",
          color: COLORS.ink,
          fontSize: 18, lineHeight: 1, letterSpacing: 1, cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontFamily: FONTS.body, padding: 0,
          transition: "background 0.12s",
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = "rgba(11,11,13,0.04)"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "transparent"; }}
      >⋯</button>
      <div
        ref={popoverRef}
        id={fullId}
        role="menu"
        {...({ popover: "auto" } as Record<string, string>)}
        style={{
          // Native [popover] applies a default `left: 0` via UA stylesheet
          // which fights `right`. Override with `left: auto` so right-anchor
          // wins and the menu actually drops below the trigger.
          position: "fixed", top: pos.top, right: pos.right, left: "auto", bottom: "auto",
          background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 12,
          boxShadow: "0 16px 40px -8px rgba(11,11,13,0.25)",
          minWidth: 200, padding: 4,
          margin: 0,
          fontFamily: FONTS.body,
        }}>
            <>
                <PMobileMenuItem
                  icon="👁" label="View as client"
                  onClick={() => { onViewAsClient(); close(); }}
                />
                {/* #3 redesign — Review changes joins the menu so admins can
                    reach the diff at every drawer width. It used to live only
                    in the desktop strip that this menu now replaces. */}
                {adminVisible && onReviewChanges && (
                  <PMobileMenuItem
                    icon="⇆" label="Review changes"
                    onClick={() => { onReviewChanges(); close(); }}
                  />
                )}
                {/* Apply template / Save as template were prototype-only —
                    no DB schema for templates exists yet. Hidden until
                    talent_profile_templates ships so we don't promise
                    persistence we can't deliver. */}
                {/* Phase 3 — admin-only Full editor escape hatch + Remove
                    from roster. Mirrors the desktop header-extras buttons
                    which are responsive-hidden at narrow drawer widths. */}
                {adminVisible && onOpenFullEditor && (
                  <>
                    <div style={{ height: 1, background: COLORS.borderSoft, margin: "4px 6px" }} />
                    <PMobileMenuItem
                      icon="↗" label="Open full editor"
                      onClick={() => { onOpenFullEditor(); close(); }}
                    />
                  </>
                )}

                {/* Drawer size — relocated here from the header to declutter
                    the toolbar. Utility classes (not inline style) keep this
                    within the file's inline-style ratchet budget. */}
                <div className="h-px my-1 mx-1.5 bg-black/10" />
                <div className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-admin-ink-dim">{copy.t("Drawer size")}</div>
                <div className="flex gap-1 px-2.5 pb-1.5">
                  {(["compact", "half", "full"] as DrawerSize[]).map((sz) => {
                    const active = customWidth === null && drawerSize === sz;
                    return (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => { onSetDrawerSize(sz); }}
                        aria-label={`${sz} size`}
                        title={sz === "compact" ? copy.t("Side drawer") : sz === "half" ? copy.t("Half-page") : copy.t("Full-page")}
                        className={
                          "inline-flex flex-1 items-center justify-center rounded-md py-1.5 transition-colors " +
                          (active ? "bg-white shadow-sm text-admin-ink" : "text-admin-ink-muted hover:bg-black/[0.04]")
                        }
                      >
                        <SizeIcon variant={sz} />
                      </button>
                    );
                  })}
                </div>

                <div style={{ height: 1, background: COLORS.borderSoft, margin: "4px 6px" }} />
                <PMobileMenuItem
                  icon="💾" label="Save & exit"
                  onClick={() => { onSaveAndExit(); close(); }}
                />
                {adminVisible && onRemoveFromRoster && (
                  <>
                    <div style={{ height: 1, background: "rgba(200,40,40,0.16)", margin: "4px 6px" }} />
                    <button
                      type="button"
                      onClick={() => { onRemoveFromRoster(); close(); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        width: "100%", padding: "9px 12px", borderRadius: 7,
                        border: "none", background: "transparent",
                        color: "#C82828", fontFamily: FONTS.body,
                        fontSize: 13, fontWeight: 600, cursor: "pointer",
                        textAlign: "left",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(200,40,40,0.06)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span aria-hidden style={{ width: 16, fontSize: 14 }}>✕</span>
                      <span>{copy.t("Remove from roster")}</span>
                    </button>
                  </>
                )}
              </>
      </div>
    </div>
  );
}


export function PMobileMenuItem({ icon, label, onClick, disabled, shortcut, hasSubmenu }: {
  icon: string; label: string; onClick: () => void;
  disabled?: boolean; shortcut?: string; hasSubmenu?: boolean;
}) {
  const copy = useDashboardText();
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px", borderRadius: 8, border: "none",
      background: "transparent", cursor: disabled ? "not-allowed" : "pointer",
      textAlign: "left", fontFamily: FONTS.body,
      opacity: disabled ? 0.45 : 1,
    }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = COLORS.surfaceAlt; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ width: 22, fontSize: 14, textAlign: "center", flexShrink: 0 }} className="text-admin-ink-muted">{icon}</span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }} className="text-admin-ink">{copy.t(label)}</span>
      {shortcut && (
        <span style={{ fontSize: 10, fontFamily: FONTS.mono, background: "rgba(11,11,13,0.04)", padding: "2px 6px", borderRadius: 4 }} className="text-admin-ink-dim">{shortcut}</span>
      )}
      {hasSubmenu && <span className="text-admin-ink-dim text-admin-13">›</span>}
    </button>
  );
}

// #2 — First-time hero on the Profile Shell. Shows below 35% to coach
// the talent through the 3 highest-leverage things to do first.

export function FirstTimeHero({ completeness, onStart, talentId }: {
  completeness: number;
  onStart: (sectionId: ProfileSectionId) => void;
  talentId: string;
}) {
  const [dismissed, setDismissed] = React.useState(false);
  const steps: { id: ProfileSectionId; label: string; helper: string; emoji: string }[] = [
    { id: "media",    label: "Add a photo",   helper: "One headshot is enough to start.", emoji: "📷" },
    { id: "services", label: "Pick what you do", helper: "What clients book you as.",     emoji: "🎯" },
    { id: "location", label: "Set your base", helper: "City + travel range.",              emoji: "📍" },
  ];
  if (dismissed) return null;
  return (
    <div style={{
      position: "relative",
      marginTop: 12, padding: 14, borderRadius: 12,
      background: "linear-gradient(135deg, rgba(15,79,62,0.06) 0%, rgba(91,107,160,0.06) 100%)",
      border: `1px solid ${COLORS.borderSoft}`,
      fontFamily: FONTS.body,
    }}>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem("tulala.welcome.dismissed." + talentId, "1");
          setDismissed(true);
        }}
        style={{
          position: "absolute", top: 8, right: 8,
          background: "none", border: "none", cursor: "pointer",
          color: COLORS.inkMuted, fontSize: 14, lineHeight: 1,
          padding: "2px 4px",
        }}
        aria-label="Dismiss"
      >×</button>
      <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 4 }} className="text-admin-ink">
        Welcome — let&apos;s start with 3 things
      </div>
      <div style={{ fontSize: 11, marginBottom: 10, lineHeight: 1.5 }} className="text-admin-ink-muted">
        Each takes about 30 seconds. You can polish the rest later.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {steps.map((s, i) => (
          <button key={s.id} type="button" onClick={() => onStart(s.id)} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: 9, border: "none",
            background: "#fff", cursor: "pointer", textAlign: "left",
            fontFamily: FONTS.body,
          }}>
            <span style={{ width: 22, height: 22, borderRadius: "50%", border: `1px solid ${COLORS.borderSoft}`, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} className="bg-admin-surface text-admin-ink-muted">{i + 1}</span>
            <span className="flex-1 min-w-0">
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 600 }} className="text-admin-ink">{s.emoji}  {s.label}</span>
              <span style={{ display: "block", fontSize: 10.5, marginTop: 1 }} className="text-admin-ink-muted">{s.helper}</span>
            </span>
            <span className="text-admin-ink-dim text-sm">›</span>
          </button>
        ))}
      </div>
      <div style={{ fontSize: 10, marginTop: 8 }} className="text-admin-ink-dim">
        Profile is {completeness}% complete · publish at 100%
      </div>
    </div>
  );
}

// #19 — Profile growth metric. Shown to talent on a published profile.
// Mock-data for now (would pull from analytics in production).

export function ProfileGrowthMetric({ onJump }: { onJump: () => void }) {
  // Stable mock — would come from /analytics/talent/{id}/last-7d
  const views = 47;
  const inquiries = 3;
  const trend = +12; // percent change vs prior week
  return (
    <div style={{
      marginTop: 12, padding: 12, borderRadius: 12,
      background: "#fff",
      border: `1px solid ${COLORS.borderSoft}`,
      boxShadow: "0 1px 2px rgba(11,11,13,0.03)",
      fontFamily: FONTS.body,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }} className="text-admin-ink-muted">Last 7 days</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: trend >= 0 ? COLORS.successDeep : COLORS.amberDeep }}>
          {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}%
        </span>
      </div>
      <div className="flex gap-2.5">
        <div className="flex-1">
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }} className="text-admin-ink">{views}</div>
          <div style={{ fontSize: 10.5, marginTop: 1 }} className="text-admin-ink-muted">Profile views</div>
        </div>
        <div style={{ width: 1, background: COLORS.borderSoft }} />
        <div className="flex-1">
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }} className="text-admin-ink">{inquiries}</div>
          <div style={{ fontSize: 10.5, marginTop: 1 }} className="text-admin-ink-muted">Inquiries</div>
        </div>
      </div>
      <button type="button" onClick={onJump} style={{
        marginTop: 8, padding: "5px 10px", borderRadius: 999,
        background: "transparent", border: `1px dashed ${COLORS.border}`,
        color: COLORS.inkMuted,
        fontSize: 10.5, fontWeight: 500, cursor: "pointer",
        fontFamily: FONTS.body,
      }}>↑ Refresh photos to boost views</button>
    </div>
  );
}
