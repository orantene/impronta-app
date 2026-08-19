"use client";

/**
 * use-editor-chrome — the editor's chrome/surface state, peeled out of
 * edit-context.tsx (W4-F2 god-file decomposition): every drawer / panel /
 * modal open-close flag and its mutex choreography (right-rail exclusivity,
 * centred-modal dismissal, competing-chrome teardown), the structure
 * navigator (open/width/recent-additions), the inspector dock + tab rail,
 * and the W3-T1 insert highlight pulse. Pure UI chrome: no persistence
 * beyond the navigator-width localStorage preference, no server calls.
 * Behavior is IDENTICAL to the former inline blocks — comments preserved.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  EditContextValue,
  LibraryTarget,
  NavigatorRecentAddition,
} from "./edit-context-types";

const NAVIGATOR_WIDTH_STORAGE_KEY = "impronta.editChrome.navigator.width.v1";
const NAVIGATOR_WIDTH_MIN = 280;
const NAVIGATOR_WIDTH_MAX = 520;
const NAVIGATOR_WIDTH_DEFAULT = 320;

export function useEditorChrome(input: { canEditTheme: boolean }) {
  const { canEditTheme } = input;

  // library overlay target
  const [libraryTarget, setLibraryTarget] = useState<LibraryTarget | null>(
    null,
  );

  // Sprint 3 — section picker popover state. Anchored at the click site of
  // an inline `+` insertion point (canvas overlay, navigator slot footer).
  // Distinct from `libraryTarget` so the popover can dismiss without
  // closing the full modal library, and the modal can be opened directly
  // (Browse all) without going through the popover.
  const [pickerPopover, setPickerPopover] = useState<{
    target: LibraryTarget;
    x: number;
    y: number;
  } | null>(null);

  // publish drawer state
  const [publishOpen, setPublishOpen] = useState(false);

  // page settings drawer state
  const [pageSettingsOpen, setPageSettingsOpen] = useState(false);

  const [pagesPickerOpenNonce, setPagesPickerOpenNonce] = useState(0);

  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [allPagesPanelOpen, setAllPagesPanelOpen] = useState(false);
  const [brandPanelOpen, setBrandPanelOpen] = useState(false);

  /** Inspector panel starts closed — tab rail only until the operator picks a tab. */
  const [inspectorDockOpen, setInspectorDockOpenState] = useState(false);
  const [inspectorRailDocked, setInspectorRailDocked] = useState(false);
  const [commandDockDocked, setCommandDockDocked] = useState(false);
  const setInspectorDockOpen = useCallback((open: boolean) => {
    setInspectorDockOpenState(open);
    if (!open) setInspectorRailDocked(false);
  }, []);
  const toggleInspectorDock = useCallback(() => {
    setInspectorDockOpenState((prev) => {
      if (prev) setInspectorRailDocked(false);
      return !prev;
    });
  }, []);

  const [inspectorTabRequest, setInspectorTabRequest] = useState<{
    tab: "content" | "style" | "layout" | "data" | "responsive" | "motion";
    nonce: number;
  } | null>(null);
  /**
   * Nav LINK focus — "the operator clicked this specific link on the canvas".
   *
   * Nav links are props, not nodes (one source of truth for the desktop row and
   * the phone menu), so clicking one selects the whole nav and the operator is
   * left scrolling a panel of twelve rows to find the link under their cursor.
   * This carries the link id alongside the selection so the panel can open on it.
   *
   * `nonce` is what makes a REPEAT click work: clicking the same link twice
   * would otherwise be an identical object and the panel would not react.
   */
  const [navLinkFocusRequest, setNavLinkFocusRequest] = useState<{
    nodeId: string;
    linkId: string;
    nonce: number;
  } | null>(null);
  const requestNavLinkFocus = useCallback((nodeId: string, linkId: string) => {
    setNavLinkFocusRequest({ nodeId, linkId, nonce: Date.now() });
  }, []);

  /**
   * The submenu held open on the canvas while it is being edited.
   *
   * A dropdown or mega panel only exists under a real pointer, so editing one
   * meant hovering with one hand and editing with the other, or publishing to
   * see it. VIEW STATE ONLY — it injects a stylesheet and writes nothing to
   * the tree, so previewing a panel can never be published by accident.
   */
  const [pinnedNavSubmenu, setPinnedNavSubmenu] = useState<{
    nodeId: string;
    linkId: string;
  } | null>(null);

  const [inspectorActiveTab, setInspectorActiveTabState] = useState<
    "content" | "style" | "layout" | "data" | "motion"
  >("content");
  const inspectorActiveTabRef = useRef(inspectorActiveTab);
  useEffect(() => {
    inspectorActiveTabRef.current = inspectorActiveTab;
  }, [inspectorActiveTab]);
  const setInspectorActiveTab = useCallback(
    (tab: "content" | "style" | "layout" | "data" | "motion") => {
      inspectorActiveTabRef.current = tab;
      setInspectorActiveTabState(tab);
    },
    [],
  );
  const requestInspectorTab = useCallback(
    (
      tab: "content" | "style" | "layout" | "data" | "responsive" | "motion",
    ) => {
      const normalized =
        tab === "responsive" ? "layout" : tab;
      setInspectorActiveTab(normalized);
      setInspectorDockOpen(true);
      setInspectorTabRequest({
        tab: normalized,
        nonce: Date.now(),
      });
    },
    [setInspectorActiveTab, setInspectorDockOpen],
  );
  const toggleInspectorTab = useCallback(
    (
      tab: "content" | "style" | "layout" | "data" | "responsive" | "motion",
    ) => {
      const normalized =
        tab === "responsive" ? "layout" : tab;
      setInspectorDockOpenState((open) => {
        if (open && inspectorActiveTabRef.current === normalized) {
          setInspectorRailDocked(false);
          return false;
        }
        setInspectorActiveTab(normalized);
        setInspectorTabRequest({
          tab: normalized,
          nonce: Date.now(),
        });
        return true;
      });
    },
    [setInspectorActiveTab],
  );

  // revisions drawer state (Phase 4)
  const [revisionsOpen, setRevisionsOpen] = useState(false);

  // theme drawer state (Phase 5)
  const [themeOpen, setThemeOpen] = useState(false);

  // assets drawer state (Phase 7)
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // comments drawer state (Phase 11)
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsFocusSectionId, setCommentsFocusSectionId] = useState<
    string | null
  >(null);

  /** Full-screen library / gallery / popover — hide right rails so focus + Escape stack stay sane. */
  const closeAllRightRailDrawers = useCallback(() => {
    setPublishOpen(false);
    setPageSettingsOpen(false);
    setRevisionsOpen(false);
    setThemeOpen(false);
    setAssetsOpen(false);
    setCollectionsOpen(false);
    setScheduleOpen(false);
    setCommentsOpen(false);
    setCommentsFocusSectionId(null);
  }, []);

  // command palette state (Phase 8) — centred modal; `openStarterTemplateGallery`
  // calls `dismissCentredModals` only; right-rail drawers use
  // `dismissCompetingEditorChrome` (includes gallery + library teardown).
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const togglePalette = useCallback(
    () => setPaletteOpen((prev) => !prev),
    [],
  );

  // keyboard-shortcuts overlay state (Phase 10) — declared before template
  // gallery open handler so both modals can be cleared together.
  const [shortcutOverlayOpen, setShortcutOverlayOpen] = useState(false);
  const openShortcutOverlay = useCallback(
    () => setShortcutOverlayOpen(true),
    [],
  );
  const closeShortcutOverlay = useCallback(
    () => setShortcutOverlayOpen(false),
    [],
  );
  const toggleShortcutOverlay = useCallback(
    () => setShortcutOverlayOpen((prev) => !prev),
    [],
  );

  /** ⌘K palette + ? overlay — hide when opening drawer-scale surfaces. */
  const dismissCentredModals = useCallback(() => {
    setPaletteOpen(false);
    setShortcutOverlayOpen(false);
  }, []);

  const [starterTemplateGalleryOpen, setStarterTemplateGalleryOpen] =
    useState(false);
  const [
    starterTemplateGalleryHighlightedSlug,
    setStarterTemplateGalleryHighlightedSlug,
  ] = useState<string | null>(null);
  const openStarterTemplateGallery = useCallback(
    (highlightedSlug?: string | null) => {
      dismissCentredModals();
      closeAllRightRailDrawers();
      setLibraryTarget(null);
      setPickerPopover(null);
      setStarterTemplateGalleryHighlightedSlug(highlightedSlug ?? null);
      setStarterTemplateGalleryOpen(true);
    },
    [dismissCentredModals, closeAllRightRailDrawers],
  );
  const closeStarterTemplateGallery = useCallback(() => {
    setStarterTemplateGalleryOpen(false);
    setStarterTemplateGalleryHighlightedSlug(null);
  }, []);

  /** Right-rail drawer opens — tear down overlapping chrome (execution-plan mutex). */
  const dismissCompetingEditorChrome = useCallback(() => {
    dismissCentredModals();
    closeStarterTemplateGallery();
    setLibraryTarget(null);
    setPickerPopover(null);
  }, [dismissCentredModals, closeStarterTemplateGallery]);

  // structure navigator (Page Structure panel) — CLOSED by default in the
  // canvas-first model (2026-06 redesign): the slim CommandDock owns the left
  // edge and launches this panel on click. ⌘\ still toggles it, and inserting
  // a section still force-opens it via `markNavigatorAddition`.
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [navigatorWidth, setNavigatorWidthState] = useState(
    NAVIGATOR_WIDTH_DEFAULT,
  );
  const [recentNavigatorAdditions, setRecentNavigatorAdditions] = useState<
    NavigatorRecentAddition[]
  >([]);
  // W3-T1 — most-recently inserted block (id + monotonic nonce), drives the
  // canvas highlight pulse. A nonce (not a bare id) so re-inserting the same id
  // still re-fires, and so the pulse effect keys on a fresh value each insert.
  const [lastInsertedNodeId, setLastInsertedNodeId] = useState<{
    id: string;
    nonce: number;
  } | null>(null);
  const markNodeInserted = useCallback((nodeId: string) => {
    setLastInsertedNodeId({ id: nodeId, nonce: Date.now() });
  }, []);
  const markNavigatorAddition = useCallback(
    (
      sectionId: string,
      builderNodeId: string | null = null,
      kind: NavigatorRecentAddition["kind"] = "section",
    ) => {
      setNavigatorOpen(true);
      const nextAddition: NavigatorRecentAddition = {
        sectionId,
        builderNodeId,
        kind,
        nonce: Date.now(),
      };
      setRecentNavigatorAdditions((current) => {
        const withoutDuplicate = current.filter(
          (item) =>
            item.sectionId !== nextAddition.sectionId ||
            item.builderNodeId !== nextAddition.builderNodeId,
        );
        return [nextAddition, ...withoutDuplicate].slice(0, 3);
      });
    },
    [],
  );
  const clearNavigatorRecentAdditions = useCallback(() => {
    setRecentNavigatorAdditions((current) =>
      current.length === 0 ? current : [],
    );
  }, []);

  // W3-T1 — highlight pulse on the just-inserted block. Self-contained (Web
  // Animations API on the element's own box-shadow — no shared keyframe sheet to
  // depend on, so it fires whether or not the Layers panel is mounted). Honors
  // `prefers-reduced-motion` (the new block already appears + is selected; only
  // the pulse is suppressed). Retries a few frames because the canvas DOM node
  // can lag the insert by one bridge re-render.
  useEffect(() => {
    if (lastInsertedNodeId === null) return;
    if (typeof document === "undefined" || typeof window === "undefined") return;
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const targetId = lastInsertedNodeId.id;
    let cancelled = false;
    let attempts = 0;
    const run = () => {
      if (cancelled) return;
      const el = Array.from(
        document.querySelectorAll<HTMLElement>(
          `[data-builder-node-id="${CSS.escape(targetId)}"]`,
        ),
      ).find(
        (candidate) =>
          !candidate.closest(
            "[data-edit-topbar], [data-edit-drawer], [data-edit-overlay]",
          ),
      );
      if (!el) {
        if (attempts < 8) {
          attempts += 1;
          requestAnimationFrame(run);
        }
        return;
      }
      if (typeof el.animate !== "function") return;
      el.animate(
        [
          { boxShadow: "0 0 0 0 rgba(124,58,237,0)" },
          { boxShadow: "0 0 0 3px rgba(124,58,237,0.55)" },
          { boxShadow: "0 0 0 0 rgba(124,58,237,0)" },
        ],
        { duration: 720, easing: "ease-out", fill: "none" },
      );
    };
    requestAnimationFrame(run);
    return () => {
      cancelled = true;
    };
  }, [lastInsertedNodeId]);

  const setNavigatorWidth = useCallback((width: number) => {
    if (!Number.isFinite(width)) return;
    const rounded = Math.round(width);
    const clamped = Math.min(
      NAVIGATOR_WIDTH_MAX,
      Math.max(NAVIGATOR_WIDTH_MIN, rounded),
    );
    setNavigatorWidthState(clamped);
  }, []);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(NAVIGATOR_WIDTH_STORAGE_KEY);
      if (!raw) return;
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed)) return;
      setNavigatorWidth(parsed);
    } catch {
      // Local preference is best-effort only.
    }
  }, [setNavigatorWidth]);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        NAVIGATOR_WIDTH_STORAGE_KEY,
        String(navigatorWidth),
      );
    } catch {
      // Ignore localStorage failures.
    }
  }, [navigatorWidth]);
  const toggleNavigator = useCallback(() => {
    setNavigatorOpen((prev) => {
      const next = !prev;
      if (next) {
        setSearchPanelOpen(false);
        setAddMenuOpen(false);
        setAllPagesPanelOpen(false);
        setBrandPanelOpen(false);
      }
      return next;
    });
  }, []);

  const closeSearchPanel = useCallback(() => setSearchPanelOpen(false), []);
  const toggleSearchPanel = useCallback(() => {
    setSearchPanelOpen((prev) => {
      const next = !prev;
      if (next) {
        dismissCompetingEditorChrome();
        closeAllRightRailDrawers();
        setAddMenuOpen(false);
        setAllPagesPanelOpen(false);
        setBrandPanelOpen(false);
        setNavigatorOpen(false);
      }
      return next;
    });
  }, [
    closeAllRightRailDrawers,
    dismissCompetingEditorChrome,
    setNavigatorOpen,
  ]);

  const closeAddMenu = useCallback(() => setAddMenuOpen(false), []);
  const toggleAddMenu = useCallback(() => {
    setAddMenuOpen((prev) => {
      const next = !prev;
      if (next) {
        dismissCompetingEditorChrome();
        closeAllRightRailDrawers();
        setSearchPanelOpen(false);
        setAllPagesPanelOpen(false);
        setBrandPanelOpen(false);
        setNavigatorOpen(false);
      }
      return next;
    });
  }, [
    closeAllRightRailDrawers,
    dismissCompetingEditorChrome,
    setNavigatorOpen,
  ]);

  const closeAllPagesPanel = useCallback(() => setAllPagesPanelOpen(false), []);
  const openAllPagesPanel = useCallback(() => {
    dismissCompetingEditorChrome();
    closeAllRightRailDrawers();
    setSearchPanelOpen(false);
    setAddMenuOpen(false);
    setBrandPanelOpen(false);
    setNavigatorOpen(false);
    setAllPagesPanelOpen(true);
  }, [
    closeAllRightRailDrawers,
    dismissCompetingEditorChrome,
    setNavigatorOpen,
  ]);
  const toggleAllPagesPanel = useCallback(() => {
    setAllPagesPanelOpen((prev) => {
      const next = !prev;
      if (next) {
        dismissCompetingEditorChrome();
        closeAllRightRailDrawers();
        setSearchPanelOpen(false);
        setAddMenuOpen(false);
        setBrandPanelOpen(false);
        setNavigatorOpen(false);
      }
      return next;
    });
  }, [
    closeAllRightRailDrawers,
    dismissCompetingEditorChrome,
    setNavigatorOpen,
  ]);

  const closeBrandPanel = useCallback(() => setBrandPanelOpen(false), []);
  const toggleBrandPanel = useCallback(() => {
    setBrandPanelOpen((prev) => {
      const next = !prev;
      if (next) {
        dismissCompetingEditorChrome();
        closeAllRightRailDrawers();
        setSearchPanelOpen(false);
        setAddMenuOpen(false);
        setAllPagesPanelOpen(false);
        setNavigatorOpen(false);
      }
      return next;
    });
  }, [
    closeAllRightRailDrawers,
    dismissCompetingEditorChrome,
    setNavigatorOpen,
  ]);
  const openLibrary = useCallback(
    (target: LibraryTarget) => {
      dismissCompetingEditorChrome();
      closeAllRightRailDrawers();
      setLibraryTarget(target);
    },
    [dismissCompetingEditorChrome, closeAllRightRailDrawers],
  );
  const closeLibrary = useCallback(() => setLibraryTarget(null), []);

  // Sprint 3 — inline picker popover. The popover is the default
  // affordance for inline `+` clicks; opening it always closes the full
  // modal library (so the operator never sees both at once).
  const openPickerPopover = useCallback(
    (target: LibraryTarget, x: number, y: number) => {
      dismissCompetingEditorChrome();
      closeAllRightRailDrawers();
      setPickerPopover({ target, x, y });
    },
    [dismissCompetingEditorChrome, closeAllRightRailDrawers],
  );
  const closePickerPopover = useCallback(() => setPickerPopover(null), []);
  // The right-side drawers all anchor to the same `right: 0` slot. Exactly
  // one `*Open` flag is true after `showExclusiveRightRailDrawer` — keeps
  // mutex logic in one place (step toward execution-plan root cause 1).
  // `dismissCompetingEditorChrome` clears palette / gallery / library first.
  // The InspectorDock stays selection-driven underneath (higher z-index drawer).
  const showExclusiveRightRailDrawer = useCallback(
    (
      active:
        | "publish"
        | "pageSettings"
        | "revisions"
        | "theme"
        | "assets"
        | "collections"
        | "schedule"
        | "comments",
      commentsSectionFocus?: string | null,
    ) => {
      dismissCompetingEditorChrome();
      setPublishOpen(active === "publish");
      setPageSettingsOpen(active === "pageSettings");
      setRevisionsOpen(active === "revisions");
      setThemeOpen(active === "theme");
      setAssetsOpen(active === "assets");
      setCollectionsOpen(active === "collections");
      setScheduleOpen(active === "schedule");
      setCommentsOpen(active === "comments");
      setCommentsFocusSectionId(
        active === "comments" ? (commentsSectionFocus ?? null) : null,
      );
    },
    [dismissCompetingEditorChrome],
  );

  const openPublish = useCallback(() => {
    showExclusiveRightRailDrawer("publish");
  }, [showExclusiveRightRailDrawer]);
  const closePublish = useCallback(() => setPublishOpen(false), []);

  const openPageSettings = useCallback(() => {
    showExclusiveRightRailDrawer("pageSettings");
  }, [showExclusiveRightRailDrawer]);
  const closePageSettings = useCallback(() => setPageSettingsOpen(false), []);

  const requestPagesPickerOpen = useCallback(() => {
    openAllPagesPanel();
    setPagesPickerOpenNonce((n) => n + 1);
  }, [openAllPagesPanel]);

  const openRevisions = useCallback(() => {
    showExclusiveRightRailDrawer("revisions");
  }, [showExclusiveRightRailDrawer]);
  const closeRevisions = useCallback(() => setRevisionsOpen(false), []);

  const openTheme = useCallback(() => {
    // Gated on `canEditTheme` (= capabilities.themeTokens || canEditSiteShell).
    // Talent Max surfaces get themeTokens; the drawer routes to the talent-scoped
    // backend (talent_pages.theme) via theme-action-scope, so it no longer 401s.
    if (!canEditTheme) return;
    showExclusiveRightRailDrawer("theme");
  }, [canEditTheme, showExclusiveRightRailDrawer]);
  const closeTheme = useCallback(() => setThemeOpen(false), []);

  const openAssets = useCallback(() => {
    showExclusiveRightRailDrawer("assets");
  }, [showExclusiveRightRailDrawer]);
  const closeAssets = useCallback(() => setAssetsOpen(false), []);

  const openCollections = useCallback(() => {
    showExclusiveRightRailDrawer("collections");
  }, [showExclusiveRightRailDrawer]);
  const closeCollections = useCallback(() => setCollectionsOpen(false), []);

  const openSchedule = useCallback(() => {
    showExclusiveRightRailDrawer("schedule");
  }, [showExclusiveRightRailDrawer]);
  const closeSchedule = useCallback(() => setScheduleOpen(false), []);

  // Comments drawer (Phase 11) — `commentsSectionFocus` null = all threads.
  const openComments = useCallback(() => {
    showExclusiveRightRailDrawer("comments", null);
  }, [showExclusiveRightRailDrawer]);
  const openCommentsForSection = useCallback(
    (sectionId: string) => {
      showExclusiveRightRailDrawer("comments", sectionId);
    },
    [showExclusiveRightRailDrawer],
  );
  const closeComments = useCallback(() => {
    setCommentsOpen(false);
    setCommentsFocusSectionId(null);
  }, []);
  return {
    navLinkFocusRequest,
    requestNavLinkFocus,
    pinnedNavSubmenu,
    setPinnedNavSubmenu,
    libraryTarget,
    openLibrary,
    closeLibrary,
    pickerPopover,
    openPickerPopover,
    closePickerPopover,
    publishOpen,
    openPublish,
    closePublish,
    pageSettingsOpen,
    openPageSettings,
    closePageSettings,
    pagesPickerOpenNonce,
    requestPagesPickerOpen,
    searchPanelOpen,
    toggleSearchPanel,
    closeSearchPanel,
    addMenuOpen,
    toggleAddMenu,
    closeAddMenu,
    allPagesPanelOpen,
    openAllPagesPanel,
    closeAllPagesPanel,
    toggleAllPagesPanel,
    brandPanelOpen,
    toggleBrandPanel,
    closeBrandPanel,
    inspectorTabRequest,
    requestInspectorTab,
    toggleInspectorTab,
    inspectorActiveTab,
    setInspectorActiveTab,
    inspectorRailDocked,
    setInspectorRailDocked,
    commandDockDocked,
    setCommandDockDocked,
    inspectorDockOpen,
    setInspectorDockOpen,
    toggleInspectorDock,
    revisionsOpen,
    openRevisions,
    closeRevisions,
    themeOpen,
    openTheme,
    closeTheme,
    assetsOpen,
    openAssets,
    closeAssets,
    collectionsOpen,
    openCollections,
    closeCollections,
    scheduleOpen,
    openSchedule,
    closeSchedule,
    commentsOpen,
    commentsFocusSectionId,
    openComments,
    openCommentsForSection,
    closeComments,
    paletteOpen,
    openPalette,
    closePalette,
    togglePalette,
    dismissCentredModals,
    dismissCompetingEditorChrome,
    starterTemplateGalleryOpen,
    starterTemplateGalleryHighlightedSlug,
    openStarterTemplateGallery,
    closeStarterTemplateGallery,
    shortcutOverlayOpen,
    openShortcutOverlay,
    closeShortcutOverlay,
    toggleShortcutOverlay,
    navigatorOpen,
    setNavigatorOpen,
    toggleNavigator,
    navigatorWidth,
    setNavigatorWidth,
    recentNavigatorAdditions,
    clearNavigatorRecentAdditions,
    markNavigatorAddition,
    lastInsertedNodeId,
    markNodeInserted,
  };
}
