"use client";

/**
 * StarterKitFilters — the surface switcher, partial-rollout toggle, group blurb,
 * and category filter bar for the Site Starter Kit view. Extracted from
 * SiteStarterKitView (which owns the state) to keep that file under the 800-line
 * max-lines cap; state is threaded via props (same names as the originating
 * locals, so the JSX is a verbatim move). Behavior-identical.
 */
import type { Dispatch, SetStateAction } from "react";

import { SurfaceSwitcher } from "./surface-switcher";
import { LAB as T, PillToggle } from "./ui";

export function StarterKitFilters({
  surface,
  setSurface,
  setRolloutFilter,
  setCategoryFilter,
  partialRolloutCount,
  rolloutFilter,
  group,
  catFilterOpts,
  categoryFilter,
  groups,
}: {
  surface: "talent" | "workspace";
  setSurface: (s: "talent" | "workspace") => void;
  setRolloutFilter: Dispatch<SetStateAction<"all" | "partial">>;
  setCategoryFilter: (value: string) => void;
  partialRolloutCount: number;
  rolloutFilter: "all" | "partial";
  group: { blurb: string } | undefined;
  catFilterOpts: React.ComponentProps<typeof PillToggle>["options"];
  categoryFilter: string;
  groups: ReadonlyArray<{ key: "talent" | "workspace"; label: string; blurb: string }>;
}) {
  return (
    <>
      {/* Surface switcher + rollout filter */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <SurfaceSwitcher
          options={groups}
          value={surface}
          onChange={(s) => {
            setSurface(s);
            // Reset filters when switching surface
            setRolloutFilter("all");
            setCategoryFilter("all");
          }}
          ariaLabel="Starter kit surface"
        />
        {/* Partial-rollout filter — only shown when this surface has canaried starters */}
        {partialRolloutCount > 0 ? (
          <button
            type="button"
            onClick={() =>
              setRolloutFilter((f) => (f === "partial" ? "all" : "partial"))
            }
            style={{
              background:
                rolloutFilter === "partial"
                  ? "rgba(155,168,183,0.20)"
                  : "transparent",
              color: rolloutFilter === "partial" ? "#B6C2CF" : T.inkMuted,
              border: `1px solid ${
                rolloutFilter === "partial"
                  ? "rgba(155,168,183,0.40)"
                  : T.borderSoft
              }`,
              fontSize: 11.5,
              fontWeight: 600,
              padding: "5px 12px",
              borderRadius: 999,
              cursor: "pointer",
            }}
          >
            {rolloutFilter === "partial"
              ? "Partial rollout ×"
              : `Partial rollout (${partialRolloutCount})`}
          </button>
        ) : null}
      </div>

      {group ? (
        <div style={{ fontSize: 12, color: T.inkMuted }}>{group.blurb}</div>
      ) : null}

      {/* A7 — Category filter bar (only shown when there's more than one category) */}
      {catFilterOpts.length > 2 ? (
        <div
          data-testid="lab-starter-category-filter"
          style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
        >
          <PillToggle
            options={catFilterOpts}
            value={categoryFilter}
            onChange={(k) => setCategoryFilter(k)}
            ariaLabel="Filter starters by category"
            size="sm"
          />
        </div>
      ) : null}
    </>
  );
}
