"use client";

import { useEffect, useState } from "react";
import type { MutableRefObject } from "react";
import { useRouter } from "next/navigation";
import { bulkSetWorkflowStatus } from "@/app/(workspace)/[tenantSlug]/admin/roster/bulk-actions";
import { PitchComposeDrawer } from "../pitch-compose";
import { getClients, meetsRole, useAdminShell } from "../state";
import type { TalentProfile } from "../state";
import { SavedViewsBar, downloadCsv } from "../wave2";
import { RosterFilterBar, RosterStatusStrip, fillAdminTpl } from "./TalentPage-1";
import type { RosterTypeFilterOption } from "./TalentPage-1";
import { RosterGrid } from "./TalentPage-2";
import { RosterArrangeView } from "./TalentPage-arrange";
import { RosterBulkActionBar, RosterEmptyState, RosterList } from "./TalentPage-3";
import {
  resolveRosterCardTaxonomy,
  rosterMatchesParentFilter,
  rosterParentFiltersOf,
} from "./roster-card-taxonomy";
import { rosterSortComparator } from "./roster-sort";
import type { RosterSortKey } from "./roster-sort";

/**
 * RosterBrowser — the roster's browse body: status strip, saved views, the
 * search + type chips + sort + grid/list bar, the cards (or rows), bulk
 * actions and the pitch composer, and arrange mode in place of all of it.
 *
 * Owned by the roster page and ALSO mounted on People › Talent, so the two
 * doors show the same grid, the same filters and the same cards. Reads the
 * roster from the shell (`effectiveRoster`), never from props, so both
 * callers see one list.
 */
export function RosterBrowser({
  arrangeMode = false,
  onExitArrange,
  exportRef,
}: {
  /** Arrange-directory-order mode (live workspaces only; see RosterArrangeView). */
  arrangeMode?: boolean;
  onExitArrange?: () => void;
  /** The caller's Export row: the browser writes its CSV exporter here. */
  exportRef?: MutableRefObject<(() => void) | null>;
}) {
  const { state, openDrawer, toast, effectiveRoster, tenantSlug, effectiveTenant, t, locale } = useAdminShell();
  const router = useRouter();
  // Phase 1 real-data bridge: when `?dataSource=live` is set on the URL,
  // the server pre-fetches Impronta's roster and `effectiveRoster` is
  // those rows. When absent, this falls back to `getRoster(plan)` per
  // the existing mock behaviour — same shape, same code path.
  const roster = effectiveRoster;
  const canEdit = meetsRole(state.role, "editor");

  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<"all" | "visible" | "hidden">("all");
  // Parent-category filter — id space covers BOTH live `parent_category`
  // slugs (e.g. "hosts-promo") and static TAXONOMY parent ids ("hosts").
  const [typeFilter, setTypeFilter] = useState<string>("all");
  // Default = Recommended: the roster opens in the same order visitors see
  // in the public directory (curated rank first, recency after).
  const [sort, setSort] = useState<RosterSortKey>("recommended");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [pitchComposeOpen, setPitchComposeOpen] = useState(false);

  // A talent is publicly visible when the agency eye is on AND the talent
  // has not globally hidden themselves.
  const isPubliclyVisible = (p: TalentProfile) =>
    (p.siteVisible ?? false) && !(p.talentHidden ?? false);

  const filteredRoster = roster
    .filter((p) => {
      if (stateFilter === "all") return true;
      return stateFilter === "visible" ? isPubliclyVisible(p) : !isPubliclyVisible(p);
    })
    .filter((p) => typeFilter === "all" || rosterMatchesParentFilter(p, typeFilter, locale))
    .filter((p) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      // Search over what the admin SEES (humanized labels — primary, parent,
      // secondaries) plus the raw slug and city.
      const view = resolveRosterCardTaxonomy(p, locale);
      return (
        p.name.toLowerCase().includes(q) ||
        (p.city ?? "").toLowerCase().includes(q) ||
        (p.primaryType ?? "").toLowerCase().includes(q) ||
        (view.primaryLabel ?? "").toLowerCase().includes(q) ||
        (view.parentLabel ?? "").toLowerCase().includes(q) ||
        view.secondaryLabels.some((s) => s.toLowerCase().includes(q))
      );
    })
    .sort(rosterSortComparator(sort, sortDir));

  const visibleCount = roster.filter(isPubliclyVisible).length;
  const counts = {
    visible: visibleCount,
    hidden: roster.length - visibleCount,
  };

  // Parent categories that actually exist in the roster — drives the type
  // filter chips (no point showing "Chefs" if there are 0 chefs). Live
  // workspaces resolve to real `parent_category` terms; mock workspaces fall
  // back to the static TAXONOMY parents.
  const usedTypes: RosterTypeFilterOption[] = (() => {
    const byId = new Map<string, RosterTypeFilterOption>();
    for (const r of roster) {
      // A talent contributes EVERY parent they span, so a chip exists for
      // each bucket present on the roster (not just primary-type buckets).
      for (const opt of rosterParentFiltersOf(r, locale)) {
        if (!byId.has(opt.id)) byId.set(opt.id, opt);
      }
    }
    return Array.from(byId.values());
  })();

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
  useEffect(() => {
    if (!exportRef) return;
    exportRef.current = exportCsv;
    return () => { exportRef.current = null; };
  });

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
      if (result.skippedCount) toast(`${result.skippedCount} skipped as incomplete: ${result.skippedNames?.join(", ")}`); // publish-checklist rejects; a silent "0" reads as broken
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
      {/* Arrange mode replaces the filter + grid section: the arranged list is
          always the FULL roster in public order (filters would be ambiguous). */}
      {arrangeMode && tenantSlug ? (
        <RosterArrangeView items={roster} tenantSlug={tenantSlug} onExit={onExitArrange ?? (() => router.refresh())} />
      ) : (
      <>
      {/* Status strip — single line replaces 4-up StatusCard. Each segment
          is a clickable filter (toggle on/off). */}
      <RosterStatusStrip
        counts={counts}
        active={stateFilter}
        onFilter={(f) => setStateFilter(f === stateFilter ? "all" : f)}
      />

      {/* Saved views — reuses the same generic SavedViewsBar the inbox
          uses (viewKey-namespaced localStorage), capturing the full
          filter/sort/view state so operators can pin e.g. "Hidden dancers
          by completeness" and restore it in one click. */}
      <SavedViewsBar
        viewKey="roster"
        current={{ search, stateFilter, typeFilter, sort, sortDir, view }}
        onApply={(v) => {
          setSearch(v.search);
          setStateFilter(v.stateFilter);
          setTypeFilter(v.typeFilter);
          setSort(v.sort);
          setSortDir(v.sortDir);
          setView(v.view);
        }}
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
            // Name → A→Z; Recommended → position 1 on top. "Newest" +
            // "Completeness" read more naturally with the high value on top.
            setSortDir(s === "name" || s === "recommended" ? "asc" : "desc");
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
      </>
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
    </>
  );
}

