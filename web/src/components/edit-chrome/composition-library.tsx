"use client";

/**
 * CompositionLibraryOverlay — section picker for the in-place editor.
 *
 * Mockup: `docs/mockups/builder-experience.html` §8 (Add section library).
 * Phase D — rebuilt to match that surface:
 *   - Drawer chrome (existing kit) preserved on desktop.
 *   - Search input first; auto-focuses on open; matches name + description
 *     across ALL section types (default + advanced) regardless of toggle.
 *   - Eight category tabs (Hero / Trust / Showcase / Story / Convert /
 *     Form / Embed / Navigation), plus an "All" pseudo-tab. Counts shown.
 *   - Tile grid grouped by category. Each tile carries a wireframe
 *     preview, name, one-line description, and optional pill tag
 *     (`new` blue / `premium` neutral).
 *   - "Show advanced sections" toggle (off by default) reveals the
 *     remaining ~27 types in their category groups, each with an
 *     "Advanced" pill.
 *   - Kit/starter facet row (Kind, Source, Plan, …) is behind **More filters**
 *     by default so search + categories stay the primary path (BUG-007).
 *   - When opened from a slot inserter, allowed-types filter still
 *     applies — a slot may only accept a subset of the catalog.
 *   - Click a tile → `insertSection(target, typeKey)` runs the existing
 *     create + splice + CAS flow. Picker closes on success.
 *
 * Slot context messaging (`Inserting into <slot>`) preserved from §8.
 *
 * Phase D responsive layer — a viewport-mode hook drives three layouts:
 *
 *   - Desktop (≥1024px): existing 720px right drawer, two-column tile grid.
 *     Canvas + navigator + drawer all visible; insertion context implicit
 *     because the operator can see the gap they clicked into.
 *   - Tablet (640–1023px): drawer width clamps to `min(720, vw - 96)` so a
 *     slice of canvas remains visible on the left. Two-column grid
 *     preserved; the smaller per-tile width is acceptable for editorial
 *     wireframes. Tab strip wraps onto a second row when needed.
 *   - Mobile (<640px): the drawer becomes a bottom sheet — rises from the
 *     bottom of the viewport, takes ~90vh, rounded top corners, scrollable
 *     body. Tab strip switches to a horizontal-scroll chip strip so
 *     categories don't eat vertical space. Tile grid is single-column.
 *     Search + meta line ("Inserting into …") sit in a sticky header so
 *     the operator never loses insertion context while scrolling tiles.
 *     The Advanced toggle moves to a full-width row below the tab strip
 *     for a clearer touch target.
 *
 * The composition-inserter `+` button (`composition-inserter.tsx`) is not
 * touched — its hit area is already touch-friendly and the circle is
 * always rendered, so the Phase B.2.C gap affordance works on touch.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useEditContext } from "./edit-context";
import { SectionWire } from "./starter-wireframes";
import { CHROME, Drawer, DrawerHead, DrawerBody } from "./kit";
import { checkSlotTypeCompatibility } from "@/lib/site-admin/edit-mode/slot-type-compatibility";
import {
  SECTION_TEMPLATE_KITS,
  SECTION_TEMPLATE_STARTERS,
  getSectionTemplateKitRequiredPlan,
  getSectionTemplateStarterRequiredPlan,
  sectionTemplateStarterPlanDeniedReason,
  type SectionTemplateKit,
  type SectionTemplateStarter,
  type SectionTemplateStarterId,
  type SectionTemplateStarterEditModel,
  type SectionTemplateStarterKind,
  type SectionTemplateStarterReadiness,
  type SectionTemplateStarterSourceKind,
} from "@/lib/site-admin/sections/shared/section-template-starters";
import {
  BUILDER_DATA_SOURCE_REGISTRY,
  getBuilderDataSourceDefinition,
  type BuilderDataSourceKey,
  type BuilderDataSourceDefinition,
} from "@/lib/site-admin/builder-node/data-bindings";

// Category → tab label. Ordering follows the §8 mockup left-to-right
// rhythm: hero opens, trust + proof, showcase + story (the bulk),
// convert + form (the asks), embed + navigation (the technical tail).
const CATEGORY_ORDER = [
  "hero",
  "trust",
  "showcase",
  "story",
  "convert",
  "form",
  "embed",
  "navigation",
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  hero: "Hero",
  trust: "Trust",
  showcase: "Showcase",
  story: "Story",
  convert: "Convert",
  form: "Form",
  embed: "Embed",
  navigation: "Navigation",
};

const EDITABLE_CAPABILITY_OPTIONS = [
  "content",
  "style",
  "layout",
  "data",
  "navigation",
  "media",
  "action",
] as const satisfies ReadonlyArray<SectionTemplateStarter["editableCapabilities"][number]>;

type ActiveTab = "all" | (typeof CATEGORY_ORDER)[number];
type StarterKindFilter = "all" | SectionTemplateStarterKind;
type StarterSourceFilter = "all" | SectionTemplateStarterSourceKind;
type StarterReadinessFilter = "all" | SectionTemplateStarterReadiness;
type StarterDataBindingFilter = "all" | BuilderDataSourceKey;
type StarterCapabilityFilter =
  | "all"
  | SectionTemplateStarter["editableCapabilities"][number];
type StarterPlanFilter = "all" | BuilderDataSourceDefinition["requiredPlan"];

// Phase D responsive — three-state viewport mode driven by matchMedia.
// `desktop` keeps the existing kit Drawer; `tablet` clamps its width;
// `mobile` swaps the kit Drawer for a bottom-sheet portal.
type ViewportMode = "desktop" | "tablet" | "mobile";

type TemplateDragSource =
  | { kind: "starter"; starter: SectionTemplateStarter }
  | { kind: "kit"; kit: SectionTemplateKit };

interface TemplateDropTarget {
  slotKey: string;
  insertAfterSortOrder: number | null;
  allowed: boolean;
  indicatorY: number;
  indicatorLeft: number;
  indicatorWidth: number;
  label: string;
  sourceLabel: string;
  sourceSectionCount: number;
  targetSlotLabel: string;
  reason: string | null;
}

interface TemplateCompatibility {
  ok: boolean;
  reason: string | null;
}

function resolveHomeCoreStarterIdsForKit(
  kit: SectionTemplateKit,
  startersById: ReadonlyMap<string, SectionTemplateStarter>,
): SectionTemplateStarterId[] {
  const homeCoreIds = kit.starterIds.filter((starterId) => {
    const starter = startersById.get(starterId);
    return starter?.homeCore === true;
  });
  if (homeCoreIds.length > 0) return homeCoreIds;
  return kit.starterIds.slice(0, Math.min(4, kit.starterIds.length));
}

function useViewportMode(): ViewportMode {
  const [mode, setMode] = useState<ViewportMode>("desktop");
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const tablet = window.matchMedia("(min-width: 640px) and (max-width: 1023px)");
    function read() {
      if (desktop.matches) setMode("desktop");
      else if (tablet.matches) setMode("tablet");
      else setMode("mobile");
    }
    read();
    desktop.addEventListener("change", read);
    tablet.addEventListener("change", read);
    return () => {
      desktop.removeEventListener("change", read);
      tablet.removeEventListener("change", read);
    };
  }, []);
  return mode;
}

// Tablet drawer width: floor to a minimum so the picker stays usable, cap
// at the desktop default so we don't stretch needlessly on tablet-landscape.
function tabletDrawerWidth(): number {
  if (typeof window === "undefined") return 600;
  return Math.max(420, Math.min(720, window.innerWidth - 96));
}

function starterMatchesFacetFilters(
  starter: SectionTemplateStarter,
  kindFilter: StarterKindFilter,
  sourceFilter: StarterSourceFilter,
  readinessFilter: StarterReadinessFilter,
  dataBindingFilter: StarterDataBindingFilter,
  capabilityFilter: StarterCapabilityFilter,
  planFilter: StarterPlanFilter,
): boolean {
  if (kindFilter !== "all" && starter.kind !== kindFilter) return false;
  if (sourceFilter !== "all" && starter.sourceKind !== sourceFilter) return false;
  if (readinessFilter !== "all" && starter.readiness !== readinessFilter) return false;
  if (dataBindingFilter !== "all" && starter.dataBindingKey !== dataBindingFilter) {
    return false;
  }
  if (
    capabilityFilter !== "all" &&
    !starter.editableCapabilities.includes(capabilityFilter)
  ) {
    return false;
  }
  if (
    planFilter !== "all" &&
    getSectionTemplateStarterRequiredPlan(starter) !== planFilter
  ) {
    return false;
  }
  return true;
}

export function CompositionLibraryOverlay() {
  const {
    libraryTarget,
    closeLibrary,
    slotDefs,
    library,
    insertSection,
    openStarterTemplateGallery,
    workspacePlan,
  } = useEditContext();
  const [busyTypeKey, setBusyTypeKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("all");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [starterKindFilter, setStarterKindFilter] = useState<StarterKindFilter>("all");
  const [starterSourceFilter, setStarterSourceFilter] =
    useState<StarterSourceFilter>("all");
  const [starterReadinessFilter, setStarterReadinessFilter] =
    useState<StarterReadinessFilter>("all");
  const [starterDataBindingFilter, setStarterDataBindingFilter] =
    useState<StarterDataBindingFilter>("all");
  const [starterCapabilityFilter, setStarterCapabilityFilter] =
    useState<StarterCapabilityFilter>("all");
  const [starterPlanFilter, setStarterPlanFilter] =
    useState<StarterPlanFilter>("all");
  /** BUG-007 — collapsed by default so search + categories stay primary. */
  const [starterFacetFiltersOpen, setStarterFacetFiltersOpen] = useState(false);
  const [dragSource, setDragSource] = useState<TemplateDragSource | null>(null);
  const [templateDropTarget, setTemplateDropTarget] =
    useState<TemplateDropTarget | null>(null);
  const [reviewKit, setReviewKit] = useState<SectionTemplateKit | null>(null);
  const [reviewStarter, setReviewStarter] =
    useState<SectionTemplateStarter | null>(null);
  const [reviewStarterIds, setReviewStarterIds] = useState<
    SectionTemplateStarterId[]
  >([]);
  const [reviewKitStylePresetIds, setReviewKitStylePresetIds] = useState<
    Partial<Record<SectionTemplateStarterId, string | null>>
  >({});
  const [reviewStarterStylePresetId, setReviewStarterStylePresetId] =
    useState<string | null>(null);
  const queryInputRef = useRef<HTMLInputElement | null>(null);
  const viewportMode = useViewportMode();
  // Recompute tablet width on resize so a window-drag mid-edit doesn't
  // strand the drawer at a stale width.
  const [tabletWidth, setTabletWidth] = useState<number>(() => 600);
  useEffect(() => {
    if (viewportMode !== "tablet") return;
    const update = () => setTabletWidth(tabletDrawerWidth());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [viewportMode]);

  // Reset state + auto-focus the search each time the library opens so the
  // operator can start typing immediately — a premium editor habit.
  useEffect(() => {
    if (!libraryTarget) return;
    setQuery("");
    setActiveTab("all");
    setShowAdvanced(false);
    setStarterKindFilter("all");
    setStarterSourceFilter("all");
    setStarterReadinessFilter("all");
    setStarterDataBindingFilter("all");
    setStarterCapabilityFilter("all");
    setStarterPlanFilter("all");
    setStarterFacetFiltersOpen(false);
    setError(null);
    setReviewKit(null);
    setReviewStarter(null);
    setReviewStarterIds([]);
    setReviewKitStylePresetIds({});
    setReviewStarterStylePresetId(null);
    const t = setTimeout(() => queryInputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [libraryTarget]);

  useEffect(() => {
    if (!libraryTarget) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeLibrary();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [libraryTarget, closeLibrary]);

  const slotDef = useMemo(() => {
    if (!libraryTarget) return null;
    return slotDefs.find((s) => s.key === libraryTarget.slotKey) ?? null;
  }, [libraryTarget, slotDefs]);

  // Slot-allowed filter is the floor: every other filter narrows from this
  // set. If the slot specifies allowedSectionTypes, advanced toggle still
  // applies but is meaningless if all allowed types are default-tier.
  const slotFiltered = useMemo(() => {
    if (!libraryTarget) return library;
    if (!slotDef) return library;
    return library.filter((entry) =>
      checkSlotTypeCompatibility({
        slotDefs,
        targetSlotKey: libraryTarget.slotKey,
        sectionTypeKey: entry.typeKey,
      }).ok,
    );
  }, [library, libraryTarget, slotDef, slotDefs]);

  const trimmedQuery = query.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;

  // Visible set = slot-filtered ∩ (default-tier OR advanced-toggle-on OR
  // search-active) ∩ (active tab OR "all"). Search bypasses the tier toggle
  // so a power user can jump to any type by typing its name.
  const visible = useMemo(() => {
    return slotFiltered.filter((entry) => {
      if (!isSearching && !showAdvanced && !entry.inDefault) return false;
      if (activeTab !== "all" && entry.category !== activeTab) return false;
      if (isSearching) {
        const hay = `${entry.label} ${entry.description} ${entry.typeKey}`.toLowerCase();
        if (!hay.includes(trimmedQuery)) return false;
      }
      return true;
    });
  }, [slotFiltered, showAdvanced, activeTab, isSearching, trimmedQuery]);

  const startersById = useMemo<Map<string, SectionTemplateStarter>>(() => {
    return new Map(
      SECTION_TEMPLATE_STARTERS.map((starter) => [
        starter.id,
        starter as SectionTemplateStarter,
      ]),
    );
  }, []);

  const templateStarterFacetBase = useMemo(() => {
    if (!libraryTarget) return [] as SectionTemplateStarter[];
    return SECTION_TEMPLATE_STARTERS.filter((starter) => {
      if (activeTab !== "all" && starter.category !== activeTab) return false;
      return true;
    });
  }, [activeTab, libraryTarget]);

  const getStarterCompatibilityForSlot = useCallback(
    (
      starter: SectionTemplateStarter,
      targetSlotKey: string,
    ): TemplateCompatibility => {
      const compatibility = checkSlotTypeCompatibility({
        slotDefs,
        targetSlotKey,
        sectionTypeKey: starter.sectionTypeKey,
      });
      if (!compatibility.ok) {
        return {
          ok: false,
          reason:
            compatibility.message ??
            `${starter.label} is not compatible with this slot.`,
        };
      }
      const planDeniedReason = sectionTemplateStarterPlanDeniedReason(
        starter.id,
        workspacePlan,
      );
      if (planDeniedReason) {
        return {
          ok: false,
          reason: planDeniedReason,
        };
      }
      return { ok: true, reason: null };
    },
    [slotDefs, workspacePlan],
  );

  const getStarterCompatibility = useCallback(
    (starter: SectionTemplateStarter): TemplateCompatibility => {
      if (!libraryTarget) {
        return { ok: false, reason: "Choose an insertion point first." };
      }
      return getStarterCompatibilityForSlot(starter, libraryTarget.slotKey);
    },
    [getStarterCompatibilityForSlot, libraryTarget],
  );

  const getKitCompatibilityForSlot = useCallback(
    (kit: SectionTemplateKit, targetSlotKey: string): TemplateCompatibility => {
      const starters = kit.starterIds
        .map((starterId) => startersById.get(starterId))
        .filter((starter): starter is SectionTemplateStarter => Boolean(starter));
      if (starters.length !== kit.starterIds.length) {
        return {
          ok: false,
          reason: "This kit is missing starter data. Reload and try again.",
        };
      }
      const failedStarter = starters
        .map((starter) => ({
          starter,
          compatibility: getStarterCompatibilityForSlot(starter, targetSlotKey),
        }))
        .find((item) => !item.compatibility.ok);
      if (failedStarter) {
        return {
          ok: false,
          reason:
            failedStarter.compatibility.reason ??
            `${failedStarter.starter.label} is not compatible with this slot.`,
        };
      }
      return { ok: true, reason: null };
    },
    [getStarterCompatibilityForSlot, startersById],
  );

  const getKitCompatibility = useCallback(
    (kit: SectionTemplateKit): TemplateCompatibility => {
      if (!libraryTarget) {
        return { ok: false, reason: "Choose an insertion point first." };
      }
      return getKitCompatibilityForSlot(kit, libraryTarget.slotKey);
    },
    [getKitCompatibilityForSlot, libraryTarget],
  );

  const starterKindCounts = useMemo(() => {
    const counts: Record<SectionTemplateStarterKind, number> = {
      data: 0,
      design: 0,
      conversion: 0,
    };
    for (const starter of templateStarterFacetBase) {
      counts[starter.kind] += 1;
    }
    return counts;
  }, [templateStarterFacetBase]);

  const starterSourceCounts = useMemo(() => {
    const counts: Record<SectionTemplateStarterSourceKind, number> = {
      "live-data": 0,
      "starter-content": 0,
      navigation: 0,
      "route-action": 0,
    };
    for (const starter of templateStarterFacetBase) {
      counts[starter.sourceKind] += 1;
    }
    return counts;
  }, [templateStarterFacetBase]);
  const starterReadinessCounts = useMemo(() => {
    const counts: Record<SectionTemplateStarterReadiness, number> = {
      "ready-now": 0,
      "needs-setup": 0,
    };
    for (const starter of templateStarterFacetBase) {
      counts[starter.readiness] += 1;
    }
    return counts;
  }, [templateStarterFacetBase]);

  const starterDataBindingCounts = useMemo(() => {
    const counts = new Map<BuilderDataSourceKey, number>();
    for (const starter of templateStarterFacetBase) {
      if (!starter.dataBindingKey) continue;
      counts.set(
        starter.dataBindingKey,
        (counts.get(starter.dataBindingKey) ?? 0) + 1,
      );
    }
    return counts;
  }, [templateStarterFacetBase]);

  const starterCapabilityCounts = useMemo(() => {
    const counts: Record<
      SectionTemplateStarter["editableCapabilities"][number],
      number
    > = {
      content: 0,
      style: 0,
      layout: 0,
      data: 0,
      navigation: 0,
      media: 0,
      action: 0,
    };
    for (const starter of templateStarterFacetBase) {
      for (const capability of starter.editableCapabilities) {
        counts[capability] += 1;
      }
    }
    return counts;
  }, [templateStarterFacetBase]);

  const starterPlanCounts = useMemo(() => {
    const counts: Record<BuilderDataSourceDefinition["requiredPlan"], number> = {
      free: 0,
      studio: 0,
      agency: 0,
      network: 0,
    };
    for (const starter of templateStarterFacetBase) {
      counts[getSectionTemplateStarterRequiredPlan(starter)] += 1;
    }
    return counts;
  }, [templateStarterFacetBase]);

  const visibleTemplateStarters = useMemo(() => {
    return templateStarterFacetBase.filter((starter) => {
      if (
        !starterMatchesFacetFilters(
          starter,
          starterKindFilter,
          starterSourceFilter,
          starterReadinessFilter,
          starterDataBindingFilter,
          starterCapabilityFilter,
          starterPlanFilter,
        )
      ) {
        return false;
      }
      if (isSearching) {
        const hay = [
          starter.label,
          starter.description,
          starter.sectionTypeKey,
          starter.kind,
          starter.readiness,
          starter.dataSource,
          starter.dataBindingKey ?? "",
          starter.editModel,
          starter.editScope,
          starter.editableCapabilities.join(" "),
          starter.componentRecipe.join(" "),
          starter.homeCore ? "home core fixed homepage starter" : "",
          ...starter.searchTerms,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(trimmedQuery)) return false;
      }
      return true;
    });
  }, [
    starterCapabilityFilter,
    isSearching,
    starterDataBindingFilter,
    starterKindFilter,
    starterPlanFilter,
    starterReadinessFilter,
    starterSourceFilter,
    templateStarterFacetBase,
    trimmedQuery,
  ]);

  const getStartersForSource = useCallback(
    (source: TemplateDragSource): SectionTemplateStarter[] => {
      if (source.kind === "starter") return [source.starter];
      return source.kit.starterIds
        .map((starterId) => startersById.get(starterId))
        .filter((starter): starter is SectionTemplateStarter => Boolean(starter));
    },
    [startersById],
  );

  const computeTemplateDropTarget = useCallback(
    (
      cursorX: number,
      cursorY: number,
      source: TemplateDragSource,
    ): TemplateDropTarget | null => {
      const drawer = document.querySelector<HTMLElement>('[data-edit-drawer="picker"]');
      const drawerRect = drawer?.getBoundingClientRect();
      if (
        drawerRect &&
        cursorX >= drawerRect.left &&
        cursorX <= drawerRect.right &&
        cursorY >= drawerRect.top &&
        cursorY <= drawerRect.bottom
      ) {
        return null;
      }

      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>(
          "[data-cms-section][data-section-id][data-slot-key]",
        ),
      );
      if (nodes.length === 0) return null;

      const items = nodes
        .map((el) => {
          const id = el.getAttribute("data-section-id");
          const slotKey = el.getAttribute("data-slot-key");
          const order = Number(el.getAttribute("data-sort-order") ?? "");
          const rect = el.getBoundingClientRect();
          return id && slotKey && Number.isFinite(order)
            ? {
                id,
                slotKey,
                order,
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                width: rect.width,
              }
            : null;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
      if (items.length === 0) return null;

      let best: (typeof items)[number] | null = null;
      let bestDistance = Infinity;
      for (const item of items) {
        const mid = (item.top + item.bottom) / 2;
        const distance = Math.abs(cursorY - mid);
        if (distance < bestDistance) {
          best = item;
          bestDistance = distance;
        }
      }
      if (!best) return null;

      const insertBefore = cursorY < (best.top + best.bottom) / 2;
      const targetSlotKey = best.slotKey;
      const siblings = items
        .filter((item) => item.slotKey === targetSlotKey)
        .sort((a, b) => a.order - b.order);
      const bestIndex = siblings.findIndex((item) => item.id === best.id);
      const previousSibling = insertBefore
        ? siblings[bestIndex - 1] ?? null
        : best;

      const starters = getStartersForSource(source);
      const expectedStarterCount =
        source.kind === "starter" ? 1 : source.kit.starterIds.length;
      const targetSlotLabel =
        slotDefs.find((slot) => slot.key === targetSlotKey)?.label ?? targetSlotKey;
      const sourceLabel =
        source.kind === "kit"
          ? `${source.kit.label} kit`
          : source.starter.label;
      let allowed = false;
      let reason: string | null = null;
      if (starters.length === 0 || starters.length !== expectedStarterCount) {
        reason = "This template is missing starter data. Reload and try again.";
      } else {
        const failedCompatibility = starters
          .map((starter) => ({
            starter,
            compatibility: getStarterCompatibilityForSlot(starter, targetSlotKey),
          }))
          .find((item) => !item.compatibility.ok);
        if (failedCompatibility) {
          reason =
            failedCompatibility.compatibility.reason ??
            `${failedCompatibility.starter.label} is not compatible with this slot.`;
        } else {
          allowed = true;
        }
      }

      const label = insertBefore ? "Drop before section" : "Drop after section";

      return {
        slotKey: targetSlotKey,
        insertAfterSortOrder: previousSibling?.order ?? null,
        allowed,
        indicatorY: insertBefore ? best.top : best.bottom,
        indicatorLeft: best.left,
        indicatorWidth: best.width,
        label,
        sourceLabel,
        sourceSectionCount: expectedStarterCount,
        targetSlotLabel,
        reason,
      };
    },
    [getStarterCompatibilityForSlot, getStartersForSource, slotDefs],
  );

  const formatDropBlockedMessage = useCallback((target: TemplateDropTarget) => {
    return target.reason ?? `Can't drop into ${target.targetSlotLabel}.`;
  }, []);

  const visibleTemplateKits = useMemo(() => {
    if (!libraryTarget) return [];
    return SECTION_TEMPLATE_KITS.filter((kit) => {
      if (activeTab !== "all" && kit.category !== activeTab) return false;
      const starters = kit.starterIds
        .map((starterId) => startersById.get(starterId))
        .filter((starter): starter is SectionTemplateStarter => Boolean(starter));
      if (starters.length !== kit.starterIds.length) return false;
      const starterMatchesFacet = starters.some((starter) =>
        starterMatchesFacetFilters(
          starter,
          starterKindFilter,
          starterSourceFilter,
          starterReadinessFilter,
          starterDataBindingFilter,
          starterCapabilityFilter,
          starterPlanFilter,
        ),
      );
      if (!starterMatchesFacet) return false;
      if (isSearching) {
        const hay = [
          kit.label,
          kit.description,
          kit.kind,
          ...kit.searchTerms,
          ...starters.flatMap((starter) => [
            starter.label,
            starter.description,
            starter.sectionTypeKey,
            starter.readiness,
            starter.dataSource,
            starter.dataBindingKey ?? "",
            starter.editModel,
            starter.editScope,
            starter.editableCapabilities.join(" "),
            starter.componentRecipe.join(" "),
            starter.homeCore ? "home core fixed homepage starter" : "",
            ...starter.searchTerms,
          ]),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(trimmedQuery)) return false;
      }
      return true;
    });
  }, [
    activeTab,
    isSearching,
    libraryTarget,
    starterCapabilityFilter,
    starterDataBindingFilter,
    starterKindFilter,
    starterPlanFilter,
    starterReadinessFilter,
    starterSourceFilter,
    startersById,
    trimmedQuery,
  ]);

  // Category counts for the tab strip — counted against the slot-filtered
  // set respecting current tier toggle (so the count reflects what the
  // operator will actually see when they click that tab). Search is
  // intentionally excluded from counts: the tab strip is a category map,
  // not a search results facet.
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of slotFiltered) {
      if (!showAdvanced && !entry.inDefault) continue;
      counts[entry.category] = (counts[entry.category] ?? 0) + 1;
    }
    return counts;
  }, [slotFiltered, showAdvanced]);

  // Group visible tiles by category; CATEGORY_ORDER drives section order.
  const grouped = useMemo(() => {
    const by: Record<string, typeof visible> = {};
    for (const entry of visible) (by[entry.category] ??= []).push(entry);
    return by;
  }, [visible]);

  async function handlePick(typeKey: string) {
    if (!libraryTarget) return;
    setBusyTypeKey(typeKey);
    setError(null);
    const res = await insertSection(libraryTarget, typeKey);
    setBusyTypeKey(null);
    if (!res.ok) {
      setError(res.error ?? "Couldn't add the section.");
      return;
    }
    closeLibrary();
  }

  const handleTemplatePick = useCallback(async (
    starter: SectionTemplateStarter,
    stylePresetId?: string | null,
  ) => {
    if (!libraryTarget) return;
    const compatibility = getStarterCompatibility(starter);
    if (!compatibility.ok) {
      setError(compatibility.reason ?? "This section template is not available here.");
      return;
    }
    const busyKey = `template:${starter.id}`;
    setBusyTypeKey(busyKey);
    setError(null);
    const res = await insertSection(libraryTarget, starter.sectionTypeKey, {
      sectionTemplateStarterId: starter.id,
      sectionTemplateStarterStylePresetId: stylePresetId ?? null,
    });
    setBusyTypeKey(null);
    if (!res.ok) {
      setError(res.error ?? "Couldn't add the section template.");
      return;
    }
    setReviewStarter(null);
    closeLibrary();
  }, [closeLibrary, getStarterCompatibility, insertSection, libraryTarget]);

  const handleKitPick = useCallback(async (
    kit: SectionTemplateKit,
    stylePresetIds?: Partial<Record<SectionTemplateStarterId, string | null>>,
  ) => {
    if (!libraryTarget) return;
    const compatibility = getKitCompatibility(kit);
    if (!compatibility.ok) {
      setError(compatibility.reason ?? "This section kit is not available here.");
      return;
    }
    const busyKey = `kit:${kit.id}`;
    setBusyTypeKey(busyKey);
    setError(null);

    let nextTarget = libraryTarget;
    for (const starterId of kit.starterIds) {
      const starter = startersById.get(starterId);
      if (!starter) {
        setBusyTypeKey(null);
        setError("Section kit is missing one of its starters.");
        return;
      }
      const res = await insertSection(nextTarget, starter.sectionTypeKey, {
        sectionTemplateStarterId: starter.id,
        sectionTemplateStarterStylePresetId: stylePresetIds?.[starterId] ?? null,
      });
      if (!res.ok) {
        setBusyTypeKey(null);
        setError(res.error ?? "Couldn't add the section kit.");
        return;
      }
      if (res.section) {
        nextTarget = {
          slotKey: nextTarget.slotKey,
          insertAfterSortOrder: res.section.sortOrder,
        };
      }
    }

    setBusyTypeKey(null);
    setReviewKit(null);
    closeLibrary();
  }, [closeLibrary, getKitCompatibility, insertSection, libraryTarget, startersById]);

  const openKitReview = useCallback((kit: SectionTemplateKit) => {
    setReviewKit(kit);
    setReviewStarter(null);
    setReviewStarterIds([...kit.starterIds]);
    setReviewKitStylePresetIds({});
    setError(null);
  }, []);

  const openStarterReview = useCallback((starter: SectionTemplateStarter) => {
    setReviewStarter(starter);
    setReviewKit(null);
    setReviewStarterStylePresetId(null);
    setError(null);
  }, []);

  const applyReviewedKit = useCallback(() => {
    if (!reviewKit || reviewStarterIds.length === 0) return;
    const selected = reviewStarterIds.filter((starterId) =>
      reviewKit.starterIds.includes(starterId),
    );
    if (selected.length === 0) return;
    void handleKitPick({ ...reviewKit, starterIds: selected }, reviewKitStylePresetIds);
  }, [handleKitPick, reviewKit, reviewKitStylePresetIds, reviewStarterIds]);

  const handleSourceInsert = useCallback(
    async (
      source: TemplateDragSource,
      targetOverride?: {
        slotKey: string;
        insertAfterSortOrder: number | null;
      },
    ) => {
      const previousTarget = libraryTarget;
      const activeTarget = targetOverride ?? previousTarget;
      if (!activeTarget) return;

      if (source.kind === "starter") {
        const compatibility = getStarterCompatibilityForSlot(
          source.starter,
          activeTarget.slotKey,
        );
        if (!compatibility.ok) {
          setError(
            compatibility.reason ?? "This section template is not available here.",
          );
          return;
        }
        const busyKey = `template:${source.starter.id}`;
        setBusyTypeKey(busyKey);
        setError(null);
        const res = await insertSection(activeTarget, source.starter.sectionTypeKey, {
          sectionTemplateStarterId: source.starter.id,
          sectionTemplateStarterStylePresetId: null,
        });
        setBusyTypeKey(null);
        if (!res.ok) {
          setError(res.error ?? "Couldn't add the section template.");
          return;
        }
        closeLibrary();
        return;
      }

      const compatibility = getKitCompatibilityForSlot(
        source.kit,
        activeTarget.slotKey,
      );
      if (!compatibility.ok) {
        setError(compatibility.reason ?? "This section kit is not available here.");
        return;
      }
      const busyKey = `kit:${source.kit.id}`;
      setBusyTypeKey(busyKey);
      setError(null);
      let nextTarget = activeTarget;
      for (const starterId of source.kit.starterIds) {
        const starter = startersById.get(starterId);
        if (!starter) {
          setBusyTypeKey(null);
          setError("Section kit is missing one of its starters.");
          return;
        }
        const res = await insertSection(nextTarget, starter.sectionTypeKey, {
          sectionTemplateStarterId: starter.id,
        });
        if (!res.ok) {
          setBusyTypeKey(null);
          setError(res.error ?? "Couldn't add the section kit.");
          return;
        }
        if (res.section) {
          nextTarget = {
            slotKey: nextTarget.slotKey,
            insertAfterSortOrder: res.section.sortOrder,
          };
        }
      }
      setBusyTypeKey(null);
      closeLibrary();
    },
    [
      closeLibrary,
      getKitCompatibilityForSlot,
      getStarterCompatibilityForSlot,
      insertSection,
      libraryTarget,
      startersById,
    ],
  );

  useEffect(() => {
    if (!libraryTarget || !dragSource) return;
    const activeDragSource = dragSource;
    function onDragOver(e: DragEvent) {
      e.preventDefault();
      const nextDropTarget = computeTemplateDropTarget(
        e.clientX,
        e.clientY,
        activeDragSource,
      );
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect =
          nextDropTarget && !nextDropTarget.allowed ? "none" : "copy";
      }
      setTemplateDropTarget(nextDropTarget);
    }
    function onDrop(e: DragEvent) {
      e.preventDefault();
      const source = activeDragSource;
      const dropTarget =
        computeTemplateDropTarget(e.clientX, e.clientY, source) ?? templateDropTarget;
      setDragSource(null);
      setTemplateDropTarget(null);
      if (!source) return;
      if (dropTarget && !dropTarget.allowed) {
        setError(formatDropBlockedMessage(dropTarget));
        return;
      }
      const targetOverride =
        dropTarget && dropTarget.allowed
          ? {
              slotKey: dropTarget.slotKey,
              insertAfterSortOrder: dropTarget.insertAfterSortOrder,
            }
          : undefined;
      void handleSourceInsert(source, targetOverride);
    }
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [
    computeTemplateDropTarget,
    dragSource,
    formatDropBlockedMessage,
    handleSourceInsert,
    libraryTarget,
    templateDropTarget,
  ]);

  const drawerOpen = !!libraryTarget;
  const visibleTemplateItemCount =
    visibleTemplateKits.length + visibleTemplateStarters.length;
  const totalVisibleItems = visible.length + visibleTemplateItemCount;
  const totalSearchable =
    slotFiltered.length + templateStarterFacetBase.length + visibleTemplateKits.length;
  const advancedHiddenCount =
    slotFiltered.length - slotFiltered.filter((e) => e.inDefault).length;
  const isMobile = viewportMode === "mobile";

  const starterFacetActiveCount = useMemo(() => {
    let n = 0;
    if (starterKindFilter !== "all") n++;
    if (starterSourceFilter !== "all") n++;
    if (starterReadinessFilter !== "all") n++;
    if (starterDataBindingFilter !== "all") n++;
    if (starterCapabilityFilter !== "all") n++;
    if (starterPlanFilter !== "all") n++;
    return n;
  }, [
    starterCapabilityFilter,
    starterDataBindingFilter,
    starterKindFilter,
    starterPlanFilter,
    starterReadinessFilter,
    starterSourceFilter,
  ]);

  if (!drawerOpen && !reviewKit && !reviewStarter && !dragSource) {
    return null;
  }

  const insertingMeta = slotDef
    ? `Inserting into ${slotDef.label} · ${totalVisibleItems} item${totalVisibleItems === 1 ? "" : "s"} visible`
    : `${totalVisibleItems} items`;

  // Inner panel content — identical between drawer (desktop/tablet) and
  // bottom-sheet (mobile) variants. Only the surrounding shell + a few
  // layout knobs differ per viewport mode.
  const innerContent = (
    <>
      {/* Search + tier toggle row: stable above the scrollable grid.
          On mobile this row is sticky so the operator never loses
          the search field while scrolling tiles. */}
      <div
        className={`${isMobile ? "sticky top-0 z-10 bg-white" : ""} px-[18px] py-3`}
        style={{ borderBottom: `1px solid ${CHROME.line}` }}
      >
        <div className="relative">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={queryInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              totalSearchable === 0
                ? "No sections available"
                : `Search ${totalSearchable} item${totalSearchable === 1 ? "" : "s"} — kits, hero, cta, testimonials…`
            }
            className="w-full rounded-lg border border-[#e5e0d5] bg-[#faf9f6] py-2 pl-9 pr-3 text-[13px] text-stone-800 placeholder:text-stone-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/15 transition-colors"
          />
        </div>
        {totalSearchable > 0 ? (
          <p className="mt-2 text-[11px] leading-snug text-zinc-500">
            {advancedHiddenCount > 0 ? (
              <>
                Search or pick a category. Rare layouts stay behind{" "}
                <span className="font-medium text-zinc-600">Show advanced sections</span>.
                Optional kit filters live under{" "}
                <span className="font-medium text-zinc-600">More filters</span>.
              </>
            ) : (
              <>
                Search or pick a category — all listed types work in this slot. Use{" "}
                <span className="font-medium text-zinc-600">More filters</span>{" "}
                to narrow kits and starters.
              </>
            )}
          </p>
        ) : null}

        {/* Tab strip: All + 8 category tabs (only those with at least one
            tile in the current visible-tier set are shown). On mobile we
            switch to a horizontal-scroll chip strip so categories don't
            consume vertical space. */}
        <div
          className={
            isMobile
              ? "mt-2 -mx-[18px] flex items-center gap-1.5 overflow-x-auto px-[18px] pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              : "mt-2 flex flex-wrap items-center gap-1"
          }
        >
          <Tab
            active={activeTab === "all"}
            onClick={() => setActiveTab("all")}
            label="All"
            count={totalVisibleItems}
            mobile={isMobile}
          />
          {CATEGORY_ORDER.map((cat) => {
            const n = categoryCounts[cat] ?? 0;
            if (n === 0) return null;
            return (
              <Tab
                key={cat}
                active={activeTab === cat}
                onClick={() => setActiveTab(cat)}
                label={CATEGORY_LABEL[cat] ?? cat}
                count={n}
                mobile={isMobile}
              />
            );
          })}

          {/* Advanced toggle on desktop/tablet — quiet pill on the right
              of the tab strip. On mobile it moves to its own row below
              for a clearer touch target. */}
          {!isMobile && advancedHiddenCount > 0 ? (
            <label className="ml-auto inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-500 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-100">
              <input
                type="checkbox"
                checked={showAdvanced}
                onChange={(e) => setShowAdvanced(e.target.checked)}
                className="h-3 w-3 cursor-pointer accent-indigo-600"
              />
              <span>Show advanced sections</span>
            </label>
          ) : null}
        </div>

        {/* Mobile-only: advanced toggle on its own row, full-width touch
            target sized for thumbs. */}
        {isMobile && advancedHiddenCount > 0 ? (
          <label className="mt-2 flex cursor-pointer select-none items-center justify-between gap-2 rounded-md bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200 active:bg-zinc-100">
            <span>Show advanced sections</span>
            <input
              type="checkbox"
              checked={showAdvanced}
              onChange={(e) => setShowAdvanced(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-indigo-600"
            />
          </label>
        ) : null}

        {templateStarterFacetBase.length > 0 ? (
          <div className="mt-2">
            {!starterFacetFiltersOpen ? (
              <button
                type="button"
                data-section-template-filters-disclosure
                onClick={() => setStarterFacetFiltersOpen(true)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-[12px] font-medium text-zinc-800 transition hover:border-[#3d4f7c]/25 hover:bg-white"
              >
                <span className="min-w-0">
                  More filters for kits & starters
                  {starterFacetActiveCount > 0 ? (
                    <span className="ml-2 inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-900">
                      {starterFacetActiveCount} active
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-[11px] font-normal text-zinc-500">
                  Kind, source, plan…
                </span>
              </button>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                    Kit & starter filters
                  </span>
                  <button
                    type="button"
                    data-section-template-filters-hide
                    onClick={() => setStarterFacetFiltersOpen(false)}
                    className="text-[11px] font-semibold text-indigo-700 hover:underline"
                  >
                    Hide filters
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[repeat(6,minmax(0,1fr))_auto]">
            <label className="flex min-w-0 items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] text-zinc-600">
              <span className="shrink-0 font-semibold uppercase tracking-wide text-zinc-400">
                Kind
              </span>
              <select
                data-section-template-kind-filter
                aria-label="Filter starter templates by kind"
                value={starterKindFilter}
                onChange={(event) =>
                  setStarterKindFilter(event.target.value as StarterKindFilter)
                }
                className="min-w-0 flex-1 bg-transparent text-[12px] font-medium text-zinc-700 outline-none"
              >
                <option value="all">All ({templateStarterFacetBase.length})</option>
                <option value="data">Data ({starterKindCounts.data})</option>
                <option value="design">Design ({starterKindCounts.design})</option>
                <option value="conversion">
                  Conversion ({starterKindCounts.conversion})
                </option>
              </select>
            </label>
            <label className="flex min-w-0 items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] text-zinc-600">
              <span className="shrink-0 font-semibold uppercase tracking-wide text-zinc-400">
                Source
              </span>
              <select
                data-section-template-source-filter
                aria-label="Filter starter templates by source"
                value={starterSourceFilter}
                onChange={(event) =>
                  setStarterSourceFilter(event.target.value as StarterSourceFilter)
                }
                className="min-w-0 flex-1 bg-transparent text-[12px] font-medium text-zinc-700 outline-none"
              >
                <option value="all">All ({templateStarterFacetBase.length})</option>
                <option value="live-data">
                  {sourceKindLabel("live-data")} ({starterSourceCounts["live-data"]})
                </option>
                <option value="navigation">
                  {sourceKindLabel("navigation")} ({starterSourceCounts.navigation})
                </option>
                <option value="route-action">
                  {sourceKindLabel("route-action")} ({starterSourceCounts["route-action"]})
                </option>
                <option value="starter-content">
                  {sourceKindLabel("starter-content")} ({starterSourceCounts["starter-content"]})
                </option>
              </select>
            </label>
            <label className="flex min-w-0 items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] text-zinc-600">
              <span className="shrink-0 font-semibold uppercase tracking-wide text-zinc-400">
                Ready
              </span>
              <select
                data-section-template-readiness-filter
                aria-label="Filter starter templates by readiness"
                value={starterReadinessFilter}
                onChange={(event) =>
                  setStarterReadinessFilter(event.target.value as StarterReadinessFilter)
                }
                className="min-w-0 flex-1 bg-transparent text-[12px] font-medium text-zinc-700 outline-none"
              >
                <option value="all">All ({templateStarterFacetBase.length})</option>
                <option value="ready-now">
                  Ready now ({starterReadinessCounts["ready-now"]})
                </option>
                <option value="needs-setup">
                  Needs setup ({starterReadinessCounts["needs-setup"]})
                </option>
              </select>
            </label>
            <label className="flex min-w-0 items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] text-zinc-600">
              <span className="shrink-0 font-semibold uppercase tracking-wide text-zinc-400">
                Data
              </span>
              <select
                data-section-template-data-filter
                aria-label="Filter starter templates by data source"
                value={starterDataBindingFilter}
                onChange={(event) =>
                  setStarterDataBindingFilter(
                    event.target.value as StarterDataBindingFilter,
                  )
                }
                className="min-w-0 flex-1 bg-transparent text-[12px] font-medium text-zinc-700 outline-none"
              >
                <option value="all">All ({templateStarterFacetBase.length})</option>
                {BUILDER_DATA_SOURCE_REGISTRY.map((source) => {
                  const count = starterDataBindingCounts.get(source.key) ?? 0;
                  if (count === 0) return null;
                  return (
                    <option key={source.key} value={source.key}>
                      {source.label} ({count})
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="flex min-w-0 items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] text-zinc-600">
              <span className="shrink-0 font-semibold uppercase tracking-wide text-zinc-400">
                Control
              </span>
              <select
                data-section-template-capability-filter
                aria-label="Filter starter templates by editable control"
                value={starterCapabilityFilter}
                onChange={(event) =>
                  setStarterCapabilityFilter(
                    event.target.value as StarterCapabilityFilter,
                  )
                }
                className="min-w-0 flex-1 bg-transparent text-[12px] font-medium text-zinc-700 outline-none"
              >
                <option value="all">All ({templateStarterFacetBase.length})</option>
                {EDITABLE_CAPABILITY_OPTIONS.map((capability) => (
                  <option key={capability} value={capability}>
                    {editableCapabilityLabel(capability)} (
                    {starterCapabilityCounts[capability]})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] text-zinc-600">
              <span className="shrink-0 font-semibold uppercase tracking-wide text-zinc-400">
                Plan
              </span>
              <select
                data-section-template-plan-filter
                aria-label="Filter starter templates by required plan"
                value={starterPlanFilter}
                onChange={(event) =>
                  setStarterPlanFilter(event.target.value as StarterPlanFilter)
                }
                className="min-w-0 flex-1 bg-transparent text-[12px] font-medium text-zinc-700 outline-none"
              >
                <option value="all">All ({templateStarterFacetBase.length})</option>
                <option value="free">Free ({starterPlanCounts.free})</option>
                <option value="studio">Studio ({starterPlanCounts.studio})</option>
                <option value="agency">Agency ({starterPlanCounts.agency})</option>
                <option value="network">Network ({starterPlanCounts.network})</option>
              </select>
            </label>
            <button
              type="button"
              data-section-template-filters-reset
              onClick={() => {
                setStarterKindFilter("all");
                setStarterSourceFilter("all");
                setStarterReadinessFilter("all");
                setStarterDataBindingFilter("all");
                setStarterCapabilityFilter("all");
                setStarterPlanFilter("all");
              }}
              disabled={
                starterKindFilter === "all" &&
                starterSourceFilter === "all" &&
                starterReadinessFilter === "all" &&
                starterDataBindingFilter === "all" &&
                starterCapabilityFilter === "all" &&
                starterPlanFilter === "all"
              }
              className="inline-flex h-full items-center justify-center rounded-md border border-zinc-200 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-600 transition hover:border-[#3d4f7c]/30 hover:text-[#3d4f7c] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Reset
            </button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          aria-live="assertive"
          className="border-b border-red-100 bg-red-50 px-[18px] py-2 text-xs text-red-700"
        >
          {error}
        </div>
      ) : null}

      {isMobile ? (
        <div className="flex-1 overflow-y-auto px-[18px] pb-6 pt-3">
          <DrawerBodyInner
            visible={visible}
            templateKits={visibleTemplateKits}
            templateStarters={visibleTemplateStarters}
            startersById={startersById}
            grouped={grouped}
            showAdvanced={showAdvanced}
            advancedHiddenCount={advancedHiddenCount}
            isSearching={isSearching}
            query={query}
            busyTypeKey={busyTypeKey}
            dragSource={dragSource}
            setDragSource={setDragSource}
            getKitCompatibility={getKitCompatibility}
            getStarterCompatibility={getStarterCompatibility}
            handlePick={handlePick}
            handleKitPick={openKitReview}
            handleTemplatePick={openStarterReview}
            handleOpenSavedTemplates={() => {
              closeLibrary();
              openStarterTemplateGallery();
            }}
          />
        </div>
      ) : (
        <DrawerBody>
          <DrawerBodyInner
            visible={visible}
            templateKits={visibleTemplateKits}
            templateStarters={visibleTemplateStarters}
            startersById={startersById}
            grouped={grouped}
            showAdvanced={showAdvanced}
            advancedHiddenCount={advancedHiddenCount}
            isSearching={isSearching}
            query={query}
            busyTypeKey={busyTypeKey}
            dragSource={dragSource}
            setDragSource={setDragSource}
            getKitCompatibility={getKitCompatibility}
            getStarterCompatibility={getStarterCompatibility}
            handlePick={handlePick}
            handleKitPick={openKitReview}
            handleTemplatePick={openStarterReview}
            handleOpenSavedTemplates={() => {
              closeLibrary();
              openStarterTemplateGallery();
            }}
          />
        </DrawerBody>
      )}
    </>
  );

  // Desktop / tablet: kit Drawer (right slide).
  // Mobile: bottom-sheet portal — same content, different shell.
  if (!isMobile) {
    const drawerWidth = viewportMode === "tablet" ? tabletWidth : undefined;
    return (
      <Drawer
        kind="picker"
        open={drawerOpen}
        zIndex={110}
        width={drawerWidth}
        ariaLabelledBy="composition-library-drawer-title"
      >
        <DrawerHead
          titleId="composition-library-drawer-title"
          title="Add a section"
          meta={insertingMeta}
          onClose={closeLibrary}
        />
        {innerContent}
        <TemplateDropOverlay
          dragSource={dragSource}
          dropTarget={templateDropTarget}
        />
        <KitReviewOverlay
          kit={reviewKit}
          selectedStarterIds={reviewStarterIds}
          selectedStylePresetIds={reviewKitStylePresetIds}
          startersById={startersById}
          busy={reviewKit ? busyTypeKey === `kit:${reviewKit.id}` : false}
          onToggle={(starterId) => {
            setReviewStarterIds((current) =>
              current.includes(starterId)
                ? current.filter((id) => id !== starterId)
                : [...current, starterId],
            );
          }}
          onStylePresetChange={(starterId, presetId) => {
            setReviewKitStylePresetIds((current) => ({
              ...current,
              [starterId]: presetId,
            }));
          }}
          onSelectAll={() => {
            if (!reviewKit) return;
            setReviewStarterIds([...reviewKit.starterIds]);
          }}
          onSelectHomeCore={() => {
            if (!reviewKit) return;
            setReviewStarterIds(
              resolveHomeCoreStarterIdsForKit(reviewKit, startersById),
            );
          }}
          onClear={() => {
            setReviewStarterIds([]);
            setReviewKitStylePresetIds({});
          }}
          onReset={() => {
            if (!reviewKit) return;
            setReviewStarterIds([...reviewKit.starterIds]);
            setReviewKitStylePresetIds({});
          }}
          onClose={() => setReviewKit(null)}
          onApply={applyReviewedKit}
        />
        <StarterReviewOverlay
          starter={reviewStarter}
          selectedStylePresetId={reviewStarterStylePresetId}
          onStylePresetChange={setReviewStarterStylePresetId}
          busy={reviewStarter ? busyTypeKey === `template:${reviewStarter.id}` : false}
          onClose={() => setReviewStarter(null)}
          onApply={() => {
            if (!reviewStarter) return;
            void handleTemplatePick(reviewStarter, reviewStarterStylePresetId);
          }}
        />
      </Drawer>
    );
  }

  // Mobile bottom sheet — own scrim + sheet, slides up from the bottom.
  // Sticky search/tabs header is inside `innerContent`.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      data-edit-mobile-picker
      className="fixed inset-0 z-[110]"
      style={{
        pointerEvents: drawerOpen ? "auto" : "none",
      }}
      aria-hidden={!drawerOpen}
    >
      {/* Scrim */}
      <div
        className="absolute inset-0 bg-[#242942]/40 transition-opacity duration-200"
        style={{ opacity: drawerOpen ? 1 : 0 }}
        onClick={closeLibrary}
      />
      {/* Sheet */}
      <div
        className="absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-2xl bg-white shadow-2xl transition-transform duration-200 ease-out"
        role="dialog"
        aria-modal="true"
        aria-hidden={!drawerOpen}
        aria-labelledby="composition-library-mobile-title"
        style={{
          transform: drawerOpen ? "translateY(0)" : "translateY(100%)",
        }}
      >
        {/* Drag-handle pill — pure visual cue, no real drag yet */}
        <div className="flex justify-center py-2">
          <div className="h-1 w-10 rounded-full bg-zinc-300" />
        </div>
        {/* Mobile head — replaces DrawerHead on small screens. The
            tools-row close button is replaced by a tap-the-scrim gesture
            plus an explicit "Done" button at the top-right for clarity. */}
        <div
          className="flex items-start justify-between gap-3 px-[18px] pb-3 pt-1"
          style={{ borderBottom: `1px solid ${CHROME.line}` }}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Add section
            </span>
            <span
              id="composition-library-mobile-title"
              className="text-base font-semibold text-zinc-900"
            >
              Pick a section
            </span>
            <span className="text-xs text-zinc-500">{insertingMeta}</span>
          </div>
          <button
            type="button"
            onClick={closeLibrary}
            aria-label="Close"
            className="-mr-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 active:bg-zinc-100"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {innerContent}
      </div>
      <TemplateDropOverlay
        dragSource={dragSource}
        dropTarget={templateDropTarget}
      />
      <KitReviewOverlay
        kit={reviewKit}
        selectedStarterIds={reviewStarterIds}
        selectedStylePresetIds={reviewKitStylePresetIds}
        startersById={startersById}
        busy={reviewKit ? busyTypeKey === `kit:${reviewKit.id}` : false}
        onToggle={(starterId) => {
          setReviewStarterIds((current) =>
            current.includes(starterId)
              ? current.filter((id) => id !== starterId)
              : [...current, starterId],
          );
        }}
        onStylePresetChange={(starterId, presetId) => {
          setReviewKitStylePresetIds((current) => ({
            ...current,
            [starterId]: presetId,
          }));
        }}
        onSelectAll={() => {
          if (!reviewKit) return;
          setReviewStarterIds([...reviewKit.starterIds]);
        }}
        onSelectHomeCore={() => {
          if (!reviewKit) return;
          setReviewStarterIds(
            resolveHomeCoreStarterIdsForKit(reviewKit, startersById),
          );
        }}
        onClear={() => {
          setReviewStarterIds([]);
          setReviewKitStylePresetIds({});
        }}
        onReset={() => {
          if (!reviewKit) return;
          setReviewStarterIds([...reviewKit.starterIds]);
          setReviewKitStylePresetIds({});
        }}
        onClose={() => setReviewKit(null)}
        onApply={applyReviewedKit}
      />
      <StarterReviewOverlay
        starter={reviewStarter}
        selectedStylePresetId={reviewStarterStylePresetId}
        onStylePresetChange={setReviewStarterStylePresetId}
        busy={reviewStarter ? busyTypeKey === `template:${reviewStarter.id}` : false}
        onClose={() => setReviewStarter(null)}
        onApply={() => {
          if (!reviewStarter) return;
          void handleTemplatePick(reviewStarter, reviewStarterStylePresetId);
        }}
      />
    </div>,
    document.body,
  );
}

interface LibraryEntryView {
  typeKey: string;
  label: string;
  description: string;
  category: string;
  inDefault: boolean;
  tag?: "new" | "premium";
}

interface DrawerBodyInnerProps {
  visible: LibraryEntryView[];
  templateKits: readonly SectionTemplateKit[];
  templateStarters: readonly SectionTemplateStarter[];
  startersById: ReadonlyMap<string, SectionTemplateStarter>;
  grouped: Record<string, LibraryEntryView[]>;
  /** When search is empty but advanced types are hidden, surface recovery copy. */
  showAdvanced: boolean;
  advancedHiddenCount: number;
  isSearching: boolean;
  query: string;
  busyTypeKey: string | null;
  dragSource: TemplateDragSource | null;
  setDragSource: (source: TemplateDragSource | null) => void;
  getKitCompatibility: (kit: SectionTemplateKit) => TemplateCompatibility;
  getStarterCompatibility: (
    starter: SectionTemplateStarter,
  ) => TemplateCompatibility;
  handlePick: (typeKey: string) => void;
  handleKitPick: (kit: SectionTemplateKit) => void;
  handleTemplatePick: (starter: SectionTemplateStarter) => void;
  handleOpenSavedTemplates: () => void;
}

function DrawerBodyInner({
  visible,
  templateKits,
  templateStarters,
  startersById,
  grouped,
  showAdvanced,
  advancedHiddenCount,
  isSearching,
  query,
  busyTypeKey,
  dragSource,
  setDragSource,
  getKitCompatibility,
  getStarterCompatibility,
  handlePick,
  handleKitPick,
  handleTemplatePick,
  handleOpenSavedTemplates,
}: DrawerBodyInnerProps) {
  const availableTemplateKitCount = templateKits.filter(
    (kit) => getKitCompatibility(kit).ok,
  ).length;
  const availableTemplateStarterCount = templateStarters.filter(
    (starter) => getStarterCompatibility(starter).ok,
  ).length;
  if (visible.length === 0 && templateStarters.length === 0 && templateKits.length === 0) {
    const recovery =
      isSearching && advancedHiddenCount > 0 && !showAdvanced
        ? " Clear the search, pick another category, or turn on Show advanced sections."
        : isSearching
          ? " Clear the search or try another category tab."
          : "";
    return (
      <div className="space-y-2 py-12 text-center text-sm text-zinc-500">
        <p className="m-0">
          {isSearching
            ? `No kits, templates, or section types match "${query.trim()}".`
            : "No section templates or types available for this slot."}
        </p>
        {recovery ? <p className="m-0 text-xs leading-relaxed text-zinc-400">{recovery}</p> : null}
      </div>
    );
  }
  const showNoSectionTypeMatchBanner =
    isSearching &&
    visible.length === 0 &&
    (templateKits.length > 0 || templateStarters.length > 0);
  return (
    <div className="space-y-6">
      {showNoSectionTypeMatchBanner ? (
        <div className="rounded-md border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-[11px] text-zinc-700">
          <p className="m-0 font-medium text-zinc-900">
            No section types match this search in the categories above.
          </p>
          <p className="mt-1 m-0 text-zinc-600">
            Kits and starter templates below still match your search.
            {advancedHiddenCount > 0 && !showAdvanced ? (
              <>
                {" "}
                Rare single-section types may need{" "}
                <strong className="font-semibold text-zinc-800">Show advanced sections</strong>.
              </>
            ) : null}
          </p>
        </div>
      ) : null}
      <section>
        <button
          type="button"
          data-section-library-saved-templates
          onClick={handleOpenSavedTemplates}
          className="group flex w-full items-start gap-3 rounded-xl border border-[#ddd8cc] bg-[#fbfaf7] p-3 text-left shadow-sm transition hover:-translate-y-px hover:border-[#3d4f7c]/45 hover:shadow-md"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#3d4f7c] ring-1 ring-inset ring-[#3d4f7c]/15">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M4 19.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13.5" />
              <path d="M8 8h8" />
              <path d="M8 12h5" />
              <path d="M4 19.5h16" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-zinc-950">
                Saved templates
              </span>
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[#3d4f7c]">
                Open gallery
              </span>
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-zinc-500">
              Reuse workspace templates, save the current draft, or apply a
              saved composition from the full template gallery.
            </span>
          </span>
        </button>
      </section>
      {templateKits.length > 0 ? (
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Homepage kits
              </h3>
              <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-400">
                Multi-section sequences that stay individually editable.
              </p>
            </div>
            <span className="text-[10px] text-zinc-400 tabular-nums">
              {availableTemplateKitCount}/{templateKits.length} available
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {templateKits.map((kit) => {
              const compatibility = getKitCompatibility(kit);
              const busy = busyTypeKey === `kit:${kit.id}`;
              return (
                <TemplateKitCard
                  key={kit.id}
                  kit={kit}
                  startersById={startersById}
                  busy={busy}
                  disabled={busyTypeKey !== null || !compatibility.ok}
                  compatibility={compatibility}
                  dragging={dragSource?.kind === "kit" && dragSource.kit.id === kit.id}
                  onDragStart={() => setDragSource({ kind: "kit", kit })}
                  onDragEnd={() => setDragSource(null)}
                  onPick={() => void handleKitPick(kit)}
                />
              );
            })}
          </div>
        </section>
      ) : null}
      {templateStarters.length > 0 ? (
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Starter section templates
              </h3>
              <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-400">
                Designed presets that insert real editable sections.
              </p>
            </div>
            <span className="text-[10px] text-zinc-400 tabular-nums">
              {availableTemplateStarterCount}/{templateStarters.length} available
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {templateStarters.map((starter) => {
              const compatibility = getStarterCompatibility(starter);
              const busy = busyTypeKey === `template:${starter.id}`;
              return (
                <TemplateStarterCard
                  key={starter.id}
                  starter={starter}
                  busy={busy}
                  disabled={busyTypeKey !== null || !compatibility.ok}
                  compatibility={compatibility}
                  dragging={
                    dragSource?.kind === "starter" &&
                    dragSource.starter.id === starter.id
                  }
                  onDragStart={() => setDragSource({ kind: "starter", starter })}
                  onDragEnd={() => setDragSource(null)}
                  onPick={() => void handleTemplatePick(starter)}
                />
              );
            })}
          </div>
        </section>
      ) : null}
      {CATEGORY_ORDER.map((cat) => {
        const entries = grouped[cat];
        if (!entries || entries.length === 0) return null;
        return (
          <section key={cat}>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                {CATEGORY_LABEL[cat] ?? cat}
              </h3>
              <span className="text-[10px] text-zinc-400 tabular-nums">
                {entries.length}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {entries.map((entry) => {
                const busy = busyTypeKey === entry.typeKey;
                const isAdvanced = !entry.inDefault;
                return (
                  <button
                    key={entry.typeKey}
                    type="button"
                    disabled={busyTypeKey !== null}
                    onClick={() => void handlePick(entry.typeKey)}
                    className="group flex flex-col items-stretch gap-2 rounded-lg border border-[#e5e0d5] bg-[#faf9f6] p-3 text-left transition hover:-translate-y-px hover:border-indigo-300 hover:shadow-md disabled:opacity-50 disabled:hover:border-[#e5e0d5] disabled:hover:translate-y-0 disabled:hover:shadow-none"
                  >
                    <div className="relative overflow-hidden rounded-md bg-zinc-50 p-2">
                      <SectionWire
                        typeKey={entry.typeKey}
                        className="h-20 w-full text-zinc-400"
                      />
                      {entry.tag ? (
                        <span
                          className={
                            entry.tag === "new"
                              ? "absolute right-2 top-2 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-blue-700 ring-1 ring-inset ring-blue-200"
                              : "absolute right-2 top-2 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-700 ring-1 ring-inset ring-zinc-300"
                          }
                        >
                          {entry.tag}
                        </span>
                      ) : null}
                      {isAdvanced ? (
                        <span className="absolute left-2 top-2 rounded-full bg-[#3d4f7c]/85 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
                          Advanced
                        </span>
                      ) : null}
                    </div>
                    <div className="flex w-full items-center justify-between gap-2 px-0.5">
                      <span className="text-sm font-semibold text-zinc-900">
                        {entry.label}
                      </span>
                      {busy ? (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                          Adding…
                        </span>
                      ) : null}
                    </div>
                    <p className="line-clamp-2 px-0.5 text-xs leading-relaxed text-zinc-500">
                      {entry.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function KitReviewOverlay({
  kit,
  selectedStarterIds,
  selectedStylePresetIds,
  startersById,
  busy,
  onToggle,
  onStylePresetChange,
  onSelectAll,
  onSelectHomeCore,
  onClear,
  onReset,
  onClose,
  onApply,
}: {
  kit: SectionTemplateKit | null;
  selectedStarterIds: readonly SectionTemplateStarterId[];
  selectedStylePresetIds: Partial<Record<SectionTemplateStarterId, string | null>>;
  startersById: ReadonlyMap<string, SectionTemplateStarter>;
  busy: boolean;
  onToggle: (starterId: SectionTemplateStarterId) => void;
  onStylePresetChange: (
    starterId: SectionTemplateStarterId,
    presetId: string | null,
  ) => void;
  onSelectAll: () => void;
  onSelectHomeCore: () => void;
  onClear: () => void;
  onReset: () => void;
  onClose: () => void;
  onApply: () => void;
}) {
  if (!kit) return null;
  const selectedCount = selectedStarterIds.length;
  const selectedStyleOverrideCount = selectedStarterIds.filter((starterId) =>
    Boolean(selectedStylePresetIds[starterId]),
  ).length;
  return (
    <div
      data-section-kit-review={kit.id}
      className="fixed inset-0 z-[125] flex items-center justify-center bg-[#242942]/35 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`kit-review-heading-${kit.id}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] rounded-2xl border border-[#ddd8cc] bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#eee9dd] px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Review kit
            </p>
            <h3
              id={`kit-review-heading-${kit.id}`}
              className="mt-1 text-lg font-semibold text-zinc-950"
            >
              {kit.label}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-zinc-500">
              {kit.description}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onSelectAll}
                className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 hover:border-[#3d4f7c]/30 hover:text-[#3d4f7c]"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={onSelectHomeCore}
                className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 hover:border-[#3d4f7c]/30 hover:text-[#3d4f7c]"
              >
                Home core
              </button>
              <button
                type="button"
                onClick={onClear}
                className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 hover:border-[#3d4f7c]/30 hover:text-[#3d4f7c]"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={onReset}
                className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 hover:border-[#3d4f7c]/30 hover:text-[#3d4f7c]"
              >
                Reset
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close kit review"
            className="-mr-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="max-h-[52vh] space-y-2 overflow-y-auto px-5 py-4">
          {kit.starterIds.map((starterId, index) => {
            const starter = startersById.get(starterId);
            if (!starter) return null;
            const checked = selectedStarterIds.includes(starterId);
            const stylePresets = starter.stylePresets ?? [];
            const selectedStylePresetId =
              selectedStylePresetIds[starterId] ?? null;
            return (
              <div
                key={starterId}
                data-section-kit-review-row={starterId}
                data-section-kit-review-data-binding={starter.dataBindingKey ?? ""}
                data-section-kit-review-edit-model={starter.editModel}
                data-section-kit-review-capabilities={starter.editableCapabilities.join(" ")}
                className={`flex items-start gap-3 rounded-xl border p-3 transition hover:border-[#3d4f7c]/35 ${
                  checked
                    ? "border-[#3d4f7c]/25 bg-[#fbfaf7]"
                    : "border-[#eee9dd] bg-zinc-50/60 opacity-75"
                }`}
              >
                <input
                  type="checkbox"
                  aria-label={`Include ${starter.label}`}
                  checked={checked}
                  onChange={() => onToggle(starterId)}
                  className="mt-1 h-4 w-4 accent-[#3d4f7c]"
                />
                <span className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-zinc-500 ring-1 ring-inset ring-zinc-200">
                    {index + 1}
                  </span>
                  <span className="hidden h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-inset ring-zinc-200 sm:block">
                    <StarterPreviewThumb starter={starter} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-950">
                        {starter.label}
                      </span>
                      <span
                        className={
                          starter.kind === "data"
                            ? "rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-200"
                            : starter.kind === "conversion"
                              ? "rounded-full bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-indigo-700 ring-1 ring-inset ring-indigo-200"
                              : "rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-600 ring-1 ring-inset ring-zinc-200"
                        }
                      >
                        {starter.kind}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">
                      {starter.description}
                    </span>
                    <span className="mt-1 block text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                      {starter.sectionTypeKey.replace(/_/g, " ")} · {starter.dataSource}
                    </span>
                    <span className="mt-1 inline-flex">
                      <ReadinessBadge readiness={starter.readiness} />
                    </span>
                    <span className="mt-1 flex">
                      <EditableCapabilityBadges starter={starter} limit={4} />
                    </span>
                    {starter.dataBindingKey ? (
                      <span className="mt-1 inline-flex">
                        <DataBindingBadge sourceKey={starter.dataBindingKey} />
                      </span>
                    ) : null}
                    {starter.homeCore ? (
                      <span className="mt-1 inline-flex items-center rounded-full bg-sky-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-sky-700 ring-1 ring-inset ring-sky-200">
                        Home core
                      </span>
                    ) : null}
                    <span className="mt-2 block rounded-lg border border-zinc-100 bg-white/75 px-2 py-1.5 text-[10px] leading-snug text-zinc-500">
                      Recipe: {starter.componentRecipe.join(" + ")}
                    </span>
                    {stylePresets.length > 0 ? (
                      <span className="mt-3 block">
                        <span className="mb-1 block text-[9px] font-semibold uppercase tracking-wider text-zinc-400">
                          Starting style
                        </span>
                        <span className="grid gap-1.5 sm:grid-cols-2">
                          <StylePresetButton
                            active={selectedStylePresetId === null}
                            label="Default"
                            description="Standard settings"
                            disabled={!checked}
                            compact
                            onClick={() => onStylePresetChange(starterId, null)}
                          />
                          {stylePresets.map((preset) => (
                            <StylePresetButton
                              key={preset.id}
                              active={selectedStylePresetId === preset.id}
                              label={preset.label}
                              description={preset.description}
                              disabled={!checked}
                              compact
                              onClick={() =>
                                onStylePresetChange(starterId, preset.id)
                              }
                            />
                          ))}
                        </span>
                      </span>
                    ) : null}
                  </span>
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#eee9dd] px-5 py-4">
          <p className="text-xs text-zinc-500">
            {selectedCount} of {kit.starterIds.length} sections selected
            {selectedStyleOverrideCount > 0
              ? ` · ${selectedStyleOverrideCount} style override${selectedStyleOverrideCount === 1 ? "" : "s"}`
              : ""}
            .
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || selectedCount === 0}
              onClick={onApply}
              className="rounded-lg bg-[#3d4f7c] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#34466f] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy ? "Adding..." : "Add selected"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StarterPreviewThumb({ starter }: { starter: SectionTemplateStarter }) {
  if (starter.preview === "map") {
    return (
      <span className="relative block h-full w-full bg-[#090909]">
        <span className="absolute inset-0 opacity-60 [background-image:linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:15px_15px]" />
        <span className="absolute left-3 top-7 h-3 w-3 rounded-full bg-[#d7b22f] shadow-[10px_-5px_0_#d7b22f]" />
        <span className="absolute right-4 top-4 h-5 w-3 rounded-full rounded-b-none bg-[#d7b22f]" />
      </span>
    );
  }
  if (starter.preview === "search" || starter.preview === "chips") {
    return (
      <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[#fbfaf7] px-2">
        <span className="h-1.5 w-12 rounded bg-zinc-800/70" />
        <span className="h-1 w-16 rounded bg-zinc-300" />
        <span className="mt-1 flex gap-1">
          <span className="h-4 w-6 rounded-full border border-zinc-300 bg-white" />
          <span className="h-4 w-6 rounded-full border border-zinc-300 bg-white" />
        </span>
      </span>
    );
  }
  return (
    <span
      className="block h-full w-full bg-cover bg-center"
      style={{
        backgroundImage: starter.previewImageUrl
          ? `url("${starter.previewImageUrl}")`
          : "linear-gradient(135deg,#f6f1e8,#d7dce8)",
      }}
    />
  );
}

function StarterReviewOverlay({
  starter,
  selectedStylePresetId,
  onStylePresetChange,
  busy,
  onClose,
  onApply,
}: {
  starter: SectionTemplateStarter | null;
  selectedStylePresetId: string | null;
  onStylePresetChange: (presetId: string | null) => void;
  busy: boolean;
  onClose: () => void;
  onApply: () => void;
}) {
  if (!starter) return null;
  const stylePresets = starter.stylePresets ?? [];
  return (
    <div
      data-section-starter-review={starter.id}
      className="fixed inset-0 z-[125] flex items-center justify-center bg-[#242942]/35 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`starter-review-heading-${starter.id}`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-[480px] flex-col overflow-hidden rounded-2xl border border-[#ddd8cc] bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="h-36 shrink-0 bg-[#fbfaf7]">
          <StarterPreviewLarge starter={starter} />
        </div>
        <div className="min-h-0 overflow-y-auto border-t border-[#eee9dd] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Review section
              </p>
              <h3
                id={`starter-review-heading-${starter.id}`}
                className="mt-1 text-lg font-semibold text-zinc-950"
              >
                {starter.label}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                {starter.description}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close section review"
              className="-mr-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <StarterReviewFact label="Section type" value={starter.sectionTypeKey.replace(/_/g, " ")} />
            <StarterReviewFact label="Content source" value={sourceKindLabel(starter.sourceKind)} />
            <StarterReviewFact
              label="Readiness"
              value={starter.readiness === "ready-now" ? "Ready now" : "Needs setup"}
            />
            <StarterReviewFact
              label="Editing approach"
              value={editModelHeadline(starter.editModel)}
              detail={editModelBlurb(starter.editModel)}
            />
          </div>
          {stylePresets.length > 0 ? (
            <div className="mt-3 rounded-xl border border-[#eee9dd] bg-white p-3">
              <span className="block text-[9px] font-semibold uppercase tracking-wider text-zinc-400">
                Starting style
              </span>
              <div className="mt-2 grid gap-2">
                <StylePresetButton
                  active={selectedStylePresetId === null}
                  label="Default"
                  description="Use this template's standard design settings."
                  onClick={() => onStylePresetChange(null)}
                />
                {stylePresets.map((preset) => (
                  <StylePresetButton
                    key={preset.id}
                    active={selectedStylePresetId === preset.id}
                    label={preset.label}
                    description={preset.description}
                    onClick={() => onStylePresetChange(preset.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-3 rounded-xl border border-[#eee9dd] bg-[#fbfaf7] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="block text-[9px] font-semibold uppercase tracking-wider text-zinc-400">
                Data connection
              </span>
              {starter.dataBindingKey ? (
                <DataBindingBadge sourceKey={starter.dataBindingKey} />
              ) : null}
            </div>
            <span className="mt-1 block text-xs font-medium leading-relaxed text-zinc-700">
              {starter.dataSource}
            </span>
          </div>
          <div className="mt-3 rounded-xl border border-[#eee9dd] bg-white p-3">
            <span className="block text-[9px] font-semibold uppercase tracking-wider text-zinc-400">
              Component recipe
            </span>
            <span className="mt-1 block text-xs font-medium leading-relaxed text-zinc-700">
              {starter.componentRecipe.join(" + ")}
            </span>
            <span className="mt-2 block text-[11px] leading-relaxed text-zinc-500">
              <span className="font-medium text-zinc-600">What you can change: </span>
              {starter.editScope}
            </span>
            <span className="mt-2 block text-[9px] font-semibold uppercase tracking-wider text-zinc-400">
              Fine-tune in inspector
            </span>
            <span className="mt-1 flex">
              <EditableCapabilityBadges starter={starter} />
            </span>
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-between gap-3 border-t border-[#eee9dd] px-5 py-4">
          <p className="text-xs text-zinc-500">
            Inserts one normal editable section.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onApply}
              className="rounded-lg bg-[#3d4f7c] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#34466f] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy ? "Adding..." : "Add section"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StarterReviewFact({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  /** Optional short explanation under the headline (starter review only). */
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-[#eee9dd] bg-[#fbfaf7] p-3">
      <span className="block text-[9px] font-semibold uppercase tracking-wider text-zinc-400">
        {label}
      </span>
      <span className="mt-1 block text-xs font-medium leading-snug text-zinc-700">
        {value}
      </span>
      {detail ? (
        <span className="mt-1.5 block text-[11px] leading-relaxed text-zinc-500">{detail}</span>
      ) : null}
    </div>
  );
}

function StylePresetButton({
  active,
  label,
  description,
  disabled = false,
  compact = false,
  onClick,
}: {
  active: boolean;
  label: string;
  description: string;
  disabled?: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        compact ? "p-2" : "p-2"
      } ${
        active
          ? "border-[#3d4f7c]/35 bg-[#f6f7fb] text-[#23345f]"
          : "border-zinc-200 bg-[#fbfaf7] text-zinc-600 hover:border-[#3d4f7c]/25"
      }`}
    >
      <span className={`block font-semibold ${compact ? "text-[11px]" : "text-xs"}`}>
        {label}
      </span>
      <span className={`${compact ? "mt-0.5 line-clamp-2 text-[10px]" : "mt-0.5 text-[11px]"} block leading-relaxed opacity-75`}>
        {description}
      </span>
    </button>
  );
}

function StarterPreviewLarge({ starter }: { starter: SectionTemplateStarter }) {
  if (starter.preview === "map") {
    return (
      <div className="relative h-full w-full overflow-hidden bg-[#090909]">
        <div className="absolute inset-0 opacity-75 [background-image:linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="absolute left-8 top-20 h-5 w-5 rounded-full bg-[#d7b22f] shadow-[14px_-7px_0_#d7b22f,26px_4px_0_#d7b22f]" />
        <div className="absolute right-12 top-10 h-9 w-6 rounded-full rounded-b-none bg-[#d7b22f]" />
        <div className="absolute left-5 top-5 h-2 w-24 rounded bg-white/10" />
      </div>
    );
  }
  if (starter.preview === "search") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#f8f7f3] to-[#eef7fb] px-8">
        <div className="h-2 w-32 rounded bg-zinc-900/70" />
        <div className="mt-4 h-3 w-56 rounded bg-zinc-400/45" />
        <div className="mt-5 flex h-10 w-full max-w-[320px] items-center rounded-xl border border-zinc-300 bg-white px-3">
          <div className="h-4 w-4 rounded-full border-2 border-zinc-700" />
          <div className="ml-3 h-2 flex-1 rounded bg-zinc-300" />
          <div className="ml-3 h-6 w-16 rounded bg-zinc-900" />
        </div>
      </div>
    );
  }
  if (starter.preview === "chips") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-[#fbfaf7] px-8">
        <div className="h-2 w-28 rounded bg-zinc-900/80" />
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {["Models", "Hosts", "Music", "Photo", "Creators"].map((label) => (
            <span
              key={label}
              className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-[10px] text-zinc-500"
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div
      className="h-full w-full bg-cover bg-center"
      style={{
        backgroundImage: starter.previewImageUrl
          ? `linear-gradient(rgba(20,20,20,.08),rgba(20,20,20,.08)),url("${starter.previewImageUrl}")`
          : "linear-gradient(135deg,#f6f1e8,#d7dce8)",
      }}
    />
  );
}

function TemplateDropOverlay({
  dragSource,
  dropTarget,
}: {
  dragSource: TemplateDragSource | null;
  dropTarget: TemplateDropTarget | null;
}) {
  if (!dragSource) return null;
  const label =
    dragSource.kind === "kit"
      ? `${dragSource.kit.label} kit`
      : dragSource.starter.label;
  const count =
    dragSource.kind === "kit"
      ? `${dragSource.kit.starterIds.length} sections`
      : "1 section";
  const activeLabel = dropTarget?.sourceLabel ?? label;
  const activeCount = dropTarget?.sourceSectionCount
    ? `${dropTarget.sourceSectionCount} section${
        dropTarget.sourceSectionCount === 1 ? "" : "s"
      }`
    : count;
  return (
    <>
      {dropTarget ? (
        <div
          data-section-template-drop-line
          style={{
            position: "fixed",
            top: dropTarget.indicatorY - 1.5,
            left: dropTarget.indicatorLeft,
            width: dropTarget.indicatorWidth,
            height: 3,
            zIndex: 116,
            pointerEvents: "none",
            borderRadius: 2,
            background: dropTarget.allowed
              ? "linear-gradient(90deg, transparent, #2c5fdb, transparent)"
              : "linear-gradient(90deg, transparent, rgba(239,68,68,0.8), transparent)",
            boxShadow: dropTarget.allowed
              ? "0 0 0 4px rgba(44,95,219,0.12), 0 0 16px 4px rgba(44,95,219,0.35)"
              : "0 0 0 4px rgba(239,68,68,0.10), 0 0 16px 4px rgba(239,68,68,0.20)",
          }}
        >
          {dropTarget.allowed ? (
            <span
              style={{
                position: "absolute",
                top: -5,
                left: -6,
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: "#2c5fdb",
                boxShadow: "0 0 0 3px rgba(44,95,219,0.20)",
              }}
            />
          ) : null}
        </div>
      ) : null}
      <div
        data-section-template-drop-overlay
        className="pointer-events-none fixed inset-y-0 left-0 z-[115] flex w-[calc(100vw-720px)] min-w-[340px] items-center justify-center bg-[#242942]/10 backdrop-blur-[1px]"
      >
        <div className="max-w-[320px] rounded-lg border border-[#3d4f7c]/25 bg-white/95 px-5 py-4 text-center shadow-2xl">
          <div
            className={`mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full text-white ${
              dropTarget && !dropTarget.allowed ? "bg-red-500" : "bg-[#3d4f7c]"
            }`}
          >
            {dropTarget && !dropTarget.allowed ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            )}
          </div>
          <p className="text-sm font-semibold text-zinc-950">
            {dropTarget
              ? dropTarget.allowed
                ? `${dropTarget.label}: ${activeLabel}`
                : `Can't drop into ${dropTarget.targetSlotLabel}`
              : `Drop to add ${activeLabel}`}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            {dropTarget
              ? dropTarget.allowed
                ? `${activeCount} will be inserted in ${dropTarget.targetSlotLabel}.`
                : (dropTarget.reason ??
                  `${activeCount} is not compatible with this slot.`)
              : `${activeCount} will be inserted at the selected position.`}
          </p>
        </div>
      </div>
    </>
  );
}

function summarizeStarterSources(starters: readonly SectionTemplateStarter[]) {
  const counts = new Map<SectionTemplateStarterSourceKind, number>();
  for (const starter of starters) {
    counts.set(starter.sourceKind, (counts.get(starter.sourceKind) ?? 0) + 1);
  }
  return Array.from(counts, ([kind, count]) => ({ kind, count }));
}

function sourceKindLabel(kind: SectionTemplateStarterSourceKind): string {
  switch (kind) {
    case "live-data":
      return "Live data";
    case "navigation":
      return "Navigation";
    case "route-action":
      return "Action";
    case "starter-content":
      return "Starter content";
  }
}

/** Plain-language summary for the starter review dialog (human QA — internal jargon). */
function editModelHeadline(model: SectionTemplateStarterEditModel): string {
  switch (model) {
    case "section-props":
      return "Standard section fields";
    case "live-data":
      return "Connected live data";
    case "navigation":
      return "Menus and links";
    case "action-route":
      return "Calls to action";
    case "asset":
      return "Images and media";
  }
}

function editModelBlurb(model: SectionTemplateStarterEditModel): string {
  switch (model) {
    case "section-props":
      return "You edit copy, layout, and presentation in the inspector — like a form, not raw code.";
    case "live-data":
      return "Sections stay wired to your roster or directory; you adjust how results show.";
    case "navigation":
      return "You change labels, destinations, and layout for menus and link rows.";
    case "action-route":
      return "You tune conversion copy, buttons, and where taps go.";
    case "asset":
      return "You swap visuals, alt text, and supporting copy around hero-style imagery.";
  }
}

function SourceKindBadge({
  kind,
  count,
}: {
  kind: SectionTemplateStarterSourceKind;
  count?: number;
}) {
  const label = sourceKindLabel(kind);
  const classes =
    kind === "live-data"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : kind === "route-action"
        ? "bg-indigo-50 text-indigo-700 ring-indigo-200"
        : kind === "navigation"
          ? "bg-sky-50 text-sky-700 ring-sky-200"
          : "bg-zinc-100 text-zinc-600 ring-zinc-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ring-1 ring-inset ${classes}`}
    >
      {label}
      {typeof count === "number" && count > 1 ? (
        <span className="ml-1 opacity-70">x{count}</span>
      ) : null}
    </span>
  );
}

function DataBindingBadge({ sourceKey }: { sourceKey: string }) {
  const source = getBuilderDataSourceDefinition(sourceKey);
  const label = source?.label ?? sourceKey.replace(/_/g, " ");
  const plan = source?.requiredPlan ?? "free";
  const classes =
    plan === "agency" || plan === "network"
      ? "bg-violet-50 text-violet-700 ring-violet-200"
      : plan === "studio"
        ? "bg-blue-50 text-blue-700 ring-blue-200"
        : "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ring-1 ring-inset ${classes}`}
      title={`${label} data source · ${plan} plan`}
    >
      {label}
    </span>
  );
}

function ReadinessBadge({
  readiness,
}: {
  readiness: SectionTemplateStarterReadiness;
}) {
  const isReadyNow = readiness === "ready-now";
  return (
    <span
      className={
        isReadyNow
          ? "inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-200"
          : "inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700 ring-1 ring-inset ring-amber-200"
      }
    >
      {isReadyNow ? "Ready now" : "Needs setup"}
    </span>
  );
}

function editableCapabilityLabel(capability: SectionTemplateStarter["editableCapabilities"][number]): string {
  switch (capability) {
    case "content":
      return "Content";
    case "style":
      return "Style";
    case "layout":
      return "Layout";
    case "data":
      return "Live data";
    case "navigation":
      return "Navigation";
    case "media":
      return "Media";
    case "action":
      return "Action";
  }
}

function EditableCapabilityBadges({
  starter,
  limit,
}: {
  starter: SectionTemplateStarter;
  limit?: number;
}) {
  const visibleCapabilities =
    typeof limit === "number"
      ? starter.editableCapabilities.slice(0, limit)
      : starter.editableCapabilities;
  const hiddenCount = starter.editableCapabilities.length - visibleCapabilities.length;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {visibleCapabilities.map((capability) => (
        <span
          key={capability}
          className="inline-flex items-center rounded-full bg-white px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-500 ring-1 ring-inset ring-zinc-200"
        >
          {editableCapabilityLabel(capability)}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className="inline-flex items-center rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-500 ring-1 ring-inset ring-zinc-200">
          +{hiddenCount}
        </span>
      ) : null}
    </span>
  );
}

function TemplateKitCard({
  kit,
  startersById,
  busy,
  disabled,
  compatibility,
  dragging,
  onDragStart,
  onDragEnd,
  onPick,
}: {
  kit: SectionTemplateKit;
  startersById: ReadonlyMap<string, SectionTemplateStarter>;
  busy: boolean;
  disabled: boolean;
  compatibility: TemplateCompatibility;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onPick: () => void;
}) {
  const starters = kit.starterIds
    .map((starterId) => startersById.get(starterId))
    .filter((starter): starter is SectionTemplateStarter => Boolean(starter));
  const sourceSummary = summarizeStarterSources(starters);
  const homeCoreCount = starters.filter((starter) => starter.homeCore).length;
  const requiredPlan = getSectionTemplateKitRequiredPlan(kit);
  const dataConnectedCount = starters.filter(
    (starter) =>
      starter.sourceKind === "live-data" ||
      starter.sourceKind === "navigation" ||
      starter.sourceKind === "route-action",
  ).length;
  return (
    <button
      type="button"
      data-section-template-kit={kit.id}
      data-section-template-kit-section-count={kit.starterIds.length}
      data-section-template-kit-home-core-count={homeCoreCount}
      data-section-template-kit-data-count={dataConnectedCount}
      data-section-template-required-plan={requiredPlan}
      data-section-template-compatible={compatibility.ok ? "true" : "false"}
      data-section-template-incompatible-reason={compatibility.reason ?? ""}
      draggable={!disabled}
      disabled={disabled}
      title={compatibility.reason ?? undefined}
      aria-label={
        compatibility.ok
          ? `${kit.label} kit, ${kit.starterIds.length} sections. Review or drag into the canvas.`
          : `${kit.label} kit is not available for this slot. ${compatibility.reason ?? ""}`
      }
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("application/x-impronta-section-kit", kit.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onPick}
      className={`group rounded-xl border border-[#ddd8cc] bg-[#fbfaf7] p-3 text-left shadow-sm transition hover:-translate-y-px hover:border-[#3d4f7c]/45 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:border-[#ddd8cc] disabled:hover:shadow-sm ${dragging ? "scale-[0.99] border-[#3d4f7c]/60 opacity-70" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="block text-sm font-semibold text-zinc-950">
            {kit.label}
          </span>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">
            {kit.description}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[#3d4f7c]/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#3d4f7c] ring-1 ring-inset ring-[#3d4f7c]/20">
          {kit.starterIds.length} sections
        </span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {starters.map((starter, idx) => (
          <div
            key={`${kit.id}-${starter.id}-${idx}`}
            className="h-10 overflow-hidden rounded-md border border-zinc-200 bg-white"
          >
            <StarterPreviewThumb starter={starter} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {sourceSummary.map((item) => (
          <SourceKindBadge key={item.kind} kind={item.kind} count={item.count} />
        ))}
        {homeCoreCount > 0 ? (
          <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-sky-700 ring-1 ring-inset ring-sky-200">
            {homeCoreCount} home core
          </span>
        ) : null}
      </div>
      {dataConnectedCount > 0 ? (
        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">
          {dataConnectedCount} section{dataConnectedCount === 1 ? "" : "s"} connect to
          tenant data, navigation, or inquiry routes.
        </p>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[10px] text-zinc-400">
          {compatibility.ok
            ? "Review or drag into the canvas"
            : (compatibility.reason ?? "Not available for this slot")}
        </span>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[#3d4f7c]">
          {busy ? "Adding..." : compatibility.ok ? "Review" : "Blocked"}
        </span>
      </div>
    </button>
  );
}

function TemplateStarterCard({
  starter,
  busy,
  disabled,
  compatibility,
  dragging,
  onDragStart,
  onDragEnd,
  onPick,
}: {
  starter: SectionTemplateStarter;
  busy: boolean;
  disabled: boolean;
  compatibility: TemplateCompatibility;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      data-section-template-starter={starter.id}
      data-section-template-kind={starter.kind}
      data-section-template-source={starter.sourceKind}
      data-section-template-readiness={starter.readiness}
      data-section-template-data-binding={starter.dataBindingKey ?? ""}
      data-section-template-edit-model={starter.editModel}
      data-section-template-capabilities={starter.editableCapabilities.join(" ")}
      data-section-template-home-core={starter.homeCore ? "true" : "false"}
      data-section-template-section-type={starter.sectionTypeKey}
      data-section-template-style-count={starter.stylePresets?.length ?? 0}
      data-section-template-required-plan={getSectionTemplateStarterRequiredPlan(starter)}
      data-section-template-compatible={compatibility.ok ? "true" : "false"}
      data-section-template-incompatible-reason={compatibility.reason ?? ""}
      draggable={!disabled}
      disabled={disabled}
      title={compatibility.reason ?? undefined}
      aria-label={
        compatibility.ok
          ? `${starter.label}, ${sourceKindLabel(starter.sourceKind)}, ${
              starter.readiness === "ready-now" ? "ready now" : "needs setup"
            }. Review or drag into the canvas.`
          : `${starter.label} is not available for this slot. ${
              compatibility.reason ?? ""
            }`
      }
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData(
          "application/x-impronta-section-starter",
          starter.id,
        );
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onPick}
      className={`group flex flex-col items-stretch gap-2 rounded-xl border border-[#ddd8cc] bg-white p-3 text-left shadow-sm transition hover:-translate-y-px hover:border-[#3d4f7c]/45 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:border-[#ddd8cc] disabled:hover:shadow-sm ${dragging ? "scale-[0.99] border-[#3d4f7c]/60 opacity-70" : ""}`}
    >
      <StarterPreview starter={starter} />
      <div className="flex items-start justify-between gap-2 px-0.5">
        <div>
          <span className="block text-sm font-semibold text-zinc-950">
            {starter.label}
          </span>
          <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            {starter.sectionTypeKey.replace(/_/g, " ")}
          </span>
        </div>
        <span
          className={
            starter.kind === "data"
              ? "shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-200"
              : starter.kind === "conversion"
                ? "shrink-0 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-indigo-700 ring-1 ring-inset ring-indigo-200"
                : "shrink-0 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-600 ring-1 ring-inset ring-zinc-200"
          }
        >
          {starter.kind}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-0.5">
        <SourceKindBadge kind={starter.sourceKind} />
        {starter.dataBindingKey ? (
          <DataBindingBadge sourceKey={starter.dataBindingKey} />
        ) : null}
        <ReadinessBadge readiness={starter.readiness} />
        <EditableCapabilityBadges starter={starter} limit={3} />
        {starter.homeCore ? (
          <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-sky-700 ring-1 ring-inset ring-sky-200">
            Home core
          </span>
        ) : null}
      </div>
      <p className="line-clamp-2 px-0.5 text-xs leading-relaxed text-zinc-500">
        {starter.description}
      </p>
      <div className="rounded-lg border border-zinc-100 bg-zinc-50/70 px-2 py-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400">
          Recipe
        </span>
        <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-zinc-500">
          {starter.componentRecipe.join(" + ")}
        </p>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 px-0.5 pt-1">
        <span className="line-clamp-2 text-[10px] leading-snug text-zinc-400">
          {compatibility.ok
            ? `${starter.dataSource} Edit: ${starter.editScope}`
            : (compatibility.reason ?? "Not available for this slot")}
        </span>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[#3d4f7c]">
          {busy ? "Adding..." : compatibility.ok ? "Add" : "Blocked"}
        </span>
      </div>
    </button>
  );
}

function StarterPreview({ starter }: { starter: SectionTemplateStarter }) {
  if (starter.preview === "map") {
    return (
      <div className="relative h-24 overflow-hidden rounded-lg bg-[#090909]">
        <div className="absolute inset-0 opacity-80 [background-image:linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:26px_26px]" />
        <div className="absolute left-5 top-11 h-5 w-5 rounded-full bg-[#d7b22f] shadow-[16px_-8px_0_#d7b22f,28px_3px_0_#d7b22f]" />
        <div className="absolute right-8 top-8 h-7 w-5 rounded-full rounded-b-none bg-[#d7b22f] shadow-lg" />
        <div className="absolute left-4 top-3 h-2 w-16 rounded bg-white/10" />
        <div className="absolute bottom-3 right-3 h-6 w-6 rounded-full bg-white/15" />
      </div>
    );
  }

  if (starter.preview === "search") {
    return (
      <div className="h-24 overflow-hidden rounded-lg bg-gradient-to-br from-[#f8f7f3] to-[#eef7fb] p-4">
        <div className="mx-auto h-2 w-28 rounded bg-zinc-900/70" />
        <div className="mx-auto mt-3 h-3 w-44 rounded bg-zinc-400/45" />
        <div className="mx-auto mt-4 flex h-8 max-w-[210px] items-center rounded-lg border border-zinc-300 bg-white px-2">
          <div className="h-3 w-3 rounded-full border-2 border-zinc-700" />
          <div className="ml-2 h-2 flex-1 rounded bg-zinc-300" />
          <div className="ml-2 h-5 w-12 rounded bg-zinc-900" />
        </div>
      </div>
    );
  }

  if (starter.preview === "chips") {
    return (
      <div className="h-24 overflow-hidden rounded-lg bg-[#fbfaf7] p-4">
        <div className="mx-auto h-2 w-24 rounded bg-zinc-900/80" />
        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          {["Models", "Hosts", "Music", "Photo", "Creators"].map((label) => (
            <span
              key={label}
              className="rounded-full border border-zinc-300 bg-white px-2 py-1 text-[9px] text-zinc-500"
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (starter.preview === "talent" || starter.preview === "gallery") {
    const src =
      starter.previewImageUrl ??
      "https://images.unsplash.com/photo-1496747611176-843222e1e57c";
    return (
      <div className="grid h-24 grid-cols-4 gap-1.5 overflow-hidden rounded-lg bg-[#f8f7f3] p-2">
        {[0, 1, 2, 3].map((idx) => (
          <div
            key={idx}
            className={
              starter.preview === "gallery" && idx === 0
                ? "col-span-2 rounded-md bg-cover bg-center"
                : "rounded-md bg-cover bg-center"
            }
            style={{
              backgroundImage:
                idx === 3 && starter.preview === "talent"
                  ? "linear-gradient(135deg,#d8d6d0,#a8a29a)"
                  : `url("${src}")`,
              filter: idx === 2 ? "saturate(.85)" : undefined,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className="relative h-24 overflow-hidden rounded-lg bg-cover bg-center"
      style={{
        backgroundImage: starter.previewImageUrl
          ? `linear-gradient(rgba(10,10,10,.35),rgba(10,10,10,.35)),url("${starter.previewImageUrl}")`
          : "linear-gradient(135deg,#f6f1e8,#d7dce8)",
      }}
    >
      <div className="absolute inset-x-5 top-6 h-3 rounded bg-white/80" />
      <div className="absolute inset-x-8 top-12 h-2 rounded bg-white/60" />
      <div className="absolute bottom-5 left-1/2 h-5 w-24 -translate-x-1/2 rounded bg-white/90" />
    </div>
  );
}

interface TabProps {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  /** Mobile mode bumps padding + font size for touch targets and disables wrap. */
  mobile?: boolean;
}
function Tab({ active, onClick, label, count, mobile }: TabProps) {
  const sizing = mobile
    ? "shrink-0 px-3 py-1.5 text-xs"
    : "px-2 py-0.5 text-[10px]";
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? `inline-flex items-center gap-1 rounded-full bg-[#3d4f7c] ${sizing} font-medium text-white`
          : `inline-flex items-center gap-1 rounded-full bg-zinc-100 ${sizing} font-medium text-zinc-600 hover:bg-zinc-200 active:bg-zinc-200`
      }
    >
      <span>{label}</span>
      <span
        className={
          active
            ? "tabular-nums text-white/70"
            : "tabular-nums text-zinc-400"
        }
      >
        {count}
      </span>
    </button>
  );
}
