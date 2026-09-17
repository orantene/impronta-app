"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CapNudge, GhostButton, PrimaryButton, ReadOnlyChip } from "../primitives";
import { SkillDiscoveryPanel } from "../skill-discovery-panel";
import { COLORS, FONTS, PLAN_META, meetsRole, useAdminShell } from "../state";
import type { Plan, TalentPage } from "../state";
import { FabWithQuickCreate } from "./InboxPage";
import { FilterChip, RosterMoreMenu, SortButton, ViewToggle } from "./TalentPage-2";
import { RosterBrowser } from "./TalentPage-browser";
import { PageHeader } from "./pages-shared";
import type { RosterSortKey } from "./roster-sort";

/** Parent-category filter chip option (live slug or static TAXONOMY id). */
export type RosterTypeFilterOption = { id: string; label: string; emoji?: string };


// ════════════════════════════════════════════════════════════════════
// TALENT
// ════════════════════════════════════════════════════════════════════

export function fillAdminTpl(template: string, vars: Record<string, string>) {
  let s = template;
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(v);
  }
  return s;
}

/** Next plan up that lifts the roster cap. Network has no further upgrade. */
function nextPlanForRoster(plan: Plan): Plan | null {
  if (plan === "free") return "studio";
  if (plan === "studio") return "agency";
  if (plan === "agency") return "network";
  return null;
}

// ════════════════════════════════════════════════════════════════════
// ROSTER (talent page) — 2026 redesign
// ── Replaces the legacy 4-up StatusCard + box-grid layout ─────────────
//   • Single-line status strip (clickable filter)
//   • Premium hairline cards w/ real photos, type chip, completeness
//   • Grid + List view toggle
//   • Inline filter chips (Status × Type) + search + sort with direction
//   • Pending-approvals strip when self-registrations are queued
//   • Bulk-select sticky action bar
//   • Cards open the new TalentProfileShellDrawer (not legacy drawer)
// ════════════════════════════════════════════════════════════════════

export function TalentPage() {
  const { state, openDrawer, openUpgrade, toast, pendingTalent, effectiveRoster, overviewMetrics, tenantSlug, t } = useAdminShell();
  const router = useRouter();
  const roster = effectiveRoster;
  const canEdit = meetsRole(state.role, "editor");
  const [moreOpen, setMoreOpen] = useState(false);
  // Arrange-directory-order mode (live workspaces only; see RosterArrangeView).
  const [arrangeMode, setArrangeMode] = useState(false);
  // Exit arrange mode + re-fetch the server roster so cards show saved ranks.
  const exitArrange = () => { setArrangeMode(false); router.refresh(); };
  // The browser owns the filtered list; the header's Export row asks it.
  const exportRef = useRef<(() => void) | null>(null);

  const pendingCount = overviewMetrics !== null
    ? (overviewMetrics.pendingApprovals ?? 0)
    : pendingTalent.length;

  const rosterCap =
    state.entityType === "agency"
      ? state.plan === "free"
        ? 5
        : state.plan === "studio"
          ? 50
          : state.plan === "agency"
            ? 200
            : null
      : null;

  return (
    <>
      <PageHeader
        eyebrow={state.entityType === "hub" ? t("admin.roster.list.eyebrowNetwork") : t("admin.roster.list.eyebrowTalent")}
        title={state.entityType === "hub" ? t("admin.roster.list.eyebrowNetwork") : t("admin.account.rosterLabel")}
        subtitle={
          state.entityType === "hub"
            ? t("admin.roster.list.headerSubtitleHub")
            : t("admin.roster.list.headerSubtitleAgency")
        }
        actions={
          <>
            {!canEdit && <ReadOnlyChip />}
            {canEdit && (
              <>
                {tenantSlug && (arrangeMode
                  ? <PrimaryButton onClick={exitArrange}>{t("admin.roster.arrange.done")}</PrimaryButton>
                  : <GhostButton onClick={() => setArrangeMode(true)}>{t("admin.roster.arrange.button")}</GhostButton>)}
                <RosterMoreMenu
                  open={moreOpen}
                  onToggle={() => setMoreOpen((o) => !o)}
                  onClose={() => setMoreOpen(false)}
                  onExport={() => exportRef.current?.()}
                  onImport={() => {
                    setMoreOpen(false);
                    toast(t("admin.roster.list.importToast"));
                  }}
                  onTypes={() => {
                    setMoreOpen(false);
                    openDrawer("talent-types");
                  }}
                />
                {meetsRole(state.role, "admin") && (
                  <GhostButton onClick={() => openDrawer("team")}>Team</GhostButton>
                )}
                <GhostButton onClick={() => openDrawer("invite-flow")}>{t("admin.roster.list.invite")}</GhostButton>
                <PrimaryButton onClick={() => openDrawer("talent-profile-shell", { mode: "create", seed: {} })}>
                  {state.entityType === "hub" ? t("admin.roster.list.inviteMember") : t("admin.roster.list.addTalent")}
                </PrimaryButton>
              </>
            )}
          </>
        }
      />

      {/* Pending approvals strip — only when there are self-registrations to review */}
      {canEdit && pendingCount > 0 && (
        <PendingApprovalsStrip
          count={pendingCount}
          onReview={() => openDrawer("talent-approvals")}
        />
      )}

      {/* Self-on-roster — refined to match new aesthetic */}
      {state.alsoTalent && (
        <SelfOnRosterRow onEdit={() => openDrawer("my-profile")} />
      )}

      {/* Cap nudge — kept as a thin top strip when relevant */}
      {rosterCap !== null && nextPlanForRoster(state.plan) && (
        <CapNudge
          label={t("admin.roster.list.capLabel")}
          current={roster.length}
          cap={rosterCap}
          upgradeLabel={t("admin.roster.new.upgradePlan")}
          translateCap={({ current, cap, label, blocking, remaining }) => ({
            headline: fillAdminTpl(t("admin.roster.cap.headline"), {
              current: String(current),
              cap: String(cap),
              label,
            }),
            detail: blocking
              ? t("admin.roster.cap.detailBlocked")
              : remaining === 1
                ? t("admin.roster.cap.detailRemainingOne")
                : fillAdminTpl(t("admin.roster.cap.detailRemainingMany"), { remaining: String(remaining) }),
          })}
          onUpgrade={() => {
            const next = nextPlanForRoster(state.plan)!;
            openUpgrade({
              feature: `${PLAN_META[next].label}: room to grow`,
              outcome:
                roster.length >= rosterCap
                  ? "You're at the limit. Upgrade and add the next talent immediately."
                  : "Stay ahead of the cap so you never have to turn talent away.",
              requiredPlan: next,
              currentUsage: { label: "Talents on your roster", current: roster.length, cap: rosterCap },
              unlocks:
                next === "studio"
                  ? ["Up to 50 talents", "Custom domain", "Owned client list", "Private inquiries"]
                  : next === "agency"
                    ? ["Up to 200 talents", "Branded site design", "Custom fields", "Team & roles up to 25"]
                    : ["Unlimited talents", "Multi-brand workspaces", "Cross-roster pool", "Hub-level analytics"],
            });
          }}
        />
      )}

      {/* Phase 3.3 — Skill discovery panel. Renders a "Find talent by skill"
          pill button. Click → expandable filter UI calling searchTalent.
          Click result → opens talent drawer. */}
      <SkillDiscoveryPanel
        onTalentClick={(talentProfileId) =>
          openDrawer("talent-profile-shell", {
            talentId: talentProfileId,
            mode: "edit-admin",
          })
        }
      />

      <RosterBrowser arrangeMode={arrangeMode} onExitArrange={exitArrange} exportRef={exportRef} />

      {/* Mobile FAB — full quick-create menu */}
      {canEdit && <FabWithQuickCreate label={t("admin.roster.list.fabLabel")} />}
    </>
  );
}

// ── Pending approvals strip ─────────────────────────────────────────
function PendingApprovalsStrip({ count, onReview }: { count: number; onReview: () => void }) {
  const { t } = useAdminShell();
  const pendingTitle =
    count === 1
      ? fillAdminTpl(t("admin.roster.list.pendingWaitingSingular"), { count: String(count) })
      : fillAdminTpl(t("admin.roster.list.pendingWaitingPlural"), { count: String(count) });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", marginBottom: 14, borderRadius: 12, border: `1px solid rgba(82,96,109,0.18)`, fontFamily: FONTS.body }} className="bg-admin-amber-soft">
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: 14,
        }}
      >
        🔍
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-admin-amber-deep text-admin-13 font-semibold">
          {pendingTitle}
        </div>
        <div style={{ fontSize: 11.5, marginTop: 1 }} className="text-admin-ink-muted">
          {t("admin.roster.list.pendingHint")}
        </div>
      </div>
      <button
        type="button"
        onClick={onReview}
        style={{
          padding: "7px 14px",
          borderRadius: 999,
          border: "none",
          background: COLORS.amberDeep,
          color: "#fff",
          fontFamily: FONTS.body,
          fontSize: 12.5,
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {t("admin.roster.list.pendingReview")}
      </button>
    </div>
  );
}

// ── Self-on-roster row — refined hairline strip ─────────────────────
function SelfOnRosterRow({ onEdit }: { onEdit: () => void }) {
  const { t } = useAdminShell();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 14px",
        marginBottom: 14,
        borderRadius: 999,
        background: "rgba(11,11,13,0.03)",
        border: `1px solid ${COLORS.borderSoft}`,
        fontFamily: FONTS.body,
      }}
    >
      <span className="text-admin-13">👤</span>
      <div style={{ flex: 1, minWidth: 0, fontSize: 12 }} className="text-admin-ink-muted">
        {t("admin.roster.list.selfRowText")}
      </div>
      <button
        type="button"
        onClick={onEdit}
        style={{
          padding: 0,
          background: "transparent",
          border: "none",
          color: COLORS.ink,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: FONTS.body,
        }}
      >
        {t("admin.roster.list.selfRowEdit")}
      </button>
    </div>
  );
}

// ── Roster status strip ─────────────────────────────────────────────
// Two segments — directory visibility, not a workflow lifecycle. Each is a
// clickable filter; clicking the active one again clears back to "all".
export function RosterStatusStrip({
  counts,
  active,
  onFilter,
}: {
  counts: { visible: number; hidden: number };
  active: "all" | "visible" | "hidden";
  onFilter: (f: "visible" | "hidden") => void;
}) {
  const { t } = useAdminShell();
  const items: { id: "visible" | "hidden"; label: string; count: number; tone: string }[] = [
    { id: "visible", label: t("admin.roster.status.visible"), count: counts.visible, tone: COLORS.green },
    { id: "hidden",  label: t("admin.roster.status.hidden"),  count: counts.hidden,  tone: COLORS.inkMuted },
  ];
  return (
    <div
      data-tulala-roster-status
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 0,
        padding: 4,
        borderRadius: 12,
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        boxShadow: "0 1px 2px rgba(11,11,13,0.03)",
        marginBottom: 14,
        fontFamily: FONTS.body,
        overflowX: "auto",
        scrollbarWidth: "none",
      }}
    >
      {items.map((it, i) => {
        const isActive = active === it.id;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onFilter(it.id)}
            disabled={it.count === 0}
            style={{
              flex: 1,
              minWidth: 96,
              padding: "10px 14px",
              border: "none",
              background: isActive ? "rgba(15,79,62,0.06)" : "transparent",
              borderRadius: 8,
              cursor: it.count === 0 ? "default" : "pointer",
              opacity: it.count === 0 ? 0.5 : 1,
              textAlign: "left",
              borderRight: i < items.length - 1 ? `1px solid ${COLORS.borderSoft}` : "none",
              fontFamily: FONTS.body,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: it.tone, }}
              />
              <span className="text-admin-ink-muted text-admin-11 font-medium">{it.label}</span>
            </div>
            <div
              style={{
                fontFamily: FONTS.display,
                fontSize: 22,
                fontWeight: 500,
                color: isActive ? COLORS.accentDeep : COLORS.ink,
                letterSpacing: -0.4,
                lineHeight: 1,
              }}
            >
              {it.count}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Roster filter bar ───────────────────────────────────────────────
export function RosterFilterBar({
  search, onSearch,
  typeFilter, onTypeFilter, usedTypes,
  sort, sortDir, onSort,
  view, onView,
  canBulk, selectedCount, onSelectAll, onClearSelection,
  resultCount, totalCount,
}: {
  search: string;
  onSearch: (s: string) => void;
  typeFilter: string;
  onTypeFilter: (f: string) => void;
  usedTypes: RosterTypeFilterOption[];
  sort: RosterSortKey;
  sortDir: "asc" | "desc";
  onSort: (s: RosterSortKey) => void;
  view: "grid" | "list";
  onView: (v: "grid" | "list") => void;
  canBulk: boolean;
  selectedCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  resultCount: number;
  totalCount: number;
}) {
  const { t } = useAdminShell();
  const resultLabel =
    resultCount === totalCount
      ? fillAdminTpl(t("admin.roster.filters.resultCountFull"), { totalCount: String(totalCount) })
      : fillAdminTpl(t("admin.roster.filters.resultCountPartial"), {
          resultCount: String(resultCount),
          totalCount: String(totalCount),
        });
  return (
    <div
      data-tulala-roster-filterbar
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        marginBottom: 14,
        fontFamily: FONTS.body,
      }}
    >
      <style>{`
        @media (max-width: 720px) {
          [data-tulala-roster-filterbar] { gap: 6px; }
          [data-tulala-roster-filterbar] [data-rfb-search] { width: 100% !important; order: -1; }
        }
      `}</style>
      {/* Search */}
      <div data-rfb-search style={{ position: "relative", width: 240 }}>
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: "50%",
            left: 12,
            transform: "translateY(-50%)",
            color: COLORS.inkMuted,
            fontSize: 13,
            pointerEvents: "none",
          }}
        >
          ⌕
        </span>
        <input
          type="text"
          aria-label={t("admin.roster.filters.searchAria")}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={t("admin.roster.filters.searchPlaceholder")}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "8px 10px 8px 32px",
            fontFamily: FONTS.body,
            fontSize: 12.5,
            color: COLORS.ink,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 999,
            outline: "none",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
          onBlur={(e) => (e.currentTarget.style.borderColor = COLORS.borderSoft)}
        />
      </div>

      {/* Type chips — only if roster has typed talent */}
      {usedTypes.length > 0 && (
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          <FilterChip
            label={t("admin.roster.filters.allTypes")}
            active={typeFilter === "all"}
            onClick={() => onTypeFilter("all")}
          />
          {usedTypes.map((opt) => (
            <FilterChip
              key={opt.id}
              label={opt.label}
              emoji={opt.emoji}
              active={typeFilter === opt.id}
              onClick={() => onTypeFilter(opt.id)}
            />
          ))}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Result count */}
      <div className="text-admin-ink-muted text-admin-11h font-medium">
        {resultLabel}
      </div>

      {/* Sort */}
      <SortButton sort={sort} sortDir={sortDir} onSort={onSort} />

      {/* View toggle */}
      <ViewToggle view={view} onView={onView} />

      {/* Bulk select count (only when active) */}
      {canBulk && selectedCount > 0 && (
        <button
          type="button"
          onClick={onClearSelection}
          style={{
            padding: "5px 10px",
            background: "rgba(15,79,62,0.08)",
            border: `1px solid ${COLORS.accent}`,
            color: COLORS.accentDeep,
            borderRadius: 999,
            cursor: "pointer",
            fontFamily: FONTS.body,
            fontSize: 11.5,
            fontWeight: 600,
          }}
        >
          {(() => {
            const parts = t("admin.roster.filters.selectedClear").split("·").map((s) => s.trim());
            const selectedWord = parts[0] ?? "";
            const clearWord = parts[1] ?? "";
            return `${selectedCount} ${selectedWord} · ${clearWord}`;
          })()}
        </button>
      )}
      {canBulk && selectedCount === 0 && (
        <button
          type="button"
          onClick={onSelectAll}
          aria-label={t("admin.roster.filters.selectAll")}
          style={{
            padding: "5px 10px",
            background: "transparent",
            border: `1px solid ${COLORS.borderSoft}`,
            color: COLORS.inkMuted,
            borderRadius: 999,
            cursor: "pointer",
            fontFamily: FONTS.body,
            fontSize: 11.5,
            fontWeight: 500,
          }}
        >
          {t("admin.roster.filters.selectAll")}
        </button>
      )}
    </div>
  );
}
