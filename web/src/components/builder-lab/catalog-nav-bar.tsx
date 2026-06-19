"use client";

/**
 * CatalogNav — the Builder Lab Catalog's two-tier (P1) view navigation.
 *
 * Tier-1: GROUP pills (Structure / Design / Admin) — reuses the shared
 *   `PillToggle` over GROUP_ORDER, no count badges.
 * Tier-2: the active group's ordered sub-views, rendered as the EXISTING flat
 *   tab strip (cloned verbatim from the pre-P1 component-catalog.tsx so the
 *   green-underline active state, the accent count badge, and the
 *   `data-testid="lab-tab-${view}"` QA hooks are all preserved), scoped to the
 *   `views` prop.
 *
 * Purely presentational — all state (current group/view, counts, labels) is
 * owned by ComponentCatalog and threaded through props.
 */

import {
  type CatalogGroup,
  type CatalogView,
  GROUP_LABEL,
  GROUP_ORDER,
  isSpecialTab,
} from "./catalog-nav";
import { LAB as T, PillToggle } from "./ui";

export function CatalogNav({
  group,
  views,
  currentView,
  countFor,
  labelFor,
  onSelectGroup,
  onSelectView,
}: {
  /** The active tier-1 group. */
  group: CatalogGroup;
  /** The active group's ordered tier-2 views. */
  views: ReadonlyArray<CatalogView>;
  /** The currently selected view (drives the tier-2 active underline). */
  currentView: CatalogView;
  /** Count badge for a gallery view (null ⇒ no badge, e.g. special views). */
  countFor: (view: CatalogView) => number | null;
  /** Display label for a view (honors admin gallery-tab renames). */
  labelFor: (view: CatalogView) => string;
  onSelectGroup: (group: CatalogGroup) => void;
  onSelectView: (view: CatalogView) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Tier-1 — group pills */}
      <PillToggle
        ariaLabel="Catalog group"
        value={group}
        onChange={onSelectGroup}
        options={GROUP_ORDER.map((g) => ({ key: g, label: GROUP_LABEL[g] }))}
      />

      {/* Tier-2 — the active group's views (cloned from the old flat strip). */}
      {views.length > 0 ? (
        <div
          role="tablist"
          aria-label="Catalog views"
          style={{ display: "flex", gap: 2, flexWrap: "wrap", borderBottom: `1px solid ${T.borderSoft}` }}
        >
          {views.map((view) => {
            const gallery = !isSpecialTab(view);
            const count = gallery ? countFor(view) : null;
            const active = view === currentView;
            return (
              <button
                key={view}
                type="button"
                role="tab"
                data-testid={`lab-tab-${view}`}
                aria-selected={active}
                onClick={() => onSelectView(view)}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
                style={{
                  background: "transparent",
                  border: "none",
                  borderBottom: `2px solid ${active ? T.accent : "transparent"}`,
                  color: active ? T.ink : T.inkMuted,
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "8px 13px",
                  marginBottom: -1,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                {labelFor(view)}
                {count !== null ? (
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: active ? T.accent : T.inkDim,
                      background: active ? "rgba(93,211,160,0.14)" : T.cardSoft,
                      borderRadius: 999,
                      padding: "1px 7px",
                      minWidth: 18,
                      textAlign: "center",
                    }}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
