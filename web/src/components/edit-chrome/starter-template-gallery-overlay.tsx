"use client";

/**
 * StarterTemplateGalleryOverlay — staff entry to starter compositions from the
 * engaged editor (topbar Templates, command palette, `?panel=templates`, etc.).
 *
 * Implements `docs/mockups/builder-experience.html` surface 18 (Empty canvas /
 * starter onboarding). Last reconciled: 2026-05.
 *
 * Wraps `StarterTemplateGalleryModal` (`empty-canvas-starter.tsx`) with plan
 * availability, `applyStarterComposition`, and optional saved-template slot.
 */

import { useActionState, useEffect, useMemo, useState } from "react";

import {
  applyStarterComposition,
  loadStarterAvailability,
  type StarterActionState,
} from "@/lib/site-admin/edit-mode/starter-action";
import { getBuilderPlanPolicy } from "@/lib/site-admin/builder-capabilities";

import { useEditContext } from "./edit-context";
import {
  STARTER_TEMPLATE_CATEGORIES,
  STARTER_TEMPLATE_TILES,
  StarterTemplateGalleryModal,
  type RecipeTile,
} from "./empty-canvas-starter";
import { WorkspaceTemplateGallery } from "./WorkspaceTemplateGallery";

type CategoryKey = (typeof STARTER_TEMPLATE_CATEGORIES)[number]["key"];

export function StarterTemplateGalleryOverlay() {
  const {
    starterTemplateGalleryOpen,
    starterTemplateGalleryHighlightedSlug,
    closeStarterTemplateGallery,
    refreshComposition,
    queueRouterRefresh,
    slots,
    slotDefs,
    library,
  } = useEditContext();
  const [state, dispatch, pending] = useActionState<StarterActionState, FormData>(
    applyStarterComposition,
    undefined,
  );
  const [allowedSlugs, setAllowedSlugs] = useState<ReadonlySet<string>>(
    new Set(["free-quickstart-5"]),
  );
  const [planTier, setPlanTier] = useState<string | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryKey>("all");
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!starterTemplateGalleryOpen || availabilityLoaded) return;
    let cancelled = false;
    void (async () => {
      const res = await loadStarterAvailability();
      if (cancelled) return;
      if (!res.ok) {
        setAvailabilityError(res.error);
        setAvailabilityLoaded(true);
        return;
      }
      setPlanTier(res.plan);
      setAllowedSlugs(new Set(res.allowedSlugs));
      setAvailabilityLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [availabilityLoaded, starterTemplateGalleryOpen]);

  useEffect(() => {
    if (!starterTemplateGalleryOpen) {
      setInfo(null);
      setPendingSlug(null);
      setQuery("");
      setCategory("all");
    }
  }, [starterTemplateGalleryOpen]);

  useEffect(() => {
    if (!state?.ok) return;
    setInfo(
      `Starter applied: ${state.createdSections} section${
        state.createdSections === 1 ? "" : "s"
      }${state.skipped ? `, ${state.skipped} skipped` : ""}.`,
    );
    setPendingSlug(null);
    closeStarterTemplateGallery();
    void (async () => {
      await refreshComposition();
      await queueRouterRefresh();
    })();
  }, [closeStarterTemplateGallery, queueRouterRefresh, refreshComposition, state]);

  const planPolicy = getBuilderPlanPolicy(planTier);
  const visibleTiles = STARTER_TEMPLATE_TILES.filter((tile) =>
    allowedSlugs.has(tile.slug),
  );
  const catalogTiles =
    planPolicy.starterTemplateMode === "free-only"
      ? visibleTiles
      : STARTER_TEMPLATE_TILES;
  const filteredTiles = useMemo<RecipeTile[]>(() => {
    const q = query.trim().toLowerCase();
    return catalogTiles.filter((tile) => {
      if (category !== "all" && tile.category !== category) return false;
      if (!q) return true;
      return `${tile.label} ${tile.summary} ${tile.info} ${tile.category} ${tile.bestFor} ${tile.sequence.join(" ")}`
        .toLowerCase()
        .includes(q);
    });
  }, [catalogTiles, category, query]);
  const currentDraftSections = useMemo(() => {
    const slotLabelByKey = new Map(slotDefs.map((slot) => [slot.key, slot.label]));
    const sectionLabelByType = new Map(
      library.map((entry) => [entry.typeKey, entry.label]),
    );
    return Object.entries(slots).flatMap(([slotKey, refs]) =>
      [...refs]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((ref) => ({
          id: ref.sectionId,
          name: ref.name,
          slotLabel: slotLabelByKey.get(slotKey) ?? slotKey,
          typeLabel: sectionLabelByType.get(ref.sectionTypeKey) ?? ref.sectionTypeKey,
        })),
    );
  }, [library, slotDefs, slots]);

  const actionError = state && !state.ok ? state.error : null;
  const errorMessage =
    actionError ??
    (availabilityError
      ? `Could not load full template access: ${availabilityError}`
      : null);

  return (
    <StarterTemplateGalleryModal
      open={starterTemplateGalleryOpen}
      tiles={filteredTiles}
      allTiles={catalogTiles}
      activeCategory={category}
      query={query}
      highlightedSlug={starterTemplateGalleryHighlightedSlug}
      pending={pending}
      pendingSlug={pendingSlug}
      onCategoryChange={setCategory}
      onQueryChange={setQuery}
      onClose={closeStarterTemplateGallery}
      onApplyStart={setPendingSlug}
      dispatch={dispatch}
      confirmOnApply
      currentDraftSections={currentDraftSections}
      savedTemplatesSlot={
        availabilityLoaded && planPolicy.workspaceTemplateLibrary ? (
          <WorkspaceTemplateGallery defaultOpen={false} enableSave reloadOnApply />
        ) : null
      }
      errorMessage={errorMessage}
      infoMessage={availabilityLoaded ? info : "Loading template access..."}
    />
  );
}
