"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { bulkSetWorkflowStatus } from "@/app/(workspace)/[tenantSlug]/admin/roster/bulk-actions";
import { PitchComposeDrawer } from "../pitch-compose";
import { CapNudge, Card, GhostButton, PrimaryButton, ReadOnlyChip, StatusCard } from "../primitives";
import { SkillDiscoveryPanel } from "../skill-discovery-panel";
import { COLORS, FONTS, PLAN_META, TAXONOMY, Z, getClients, getRoster, meetsRole, useAdminShell } from "../state";
import type { Plan, TalentPage, TalentProfile, TaxonomyParentId } from "../state";
import { downloadCsv } from "../wave2";
import { FabWithQuickCreate } from "./InboxPage";
import { FilterChip, RosterGrid, RosterMoreMenu, SortButton, ViewToggle } from "./TalentPage-2";
import { RosterBulkActionBar, RosterEmptyState, RosterList } from "./TalentPage-3";
import { Grid, PageHeader } from "./pages-shared";
import { byName } from "@/lib/field-engine/sort-comparators";


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
  const { state, openDrawer, openUpgrade, toast, pendingTalent, effectiveRoster, overviewMetrics, tenantSlug, effectiveTenant, t } = useAdminShell();
  const router = useRouter();
  // Phase 1 real-data bridge: when `?dataSource=live` is set on the URL,
  // the server pre-fetches Impronta's roster and `effectiveRoster` is
  // those rows. When absent, this falls back to `getRoster(plan)` per
  // the existing mock behaviour — same shape, same code path.
  const roster = effectiveRoster;
  const canEdit = meetsRole(state.role, "editor");
  const isFree = state.plan === "free";

  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<"all" | "visible" | "hidden">("all");
  const [typeFilter, setTypeFilter] = useState<TaxonomyParentId | "all">("all");
  const [sort, setSort] = useState<"name" | "completeness" | "newest" | "lastEdited">("newest");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moreOpen, setMoreOpen] = useState(false);
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [pitchComposeOpen, setPitchComposeOpen] = useState(false);

  // Resolve a parent-type filter to its children (for filtering by primaryType id).
  const typeFilterChildren = typeFilter === "all"
    ? null
    : new Set(TAXONOMY.find(p => p.id === typeFilter)?.children.map(c => c.id) ?? []);

  // A talent is publicly visible when the agency eye is on AND the talent
  // has not globally hidden themselves.
  const isPubliclyVisible = (p: TalentProfile) =>
    (p.siteVisible ?? false) && !(p.talentHidden ?? false);

  const filteredRoster = roster
    .filter((p) => {
      if (stateFilter === "all") return true;
      return stateFilter === "visible" ? isPubliclyVisible(p) : !isPubliclyVisible(p);
    })
    .filter((p) => !typeFilterChildren || (p.primaryType !== undefined && typeFilterChildren.has(p.primaryType)))
    .filter((p) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.city ?? "").toLowerCase().includes(q) ||
        (p.primaryType ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      let r = 0;
      if (sort === "name") r = byName(a, b);
      else if (sort === "completeness") r = (a.completeness ?? 0) - (b.completeness ?? 0);
      else if (sort === "newest") {
        const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
        r = ta - tb;
      } else if (sort === "lastEdited") {
        const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
        const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
        r = ta - tb;
      }
      return sortDir === "asc" ? r : -r;
    });

  const visibleCount = roster.filter(isPubliclyVisible).length;
  const counts = {
    visible: visibleCount,
    hidden: roster.length - visibleCount,
  };

  // Talent-type parents that actually exist in the roster — drives the
  // type filter chips (no point showing "Chefs" if there are 0 chefs).
  const usedTypes = Array.from(new Set(
    roster
      .map((r) => {
        if (!r.primaryType) return null;
        for (const p of TAXONOMY) {
          if (p.children.some((c) => c.id === r.primaryType)) return p.id;
        }
        return null;
      })
      .filter((x): x is TaxonomyParentId => x !== null)
  ));

  const pendingCount = overviewMetrics !== null
    ? (overviewMetrics.pendingApprovals ?? 0)
    : pendingTalent.length;

  const exportCsv = () => {
    downloadCsv(
      `roster-${new Date().toISOString().slice(0, 10)}.csv`,
      filteredRoster.map((p) => ({
        name: p.name,
        state: p.state,
        height: p.height ?? "",
        city: p.city ?? "",
        representation: p.representation ?? "",
      })),
    );
    toast(fillAdminTpl(t("admin.roster.list.exportedToast"), { count: String(filteredRoster.length) }));
  };

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

  // Bulk select helpers
  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const clearSelected = () => setSelected(new Set());
  const selectAll = () => setSelected(new Set(filteredRoster.map((p) => p.id)));

  const handleBulkAction = async (status: "publish" | "archive") => {
    if (!tenantSlug) {
      toast(t("admin.roster.list.bulkRequiresWorkspace"));
      return;
    }
    setIsBulkLoading(true);
    const result = await bulkSetWorkflowStatus(tenantSlug, Array.from(selected), status);
    setIsBulkLoading(false);
    if (result.ok) {
      toast(
        status === "publish"
          ? fillAdminTpl(t("admin.roster.list.bulkPublishedToast"), { count: String(result.updatedCount) })
          : fillAdminTpl(t("admin.roster.list.bulkArchivedToast"), { count: String(result.updatedCount) }),
      );
      clearSelected();
      // Refresh server-rendered roster so the new workflow_status badges
      // (Published / Archived) update on the cards immediately.
      router.refresh();
    } else {
      toast(fillAdminTpl(t("admin.roster.list.bulkErrorToast"), { error: result.error }));
    }
  };

  // Card click → open the rich profile shell drawer with the canonical
  // talent id so the drawer's autosaves work against the real DB row.
  const openProfile = (p: TalentProfile) => {
    openDrawer("talent-profile-shell", {
      mode: "edit-admin",
      talentId: p.id,
      seed: {
        stageName: p.name,
        primaryType: p.primaryType,
        homeBase: p.city,
        profileCode: p.profileCode,
      },
    });
  };

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
                <RosterMoreMenu
                  open={moreOpen}
                  onToggle={() => setMoreOpen((o) => !o)}
                  onClose={() => setMoreOpen(false)}
                  onExport={exportCsv}
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

      {/* Status strip — single line replaces 4-up StatusCard. Each segment
          is a clickable filter (toggle on/off). */}
      <RosterStatusStrip
        counts={counts}
        active={stateFilter}
        onFilter={(f) => setStateFilter(f === stateFilter ? "all" : f)}
      />

      {/* Filter bar — search + type chips + sort + view toggle */}
      <RosterFilterBar
        search={search}
        onSearch={setSearch}
        typeFilter={typeFilter}
        onTypeFilter={setTypeFilter}
        usedTypes={usedTypes}
        sort={sort}
        sortDir={sortDir}
        onSort={(s) => {
          if (s === sort) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
          else {
            setSort(s);
            // "Newest" + "Completeness" read more naturally with the high
            // value on top — default to desc. Name → A→Z.
            setSortDir(s === "name" ? "asc" : "desc"); // newest / lastEdited / completeness → desc by default
          }
        }}
        view={view}
        onView={setView}
        canBulk={canEdit}
        selectedCount={selected.size}
        onSelectAll={selectAll}
        onClearSelection={clearSelected}
        resultCount={filteredRoster.length}
        totalCount={roster.length}
      />

      {/* Body — grid / list / empty */}
      {filteredRoster.length === 0 ? (
        <RosterEmptyState
          searching={!!search.trim()}
          query={search.trim()}
          onClear={() => {
            setSearch("");
            setStateFilter("all");
            setTypeFilter("all");
          }}
          onAdd={canEdit ? () => openDrawer("talent-profile-shell", { mode: "create", seed: {} }) : undefined}
        />
      ) : view === "grid" ? (
        <RosterGrid
          items={filteredRoster}
          selected={selected}
          onSelect={canEdit ? toggleSelect : undefined}
          onOpen={openProfile}
        />
      ) : (
        <RosterList
          items={filteredRoster}
          selected={selected}
          onSelect={canEdit ? toggleSelect : undefined}
          onOpen={openProfile}
        />
      )}

      {/* Bulk action bar — sticky bottom when selection > 0 */}
      {selected.size > 0 && canEdit && (
        <RosterBulkActionBar
          count={selected.size}
          onClear={clearSelected}
          onPublish={() => handleBulkAction("publish")}
          onArchive={() => handleBulkAction("archive")}
          isLoading={isBulkLoading}
          onSendPitch={() => setPitchComposeOpen(true)}
        />
      )}

      {/* Pitch compose drawer */}
      {pitchComposeOpen && (
        <PitchComposeDrawer
          open={pitchComposeOpen}
          onOpenChange={setPitchComposeOpen}
          selectedTalents={roster.filter((t) => selected.has(t.id))}
          clients={getClients(state.plan)}
          tenantSlug={tenantSlug ?? ""}
          agencyName={effectiveTenant.name}
          onPitchSent={() => {
            clearSelected();
            toast(t("admin.roster.list.pitchSentToast"));
          }}
        />
      )}

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
function RosterStatusStrip({
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
function RosterFilterBar({
  search, onSearch,
  typeFilter, onTypeFilter, usedTypes,
  sort, sortDir, onSort,
  view, onView,
  canBulk, selectedCount, onSelectAll, onClearSelection,
  resultCount, totalCount,
}: {
  search: string;
  onSearch: (s: string) => void;
  typeFilter: TaxonomyParentId | "all";
  onTypeFilter: (f: TaxonomyParentId | "all") => void;
  usedTypes: TaxonomyParentId[];
  sort: "name" | "completeness" | "newest" | "lastEdited";
  sortDir: "asc" | "desc";
  onSort: (s: "name" | "completeness" | "newest" | "lastEdited") => void;
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
          {usedTypes.map((t) => {
            const meta = TAXONOMY.find((p) => p.id === t)!;
            return (
              <FilterChip
                key={t}
                label={meta.label}
                emoji={meta.emoji}
                active={typeFilter === t}
                onClick={() => onTypeFilter(t)}
              />
            );
          })}
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
