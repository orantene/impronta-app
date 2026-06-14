"use client";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  buildCorePublishRequirements,
  buildProfilePublishRequirements,
  canApplyProfileStatusTransition,
  getProfilePublishCompleteness,
} from "@/lib/field-engine/profile-publish-requirements";
import type { ResolvedField } from "@/lib/field-engine/resolve-talent-fields";
import { resolveDynamicFieldsForParent } from "@/lib/field-engine/client-field-source-select";
import {
  getFieldsForTalentAsTalent,
  getTalentFieldValuesAsTalent,
  setTalentFieldValueAsTalent,
  setTalentFieldVisibilityAsTalent,
} from "@/lib/server-actions/talent-field-values-catalog";
import {
  addAspirationAsTalent,
  getAspirationsAsTalent,
  getContextCatalogAsTalent,
  getEnabledParentCategoriesForPickerAsTalent,
  getResolvedContextsAsTalent,
  getResolvedSkillsAsTalent,
  getTalentTypesUnderParentAsTalent,
  removeAspirationAsTalent,
  requestNewTaxonomyTermAsTalent,
  setFeaturedSkillAsTalent,
  setTalentProfileContextsAsTalent,
  setTalentProfileSkillsAsTalent,
  unverifySkillAsTalent,
  updateSkillAsTalent,
  verifySkillAsTalent,
} from "@/lib/server-actions/talent-self-services";
import type {
  LiveCategoryGroupNavItem,
  LiveCategoryRequiredMissingItem,
} from "../../live-category-fields-editor";
import {
  AvailabilityStatus,
  BioTone,
  COLORS,
  CONTEXT_CATALOG,
  ChipsInput,
  ContextSlotPanel,
  DRAWER_SIZE_PX,
  DrawerDetailSkeleton,
  DrawerShell,
  DrawerSize,
  FONTS,
  FieldRow,
  LanguageSlotPanel,
  LanguagesEditor,
  LiveCategoryFieldsEditor,
  LiveCategoryFieldsHistoryModal,
  LiveTaxonomyParent,
  LocaleBio,
  LocaleCode,
  LocationSlotPanel,
  MediaGalleryDrawer,
  MetricsRibbon,
  MyTalentProfile,
  Personality,
  PhotoGalleryPro,
  PhotoMeta,
  Plan,
  ProfileIdentity,
  ProfileLanguage,
  RegFieldInput,
  Section,
  ServiceArea,
  ShellLimitsEntry,
  SkillFreshnessBanner,
  SkillHintsBanner,
  SkillOverridesPanel,
  SkillProficiency,
  SkillSlotPanel,
  TAXONOMY,
  TAXONOMY_FIELDS,
  TYPE_RATE_UNIT,
  TaxonomyChild,
  TaxonomyParent,
  TaxonomyParentId,
  TextInput,
  Toggle,
  ToggleControl,
  WORKSPACE_TAXONOMY_DEFAULT,
  actionDeleteMediaAssets,
  actionImportFromGoogleDrive,
  actionImportSingleDriveFile,
  actionListDriveFolder,
  actionReorderMediaAssets,
  actionRevertCropToSource,
  actionUploadAndAssignMedia,
  addPendingReview,
  addTalentToRoster,
  clearPendingReview,
  clearProfileDraft,
  commitTalentProfileShellAdmin,
  computeTrustTier,
  dbToUiProfileShellStatus,
  extractShellVideoUrls,
  findShellBusinessLine,
  findShellWhatsappHref,
  getDynamicFieldsForType,
  getEnabledTaxonomyTree,
  getProfileById,
  limitsDataToEntries,
  limitsEntriesToData,
  prefetchContextsData,
  prefetchLanguagesData,
  prefetchSkillsData,
  registerPortfolioPhoto,
  removeFromRoster,
  saveSelfLanguages,
  setProfileOverride,
  setTalentAvatar,
  setTalentHero,
  splitShellContactPhone,
  syncSelfTalentTypeTaxonomyFromShell,
  updateSelfAbout,
  updateSelfAvailability,
  updateSelfCredits,
  updateSelfIdentity,
  updateSelfLimits,
  updateSelfLocation,
  updateSelfMediaAlbums,
  updateSelfProfileDrawerExtras,
  updateSelfProfileShellDynFields,
  updateSelfProfileWorkflowFromShell,
  updateSelfRates,
  updateSelfSocialProof,
  updateSelfTalentDocuments,
  useAdminShell,
  useDashboardText,
  useLiveTaxonomy,
  useQueuedRouterRefresh
} from "../drawer-shared";
import {
  AdvancedAgencySettingsSection,
  AlbumsEditorPro,
  AspirationsEditor,
  AvailabilityGrid,
  BiosEditor,
  CityAutocompleteInput,
  CreditsEditor,
  CustomWorkspaceFieldInput,
  DiffEntry,
  FieldLockToggle,
  FieldLocksOverviewPanel,
  FilesEditor,
  FirstTimeHero,
  HeaderPublishCoach,
  HelloReelEditor,
  IdentityEditor,
  InviteClaimBanner,
  LANGUAGE_PRESETS,
  LimitsEditor,
  LiveCategoryFieldsPanel,
  LockedHint,
  NextTierCoach,
  PROFILE_SECTIONS,
  PackageRatesEditor,
  PastClientsEditor,
  PersonalityEditor,
  PolaroidsEditor,
  ProfileAccordionSection,
  ProfileActivityLog,
  ProfileDiffModal,
  ProfileGrowthMetric,
  ProfileOwnershipPanel,
  ProfileSectionId,
  ProfileShellMobileMenu,
  ProfileShellPayload,
  ProfileState,
  PublishCelebrationModal,
  RatesEditor,
  RecurringPatternEditor,
  RequiredCoach,
  SECTION_META,
  SeasonalEditor,
  ServiceAreaMap,
  ServicesEditor,
  SkillsProEditor,
  SmartFooterCTA,
  StatusPillDropdown,
  ThreeSlotPhotoBlock,
  UpcomingVisitsEditor,
  VerificationsEditor,
  ViewAsClientModal,
  _getEditorHydration,
  ageString,
  computeProfileDiff,
  findChild,
  getTypeDefaults,
  makeInitialProfileState,
  profileReducer
} from "./profile-shell-internal";
import { shouldShowPolaroidsSection } from "./profile-polaroids-policy";
import { CommercialTermsEditor } from "./profile-shell-modules/profile-commercial-terms";
import { TalentServicesMenuCard } from "@/app/(workspace)/[tenantSlug]/talent/settings/TalentServicesMenuCard";
import { ProfileReviewsEditor } from "./profile-shell-modules/profile-reviews";
import {
  ProfileShellSaveErrorBanner,
  ProfileShellSectionSaveHint,
  ProfileShellUnsavedBanner,
} from "./profile-shell-modules/profile-shell-save-hints";
import type { ServiceAreaDesired } from "../../location-slot-panel";
import { saveTalentServiceAreas } from "@/lib/server-actions/admin-talent-service-areas";
import { setTalentLanguages } from "@/lib/server-actions/admin-talent-languages";
import type { TalentLanguageInput } from "@/lib/server-actions/admin-talent-languages.types";
import {
  formatProfileShellSaveFailures,
  runProfileShellSaveSteps,
  type ProfileShellSaveStepResult,
} from "@/lib/talent/profile-shell-save-feedback";

function detailsGroupHelperText(label: string): string {
  const normalized = label.toLowerCase();

  if (normalized.includes("physical") || normalized.includes("casting")) {
    return "Casting facts, measurements, and profile details used for matching.";
  }
  if (normalized.includes("equipment") || normalized.includes("tools")) {
    return "Gear, tools, and setup details clients need before booking.";
  }
  if (normalized.includes("operational")) {
    return "Practical requirements that keep bookings clear and predictable.";
  }
  if (normalized.includes("music")) {
    return "Genres, set format, and music-specific booking details.";
  }
  if (normalized.includes("performer")) {
    return "Act format, performance style, and production needs.";
  }
  if (normalized.includes("singer")) {
    return "Vocal, repertoire, and live performance details.";
  }

  return "Type-specific profile fields for this category.";
}

// Phase 1d (remediation §4): the 3,546-LOC unified profile shell (its own
// profileReducer + history/undo refs). Extracted LAST AND ALONE. Byte-for-byte;
// irreducible — max-lines grandfathered via mandated scoped suppression regen.

export function TalentProfileShellDrawer() {
  const { state: protoState, closeDrawer, openDrawer, toast, customFields, tenantSlug, bridgeTenantIdentity, bridgeTalentSelfProfile, effectiveTenant, profileEditorLayout, clientFieldSource } = useAdminShell();
  const workspaceScopeTenantId =
    bridgeTenantIdentity?.tenantId
    ?? bridgeTenantIdentity?.slug
    ?? tenantSlug
    ?? effectiveTenant.slug;
  const copy = useDashboardText();
  const queueShellRouterRefresh = useQueuedRouterRefresh();
  const drawerId = protoState.drawer.drawerId;
  const drawerOpen = drawerId === "talent-profile-shell" || drawerId === "talent-profile-edit";
  const payload = (protoState.drawer.payload ?? {}) as ProfileShellPayload;
  const mode = drawerId === "talent-profile-edit"
    ? ("edit-self" as const)
    : payload.mode ?? "edit-admin";
  const isSelf = mode === "edit-self";
  const adminVisible = !isSelf;
  const isInvited = payload.seed?.method === "invited";
  const talentSelfFieldActions = useMemo(
    () =>
      isSelf
        ? {
            getFields: getFieldsForTalentAsTalent,
            getValues: getTalentFieldValuesAsTalent,
            setValue: setTalentFieldValueAsTalent,
            setVisibility: setTalentFieldVisibilityAsTalent,
          }
        : undefined,
    [isSelf],
  );
  const talentSelfSkillActions = useMemo(
    () =>
      isSelf
        ? {
            getResolvedSkills: getResolvedSkillsAsTalent,
            getAspirations: getAspirationsAsTalent,
            setTalentProfileSkills: setTalentProfileSkillsAsTalent,
            updateSkill: updateSkillAsTalent,
            verifySkill: verifySkillAsTalent,
            unverifySkill: unverifySkillAsTalent,
            setFeaturedSkill: setFeaturedSkillAsTalent,
          }
        : undefined,
    [isSelf],
  );
  const talentSelfSkillSearchActions = useMemo(
    () =>
      isSelf
        ? {
            getEnabledParentCategoriesForPicker: getEnabledParentCategoriesForPickerAsTalent,
            getTalentTypesUnderParent: getTalentTypesUnderParentAsTalent,
            requestNewTaxonomyTerm: requestNewTaxonomyTermAsTalent,
          }
        : undefined,
    [isSelf],
  );
  const talentSelfCareerInterestActions = useMemo(
    () =>
      isSelf
        ? {
            getAspirations: getAspirationsAsTalent,
            addAspiration: addAspirationAsTalent,
            removeAspiration: removeAspirationAsTalent,
            getEnabledParentCategoriesForPicker: getEnabledParentCategoriesForPickerAsTalent,
            getTalentTypesUnderParent: getTalentTypesUnderParentAsTalent,
          }
        : undefined,
    [isSelf],
  );
  const talentSelfContextActions = useMemo(
    () =>
      isSelf
        ? {
            getResolvedContexts: getResolvedContextsAsTalent,
            setTalentProfileContexts: setTalentProfileContextsAsTalent,
          }
        : undefined,
    [isSelf],
  );
  const talentSelfContextCatalogActions = useMemo(
    () =>
      isSelf
        ? {
            getContextCatalog: getContextCatalogAsTalent,
          }
        : undefined,
    [isSelf],
  );

  // ── Reducer with history (undo/redo) ─────────────────────────────
  const initialState = useRef<ProfileState | null>(null);
  if (initialState.current === null) {
    // Pass `bridgeTalentSelfProfile` so the seed uses the real talent's
    // displayName / homeCity for self-edit drawers on real DB rows.
    // Without this thread-through, the drawer falls back to the fixture
    // canonical profile (Marta Reyes) for any non-fixture talent — i.e.
    // every real freshly-provisioned talent — and pre-fills the identity
    // section with Marta's name and Madrid as the home base.
    initialState.current = makeInitialProfileState(payload, isSelf, bridgeTalentSelfProfile);
  }
  const [state, dispatch] = React.useReducer(profileReducer, initialState.current);
  const historyRef = useRef<ProfileState[]>([initialState.current]);
  const historyIdxRef = useRef(0);
  const skipHistoryRef = useRef(false);
  const allowMarkDirtyRef = useRef(false);
  const savedStatusResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  type SaveStatus = "idle" | "saving" | "saved" | "error";
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [serverProfileUpdatedAtMs, setServerProfileUpdatedAtMs] = useState<number | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  /** Bumps when undo stack changes so header controls re-render (refs alone don't). */
  const [historyUiEpoch, setHistoryUiEpoch] = useState(0);

  // Drawer sizing — same model as DrawerShell: 3 presets (compact /
  // half / full) from a header toolbar + a draggable left edge for
  // fine-tuning. compact = the original 720px side drawer.
  const [pshellSize, setPshellSize] = useState<DrawerSize>("compact");
  const [pshellCustomWidth, setPshellCustomWidth] = useState<number | null>(null);
  const [pshellDragging, setPshellDragging] = useState(false);
  useEffect(() => {
    if (!pshellDragging) return;
    const onMove = (e: MouseEvent) => {
      setPshellCustomWidth(
        Math.min(
          Math.max(window.innerWidth - e.clientX, 420),
          Math.round(window.innerWidth * 0.96),
        ),
      );
    };
    const onUp = () => setPshellDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [pshellDragging]);
  const pshellWidth =
    typeof window === "undefined"
      ? 720
      : pshellCustomWidth
        ? pshellCustomWidth
        : pshellSize === "compact"
          ? 720
          : DRAWER_SIZE_PX[pshellSize](window.innerWidth);

  useEffect(() => {
    if (!drawerOpen) return;
    allowMarkDirtyRef.current = mode === "create" || !payload.talentId;
    setDirty(false);
    setSavedAt(null);
    setSaveStatus("idle");
    setSaveError(null);
    setServerProfileUpdatedAtMs(null);
    if (savedStatusResetTimerRef.current) {
      clearTimeout(savedStatusResetTimerRef.current);
      savedStatusResetTimerRef.current = null;
    }
  }, [drawerOpen, payload.talentId, mode]);

  // Push a snapshot whenever state changes (debounced).
  useEffect(() => {
    if (!drawerOpen) return;
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      const h = historyRef.current.slice(0, historyIdxRef.current + 1);
      h.push(state);
      // Cap ring buffer at 30.
      if (h.length > 30) h.shift();
      historyRef.current = h;
      historyIdxRef.current = h.length - 1;
      setHistoryUiEpoch((x) => x + 1);
    }, 350);
    return () => clearTimeout(t);
  }, [state, drawerOpen]);

  const undo = React.useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    skipHistoryRef.current = true;
    dispatch({ type: "RESET", state: historyRef.current[historyIdxRef.current] });
    if (allowMarkDirtyRef.current) setDirty(true);
    setHistoryUiEpoch((x) => x + 1);
    toast(copy.t("Undone"));
  }, [copy, toast]);
  const redo = React.useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    skipHistoryRef.current = true;
    dispatch({ type: "RESET", state: historyRef.current[historyIdxRef.current] });
    if (allowMarkDirtyRef.current) setDirty(true);
    setHistoryUiEpoch((x) => x + 1);
    toast(copy.t("Redone"));
  }, [copy, toast]);

  // Keyboard ⌘Z / ⌘⇧Z
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, undo, redo]);

  // Convenience patcher — `silent` skips dirty tracking (hydration + gallery sync).
  const patch = React.useCallback((p: Partial<ProfileState>, opts?: { silent?: boolean }) => {
    if (allowMarkDirtyRef.current && !opts?.silent) setDirty(true);
    dispatch({ type: "PATCH", patch: p });
  }, []);

  // Stable single-field patchers — passed to memoized editors so a keystroke
  // in one section doesn't re-render every other editor in the active panel.
  // Each is wrapped in useCallback so its reference is stable across renders.
  const patchPersonality = React.useCallback((p: Personality) => patch({ personality: p }), [patch]);
  const patchBios = React.useCallback((bs: LocaleBio[]) => patch({ bios: bs }), [patch]);
  const patchBioActiveLocale = React.useCallback((l: LocaleCode) => patch({ bioActiveLocale: l }), [patch]);
  const patchLanguages = React.useCallback((v: ProfileState["languages"]) => patch({ languages: v }), [patch]);
  const patchPastClients = React.useCallback((c: ProfileState["pastClients"]) => patch({ pastClients: c }), [patch]);
  const patchVideoLinks = React.useCallback((v: string[]) => patch({ videoLinks: v }), [patch]);
  const patchHelloReel = React.useCallback((r: ProfileState["helloReel"]) => patch({ helloReel: r }), [patch]);
  const patchPolaroids = React.useCallback((p: ProfileState["polaroids"]) => patch({ polaroids: p }), [patch]);
  const patchRates = React.useCallback((rs: ProfileState["rates"]) => patch({ rates: rs }), [patch]);
  const patchCredits = React.useCallback((c: ProfileState["credits"]) => patch({ credits: c }), [patch]);
  const patchLimits = React.useCallback((l: ProfileState["limits"]) => patch({ limits: l }), [patch]);
  const patchFiles = React.useCallback((f: ProfileState["files"]) => patch({ files: f }), [patch]);
  // Stable service-area sub-field patchers so memoized ChipsInput children
  // don't re-render every time an unrelated field changes.
  const patchServiceCities = React.useCallback((v: string[]) => patch({ serviceArea: { ...state.serviceArea, serviceCities: v } }), [patch, state.serviceArea]);
  const patchWorkEligibility = React.useCallback((v: string[]) => patch({ serviceArea: { ...state.serviceArea, workEligibility: v } }), [patch, state.serviceArea]);
  const patchVisaCountries = React.useCallback((v: string[]) => patch({ serviceArea: { ...state.serviceArea, visaCountries: v } }), [patch, state.serviceArea]);
  // Stable callback for PhotoGalleryPro so it doesn't re-render on every
  // unrelated field change. Depends only on the album slice it mutates.
  const patchActiveAlbumItems = React.useCallback((items: ProfileState["albumsPro"][number]["items"]) => patch({
    albumsPro: state.albumsPro.map(a => a.id === state.activeAlbumId ? { ...a, items } : a),
  }), [patch, state.albumsPro, state.activeAlbumId]);
  // Stable callback for BiosEditor's regenerate button — rebuilds the active
  // locale bio from the type-defaults template.
  const onBiosRegenerate = React.useCallback(() => {
    if (!state.primaryType) return;
    const defaults = getTypeDefaults(state.primaryType);
    const text = defaults.bioTemplate({
      stageName: state.stageName,
      homeBase: state.serviceArea.homeBase,
      languages: state.languages.map(l => l.language),
    });
    patch({
      bios: state.bios.map(b => b.locale === state.bioActiveLocale ? { ...b, text } : b),
    });
  }, [patch, state.primaryType, state.stageName, state.serviceArea.homeBase, state.languages, state.bios, state.bioActiveLocale]);

  // Phase 1 — avatar + hero local state (hydrated from bundle alongside gallery).
  const [avatarPhotoUrl, setAvatarPhotoUrl] = useState<string | null>(null);
  const [heroPhotoUrl, setHeroPhotoUrl] = useState<string | null>(null);

  // Multi-tenant identity gates — surfaced as a banner + read-only badge
  // when this tenant manages a Tulala-native talent on a non-exclusive
  // basis. See admin-talent-profile-sections.ts personal_profile_locked
  // computation for the canonical truth.
  const [tulalaNativeIdentity, setTulalaNativeIdentity] = useState(false);
  const [personalProfileLocked, setPersonalProfileLocked] = useState(false);
  const [rosterExclusivity, setRosterExclusivity] = useState<string | null>(null);
  // All assets for the gallery drawer (populated during bundle hydration).
  const [galleryDrawerOpen, setGalleryDrawerOpen] = useState(false);
  const [galleryDrawerFocus, setGalleryDrawerFocus] = useState<"avatar" | "hero" | "gallery">("gallery");
  const [galleryAssets, setGalleryAssets] = useState<import("@/components/talent/media-gallery-drawer").MediaAsset[]>([]);

  // Editor row and media bundle load in parallel, but profile fields should
  // not wait for photo/gallery hydration before appearing in the drawer.
  // (Dedupe moved to the module-level in-flight cache — see
  // `_getEditorHydration`. The old per-ref guard was StrictMode-unsafe.)
  const [hydratingMedia, setHydratingMedia] = useState(false);
  // P2 — honest hydration status for the editor's saved data. The drawer
  // paints from a 3-field seed; the real values arrive async. This makes
  // the loading/loaded/failed state explicit so empty defaults never
  // masquerade as real saved values.
  const [editorHydration, setEditorHydration] =
    useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [hydrationNonce, setHydrationNonce] = useState(0);
  const retryHydration = useCallback(() => {
    // The in-flight cache self-evicts on settle, so by the time the
    // error overlay's Retry is visible there's no entry — bumping the
    // nonce re-runs the effect and triggers a fresh fetch.
    setEditorHydration("loading");
    setHydrationNonce((n) => n + 1);
  }, []);
  // Stash the latest state in a ref so effects/callbacks below can read the
  // current value without forcing a `state` dep (which would re-fire on every
  // keystroke). Declared up here because the gallery→albums sync useEffect
  // needs it. Re-assigned every render so it always points at the latest state.
  const stateRef = useRef(state);
  stateRef.current = state;
  const deferredServiceAreaRef = useRef<ServiceAreaDesired | null>(null);
  const deferredServiceAreaTouchedRef = useRef(false);
  const deferredLanguagesRef = useRef<TalentLanguageInput[] | null>(null);
  const deferredLanguagesTouchedRef = useRef(false);

  useEffect(() => {
    if (!drawerOpen) return;
    deferredServiceAreaTouchedRef.current = false;
    deferredLanguagesTouchedRef.current = false;
  }, [drawerOpen, payload.talentId]);

  const handleDeferredServiceAreaHydrated = useCallback((value: ServiceAreaDesired) => {
    deferredServiceAreaRef.current = value;
  }, []);
  const handleDeferredServiceAreaChange = useCallback((value: ServiceAreaDesired) => {
    deferredServiceAreaRef.current = value;
    deferredServiceAreaTouchedRef.current = true;
    setDirty(true);
  }, []);
  const handleDeferredLanguagesHydrated = useCallback((languages: TalentLanguageInput[]) => {
    deferredLanguagesRef.current = languages;
  }, []);
  const handleDeferredLanguagesChange = useCallback((languages: TalentLanguageInput[]) => {
    deferredLanguagesRef.current = languages;
    deferredLanguagesTouchedRef.current = true;
    setDirty(true);
  }, []);
  useEffect(() => {
    if (!drawerOpen || mode === "create") return;
    const tid = payload.talentId;
    if (!tid) return;
    allowMarkDirtyRef.current = false;
    setHydratingMedia(true);
    setEditorHydration("loading");
    let cancelled = false;

    // StrictMode-proof: reuse the in-flight fetch on the 2nd invocation
    // instead of refiring. Exactly-once application is still guaranteed
    // by `cancelled` (the first run's cleanup sets it true; the reusing
    // run's stays false and applies the data).
    const { entry: _hy, reused: _reused } = _getEditorHydration(tid, isSelf);
    if (_reused) {
      void improntaLog("admin_talentprofileshelldrawer.info", {
        message: `[editor-loader] duplicate prevented (in-flight reuse) talent=${tid}`,
      });
    } else {
      void improntaLog("admin_talentprofileshelldrawer.info", {
        message: `[hydration] effect start talent=${tid} ts=${Date.now()}`,
      });
    }

    void _hy.media
      .then((mediaRes) => {
        if (cancelled) return;
        setHydratingMedia(false);
        if (!mediaRes.ok) return;

        const s = stateRef.current;

        let albumsPro = s.albumsPro;
        let polaroids = s.polaroids;

        const { gallery, hero, polaroids: polaroidsMap, card } = mediaRes.data;

        if (card?.url) setAvatarPhotoUrl(card.url);
        if (hero?.url) setHeroPhotoUrl(hero.url);

        type AssetWithMeta = import("@/components/talent/media-gallery-drawer").MediaAsset & {
          metadata?: Record<string, unknown>;
        };
        const allAssets: AssetWithMeta[] = [];
        if (card) allAssets.push({ id: card.id, url: card.url, variantKind: "card", sortOrder: 0 });
        if (hero) allAssets.push({ id: hero.id, url: hero.url, variantKind: "hero", sortOrder: 0 });
        for (const g of gallery) {
          allAssets.push({
            id: g.id,
            url: g.url,
            variantKind: "gallery",
            sortOrder: g.sortOrder,
            metadata: g.metadata ?? {},
          });
        }
        setGalleryAssets(allAssets);

        const fallbackAlbumId = s.albumsPro[0]?.id ?? "main";
        const knownIds = new Set(s.albumsPro.map(a => a.id));
        const extraAlbumIds = new Set<string>();
        for (const g of gallery) {
          const aid = (g.metadata?.albumId as string | undefined) ?? fallbackAlbumId;
          if (!knownIds.has(aid)) extraAlbumIds.add(aid);
        }
        const extraAlbums = [...extraAlbumIds].map(id => ({
          id,
          name: id.replace(/-[a-z0-9]{4,}$/, "").replace(/-/g, " ") || "Untitled",
          items: [] as PhotoMeta[],
        }));

        albumsPro = extraAlbums.length > 0 ? [...s.albumsPro, ...extraAlbums] : s.albumsPro;
        polaroids = s.polaroids.map(p => {
          const hit = polaroidsMap[p.id];
          return hit ? { ...p, url: hit.url, mediaAssetId: hit.id } : p;
        });

        patch({ albumsPro, polaroids }, { silent: true });
      })
      .catch(() => {
        if (!cancelled) setHydratingMedia(false);
      });

    // P3 — one coordinated server round trip instead of two independent
    // ones. Returns the identical [edRes, dynRes] tuple so the hydration
    // body below is unchanged; the P2 error/Retry path is the fallback.
    void _hy.editor
      .then(([edRes, dynRes]) => {
        if (cancelled) return;
        const s = stateRef.current;

        if (!edRes.ok) {
          allowMarkDirtyRef.current = true;
          setEditorHydration("error");
          return;
        }

        const d = edRes.data;
        // Multi-tenant identity flags — three fields added by
        // admin-talent-profile-sections.ts. Used by the banner + the future
        // per-field disabled gating. Cast through unknown because the
        // ProfileEditorData expanded type isn't in scope here without a
        // bigger refactor; fields are TS-safe at the source loader.
        setTulalaNativeIdentity(Boolean((d as Record<string, unknown>).tulala_native_identity));
        setPersonalProfileLocked(Boolean((d as Record<string, unknown>).personal_profile_locked));
        setRosterExclusivity(((d as Record<string, unknown>).roster_exclusivity_status as string | null) ?? null);
        const patchPayload: Partial<ProfileState> = {};
        {
          // DB enums use underscores; SelectPicker / ProfileIdentity use slash ids (she/her).
          const DB_PRONOUNS_TO_STATE: Record<string, ProfileIdentity["pronouns"]> = {
            she_her: "she/her",
            he_him: "he/him",
            they_them: "they/them",
            ze_zir: "ze/zir",
            custom: "custom",
          };
          const displayName = ((d.display_name as string | null) ?? "").trim();
          patchPayload.stageName = displayName || s.stageName;
          patchPayload.identity = {
            ...s.identity,
            stageName: displayName || s.identity.stageName,
            firstName: (d.first_name as string | null) ?? s.identity.firstName ?? "",
            lastName: (d.last_name as string | null) ?? s.identity.lastName ?? "",
            legalName: (d.legal_name as string | null) ?? s.identity.legalName ?? "",
            pronouns: d.pronouns ? DB_PRONOUNS_TO_STATE[d.pronouns as string] ?? null : null,
            pronounsCustom: (d.pronouns_custom as string | null) ?? "",
            gender: (d.gender as string | null) as ProfileIdentity["gender"] ?? null,
            dob: (d.date_of_birth as string | null) ?? null,
            ageDisplay: (d.age_display_mode as ProfileIdentity["ageDisplay"]) ?? "range",
            nationality: (d.nationality as string | null) ?? s.identity.nationality,
            homeCountry: (d.home_country_text as string | null) ?? s.identity.homeCountry ?? "",
            responseTime: (d.response_time as ProfileIdentity["responseTime"]) ?? s.identity.responseTime,
            visibility: (d.field_visibility as ProfileIdentity["visibility"]) ?? s.identity.visibility,
            contactEmail: ((d.invitation_email as string | null) ?? "").trim(),
            ...splitShellContactPhone((d.phone as string | null) ?? null),
          };
        }
        const shellVideos = extractShellVideoUrls(d.embedded_media);
        if (shellVideos.length > 0) patchPayload.videoLinks = shellVideos;
        const shellWa = findShellWhatsappHref(d.social_links);
        if (shellWa && patchPayload.identity) {
          const withPlus = shellWa.startsWith("+") ? shellWa : `+${shellWa}`;
          const wp = splitShellContactPhone(withPlus);
          patchPayload.identity = {
            ...patchPayload.identity,
            whatsapp: wp.contactPhone,
            whatsappPrefix: wp.contactPhonePrefix,
          };
        }
        const shellBiz = findShellBusinessLine(d.social_links);
        if (shellBiz && patchPayload.identity) {
          patchPayload.identity = { ...patchPayload.identity, businessLine: shellBiz };
        }
        if (d.bios && d.bios.length > 0) patchPayload.bios = d.bios as LocaleBio[];
        if (d.bio_tone) patchPayload.bioTone = d.bio_tone as BioTone;
        if (d.tagline) patchPayload.tagline = d.tagline;
        if (
          d.personality_traits &&
          typeof d.personality_traits === "object" &&
          !Array.isArray(d.personality_traits)
        ) {
          // Seeded/legacy rows store `personality_traits` as `[]` or an
          // object lacking loves/avoids; `typeof [] === "object"` so the
          // old check let that clobber the safe { loves:[], avoids:[] }
          // default → ChipsInput crash. Normalize: keep arrays, default
          // missing sides to [].
          const pt = d.personality_traits as Partial<Personality>;
          patchPayload.personality = {
            loves: Array.isArray(pt.loves) ? pt.loves : [],
            avoids: Array.isArray(pt.avoids) ? pt.avoids : [],
          };
        }
        if (d.home_city_text || d.upcoming_visits) {
          patchPayload.serviceArea = {
            ...s.serviceArea,
            homeBase: d.home_city_text ?? s.serviceArea.homeBase,
            homePlaceId: (d.home_place_id as string | undefined) ?? s.serviceArea.homePlaceId,
            travelKm: d.travel_radius_km ?? s.serviceArea.travelKm,
            travelFee: d.travel_fee_required,
            remoteOnly: d.remote_only,
            passport: (d.passport_status as ServiceArea["passport"]) ?? s.serviceArea.passport,
            driversLicense: (d.drivers_license as ServiceArea["driversLicense"]) ?? s.serviceArea.driversLicense,
            workEligibility: Array.isArray(d.work_eligibility) ? (d.work_eligibility as string[]) : s.serviceArea.workEligibility,
            upcomingVisits: Array.isArray(d.upcoming_visits) ? (d.upcoming_visits as ServiceArea["upcomingVisits"]) : s.serviceArea.upcomingVisits,
          };
        }
        if (Array.isArray(d.rates_data) && d.rates_data.length > 0) patchPayload.rates = d.rates_data as ProfileState["rates"];
        if (Array.isArray(d.rate_tiers_data) && d.rate_tiers_data.length > 0) {
          patchPayload.rateTiers = d.rate_tiers_data as ProfileState["rateTiers"];
        }
        if (Array.isArray(d.package_rates_data) && d.package_rates_data.length > 0) {
          patchPayload.packageRates = d.package_rates_data as ProfileState["packageRates"];
        }
        if (d.rate_card_visibility) patchPayload.rateCardVisibility = d.rate_card_visibility as ProfileState["rateCardVisibility"];
        patchPayload.askForQuote = d.ask_for_quote;
        patchPayload.travelIncluded = d.travel_included;
        patchPayload.lodgingIncluded = d.lodging_included;
        if (Array.isArray(d.credits_data) && d.credits_data.length > 0) patchPayload.credits = d.credits_data as ProfileState["credits"];
        if (d.limits_data && typeof d.limits_data === "object" && !Array.isArray(d.limits_data)) {
          patchPayload.limits = limitsDataToEntries(d.limits_data) as ProfileState["limits"];
        }
        if (Array.isArray(d.social_proof_data) && d.social_proof_data.length > 0) {
          patchPayload.pastClients = d.social_proof_data as ProfileState["pastClients"];
        }
        if (d.availability_data && typeof d.availability_data === "object") {
          const av = d.availability_data as {
            cells?: unknown[];
            recurring?: unknown;
            vacation?: unknown;
            seasonalWindows?: ProfileState["seasonalWindows"];
          };
          if (Array.isArray(av.cells)) patchPayload.availability = av.cells as ProfileState["availability"];
          if (av.recurring) patchPayload.recurring = av.recurring as ProfileState["recurring"];
          if (av.vacation) patchPayload.vacation = av.vacation as ProfileState["vacation"];
          if (Array.isArray(av.seasonalWindows)) patchPayload.seasonalWindows = av.seasonalWindows;
        }
        if (d.internal_notes) patchPayload.internalNotes = d.internal_notes;
        if (d.emergency_contact && typeof d.emergency_contact === "object") {
          patchPayload.emergencyContact = d.emergency_contact as ProfileState["emergencyContact"];
        }
        if (d.field_locks_data && typeof d.field_locks_data === "object") {
          const fl = d.field_locks_data as { locks?: unknown[]; reasons?: Record<string, string> };
          if (Array.isArray(fl.locks)) patchPayload.fieldLocks = fl.locks as ProfileState["fieldLocks"];
          if (fl.reasons) patchPayload.fieldLockReasons = fl.reasons;
        }
        patchPayload.featureInDirectory = d.feature_in_directory;
        if (typeof d.is_discoverable === "boolean") {
          patchPayload.isDiscoverable = d.is_discoverable;
        }

        if (Array.isArray(d.media_albums_data) && d.media_albums_data.length > 0) {
          const saved = (d.media_albums_data as { id: string; name: string; sortOrder?: number }[])
            .slice()
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
          const itemsByAlbum = new Map(s.albumsPro.map(a => [a.id, a.items]));
          patchPayload.albumsPro = saved.map(sv => ({
            id: sv.id,
            name: sv.name,
            items: itemsByAlbum.get(sv.id) ?? [],
          }));
        }

        if (Array.isArray(d.documents_data) && d.documents_data.length > 0) {
          patchPayload.files = d.documents_data.map(doc => ({
            id: doc.id,
            name: doc.name,
            kind: doc.kind,
            sizeBytes: doc.sizeBytes,
            uploadedAt: doc.uploadedAt,
            storagePath: doc.storagePath,
            bucketId: doc.bucketId,
            mimeType: doc.mimeType,
          }));
        }

        if (d.updated_at) {
          const ms = Date.parse(d.updated_at);
          if (!Number.isNaN(ms)) setServerProfileUpdatedAtMs(ms);
        }

        patchPayload.profileStatus = dbToUiProfileShellStatus(
          d.workflow_status as string | null,
          d.visibility as string | null,
        );
        patchPayload.primaryType = d.shell_primary_talent_slug;
        patchPayload.secondaryTypes = d.shell_secondary_talent_slugs ?? [];

        if (dynRes.ok && Object.keys(dynRes.values).length > 0) {
          patchPayload.dynFields = { ...s.dynFields, ...dynRes.values };
        }

        patch(patchPayload, { silent: true });
        allowMarkDirtyRef.current = true;
        setEditorHydration("loaded");
      })
      .catch(() => {
        if (!cancelled) {
          allowMarkDirtyRef.current = true;
          setEditorHydration("error");
        }
      });
    return () => {
      cancelled = true;
      void improntaLog("admin_talentprofileshelldrawer.info", {
        message: `[hydration] effect cleanup talent=${tid}`,
      });
      // No ref-nulling here: dedupe is the module in-flight cache, not
      // this ref (nulling it here is exactly what let StrictMode double
      // fire). The in-flight entry self-evicts on settle.
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only retrigger on the listed identity/mode signals; omitted helpers are stable server-action refs
  }, [drawerOpen, mode, payload.talentId, isSelf, hydrationNonce]);

  // Keep albumsPro photo lists in sync with galleryAssets. Without this,
  // photos uploaded/deleted via MediaGalleryDrawer after the drawer opens
  // would update the gallery but leave the Albums section showing stale
  // counts (Main · 0). Runs whenever the gallery list changes — including
  // the initial bundle hydration above.
  useEffect(() => {
    const galleryItems = galleryAssets.filter(a => a.variantKind === "gallery");
    if (galleryItems.length === 0) return; // don't wipe albums on empty initial state
    const fallbackAlbumId = stateRef.current.albumsPro[0]?.id ?? "main";
    const byAlbum = new Map<string, PhotoMeta[]>();
    for (const g of galleryItems) {
      const meta = (g as { metadata?: Record<string, unknown> }).metadata;
      const aid = (meta?.albumId as string | undefined) ?? fallbackAlbumId;
      const list = byAlbum.get(aid) ?? [];
      list.push({ url: g.url, mediaAssetId: g.id });
      byAlbum.set(aid, list);
    }
    const updatedAlbums = stateRef.current.albumsPro.map(a =>
      byAlbum.has(a.id)
        ? { ...a, items: byAlbum.get(a.id)! }
        : a.id === fallbackAlbumId
          ? { ...a, items: byAlbum.get(fallbackAlbumId) ?? [] }
          : a
    );
    patch({ albumsPro: updatedAlbums }, { silent: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- stateRef.current reads fresh state at call time; patch is a stable callback; only galleryAssets changes should trigger this sync
  }, [galleryAssets]);

  // Prefetch skills data as soon as the drawer opens so the Services tab loads
  // from cache instead of waiting for a live server action call.
  useEffect(() => {
    const tid = payload.talentId;
    if (!tid || !bridgeTenantIdentity?.tenantId) return;
    prefetchSkillsData(tid);
    prefetchContextsData(tid);
    prefetchLanguagesData(tid);
  }, [payload.talentId, bridgeTenantIdentity?.tenantId]);

  // ── Save-button architecture ─────────────────────────────────────────────
  // Option A — explicit header Save for all text/select/profile slices.
  // Location + language slot panels run in `deferred` mode (local state
  // only until Save). Photo upload/delete/reorder still commit on intent.
  // stateRef is declared above (near the media hydration block) — saveAll
  // reads from it so we can keep `state` out of this callback's dep array.

  const saveAll = React.useCallback(async (): Promise<boolean> => {
    let tid = payload.talentId;
    /** First save in `create` mode — row minted this click; fall through to
     *  commitTalentProfileShellAdmin so identity/location/bio/etc. persist. */
    let justCreated = false;

    // ── Create-mode bridge ─────────────────────────────────────────────
    // The drawer is now also the "Add talent" entry point. When opened in
    // `create` mode with no talentId, the first save inserts the row via
    // `addTalentToRoster` (same server action the QuickAdd used), then
    // commits the full drawer state in the same click, then transitions to
    // `edit-admin` mode with the new id.
    if (!tid && mode === "create" && !isSelf) {
      if (!tenantSlug) {
        setSaveError(copy.t("No workspace context."));
        setSaveStatus("error");
        return false;
      }
      const s = stateRef.current;
      const stageName = (s.stageName ?? s.identity?.stageName ?? "").trim();
      const homeBase = (s.serviceArea?.homeBase ?? "").trim();
      const primaryType = s.primaryType ?? null;
      // Same minimum gate as the legacy QuickAdd drawer (`minimumValid`
      // in new-talent-drawer.tsx) — admins know they need name + primary
      // type + home base to mint a profile.
      if (!stageName) {
        setSaveError(copy.t("Add a stage / professional name first."));
        setSaveStatus("error");
        return false;
      }
      if (!primaryType) {
        setSaveError(copy.t("Pick a primary talent type to continue."));
        setSaveStatus("error");
        return false;
      }
      if (!homeBase) {
        setSaveError(copy.t("Enter a home base to continue."));
        setSaveStatus("error");
        return false;
      }
      setSaveStatus("saving");
      setSaveError(null);
      // Derive first/last from the explicit identity fields if filled,
      // otherwise split the stage name as a best-effort fallback.
      const explicitFirst = (s.identity?.firstName ?? "").trim();
      const explicitLast = (s.identity?.lastName ?? "").trim();
      const stageParts = stageName.split(/\s+/);
      const firstName = explicitFirst || (stageParts[0] ?? "");
      const lastName = explicitLast || stageParts.slice(1).join(" ");
      const email = (s.identity?.contactEmail ?? "").trim();
      const phone = (s.identity?.contactPhone ?? "").trim();
      const createRes = await addTalentToRoster({
        tenantSlug,
        firstName,
        lastName,
        displayName: stageName,
        email,
        phone,
        homeBase,
        primaryTypeSlugorId: primaryType,
        secondaryTypeSlugorIds: s.secondaryTypes ?? [],
        managementMethod: "agency",
      });
      if (!createRes.ok || !createRes.talentProfileId) {
        // ActionResult is a discriminated union — inside this OR-guard
        // TS can't narrow to the !ok branch, so use the `in` operator.
        const createErr = "error" in createRes ? createRes.error : null;
        setSaveError(createErr ?? copy.t("Could not create the talent profile."));
        setSaveStatus("error");
        return false;
      }
      tid = createRes.talentProfileId;
      justCreated = true;
      // Fall through — commitTalentProfileShellAdmin runs below with `tid`
      // so nationality, bio, logistics, dyn fields, etc. persist on the
      // first click (not only the minimal addTalentToRoster columns).
    }

    if (!tid) {
      setSaveError(copy.t("No talent context yet — finish creating first."));
      setSaveStatus("error");
      return false;
    }
    setSaveStatus("saving");
    setSaveError(null);

    try {
    const PRONOUNS_TO_DB: Record<string, "she_her" | "he_him" | "they_them" | "ze_zir" | "custom"> = {
      "she/her": "she_her",
      "he/him": "he_him",
      "they/them": "they_them",
      "ze/zir": "ze_zir",
      custom: "custom",
      she_her: "she_her",
      he_him: "he_him",
      they_them: "they_them",
      ze_zir: "ze_zir",
    };

    const s = stateRef.current;
    const useCanonicalDeferredPanels = !!(bridgeTenantIdentity?.tenantId && tid) && !justCreated;
    const shellSyncTaxonomy = adminVisible && !isSelf && !!tid;
    const id = s.identity;
    const visibilityDraft = id.visibility;
    const visibilityPatch = visibilityDraft && (visibilityDraft.legalName || visibilityDraft.pronouns || visibilityDraft.gender || visibilityDraft.dob)
      ? {
          legalName: [...(visibilityDraft.legalName ?? ["agency"])],
          pronouns: [...(visibilityDraft.pronouns ?? ["agency"])],
          gender: [...(visibilityDraft.gender ?? ["agency"])],
          dob: [...(visibilityDraft.dob ?? ["agency"])],
        }
      : undefined;

    const identityPayload = {
      talent_profile_id: tid,
      stage_name: id.stageName,
      first_name: id.firstName ?? "",
      last_name: id.lastName ?? "",
      legal_name: id.legalName || ((id.firstName || id.lastName) ? `${id.firstName ?? ""} ${id.lastName ?? ""}`.trim() : ""),
      pronouns: id.pronouns ? PRONOUNS_TO_DB[id.pronouns] ?? null : null,
      pronouns_custom: id.pronounsCustom ?? "",
      gender: id.gender ?? "",
      date_of_birth: id.dob ?? "",
      age_display_mode:
        id.ageDisplay === "exact" || id.ageDisplay === "range" || id.ageDisplay === "hidden" ? id.ageDisplay : undefined,
      nationality: id.nationality ?? "",
      home_country: id.homeCountry ?? "",
      response_time:
        id.responseTime === "1h" || id.responseTime === "4h" || id.responseTime === "24h" || id.responseTime === "48h"
          ? id.responseTime
          : null,
      is_discoverable: s.isDiscoverable,
      field_visibility: visibilityPatch,
      contact_email: id.contactEmail ?? "",
      contact_phone: id.contactPhone ?? "",
      contact_phone_prefix: id.contactPhonePrefix ?? "+1",
    };

    const aboutPayload = {
      talent_profile_id: tid,
      bios: s.bios.map(b => ({ locale: b.locale, text: b.text })),
      bio_tone: s.bioTone ?? null,
      personality_traits: s.personality ?? [],
      tagline: s.tagline ?? null,
    };

    const sa = s.serviceArea;
    const locationPayload = {
      talent_profile_id: tid,
      home_base: sa.homeBase || null,
      home_place_id: sa.homePlaceId ?? null,
      travel_radius_km: sa.travelKm ?? null,
      travel_fee_required: sa.travelFee ?? false,
      remote_only: sa.remoteOnly ?? false,
      passport_status: (sa.passport as "valid" | "expired" | "none" | undefined) ?? null,
      drivers_license: (sa.driversLicense as "none" | "standard" | "international" | "commercial" | undefined) ?? null,
      work_eligibility: sa.workEligibility ?? [],
      upcoming_visits: (sa.upcomingVisits ?? []).map(v => ({
        id: v.id, city: v.city, placeId: v.placeId, date: v.date, dateEnd: v.dateEnd,
      })),
    };

    const ratesPayload = {
      talent_profile_id: tid,
      rates_data: s.rates.map(r => ({ typeId: r.typeId, amount: r.amount, currency: r.currency, unit: r.unit })),
      rate_tiers_data: s.rateTiers,
      package_rates_data: s.packageRates.map(p => ({ id: p.id, name: p.name, description: p.description, amount: p.amount, currency: p.currency })),
      rate_card_visibility: s.rateCardVisibility as "public" | "agency-only" | "on-request",
      ask_for_quote: s.askForQuote,
      travel_included: s.travelIncluded,
      lodging_included: s.lodgingIncluded,
    };

    const availPayload = {
      talent_profile_id: tid,
      availability_data: {
        cells: s.availability,
        recurring: s.recurring,
        vacation: s.vacation,
        seasonalWindows: s.seasonalWindows,
      },
    };

    const langsPayload = {
      talent_profile_id: tid,
      languages: s.languages.map(l => ({
        language: l.language,
        level: l.level,
        canHost: (l as { canHost?: boolean }).canHost,
        canSell: (l as { canSell?: boolean }).canSell,
        canTranslate: (l as { canTranslate?: boolean }).canTranslate,
        canTeach: (l as { canTeach?: boolean }).canTeach,
      })),
    };

    const creditsPayload = {
      talent_profile_id: tid,
      credits_data: s.credits.map(c => ({ id: c.id, brand: c.brand, type: c.type, credit: c.credit, role: c.role, year: c.year, pinned: c.pinned })),
    };

    const limitsRows: ShellLimitsEntry[] = Array.isArray(s.limits) && (s.limits.length === 0 || "enforcement" in s.limits[0])
      ? (s.limits as ShellLimitsEntry[])
      : limitsDataToEntries(s.limits as unknown);
    const limitsPayload = {
      talent_profile_id: tid,
      limits_data: limitsEntriesToData(limitsRows),
    };

    const socialPayload = {
      talent_profile_id: tid,
      social_proof_data: s.pastClients.map(c => ({ id: c.id, name: c.name, testimonial: c.testimonial, testimonialBy: c.testimonialBy, verified: c.verified })),
    };

    const rosterMetaPayload = {
      talent_profile_id: tid,
      internal_notes: s.internalNotes || null,
      emergency_contact: s.emergencyContact as { name: string; relation: string; phone: string },
      field_locks_data: { locks: s.fieldLocks as string[], reasons: s.fieldLockReasons as Record<string, string> },
      feature_in_directory: s.featureInDirectory,
    };

    // Albums — id + name + ordering only. Photos are tied to albums by
    // metadata.albumId and persist independently via actionUploadAndAssignMedia.
    const albumsPayload = {
      talent_profile_id: tid,
      albums: s.albumsPro.map((a, i) => ({ id: a.id, name: a.name, sortOrder: i })),
    };

    // Documents — metadata only. Files themselves are uploaded on pick to
    // the private media-originals bucket. We persist the list of refs so
    // the row reappears with download links on next load. Skip rows that
    // are still mid-upload (no storagePath yet).
    const documentsPayload = {
      talent_profile_id: tid,
      documents: s.files
        .filter(f => !!f.storagePath && !!f.bucketId && !f.uploading)
        .map(f => ({
          id: f.id,
          name: f.name,
          kind: f.kind,
          storagePath: f.storagePath!,
          bucketId: f.bucketId!,
          sizeBytes: f.sizeBytes ?? 0,
          mimeType: f.mimeType,
          uploadedAt: f.uploadedAt,
        })),
    };

    // Agency roster edit: explicit Save runs profile batch + deferred slices.
    if (adminVisible && !isSelf) {
      const saveSteps: {
        section: string;
        run: () => Promise<ProfileShellSaveStepResult>;
      }[] = [
        {
          section: "Profile",
          run: async () => {
            const batchRes = await commitTalentProfileShellAdmin({
              talent_profile_id: tid,
              identity: identityPayload,
              about: {
                bios: aboutPayload.bios,
                bio_tone: aboutPayload.bio_tone,
                personality_traits: aboutPayload.personality_traits,
                tagline: aboutPayload.tagline,
              },
              location: {
                home_base: locationPayload.home_base,
                home_place_id: locationPayload.home_place_id,
                travel_radius_km: locationPayload.travel_radius_km,
                travel_fee_required: locationPayload.travel_fee_required,
                remote_only: locationPayload.remote_only,
                passport_status: locationPayload.passport_status,
                drivers_license: locationPayload.drivers_license,
                work_eligibility: locationPayload.work_eligibility,
                upcoming_visits: locationPayload.upcoming_visits,
              },
              rates: {
                rates_data: ratesPayload.rates_data,
                package_rates_data: ratesPayload.package_rates_data,
                rate_tiers_data: ratesPayload.rate_tiers_data,
                rate_card_visibility: ratesPayload.rate_card_visibility,
                ask_for_quote: ratesPayload.ask_for_quote,
                travel_included: ratesPayload.travel_included,
                lodging_included: ratesPayload.lodging_included,
              },
              shell_sync_taxonomy: shellSyncTaxonomy,
              skip_languages: useCanonicalDeferredPanels,
              skip_service_areas: useCanonicalDeferredPanels,
              shell_primary_talent_slug: s.primaryType,
              shell_secondary_talent_slugs: s.secondaryTypes,
              shell_profile_status: s.profileStatus,
              availability: { availability_data: availPayload.availability_data },
              languages: { languages: langsPayload.languages },
              credits: { credits_data: creditsPayload.credits_data },
              limits: { limits_data: limitsPayload.limits_data },
              social: { social_proof_data: socialPayload.social_proof_data },
              albums: { albums: albumsPayload.albums },
              documents: { documents: documentsPayload.documents },
              rosterMeta: {
                internal_notes: rosterMetaPayload.internal_notes,
                emergency_contact: rosterMetaPayload.emergency_contact,
                field_locks_data: rosterMetaPayload.field_locks_data,
                feature_in_directory: rosterMetaPayload.feature_in_directory,
              },
              dyn_fields: s.dynFields,
              profileDrawerExtras: {
                videoLinks: s.videoLinks,
                whatsapp: s.identity.whatsapp ?? "",
                whatsappPrefix: s.identity.whatsappPrefix ?? "+1",
                businessLine: s.identity.businessLine ?? "",
              },
            });
            return batchRes.ok ? { ok: true as const } : { ok: false as const, error: batchRes.error };
          },
        },
      ];

      if (useCanonicalDeferredPanels && deferredServiceAreaTouchedRef.current && deferredServiceAreaRef.current) {
        const area = deferredServiceAreaRef.current;
        saveSteps.push({
          section: "Location",
          run: async () => {
            const res = await saveTalentServiceAreas({
              talent_profile_id: tid,
              home_base_location_id: area.homeBase?.id ?? null,
              travel_to_location_ids: area.travelTo.map((c) => c.id),
              travel_radius_km: area.travelRadiusKm,
              travel_fee_required: area.travelFeeRequired,
              remote_only: area.remoteOnly,
            });
            return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
          },
        });
      }

      if (useCanonicalDeferredPanels && deferredLanguagesTouchedRef.current && deferredLanguagesRef.current) {
        saveSteps.push({
          section: "Languages",
          run: async () => {
            const res = await setTalentLanguages({
              talent_profile_id: tid,
              languages: deferredLanguagesRef.current!.map((l, i) => ({
                ...l,
                display_order: i,
              })),
            });
            return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
          },
        });
      }

      const stepped = await runProfileShellSaveSteps(saveSteps);
      if (!stepped.ok) {
        setSaveStatus("error");
        setSaveError(formatProfileShellSaveFailures(stepped.failures));
        void improntaLog("admin_talentprofileshelldrawer.error", {
          message: "[saveAll] stepped:",
          failures: stepped.failures.join(", "),
        });
        return false;
      }
      if (justCreated) {
        clearProfileDraft("default");
        openDrawer("talent-profile-shell", {
          mode: "edit-admin",
          talentId: tid,
        });
      }
      deferredServiceAreaTouchedRef.current = false;
      deferredLanguagesTouchedRef.current = false;
      setDirty(false);
      setServerProfileUpdatedAtMs(Date.now());
      setSaveStatus("saved");
      setSaveError(null);
      setSavedAt(new Date());
      if (savedStatusResetTimerRef.current) clearTimeout(savedStatusResetTimerRef.current);
      savedStatusResetTimerRef.current = setTimeout(() => {
        setSaveStatus("idle");
        savedStatusResetTimerRef.current = null;
      }, 2800);
      startTransition(() => {
        queueShellRouterRefresh();
      });
      return true;
    }

    const profileDrawerExtrasPayload = {
      talent_profile_id: tid,
      videoLinks: s.videoLinks,
      whatsapp: s.identity.whatsapp ?? "",
      whatsappPrefix: s.identity.whatsappPrefix ?? "+1",
      businessLine: s.identity.businessLine ?? "",
    };

    // Talent self-edit: still uses per-section actions (separate auth model).
    const ops: Array<Promise<{ ok: true } | { ok: false; error: string }>> = [
      updateSelfIdentity(identityPayload),
      updateSelfProfileDrawerExtras(profileDrawerExtrasPayload),
      updateSelfAbout(aboutPayload),
      updateSelfLocation(locationPayload),
      updateSelfRates(ratesPayload),
      updateSelfAvailability(availPayload),
      saveSelfLanguages(langsPayload),
      updateSelfCredits(creditsPayload),
      updateSelfLimits(limitsPayload),
      updateSelfSocialProof(socialPayload),
      updateSelfMediaAlbums({ talent_profile_id: tid, albums: albumsPayload.albums }),
      updateSelfTalentDocuments({ talent_profile_id: tid, documents: documentsPayload.documents }),
      updateSelfProfileShellDynFields({ talent_profile_id: tid, dyn_fields: s.dynFields }),
      updateSelfProfileWorkflowFromShell({ talent_profile_id: tid, profile_status: s.profileStatus }),
    ];

    const labels = [
      "Identity",
      "Media & contact links",
      "About",
      "Location",
      "Rates",
      "Availability",
      "Languages",
      "Credits",
      "Limits",
      "Social proof",
      "Portfolio albums",
      "Documents",
      "Profile fields",
      "Profile status",
    ];
    const results = await Promise.all(ops);

    const failures = results
      .map((r, i) => (!r.ok ? `${labels[i]}: ${r.error}` : null))
      .filter((x): x is string => x !== null);

    if (failures.length > 0) {
      setSaveStatus("error");
      setSaveError(failures.join(" · "));
      void improntaLog("admin_talentprofileshelldrawer.error", {
        message: "[saveAll] failures:",
        failures: failures.join(", "),
      });
      return false;
    }

    if (shellSyncTaxonomy) {
      const taxRes = await syncSelfTalentTypeTaxonomyFromShell({
        talent_profile_id: tid,
        primary_slug: s.primaryType,
        secondary_slugs: s.secondaryTypes,
      });
      if (!taxRes.ok) {
        setSaveStatus("error");
        setSaveError(taxRes.error);
        void improntaLog("admin_talentprofileshelldrawer.error", {
          message: "[saveAll] taxonomy:",
          taxRes: taxRes.error,
        });
        return false;
      }
    }

    setDirty(false);
    setServerProfileUpdatedAtMs(Date.now());
    setSaveStatus("saved");
    setSaveError(null);
    setSavedAt(new Date());
    if (savedStatusResetTimerRef.current) clearTimeout(savedStatusResetTimerRef.current);
    savedStatusResetTimerRef.current = setTimeout(() => {
      setSaveStatus("idle");
      savedStatusResetTimerRef.current = null;
    }, 2800);
    startTransition(() => {
      queueShellRouterRefresh();
    });
    return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setSaveStatus("error");
      setSaveError(msg);
      logServerError("saveall", e);
      return false;
    }
  }, [payload.talentId, mode, isSelf, adminVisible, queueShellRouterRefresh, copy, bridgeTenantIdentity, tenantSlug, openDrawer]);

  const toggleSet = (field: "secondaryTypes" | "specialties" | "contexts" | "aspirations") =>
    (value: string) => {
      if (allowMarkDirtyRef.current) setDirty(true);
      dispatch({ type: "TOGGLE_SET", field, value });
    };
  const setSkill = (skillId: string, proficiency: SkillProficiency | null) => {
    if (allowMarkDirtyRef.current) setDirty(true);
    dispatch({ type: "SET_SKILL", skillId, proficiency });
  };

  // ── UI state ───────────────────────────────────────────────────────
  // Counts surfaced by LiveCategoryFieldsEditor — used by sectionComplete
  // / sectionStarted to color the rail dot for the "Profile fields" entry.
  // Updated via the editor's onCountsChange callback (initial load + saves).
  const [profileFieldCounts, setProfileFieldCounts] = useState<{ filled: number; total: number }>(
    { filled: 0, total: 0 },
  );
  const [profileFieldNavGroups, setProfileFieldNavGroups] = useState<LiveCategoryGroupNavItem[]>([]);
  const [profileFieldRequiredMissing, setProfileFieldRequiredMissing] = useState<LiveCategoryRequiredMissingItem[]>([]);
  const [profileFieldAllFields, setProfileFieldAllFields] = useState<ResolvedField[]>([]);
  const [activeProfileFieldGroupKey, setActiveProfileFieldGroupKey] = useState<string | null>(null);
  const [profileFieldRailOpen, setProfileFieldRailOpen] = useState(false);
  // Bumped only AFTER a taxonomy assign/remove server action resolves, so
  // Specialty details re-resolves exactly when the DB write is committed
  // — no blind debounce, no read-stale race.
  const [taxonomyVersion, setTaxonomyVersion] = useState(0);
  // #3 — Deep-link hydration. URL ?section=availability lands directly
  // on the Availability accordion, scrolled into view + expanded.
  // Falls back to "identity" (Stage / professional name) for all modes unless
  // payload.section or ?section= overrides.
  const [historyOpen, setHistoryOpen] = useState(false);
  const hasResolvedEngineContext = !!payload.talentId && (!!bridgeTenantIdentity?.tenantId || isSelf);
  const selectedTalentTypeSlugs = useMemo(
    () => [state.primaryType, ...state.secondaryTypes].filter((slug): slug is string => Boolean(slug)),
    [state.primaryType, state.secondaryTypes],
  );
  const resolvedProfileFieldKeys = useMemo(
    () => profileFieldAllFields.map((field) => field.field_key),
    [profileFieldAllFields],
  );
  const showPolaroidsSection = shouldShowPolaroidsSection({
    selectedTypeSlugs: selectedTalentTypeSlugs,
    newEngineActive: hasResolvedEngineContext,
    resolvedFieldKeys: hasResolvedEngineContext ? resolvedProfileFieldKeys : null,
  });
  const [activeSection, setActiveSection] = useState<ProfileSectionId>(() => {
    // Resolution order: payload.section (drawer caller) → URL ?section=X
    // (deep-link / refresh) → mode default. The payload path is what the
    // talent's MyProfilePage uses to deep-link into the right card —
    // every dashboard tile passes section: "services" / "rates" / etc.
    const fromPayload = payload.section;
    if (fromPayload && (PROFILE_SECTIONS as readonly string[]).includes(fromPayload)) {
      return fromPayload as ProfileSectionId;
    }
    if (typeof window === "undefined") return "identity";
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("section");
    if (fromUrl && (PROFILE_SECTIONS as readonly string[]).includes(fromUrl)) {
      return fromUrl as ProfileSectionId;
    }
    return "identity";
  });
  // Scroll the section into view after the accordion expands
  useEffect(() => {
    if (!drawerOpen || !activeSection) return;
    let followup: ReturnType<typeof setTimeout> | null = null;
    const scrollToActiveSection = () => {
      const useMediaAnchor =
        activeSection === "media"
        || activeSection === "albums"
        || activeSection === "polaroids";
      const selector = useMediaAnchor
        ? "[data-tulala-pshell] [data-pshell-media-start]"
        : `[data-tulala-pshell] #pshell-${activeSection}`;
      const el = document.querySelector(selector);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const t = setTimeout(() => {
      scrollToActiveSection();
      // Media's top block can shift slightly after image/layout hydration.
      // Run one follow-up nudge so "Media" reliably lands on photos first.
      if (activeSection === "media" || activeSection === "albums" || activeSection === "polaroids") {
        followup = setTimeout(scrollToActiveSection, 140);
      }
    }, 80);
    return () => {
      clearTimeout(t);
      if (followup) clearTimeout(followup);
    };
  }, [drawerOpen, activeSection]);
  useEffect(() => {
    if (!showPolaroidsSection && activeSection === "polaroids") {
      setActiveSection("media");
    }
  }, [activeSection, showPolaroidsSection]);
  useEffect(() => {
    if (profileFieldNavGroups.length === 0) {
      if (activeProfileFieldGroupKey !== null) setActiveProfileFieldGroupKey(null);
      return;
    }
    if (
      !activeProfileFieldGroupKey
      || !profileFieldNavGroups.some((group) => group.key === activeProfileFieldGroupKey)
    ) {
      setActiveProfileFieldGroupKey(profileFieldNavGroups[0]?.key ?? null);
    }
  }, [profileFieldNavGroups, activeProfileFieldGroupKey]);
  useEffect(() => {
    if (activeSection === "profile_fields" && profileFieldNavGroups.length > 0) {
      setProfileFieldRailOpen(true);
    }
  }, [activeSection, profileFieldNavGroups.length]);
  const activeProfileFieldGroup = useMemo(() => {
    if (profileFieldNavGroups.length === 0) return null;
    return profileFieldNavGroups.find((group) => group.key === activeProfileFieldGroupKey)
      ?? profileFieldNavGroups[0]
      ?? null;
  }, [profileFieldNavGroups, activeProfileFieldGroupKey]);
  const profileFieldHeaderTitle = activeProfileFieldGroup?.label ?? "Details";
  const profileFieldHeaderDescription = activeProfileFieldGroup
    ? detailsGroupHelperText(activeProfileFieldGroup.label)
    : selectedTalentTypeSlugs.length > 0
      ? "No extra fields are configured for this type."
      : "Select a talent type in Services to see relevant fields.";
  const [refinementTab, setRefinementTab] = useState<"skills" | "contexts">("skills");
  const [viewAsClient, setViewAsClient] = useState(false);

  // (Required-coach autofocus uses [data-pshell-field] querySelector)

  // ── Plan filter + live taxonomy ───────────────────────────────────
  // PR-A — picker source comes from taxonomy_terms (parent_category +
  // talent_type). Workspace-enabled subset + plan tier still apply.
  const liveTax = useLiveTaxonomy();
  const [showMoreParents, setShowMoreParents] = useState(false);
  const planRank = (p: "free" | "studio" | "agency" | "network") =>
    ({ free: 0, studio: 1, agency: 2, network: 3 } as const)[p];
  const currentRank = planRank(protoState.plan as "free" | "studio" | "agency" | "network");

  // Live mode: load this tenant's enabled-taxonomy set from the DB. When
  // present we filter by allow_as_primary on the real overlay, instead
  // of the WORKSPACE_TAXONOMY_DEFAULT fixture. Falls back to the fixture
  // when not on a real tenant. (bridgeTenantIdentity is destructured from
  // useAdminShell at the top of TalentProfileShellDrawer.)
  const [liveEnabledPrimaryIds, setLiveEnabledPrimaryIds] = useState<Set<string> | null>(null);
  const [liveEnabledPrimarySlugs, setLiveEnabledPrimarySlugs] = useState<Set<string>>(new Set());
  // Phase 2b — parallel set keyed by SECONDARY allowance, walked across the
  // ENTIRE tree (not just the top level) because secondary chips render
  // talent_type leaves (children of parent_category / category_group, see
  // use-taxonomy.ts → toDisplay()). When a leaf's tenant overlay says
  // `is_enabled=false` OR `allow_as_secondary=false`, that chip should
  // fade in the SiblingTopNPicker. Identical default-true semantics to
  // the primary path: when no overlay row exists the leaf stays enabled.
  const [liveEnabledSecondarySlugs, setLiveEnabledSecondarySlugs] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!bridgeTenantIdentity?.tenantId) return;
    let cancelled = false;
    getEnabledTaxonomyTree().then((res) => {
      if (cancelled || !res.ok) return;
      const ids = new Set<string>();
      const slugs = new Set<string>();
      const secondarySlugs = new Set<string>();
      // Walk the full tree depth-first — parents AND every child level —
      // so we capture talent_type leaves (level 3) as well as the
      // category_group / parent_category levels above.
      const walk = (nodes: typeof res.tree): void => {
        for (const n of nodes) {
          if (n.is_enabled && n.allow_as_primary) {
            ids.add(n.id);
            slugs.add(n.slug);
          }
          if (n.is_enabled && n.allow_as_secondary) {
            secondarySlugs.add(n.slug);
          }
          if (n.children?.length) walk(n.children);
        }
      };
      walk(res.tree);
      setLiveEnabledPrimaryIds(ids);
      setLiveEnabledPrimarySlugs(slugs);
      setLiveEnabledSecondarySlugs(secondarySlugs);
    });
    return () => { cancelled = true; };
  }, [bridgeTenantIdentity?.tenantId]);

  const fixtureAllowedParentIds = new Set(
    WORKSPACE_TAXONOMY_DEFAULT
      .filter(s => s.isEnabled && s.showInRegistration)
      .map(s => s.parentId as string)
  );
  const filterByWS = (lp: LiveTaxonomyParent) => {
    // Live mode wins when we have it.
    if (liveEnabledPrimaryIds) {
      return liveEnabledPrimaryIds.has(lp.raw.id)
        || liveEnabledPrimarySlugs.has(lp.raw.slug)
        || liveEnabledPrimarySlugs.has(lp.display.id);
    }
    return fixtureAllowedParentIds.has(lp.raw.slug)
      || fixtureAllowedParentIds.has(lp.display.id);
  };
  const visibleParentsLP = liveTax.visibleParents
    .filter(filterByWS)
    .filter(lp => planRank(lp.display.minPlan) <= currentRank);
  const restParentsLP = liveTax.restParents
    .filter(filterByWS)
    .filter(lp => planRank(lp.display.minPlan) <= currentRank);
  const allowedParents = (showMoreParents
    ? [...visibleParentsLP, ...restParentsLP]
    : visibleParentsLP
  ).map(lp => lp.display);

  // Resolve types
  const primaryRes = findChild(state.primaryType);
  const allSelectedTypeIds = state.primaryType ? [state.primaryType, ...state.secondaryTypes] : [...state.secondaryTypes];
  // F16 — Services-typed talent surface "Photos of work / venue" copy
  // instead of "Portfolio" (a service business doesn't have a portfolio
  // in the fashion sense).
  const isServicesPrimary = state.primaryType
    ? !!TAXONOMY.find(p => p.id === "services")?.children.some(c => c.id === state.primaryType)
    : false;

  // ── DB-driven editor sidebar layout (B0/B1) ────────────────────────────────
  // The rail group order/labels + mobile-pill order now come from
  // `profileEditorLayout` (loaded DB-first by the layout, hardcoded fallback in
  // the context). PROFILE_SECTIONS / SECTION_META remain the STATIC type-source
  // + per-slug fallback. `activeSection` init/validation and the per-section
  // accordion renderers below stay on the static constants and are untouched.

  // Per-slug meta resolver: DB layout first, hardcoded SECTION_META fallback so
  // a slug missing from the DB layout still renders a label + emoji.
  const metaFor = useCallback(
    (slug: string): { label: string; emoji: string } =>
      profileEditorLayout.sectionMeta[slug] ?? SECTION_META[slug as Exclude<ProfileSectionId, "">],
    [profileEditorLayout],
  );

  // Derived rail groups: order/grouping/labels from the DB layout. Each group's
  // header uses labelEnAlt for service-primary talents when present (generalises
  // the old `isServicesPrimary ? "Photos of work / venue" : "Portfolio"` flip).
  // Section ids are filtered to known renderer slugs so a stray DB slug can't
  // break typing or rendering.
  const railGroups = useMemo<{ label: string; ids: ProfileSectionId[] }[]>(
    () =>
      profileEditorLayout.groups.map((g) => ({
        label: (isServicesPrimary && g.labelEnAlt) ? g.labelEnAlt : g.labelEn,
        ids: g.sections
          .map((s) => s.slug)
          .filter((slug) => (PROFILE_SECTIONS as readonly string[]).includes(slug)) as ProfileSectionId[],
      })),
    [profileEditorLayout, isServicesPrimary],
  );

  // Mobile-pill order: DB order first, then any static section not present in
  // the DB layout (so nothing ever disappears). Visibility gates are applied at
  // the render site, unchanged.
  const mobilePillSlugs = useMemo<Exclude<ProfileSectionId, "">[]>(() => {
    const orderedSet = new Set(profileEditorLayout.orderedSectionSlugs);
    const ordered = profileEditorLayout.orderedSectionSlugs.filter((slug) =>
      (PROFILE_SECTIONS as readonly string[]).includes(slug),
    );
    const tail = (PROFILE_SECTIONS as readonly string[]).filter(
      (s) => s && !orderedSet.has(s),
    );
    return [...ordered, ...tail] as Exclude<ProfileSectionId, "">[];
  }, [profileEditorLayout]);
  const allSelectedChildren = allSelectedTypeIds
    .map(id => findChild(id))
    .filter((x): x is { parent: TaxonomyParent; child: TaxonomyChild } => x !== null);
  const dynParentIds = Array.from(new Set(allSelectedChildren.map(x => x.parent.id)));
  // Phase A unification — read dynamic per-type fields from the
  // catalog via getDynamicFieldsForType(). One source of truth: the
  // catalog. The legacy TAXONOMY_FIELDS shape is preserved so the
  // existing renderer keeps working.
  const dynamicGroups = dynParentIds
    .map(pid => {
      const parent = TAXONOMY.find(p => p.id === pid)!;
      const groups = getDynamicFieldsForType(pid);
      const staticFields = groups[0]?.fields ?? [];
      // P1 field-engine unification — when the `drawer` surface is flipped to
      // `db`, render the DB-resolved type-specific catalog for this parent.
      // When `static` (default) or the DB has no fields for this parent, this
      // returns null and we keep `staticFields` (byte-identical to today).
      // NOTE: this `dynamicGroups`/"Profile details" path is the prototype /
      // standalone fallback — for a real tenant (`hasResolvedEngineContext`),
      // the type-specific editor is the DB-driven `LiveCategoryFieldsEditor`
      // and these sections are hidden. The dev parity assertion still runs.
      const dbFields = resolveDynamicFieldsForParent({
        payload: clientFieldSource,
        surface: "drawer",
        parentSlug: pid,
        staticFields,
      });
      return { parent, fields: dbFields ? [...dbFields] : staticFields };
    })
    .filter(g => g.fields.length > 0);

  // Custom workspace fields filtered to those that apply to talent.
  // Renders below type-specific fields in the "Profile details" section.
  const workspaceCustomTalentFields = customFields.filter(cf => cf.appliesTo === "Talent");

  // Smart defaults — when primary type changes
  const lastTypeRef = useRef<string | null>(payload.seed?.primaryType ?? null);
  useEffect(() => {
    if (!state.primaryType || state.primaryType === lastTypeRef.current) return;
    lastTypeRef.current = state.primaryType;
    const defaults = getTypeDefaults(state.primaryType);
    const updates: Partial<ProfileState> = {};
    if (state.specialties.length === 0 && defaults.defaultSpecialties.length > 0) {
      updates.specialties = defaults.defaultSpecialties;
    }
    const activeBio = state.bios.find(b => b.locale === state.bioActiveLocale);
    if (!activeBio?.text.trim()) {
      const langStrings = state.languages.map(l => l.language);
      const newText = defaults.bioTemplate({ stageName: state.stageName, homeBase: state.serviceArea.homeBase, languages: langStrings });
      updates.bios = state.bios.map(b => b.locale === state.bioActiveLocale ? { ...b, text: newText } : b);
    }
    // Suggest a default rate row for the new primary type
    if (!state.rates.some(r => r.typeId === state.primaryType)) {
      const child = findChild(state.primaryType);
      if (child) {
        const unit = TYPE_RATE_UNIT[child.parent.id] ?? "day";
        updates.rates = [...state.rates, { typeId: state.primaryType, amount: 0, currency: "USD", unit }];
      }
    }
    if (Object.keys(updates).length > 0) patch(updates);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: fires only on primaryType change; other state reads are the correct snapshot at that moment; adding them would fire on every keystroke
  }, [state.primaryType]);

  // Computed trust tier
  const trust = computeTrustTier(state.verifications);

  // Required fields
  const totalPhotos = state.albumsPro.reduce((n, a) => n + a.items.length, 0);
  const activeBio = state.bios.find(b => b.locale === state.bioActiveLocale);
  const newEngineActive = hasResolvedEngineContext;
  // Publish gate now comes from one helper path:
  //   - core universal floor (identity/location/media/bio/language),
  //   - resolver-driven required detail blockers.
  // Legacy model-only fallback blockers are intentionally removed; type-
  // specific publish requirements should be owned by the resolver path.
  const required = buildProfilePublishRequirements({
    core: buildCorePublishRequirements({
      stageName: state.stageName,
      primaryType: state.primaryType || null,
      homeBase: state.serviceArea.homeBase,
      totalPhotos,
      activeBioLength: activeBio?.text.trim().length ?? 0,
      languageCount: state.languages.length,
    }),
    resolverMissing: profileFieldRequiredMissing,
  });
  const missing = required.filter(r => !r.met);
  const canPublishProfile = missing.length === 0;
  const completeness = getProfilePublishCompleteness(required);

  // Per-section completeness (for tab-nav dots)
  const polaroidsFilledCount = state.polaroids.filter(p => p.url).length;
  const sectionComplete: Record<Exclude<ProfileSectionId, "">, boolean> = {
    services:      !!state.primaryType,
    location:      !!state.serviceArea.homeBase.trim(),
    logistics:     !!state.serviceArea.passport || !!state.serviceArea.driversLicense
      || !!state.serviceArea.ownsVehicle
      || (state.serviceArea.workEligibility?.length ?? 0) > 0
      || (state.serviceArea.visaCountries?.length ?? 0) > 0,
    media:         totalPhotos >= 3,
    albums:        state.albumsPro.length > 1 || totalPhotos > 0,
    polaroids:     polaroidsFilledCount >= 4,
    about:         (activeBio?.text.trim().length ?? 0) >= 30,
    // Physical / wardrobe completion = at least one field per group
    // is filled. Both gates are weak — fully populating the grids is
    // the talent's polish step, not a publish blocker.
    physical:      Object.entries(state.dynFields).some(([k, v]) =>
      ["height","bust","waist","hips","hair","eyes","skin_tone","tattoos","piercings","weight","inseam","body_type","tattoos_note","marks","hair_length"].includes(k)
      && (Array.isArray(v) ? v.length > 0 : !!String(v ?? "").trim())
    ),
    wardrobe:      Object.entries(state.dynFields).some(([k, v]) =>
      ["shoe","shoe_us","shoe_uk","dress_size","suit_size"].includes(k)
      && (Array.isArray(v) ? v.length > 0 : !!String(v ?? "").trim())
    ),
    details:       Object.keys(state.dynFields).length > 0,
    rates:         state.rates.some(r => r.amount > 0),
    // Booking-terms preferences persist independently (CommercialTermsEditor
    // self-saves talent_profiles.booking_terms) so completion isn't derived
    // from the profile reducer — treat as non-gating like `admin`.
    commercial_terms: true,
    availability:  state.availability.length > 0,
    identity:      !!state.identity.pronouns || !!state.identity.gender,
    refinement:    state.skillEntries.length + state.contexts.length > 0,
    credits:       state.credits.length > 0,
    limits:        state.limits.length > 0,
    files:         state.files.length > 0,
    social_proof:  state.pastClients.length > 0,
    // Reviews are an independently-moderated read surface (loaded by
    // ProfileReviewsEditor); not derived from the profile reducer, so it
    // never gates publish — treat as non-gating like `admin`.
    reviews:       true,
    verifications: state.verifications.idSubmitted && state.verifications.payoutConnected,
    admin:         true,
    // Back-office diagnostic, not a publish gate (mirrors `admin`).
    agency_fields: true,
    profile_fields: profileFieldCounts.total > 0
      && profileFieldCounts.filled >= profileFieldCounts.total,
  };

  // Tri-state companion: a section is "started" when it has SOME data but
  // hasn't crossed the completeness threshold yet. Sections without a
  // started concept (e.g. admin) just stay false.
  const sectionStarted: Record<Exclude<ProfileSectionId, "">, boolean> = {
    services:      !sectionComplete.services && (state.specialties.length > 0 || state.secondaryTypes.length > 0),
    location:      !sectionComplete.location && (state.serviceArea.serviceCities.length > 0 || state.serviceArea.travelKm > 0),
    logistics:     false,
    media:         !sectionComplete.media && totalPhotos > 0,
    albums:        !sectionComplete.albums && state.albumsPro.length > 0,
    polaroids:     !sectionComplete.polaroids && polaroidsFilledCount > 0,
    about:         !sectionComplete.about && ((activeBio?.text.trim().length ?? 0) > 0),
    physical:      false,
    wardrobe:      false,
    details:       false,
    rates:         !sectionComplete.rates && (state.askForQuote || state.packageRates.length > 0),
    commercial_terms: false,
    availability:  false,
    identity:      !sectionComplete.identity && (!!state.identity.legalName || !!state.identity.dob || !!state.identity.nationality),
    refinement:    false,
    credits:       false,
    limits:        false,
    files:         false,
    social_proof:  false,
    reviews:       false,
    verifications: !sectionComplete.verifications && (state.verifications.idSubmitted || state.verifications.payoutConnected),
    admin:         false,
    agency_fields: false,
    profile_fields: !sectionComplete.profile_fields && profileFieldCounts.filled > 0,
  };

  // Specialty options
  const specialtyOptions = allSelectedChildren
    .filter(x => x.child.specialties && x.child.specialties.length > 0)
    .map(x => ({ typeId: x.child.id, typeLabel: x.child.label, items: x.child.specialties! }));

  const setDyn = (key: string, v: string | string[]) =>
    patch({ dynFields: { ...state.dynFields, [key]: v } });

  // #8 — Publish celebration modal. When admin publishes a previously
  // unpublished profile, intercept submit and open the share toolkit.
  const [publishCelebrationOpen, setPublishCelebrationOpen] = useState(false);
  // #18 — Talent diff preview before submit. #15 — Admin diff view on
  // pending submissions. The baseline snapshot is the initial state when
  // the drawer was opened (already cached in initialState.current).
  const [diffOpen, setDiffOpen] = useState(false);
  const computeDiff = (): DiffEntry[] => {
    return computeProfileDiff(initialState.current ?? null, state);
  };
  const finalSubmit = () => {
    // Translate the relevant ProfileState slices into MyTalentProfile
    // shape and write to the override store. Closes the data-debt
    // where dashboard tiles read seed data while the shell wrote to
    // its internal ProfileState — edits never round-tripped.
    //
    // Map only the fields that have a clean MyTalentProfile equivalent
    // — keep the merge surgical so we don't accidentally clobber
    // shapes that don't match (rateCard, bookingStats, etc.).
    // Phase B — round-trip is keyed by canonical talent id from the
    // payload. No more "is this Marta?" name match. When `talentId`
    // is absent (registration / brand-new create flow), there's no
    // canonical record to write back to yet, so we skip the round-
    // trip and rely on the create flow to register the talent.
    const tid = payload.talentId;
    if (tid) {
      // Read canonical profile for this talent to preserve nested
      // shapes the drawer doesn't edit (rateCard.lines, bookingStats,
      // verifications, etc.).
      const canonical = getProfileById(tid);
      const passports: MyTalentProfile["travel"]["passports"] =
        state.serviceArea.passport === "valid" && state.identity.nationality
          ? [state.identity.nationality.toUpperCase()]
          : (canonical.travel?.passports ?? []);
      const workAuth = state.serviceArea.workEligibility && state.serviceArea.workEligibility.length > 0
        ? state.serviceArea.workEligibility.map(w => w.toUpperCase())
        : (canonical.travel?.workAuth ?? []);
      // Extract video items from albumsPro back to portfolioVideos.
      const portfolioVideos: MyTalentProfile["portfolioVideos"] = state.albumsPro
        .flatMap(a => a.items)
        .filter(it => !!it.videoUrl)
        .map(it => ({
          url: it.videoUrl!,
          caption: it.caption,
          durationSec: it.videoDurationSec,
        }));
      // Phase A/C foundation — round-trip measurements from dynFields
      // back to the canonical structured shape. Anything the drawer
      // doesn't touch comes from the canonical record (deep merge).
      const dyn = state.dynFields;
      const measurements: MyTalentProfile["measurements"] = {
        ...canonical.measurements,
        heightImperial: (typeof dyn.height === "string" && dyn.height.trim()) || canonical.measurements.heightImperial,
        // metric-style entries get split out at display time; we keep
        // the imperial value as the primary truth.
        heightMetric: canonical.measurements.heightMetric,
        weight: (typeof dyn.weight === "string" && dyn.weight.trim()) || canonical.measurements.weight,
        bust: (typeof dyn.bust === "string" && dyn.bust.trim()) || canonical.measurements.bust,
        waist: (typeof dyn.waist === "string" && dyn.waist.trim()) || canonical.measurements.waist,
        hips: (typeof dyn.hips === "string" && dyn.hips.trim()) || canonical.measurements.hips,
        inseam: (typeof dyn.inseam === "string" && dyn.inseam.trim()) || canonical.measurements.inseam,
        shoeEU: (typeof dyn.shoe === "string" && dyn.shoe.trim()) || canonical.measurements.shoeEU,
        shoeUS: (typeof dyn.shoe_us === "string" && dyn.shoe_us.trim()) || canonical.measurements.shoeUS,
        shoeUK: (typeof dyn.shoe_uk === "string" && dyn.shoe_uk.trim()) || canonical.measurements.shoeUK,
        dress: (typeof dyn.dress_size === "string" && dyn.dress_size.trim()) || canonical.measurements.dress,
        suit: (typeof dyn.suit_size === "string" && dyn.suit_size.trim()) || canonical.measurements.suit,
        hairColor: (typeof dyn.hair === "string" && dyn.hair) || canonical.measurements.hairColor,
        hairLength: (typeof dyn.hair_length === "string" && dyn.hair_length === "Short" ? "short"
          : typeof dyn.hair_length === "string" && dyn.hair_length === "Medium" ? "medium"
          : typeof dyn.hair_length === "string" && dyn.hair_length === "Long" ? "long"
          : canonical.measurements.hairLength) as MyTalentProfile["measurements"]["hairLength"],
        eyeColor: (typeof dyn.eyes === "string" && dyn.eyes) || canonical.measurements.eyeColor,
        skinTone: (typeof dyn.skin_tone === "string" && dyn.skin_tone) || canonical.measurements.skinTone,
        tattoosNote: (typeof dyn.tattoos_note === "string" && dyn.tattoos_note) || canonical.measurements.tattoosNote,
      };
      setProfileOverride(tid, {
        name: state.stageName,
        pronouns: (state.identity.pronouns ?? canonical.pronouns) as MyTalentProfile["pronouns"],
        city: state.serviceArea.homeBase || canonical.city,
        // Phase C — round-trip primary + secondary roles so the
        // dashboard + roster card see multi-role assignments.
        primaryType: (state.primaryType ?? canonical.primaryType) as TaxonomyParentId,
        secondaryTypes: state.secondaryTypes as TaxonomyParentId[],
        specialties: state.specialties as MyTalentProfile["specialties"],
        languages: state.languages as MyTalentProfile["languages"],
        portfolioVideos,
        measurements,
        emergencyContact: state.emergencyContact,
        // Nested travel — deep-merged so unrelated fields survive.
        travel: {
          ...(canonical.travel ?? { passports: [], workAuth: [], visasNeeded: [] }),
          passports,
          workAuth,
        },
      });
    }

    if (isSelf) {
      // Self-edit submission flips the profile to "pending" so the
      // agency's review queue picks it up. Production: emits a
      // pubsub event the agency surfaces as "1 profile awaiting
      // review" in their roster topbar. Toast names the agency so
      // the talent knows where their changes landed.
      patch({ profileStatus: "pending" });
      // Step 6 — push to the workspace pending-review queue. Derive a
      // short human-readable summary from the diff so the roster badge
      // and review drawer can show what changed without re-running the
      // diff machinery. Cap at the first 3 fields + count of the rest.
      const diff = computeDiff();
      const note = diff.length === 0
        ? "Submitted for review"
        : diff.length <= 3
          ? `Updated ${diff.map(d => d.fieldLabel.toLowerCase()).join(", ")}`
          : `Updated ${diff.slice(0, 3).map(d => d.fieldLabel.toLowerCase()).join(", ")} +${diff.length - 3} more`;
      // Pending-review queue requires a talent id to key by. Skip
      // when this is a brand-new (uncommitted) registration.
      if (tid) {
        addPendingReview({
          talentId: tid,
          submittedAt: new Date().toISOString(),
          note,
        });
      }
      toast(`Submitted to ${effectiveTenant.name} · they'll review within 1 business day`);
    } else {
      // Admin path clears the pending-review queue so the strip on
      // the roster page goes away after action. Safe no-op when the
      // talent isn't in the queue.
      if (tid) clearPendingReview(tid);
      toast(state.profileStatus === "published" ? "Profile updated" : "Profile published");
    }
    // #4 — Clear the QuickAdd → Shell handoff draft once the profile
    // has been committed; otherwise the next "Add talent" inherits stale data.
    if (mode === "create") clearProfileDraft("default");
    closeDrawer();
  };
  const submit = () => {
    if (!isSelf && state.profileStatus !== "published") {
      if (!canApplyProfileStatusTransition({
        role: "admin",
        currentStatus: state.profileStatus,
        nextStatus: "published",
        canPublish: canPublishProfile,
      })) {
        toast(missing.length === 1 ? "Add 1 item to publish" : `Add ${missing.length} items to publish`);
        return;
      }
      // Admin going draft/pending → published. Open celebration first.
      patch({ profileStatus: "published" });
      setPublishCelebrationOpen(true);
      return;
    }
    if (isSelf) {
      // Talent self-edit — preview diff before final submit.
      const entries = computeDiff();
      if (entries.length > 0) {
        setDiffOpen(true);
        return;
      }
    }
    finalSubmit();
  };
  // Save & exit — fire saveAll(), wait for it, then close. Distinct from
  // the Save button: saveAll alone keeps the drawer open so the user can
  // keep editing; this one commits and dismisses in one click.
  const saveAndExit = async () => {
    if (payload.talentId && mode !== "create") {
      if (!dirty && saveStatus !== "error") {
        closeDrawer();
        return;
      }
      const ok = await saveAll();
      if (!ok) {
        toast(copy.isSpanish ? "No se guardó. Revisa el botón Guardar." : "Not saved. Check the Save button for errors.");
        return;
      }
    }
    toast(copy.t("Saved — closing drawer"));
    closeDrawer();
  };

  // Required-coach jump-and-focus.
  // Uses querySelector inside the shell rather than forwardRef wiring,
  // since several controls are wrapped components.
  const onJumpToMissing = (id: string) => {
    const r = required.find(x => x.id === id);
    if (!r) return;
    setActiveSection(r.sectionId);
    if (r.sectionId === "profile_fields" && "groupKey" in r && typeof r.groupKey === "string") {
      setProfileFieldRailOpen(true);
      setActiveProfileFieldGroupKey(r.groupKey);
    }
    setTimeout(() => {
      const sel = `[data-tulala-pshell] [data-pshell-field="${id}"]`;
      const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel);
      if (el) {
        el.focus();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 250);
  };

  const handleProfileStatusChange = (nextStatus: typeof state.profileStatus) => {
    if (!canApplyProfileStatusTransition({
      role: isSelf ? "talent" : "admin",
      currentStatus: state.profileStatus,
      nextStatus,
      canPublish: canPublishProfile,
    })) {
      toast(missing.length === 1 ? "Add 1 item to publish" : `Add ${missing.length} items to publish`);
      return;
    }
    patch({ profileStatus: nextStatus });
  };

  if (!drawerOpen) return null;

  void historyUiEpoch;
  const canUndoStack = historyIdxRef.current > 0;
  const canRedoStack = historyIdxRef.current < historyRef.current.length - 1;
  // In `create` mode the drawer has no talentId yet, but the header CTA
  // (now "Create profile") still needs to render — clicking it is what
  // inserts the row. Showing the button as soon as the user opens the
  // drawer (in create mode) gives them an obvious commit affordance.
  const showHeaderSave = mode === "create"
    ? !isSelf
    : !!payload.talentId && (dirty || saveStatus === "saving" || saveStatus === "error");
  const saveSubtitle = copy.profileDrawerSaveSubtitle({
    saveStatus,
    savedAt,
    serverUpdatedAtMs: serverProfileUpdatedAtMs,
    ageText: savedAt ? ageString(savedAt) : "",
  });
  const saveSubtitleTitle = copy.profileDrawerSaveSubtitleTitle({
    saveStatus,
    savedAt,
    serverUpdatedAtMs: serverProfileUpdatedAtMs,
    saveError,
  });

  return (
    <div onClick={closeDrawer} style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(11,11,13,0.42)", backdropFilter: "blur(8px)",
      // 2026 redesign — half-width side drawer instead of full-screen.
      // Slides from the right; the talent profile / roster page stays
      // visible on the left so context isn't lost. Container queries
      // below already handle the mobile bottom-sheet behavior.
      display: "flex", alignItems: "stretch", justifyContent: "flex-end",
      fontFamily: FONTS.body,
    }}>
      <div onClick={e => e.stopPropagation()} data-tulala-pshell style={{
        width: "100%", maxWidth: pshellWidth, height: "100vh",
        background: "#fff",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        transition: pshellDragging ? "none" : "max-width .2s cubic-bezier(.4,0,.2,1)",
        boxShadow: "-12px 0 40px -12px rgba(11,11,13,0.18)",
      }}>
        {/* Draggable left edge — drag to fine-tune the drawer width.
            Sits inside the panel (its overflow:hidden clips a negative
            offset) so width:6 at left:0 is the grab strip. */}
        <div
          onMouseDown={(e) => { e.preventDefault(); setPshellDragging(true); }}
          role="separator"
          aria-label={copy.t("Resize drawer")}
          title={copy.t("Drag to resize")}
          style={{
            position: "absolute", top: 0, left: 0, width: 6, height: "100%",
            cursor: "ew-resize", zIndex: 60, background: "transparent",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(11,11,13,0.06)"; }}
          onMouseLeave={(e) => { if (!pshellDragging) e.currentTarget.style.background = "transparent"; }}
        />
        <style>{`
          /* 2026 #3 — Container queries replace viewport-width media
             queries. The shell now responds to its OWN width, not the
             viewport. So if it ever renders in a sidebar, an iframe,
             or a desktop split-pane, layout still adapts correctly. */
          [data-tulala-pshell] {
            container-type: inline-size;
            container-name: pshell;
          }
          /* 2026 redesign — single-column body, no live-preview pane.
             The preview added cognitive load + horizontal real-estate
             without showing anything the talent didn't already see in
             the profile underneath. RequiredCoach and ProfileGrowthMetric
             still render, but inline above the form so they participate
             in the same scroll. */
          [data-tulala-pshell] [data-pshell-body] { display: flex; flex-direction: row; flex: 1; min-height: 0; }
          [data-tulala-pshell] [data-pshell-form] { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 16px; position: relative; min-width: 0; background: ${COLORS.surface}; box-sizing: border-box; }
          [data-tulala-pshell] [data-pshell-form-banners] {
            display: flex; flex-direction: column; gap: 10px;
            padding: 14px 18px 0;
          }
          /* Vertical section rail — primary nav for the drawer at >= 601px.
             Replaces the horizontal pill row. Rail click sets activeSection
             and the existing single-section body shows that section's form. */
          [data-tulala-pshell] [data-pshell-rail] {
            width: 176px; flex-shrink: 0;
            border-right: 1px solid ${COLORS.borderSoft};
            background: rgba(11,11,13,0.018);
            overflow-y: auto;
            padding: 10px 8px;
            display: flex; flex-direction: column; gap: 1px;
          }
          [data-tulala-pshell] [data-details-rail-badge] {
            flex-shrink: 0;
            min-width: 18px;
            padding: 1px 5px;
            border-radius: 999px;
            background: rgba(11,11,13,0.06);
            color: ${COLORS.inkMuted};
            font-size: 10px;
            font-weight: 700;
            line-height: 1.4;
            text-align: center;
            font-variant-numeric: tabular-nums;
          }
          [data-tulala-pshell] [data-details-rail-badge][data-active="true"] {
            background: rgba(15,79,62,0.12);
            color: ${COLORS.accentDeep};
          }
          [data-tulala-pshell] [data-details-rail-chevron] {
            flex-shrink: 0;
            color: ${COLORS.inkMuted};
            font-size: 11px;
          }
          [data-tulala-pshell] [data-details-rail-children] {
            margin: 2px 0 6px 29px;
            padding: 2px 0 2px 7px;
            border-left: 1px solid rgba(15,79,62,0.18);
            display: flex;
            flex-direction: column;
            gap: 1px;
          }
          [data-tulala-pshell] [data-details-rail-child] {
            width: 100%;
            display: flex;
            align-items: center;
            gap: 6px;
            border: none;
            border-radius: 7px;
            padding: 5px 8px;
            background: transparent;
            color: ${COLORS.inkMuted};
            cursor: pointer;
            font-family: ${FONTS.body};
            font-size: 11px;
            font-weight: 550;
            letter-spacing: 0;
            text-align: left;
          }
          [data-tulala-pshell] [data-details-rail-child][data-active="true"] {
            background: rgba(15,79,62,0.08);
            color: ${COLORS.accentDeep};
            font-weight: 700;
          }
          [data-tulala-pshell] [data-details-rail-child-label] {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          [data-tulala-pshell] [data-details-rail-child-count] {
            flex-shrink: 0;
            font-size: 10px;
            font-weight: 700;
            color: rgba(11,11,13,0.42);
            font-variant-numeric: tabular-nums;
          }
          [data-tulala-pshell] [data-details-rail-child][data-active="true"] [data-details-rail-child-count] {
            color: ${COLORS.accentDeep};
          }
          [data-tulala-pshell] [data-pshell-rail]::-webkit-scrollbar { width: 4px; }
          [data-tulala-pshell] [data-pshell-rail]::-webkit-scrollbar-thumb { background: rgba(11,11,13,0.10); border-radius: 4px; }
          [data-tulala-pshell] [data-pshell-tab-nav] { display: none; }
          /* Single-section pattern at all widths: rail (or pills, on narrow)
             is the nav. Closed sections + section headers are hidden — rail
             names the active section, header would be redundant. */
          [data-tulala-pshell] section[data-paccordion-section]:not(:has([data-open="true"])) { display: none; }
          [data-tulala-pshell] section[data-paccordion-section] [data-paccordion-header] { display: none; }
          [data-tulala-pshell] section[data-paccordion-section] [data-paccordion-body][data-open="true"] {
            max-height: none !important;
            padding: 14px 18px !important;
          }
          [data-tulala-pshell] [data-paccordion-section] [data-paccordion-header] {
            position: sticky; top: 0; z-index: 5;
            background: #fff;
          }
          [data-tulala-pshell] [data-paccordion-body] {
            overflow: hidden;
            transition: max-height .22s cubic-bezier(.4,0,.2,1), opacity .18s, padding .18s;
          }
          [data-tulala-pshell] [data-paccordion-body][data-open="false"] {
            max-height: 0 !important; opacity: 0;
            padding-top: 0 !important; padding-bottom: 0 !important;
          }
          [data-tulala-pshell] [data-paccordion-body][data-open="true"] {
            max-height: 4000px; opacity: 1;
          }
          /* Disabled inputs flag their parent FieldRow as "locked" so
             the helper text dims naturally without a class on the parent. */
          [data-tulala-pshell] [data-tulala-fieldrow]:has(input:disabled),
          [data-tulala-pshell] [data-tulala-fieldrow]:has(textarea:disabled) {
            opacity: 0.65;
          }
          /* 2026 #5 — color-mix(). Generate hover variants from the
             accent token instead of hardcoding rgba sprays everywhere.
             Buttons that opt in via [data-pshell-tinted] inherit a
             token-driven hover state. */
          [data-tulala-pshell] [data-pshell-tinted]:hover {
            background: color-mix(in oklch, ${COLORS.accent} 8%, white);
          }
          /* #3 redesign — the toolbar no longer collapses by width. Every
             secondary action now lives in the always-present ⋯ menu, so there
             is no [data-pshell-header-extras] to hide and no "mobile menu"
             that pops in at the 720px default width (the bug: the default
             drawer width sat exactly on the old max-width:720px breakpoint).
             Two width rules remain:

             (a) Bottom-sheet — a true MOBILE pattern, so keyed to the
                 VIEWPORT, not the drawer's own width. A narrow drawer dragged
                 thin on a desktop stays a right-side panel; only an actual
                 small screen docks it to the bottom. */
          @media (max-width: 640px) {
            [data-tulala-pshell] {
              border-radius: 20px 20px 0 0; max-height: 95vh; height: 95vh;
              align-self: flex-end; max-width: none;
            }
          }
          /* (b) Narrow drawer OR phone — the 176px rail doesn't fit, so fall
                 back to the horizontal pill row. Keyed to the CONTAINER so it
                 adapts whether the drawer is dragged thin on a desktop or it's
                 an actual small screen. */
          @container pshell (max-width: 480px) {
            [data-tulala-pshell] [data-pshell-rail] { display: none; }
            [data-tulala-pshell] [data-pshell-tab-nav] { display: flex; }
            [data-tulala-pshell] [data-pshell-body] { flex-direction: column; }
          }
          /* Fallback for browsers without container-query support
             (Safari < 16, Firefox < 110): mirror the rail→pills rule on the
             viewport. The bottom-sheet rule above is already viewport-keyed
             so it needs no fallback. */
          @supports not (container-type: inline-size) {
            @media (max-width: 480px) {
              [data-tulala-pshell] [data-pshell-rail] { display: none; }
              [data-tulala-pshell] [data-pshell-tab-nav] { display: flex; }
              [data-tulala-pshell] [data-pshell-body] { flex-direction: column; }
            }
          }
        `}</style>

        {/* Header toolbar — one consistent row at every width:
            ✕ · title + save-status · [status chip] · [undo/redo] · [Save] ·
            [smart publish] · [⋯ overflow]. All secondary actions live in the
            ⋯ menu, so nothing collapses or duplicates as the drawer resizes. */}
        <div style={{
          padding: "12px 18px", borderBottom: `1px solid ${COLORS.borderSoft}`,
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          // #3 redesign — wrap to a second row at very narrow (phone) widths
          // instead of overflowing horizontally. No effect at normal widths
          // (everything fits on one line); only kicks in when the controls
          // alone can't fit, dropping them below the title.
          flexWrap: "wrap",
        }}>
          <button type="button" onClick={closeDrawer} aria-label={copy.t("Close")} style={{
            width: 28, height: 28, borderRadius: 8, border: "none", cursor: "pointer",
            background: "transparent", color: COLORS.ink, fontSize: 14, lineHeight: 1,
          }}>✕</button>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink">
              {mode === "create" ? copy.t("New profile") : isSelf ? copy.t("Edit your profile") : (state.stageName || copy.t("Profile"))}
            </div>
            {mode !== "create" && payload.seed?.profileCode && (
              <div
                title={payload.seed.profileCode}
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  color: COLORS.inkMuted,
                  fontFamily: FONTS.mono,
                  marginTop: 1,
                }}
              >
                {payload.seed.profileCode}
              </div>
            )}
            <div style={{ fontSize: 11, marginTop: 1, display: "inline-flex", alignItems: "center", gap: 4 }}
              title={saveSubtitleTitle || undefined}
            >
              <span style={{
                width: 5, height: 5, borderRadius: "50%", background: saveStatus === "error" ? "#C82828"
                  : saveStatus === "saving" ? COLORS.amberDeep
                  : savedAt ? COLORS.green
                  : serverProfileUpdatedAtMs ? COLORS.accentDeep
                  : "rgba(11,11,13,0.20)", }} />
              {saveSubtitle}
            </div>
          </div>

          {/* Workflow status chip — sits to the LEFT of the smart publish
              control. The old borderless pill looked un-clickable, so admins
              didn't realise they could flip status here; it now has a border +
              chevron + hover. Lets them move the talent between Draft /
              Pending / Published / Hidden without scrolling. */}
          <StatusPillDropdown
            status={state.profileStatus}
            onChange={handleProfileStatusChange}
            role={isSelf ? "talent" : "admin"}
            canPublish={canPublishProfile}
          />

          {/* History control strip — always visible (incl. mobile); pairs with explicit Save. */}
          <div
            role="group"
            aria-label={copy.isSpanish ? "Historial de edición" : "Edit history"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              flexShrink: 0,
              borderRadius: 10,
              border: `1px solid ${COLORS.borderSoft}`,
              background: "rgba(11,11,13,0.03)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
              overflow: "hidden", }} className="text-admin-ink-muted">
            <button
              type="button"
              onClick={undo}
              aria-label={copy.t("Undo (⌘Z)")}
              title={`${copy.t("Undo")} · ⌘Z`}
              disabled={!canUndoStack}
              style={{
                width: 34,
                height: 30,
                border: "none",
                background: "transparent",
                color: !canUndoStack ? COLORS.inkDim : COLORS.ink,
                cursor: !canUndoStack ? "not-allowed" : "pointer",
                fontSize: 15,
                lineHeight: 1,
                padding: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 14 4 9l5-5" />
                <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H10" />
              </svg>
            </button>
            <div style={{ width: 1, height: 18, background: COLORS.borderSoft, flexShrink: 0 }} />
            <button
              type="button"
              onClick={redo}
              aria-label={copy.t("Redo (⌘⇧Z)")}
              title={`${copy.t("Redo")} · ⌘⇧Z`}
              disabled={!canRedoStack}
              style={{
                width: 34,
                height: 30,
                border: "none",
                background: "transparent",
                color: !canRedoStack ? COLORS.inkDim : COLORS.ink,
                cursor: !canRedoStack ? "not-allowed" : "pointer",
                fontSize: 15,
                lineHeight: 1,
                padding: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m15 14 5-5-5-5" />
                <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H15" />
              </svg>
            </button>
          </div>

          {/* Save appears once the user edits (or while saving / after error). */}
          {showHeaderSave && (
            <button
              type="button"
              onClick={() => { void saveAll(); }}
              disabled={saveStatus === "saving"}
              title={saveStatus === "error" && saveError ? saveError : undefined}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 999, border: "none",
                background:
                  saveStatus === "error" ? "rgba(200,40,40,0.10)"
                  : COLORS.fill,
                color:
                  saveStatus === "error" ? "#C82828"
                  : "#fff",
                fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 700,
                letterSpacing: 0.2,
                cursor: saveStatus === "saving" ? "wait" : "pointer",
                opacity: saveStatus === "saving" ? 0.85 : 1,
                maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              {saveStatus === "saving" && (
                <span aria-hidden style={{
                  width: 12, height: 12, borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff",
                  animation: "tulala-spin 0.8s linear infinite",
                }} />
              )}
              {saveStatus === "saving" ? (mode === "create" ? copy.t("Creating…") : copy.t("Saving…"))
                : saveStatus === "error" ? `⚠ ${(saveError ?? (copy.isSpanish ? "No se pudo guardar" : "Couldn't save")).slice(0, 40)}`
                : mode === "create" ? copy.t("Create profile")
                : copy.t("Save")}
              <style>{`@keyframes tulala-spin { to { transform: rotate(360deg); } }`}</style>
            </button>
          )}

          {/* #3 redesign — ONE smart publish control replaces the old trio
              (the "Add N to publish" coach pill + the status-dropdown
              "Published" option + a separate greyed-out "Publish" button).
              While the profile isn't live yet AND required fields are missing,
              this renders the coach: an "Add N to publish" pill that opens a
              checklist with jump-to-field links. The moment nothing's missing
              it flips to the action button (Publish / Update / Submit for
              review). Every OTHER secondary action moved into the ⋯ menu, so
              the toolbar now fits at every width and never collapses into a
              "mobile menu" at the default size. */}
          {state.profileStatus !== "published" && state.profileStatus !== "hidden" && missing.length > 0 ? (
            <HeaderPublishCoach missing={missing} onJump={onJumpToMissing} />
          ) : (
            <SmartFooterCTA
              status={state.profileStatus}
              mode={mode}
              canPublish={canPublishProfile}
              onAction={submit}
            />
          )}

          {/* Overflow menu — the single home for every secondary action, at
              EVERY drawer width now (the old desktop-only strip is gone, so
              there's no duplication and nothing to collapse into a "mobile
              menu" at the 720px default width). */}
          <ProfileShellMobileMenu
            adminVisible={adminVisible}
            isSelf={isSelf}
            primaryTypeSet={!!state.primaryType}
            onViewAsClient={() => setViewAsClient(true)}
            onReviewChanges={adminVisible ? () => setDiffOpen(true) : undefined}
            drawerSize={pshellSize}
            customWidth={pshellCustomWidth}
            onSetDrawerSize={(sz) => { setPshellCustomWidth(null); setPshellSize(sz); }}
            onSaveAndExit={saveAndExit}
            onOpenFullEditor={
              tenantSlug && payload.talentId
                ? () => {
                    window.location.href = `/${tenantSlug}/admin/roster/${payload.talentId}`;
                  }
                : undefined
            }
            onRemoveFromRoster={
              payload.talentId
                ? async () => {
                    const tid = payload.talentId;
                    if (!tid) return;
                    const name = state.identity.stageName || "this talent";
                    const ok = window.confirm(
                      `Remove ${name} from your roster?\n\n` +
                        `They'll keep their Tulala account and any work history. ` +
                        `You can re-add them later. This only ends the agency ` +
                        `relationship — it does NOT delete the talent's account.`,
                    );
                    if (!ok) return;
                    const result = await removeFromRoster({ talent_profile_id: tid });
                    if (!result.ok) {
                      toast(result.error);
                      return;
                    }
                    toast(
                      result.keptUserAccount
                        ? `${name} removed. Their Tulala account is still active.`
                        : `${name} removed from your roster.`,
                    );
                    closeDrawer();
                    // Refresh server-rendered roster list so the removed
                    // talent disappears immediately (revalidatePath in the
                    // action invalidates the cache; router.refresh fetches
                    // the fresh layout payload). Without this the UI lies
                    // for the rest of the session.
                    queueShellRouterRefresh();
                  }
                : undefined
            }
          />
        </div>

        {/* Invite-claim banner */}
        {isInvited && (
          <InviteClaimBanner
            stageName={state.stageName}
            onResend={() => toast(`Resent invite to ${state.stageName}`)}
            onTakeOver={() => { patch({ profileStatus: "draft" }); toast("Now agency-managed"); }}
          />
        )}

        {/* Mobile tab nav */}
        <div data-pshell-tab-nav style={{
          padding: "8px 14px", borderBottom: `1px solid ${COLORS.borderSoft}`,
          gap: 6, overflowX: "auto", flexShrink: 0,
        }}>
          {mobilePillSlugs.map(s => {
            if (s === "admin" && !adminVisible) return null;
            if (s === "polaroids" && !showPolaroidsSection) return null;
            if (s === "details" && dynamicGroups.length === 0) return null;
            if (s === "refinement" && hasResolvedEngineContext) return null;
            const meta = metaFor(s);
            const active = activeSection === s;
            const done = sectionComplete[s];
            return (
              <button key={s} type="button" onClick={() => setActiveSection(s)} style={{
                flexShrink: 0, padding: "6px 11px", borderRadius: 999,
                border: `1px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                background: active ? "rgba(15,79,62,0.08)" : "#fff",
                color: active ? COLORS.accentDeep : COLORS.ink,
                fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                fontFamily: FONTS.body,
                display: "inline-flex", alignItems: "center", gap: 5,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: done ? COLORS.green : "rgba(11,11,13,0.18)",
                }} />
                <span>{meta.emoji}</span>
                {copy.t(meta.label)}
              </button>
            );
          })}
        </div>

        {/* Multi-tenant identity banner — visible only when this agency
            manages a Tulala-native, non-exclusive talent. Tells the admin
            that personal profile data belongs to the talent, NOT to the
            agency. Roster relationship fields are still editable. */}
        {!isSelf && tulalaNativeIdentity && (
          <div
            role="status"
            style={{
              margin: "0 16px 12px",
              padding: "10px 14px",
              border: "1px solid rgba(31,74,58,0.25)",
              borderRadius: 10,
              background: "rgba(31,74,58,0.06)",
              fontFamily: FONTS.body,
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 12.5,
            }}
          >
            <span
              aria-hidden
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 22,
                height: 22,
                borderRadius: 999,
                background: "#1f4a3a",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              ✓
            </span>
            <div style={{ flex: 1, lineHeight: 1.45 }}>
              <strong>Tulala-verified talent.</strong>{" "}
              {personalProfileLocked
                ? "Personal profile is owned by the talent — you can manage roster relationship only."
                : `Roster relationship: ${rosterExclusivity ?? "unspecified"}. Personal profile editable because the relationship is exclusive.`}
            </div>
          </div>
        )}
        {/* Body — rail on the left (>= 601px) + scrolling form on the right.
            On narrow widths the rail collapses and the horizontal pill nav
            above the body takes over (single nav at any width, never two). */}
        <div data-pshell-body>
          {(() => {
            // Group sections by mental task. Order is the order shown in
            // the rail. Each group has a small label header. Sections that
            // don't apply (e.g. physical/wardrobe for non-models, admin
            // for non-admins, details with no fields) are filtered out and
            // empty groups collapse so the rail stays tight.
            // Rail groups now come from the DB-driven layout (`railGroups`,
            // derived above from `profileEditorLayout`). The old inline
            // RAIL_GROUPS literal + `mediaGroupLabel` flip are superseded by the
            // layout's group order + labelEnAlt handling.
            const RAIL_GROUPS = railGroups;
            // One source of truth: when the NEW DB-driven engine is
            // mounted (real talent + tenant), it supersedes the legacy
            // field_values/dynamicGroups editor. Collapse the OLD
            // accordions (refinement / physical / wardrobe / details) so
            // a tenant talent edits through exactly ONE engine. The
            // underlying field_values data is untouched — Discover and
            // the public profile still read it; this only stops the
            // drawer double-rendering the same concepts.
            const visible = (s: ProfileSectionId) => {
              if (!s) return false;
              if (s === "admin" && !adminVisible) return false;
              if (s === "polaroids" && !showPolaroidsSection) return false;
              if ((s === "refinement" || s === "physical" || s === "wardrobe" || s === "details") && newEngineActive) return false;
              if (s === "details" && dynamicGroups.length === 0) return false;
              if (s === "physical" && !dynamicGroups.some(g => g.fields.some(f => f.subsection === "physical"))) return false;
              if (s === "wardrobe" && !dynamicGroups.some(g => g.fields.some(f => f.subsection === "wardrobe"))) return false;
              // Profile fields editor only mounts when there's a real talent
              // + tenant context (bridge below the editor enforces the same).
              if (s === "profile_fields" && !newEngineActive) return false;
              // Agency Fields = the live DB-resolved field catalog; only
              // meaningful with a real talent + tenant (same as the engine).
              if (s === "agency_fields" && !newEngineActive) return false;
              return true;
            };
            // Top-of-rail summary: how many sections are complete out of
            // the visible total. Replaces the bulky "Add N to publish"
            // banner with a quiet progress indicator inside the nav itself.
            const allVisibleSections = RAIL_GROUPS.flatMap(g => g.ids).filter(visible) as Exclude<ProfileSectionId, "">[];
            const totalVisible = allVisibleSections.length;
            const totalDone = allVisibleSections.filter(s => sectionComplete[s]).length;
            const ratio = totalVisible > 0 ? totalDone / totalVisible : 0;
            return (
              <aside data-pshell-rail aria-label="Profile sections">
                <div style={{
                  padding: "8px 12px 12px",
                  borderBottom: `1px solid ${COLORS.borderSoft}`,
                  marginBottom: 6,
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 }} className="text-admin-ink-muted">
                    <span>{copy.t("Profile")}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }} className="text-admin-ink">{totalDone}/{totalVisible}</span>
                  </div>
                  <div style={{
                    height: 3, borderRadius: 2,
                    background: "rgba(11,11,13,0.06)",
                    overflow: "hidden",
                  }}>
                    <div style={{ height: "100%", width: `${Math.round(ratio * 100)}%`, transition: "width .3s cubic-bezier(.4,0,.2,1)", }} />
                  </div>
                </div>
                {RAIL_GROUPS.map(group => {
                  const items = group.ids.filter(visible) as Exclude<ProfileSectionId, "">[];
                  if (items.length === 0) return null;
                  return (
                    <div key={group.label} style={{ marginBottom: 4 }}>
                      <div style={{
                        padding: "6px 12px 4px",
                        fontSize: 9.5, fontWeight: 700,
                        letterSpacing: 0.7, textTransform: "uppercase",
                        color: "rgba(11,11,13,0.42)",
                        fontFamily: FONTS.body,
                      }}>{copy.t(group.label)}</div>
                      {items.map(s => {
                        const meta = metaFor(s);
                        const ownsProfileFieldGroups = s === "services" && newEngineActive && profileFieldNavGroups.length > 0;
                        const ownsLegacyRefinement = s === "services" && visible("refinement");
                        const active = activeSection === s
                          || (ownsProfileFieldGroups && activeSection === "profile_fields")
                          || (ownsLegacyRefinement && activeSection === "refinement");
                        const done = sectionComplete[s];
                        const started = sectionStarted[s];
                        const detailsNavCount = ownsProfileFieldGroups
                          ? profileFieldNavGroups.length
                          : ownsLegacyRefinement
                            ? 1
                            : 0;
                        const isDetailsSection = ownsProfileFieldGroups || ownsLegacyRefinement;
                        return (
                          <div key={s}>
                            <button
                              type="button"
                              aria-expanded={isDetailsSection ? profileFieldRailOpen : undefined}
                              onClick={() => {
                                if (isDetailsSection) {
                                  setActiveSection(s);
                                  setProfileFieldRailOpen((open) => (active ? !open : true));
                                  return;
                                }
                                setActiveSection(s);
                              }}
                              style={{
                                width: "100%",
                                display: "flex", alignItems: "center", gap: 8,
                                padding: "7px 10px 7px 12px", borderRadius: 8,
                                border: "none",
                                background: active ? "rgba(15,79,62,0.10)" : "transparent",
                                color: active ? COLORS.accentDeep : COLORS.ink,
                                fontSize: 12.5, fontWeight: active ? 600 : 500,
                                textAlign: "left", cursor: "pointer",
                                fontFamily: FONTS.body,
                                position: "relative",
                                letterSpacing: 0.1,
                              }}
                            >
                              {active && (
                                <span aria-hidden style={{
                                  position: "absolute", left: 2, top: 7, bottom: 7, width: 2,
                                  background: COLORS.accent, borderRadius: 2,
                                }} />
                              )}
                              <span aria-hidden style={{
                                width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                                background: done
                                  ? COLORS.green
                                  : started
                                    ? "rgba(15,79,62,0.38)"
                                    : "rgba(11,11,13,0.12)",
                              }} />
                              <span aria-hidden style={{ fontSize: 13, lineHeight: 1, width: 16, textAlign: "center", flexShrink: 0 }}>{meta.emoji}</span>
                              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{copy.t(meta.label)}</span>
                              {isDetailsSection && (
                                <>
                                  <span data-details-rail-badge data-active={active ? "true" : "false"}>
                                    {detailsNavCount}
                                  </span>
                                  <span aria-hidden data-details-rail-chevron>
                                    {profileFieldRailOpen ? "⌄" : "›"}
                                  </span>
                                </>
                              )}
                            </button>
                            {isDetailsSection && profileFieldRailOpen && (
                              <div
                                data-details-rail-children
                                role="group"
                                aria-label="Service detail categories"
                              >
                                {ownsLegacyRefinement && !ownsProfileFieldGroups && (
                                  <button
                                    type="button"
                                    data-details-rail-child
                                    data-active={activeSection === "refinement" ? "true" : "false"}
                                    onClick={() => {
                                      setActiveSection("refinement");
                                      setProfileFieldRailOpen(true);
                                    }}
                                  >
                                    <span data-details-rail-child-label>
                                      {copy.t(metaFor("refinement").label)}
                                    </span>
                                  </button>
                                )}
                                {profileFieldNavGroups.map((detailsGroup) => {
                                  const childActive = activeSection === "profile_fields" && activeProfileFieldGroupKey === detailsGroup.key;
                                  return (
                                    <button
                                      key={detailsGroup.key}
                                      type="button"
                                      data-details-rail-child
                                      data-active={childActive ? "true" : "false"}
                                      onClick={() => {
                                        setActiveSection("profile_fields");
                                        setProfileFieldRailOpen(true);
                                        setActiveProfileFieldGroupKey(detailsGroup.key);
                                      }}
                                    >
                                      <span data-details-rail-child-label>
                                        {detailsGroup.label}
                                      </span>
                                      <span data-details-rail-child-count>
                                        {detailsGroup.filled}/{detailsGroup.total}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                {!!payload.talentId && (
                  <div className="mb-1">
                    <div style={{
                      padding: "6px 12px 4px",
                      fontSize: 9.5, fontWeight: 700,
                      letterSpacing: 0.7, textTransform: "uppercase",
                      color: "rgba(11,11,13,0.42)",
                      fontFamily: FONTS.body,
                    }}>{copy.t("Audit")}</div>
                    <button
                      type="button"
                      onClick={() => setHistoryOpen(true)}
                      style={{
                        width: "100%",
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "7px 10px 7px 12px", borderRadius: 8,
                        border: "none", background: "transparent",
                        color: COLORS.ink, fontSize: 12.5, fontWeight: 500,
                        textAlign: "left", cursor: "pointer",
                        fontFamily: FONTS.body, letterSpacing: 0.1,
                      }}
                    >
                      <span aria-hidden style={{
                        width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                        background: "rgba(11,11,13,0.12)",
                      }} />
                      <span aria-hidden style={{ fontSize: 13, lineHeight: 1, width: 16, textAlign: "center", flexShrink: 0 }}>🕓</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{copy.t("History")}</span>
                    </button>
                  </div>
                )}
              </aside>
            );
          })()}
          {!!payload.talentId && (
            <LiveCategoryFieldsHistoryModal
              talentProfileId={payload.talentId!}
              open={historyOpen}
              onClose={() => setHistoryOpen(false)}
            />
          )}
          <div data-pshell-form>
            {/* P2 — honest hydration overlay. The drawer paints from a
                3-field seed; real saved values arrive async. While that's
                in flight we cover the form with a skeleton (never let
                empty defaults read as real saved data); on failure we
                show an explicit error + Retry. Cleared once loaded.
                Only for real talents (create mode has nothing to load). */}
            {mode !== "create" && !!payload.talentId && editorHydration === "loading" && (
              <div
                aria-busy="true"
                aria-label={copy.t("Loading saved profile")}
                style={{
                  position: "absolute", inset: 0, zIndex: 7,
                  background: "#fff", overflow: "hidden",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 24px 4px", fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, letterSpacing: 0.2 }} className="text-admin-ink-muted">
                  <span aria-hidden style={{
                    width: 12, height: 12, borderRadius: "50%",
                    border: `2px solid ${COLORS.borderSoft}`,
                    borderTopColor: COLORS.accent,
                    animation: "tulalaSpin .7s linear infinite",
                  }} />
                  {copy.t("Loading saved profile…")}
                  <style>{`@keyframes tulalaSpin{to{transform:rotate(360deg)}}`}</style>
                </div>
                <DrawerDetailSkeleton />
              </div>
            )}
            {mode !== "create" && !!payload.talentId && editorHydration === "error" && (
              <div
                role="alert"
                style={{
                  position: "absolute", inset: 0, zIndex: 7,
                  background: "#fff", display: "flex",
                  flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: 12, padding: 32,
                  fontFamily: FONTS.body, textAlign: "center",
                }}
              >
                <div className="text-admin-ink text-sm font-semibold">
                  {copy.t("Couldn't load this profile's saved data")}
                </div>
                <div style={{ fontSize: 12, maxWidth: 320 }} className="text-admin-ink-muted">
                  {copy.t("Editing is paused so you don't overwrite real data with blanks. Retry to load it.")}
                </div>
                <button
                  type="button"
                  onClick={retryHydration}
                  style={{
                    padding: "8px 18px", borderRadius: 999,
                    border: "none", background: COLORS.accent, color: "#fff",
                    fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {copy.t("Retry")}
                </button>
              </div>
            )}
            {/* Inline banners — replaces the old left-pane chrome.
                Render only when there's something to say so the form
                starts close to the top edge on healthy profiles. */}
            {/* "Add N to publish" coach moved to the drawer header. The
                FirstTimeHero (only fires for very low completeness) still
                lives in-form because it's a richer onboarding moment. */}
            <div data-pshell-form-banners>
              <ProfileShellUnsavedBanner visible={dirty} />
              <ProfileShellSaveErrorBanner message={saveStatus === "error" ? saveError : null} />
            </div>
            {completeness < 35 && !localStorage.getItem("tulala.welcome.dismissed." + (payload.talentId ?? "")) && (
              <div data-pshell-form-banners>
                <FirstTimeHero
                  completeness={completeness}
                  onStart={(sectionId) => setActiveSection(sectionId)}
                  talentId={payload.talentId ?? ""}
                />
              </div>
            )}
            {/* THREE-SLOT PHOTO BLOCK — only in visual sections to avoid
                bleeding into Identity / Rates / Availability etc. */}
            {(activeSection === "" || ["media", "albums"].includes(activeSection) || (showPolaroidsSection && activeSection === "polaroids")) && (
              <div data-pshell-media-start>
                <ThreeSlotPhotoBlock
                  avatarUrl={avatarPhotoUrl}
                  heroUrl={heroPhotoUrl}
                  galleryPhotos={galleryAssets.filter(a => a.variantKind === "gallery").map(a => a.url)}
                  onOpenSlot={(slot) => {
                    setGalleryDrawerFocus(slot);
                    setGalleryDrawerOpen(true);
                  }}
                />
              </div>
            )}

            {/* Earned-trust ribbon — drawer-level signal (not tied to any one section) */}
            {payload.talentId && bridgeTenantIdentity?.tenantId && (
              <MetricsRibbon talentProfileId={payload.talentId} />
            )}

            {/* IDENTITY */}
            <ProfileAccordionSection
              id="identity" primaryType={state.primaryType ? [state.primaryType, ...state.secondaryTypes] : state.secondaryTypes} title={copy.t("Identity")}
              sub={copy.t("Name, pronouns, DOB. Each field has its own privacy.")}
              complete={sectionComplete.identity} started={sectionStarted.identity}
              open={activeSection === "identity"}
              onToggle={() => setActiveSection(activeSection === "identity" ? "" : "identity")}
            >
              <ProfileShellSectionSaveHint locked={personalProfileLocked} />
              <IdentityEditor
                identity={state.identity}
                onChange={(next) => patch({ identity: next, stageName: next.stageName })}
                isSelf={isSelf}
                isFieldLocked={(path) => isSelf && state.fieldLocks.includes(path)}
                lockReasons={state.fieldLockReasons}
                workspaceScopeTenantId={workspaceScopeTenantId}
                disabled={personalProfileLocked}
              />
              <FieldRow label={copy.t("Tagline")} optional hint={copy.t("One line clients see at a glance.")} catalogId="identity.tagline" tenantId={workspaceScopeTenantId}>
                <TextInput placeholder={copy.t("e.g. Editorial fashion model · Madrid")} value={state.tagline} onChange={(e) => patch({ tagline: e.target.value })} />
              </FieldRow>
              <FieldRow
                label={copy.t("Show me on Tulala Discover")}
                recommended
                hint={copy.t("ⓘ Discover is where clients across Tulala find new talent. Appearing here multiplies your exposure to event planners, brands, and agencies. Your trust gates and contact controls still apply — clients reach you through coordinated inquiries, never direct DMs. Toggle off anytime.")}
              >
                <ToggleControl
                  value={state.isDiscoverable}
                  onChange={(v) => patch({ isDiscoverable: v })}
                  label={copy.t(state.isDiscoverable ? "On — appearing on Discover" : "Off — hidden from Discover")}
                />
              </FieldRow>
              {/* T2 — Discover card preview. Renders a schematic of what
                  this talent's card looks like to clients browsing Discover.
                  Live data from state: stage name, primary category slug,
                  home city, photo from polaroids/albums. Trust tier renders
                  as "BASIC" until verification lifts it (real tier resolves
                  server-side on the Discover materialized view). */}
              {state.isDiscoverable && (
                <div
                  style={{
                    marginTop: 4,
                    padding: 12,
                    borderRadius: 12,
                    border: `1px solid ${COLORS.borderSoft}`,
                    background: COLORS.surfaceAlt ?? "rgba(11,11,13,0.03)",
                  }}
                >
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 10, fontFamily: FONTS.body }} className="text-admin-ink-dim">
                    Preview · your Discover card
                  </div>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "84px 1fr",
                    gap: 12,
                    alignItems: "start",
                  }}>
                    <div style={{ aspectRatio: "4 / 5", width: 84, borderRadius: 10, background: state.polaroids.find(p => p.url)?.url
                          ? `url(${state.polaroids.find(p => p.url)!.url}) center/cover`
                          : (state.albumsPro[0]?.items[0]?.url
                              ? `url(${state.albumsPro[0].items[0].url}) center/cover`
                              : COLORS.borderSoft), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONTS.display, fontSize: 22, fontWeight: 500, flexShrink: 0 }} className="text-admin-ink-muted">
                      {!state.polaroids.find(p => p.url)?.url
                        && !state.albumsPro[0]?.items[0]?.url
                        && (state.identity.stageName || state.stageName || "??")
                            .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0, fontFamily: FONTS.body }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }} className="text-admin-ink">
                        <span>{state.identity.stageName || state.stageName || copy.t("Your name")}</span>
                        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, padding: "1px 6px", borderRadius: 4, background: "rgba(11,11,13,0.06)" }} className="text-admin-ink-muted">BASIC</span>
                      </div>
                      <div style={{ fontSize: 12, marginBottom: 3 }} className="text-admin-ink-muted">
                        {state.primaryType ?? copy.t("Add a primary category")}
                        {state.serviceArea.homeBase ? ` · ${state.serviceArea.homeBase}` : ""}
                      </div>
                      <div style={{ fontSize: 11, marginTop: 8, fontStyle: "italic", lineHeight: 1.45 }} className="text-admin-ink-dim">
                        {copy.t("Trust badge, 14-day availability strip, and rate band are derived live by Discover — they update as your verification, calendar, and rates change.")}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </ProfileAccordionSection>

            {/* AGENCY FIELDS — the live DB-resolved field catalog for
                this talent's primary + secondary types. Back-office
                diagnostic; opens from the "Agency Fields" rail entry
                under Back office. Real talent + tenant only. */}
            {payload.talentId && bridgeTenantIdentity?.tenantId &&
              activeSection === "agency_fields" && (
              <div style={{ padding: "0 24px" }}>
                <LiveCategoryFieldsPanel
                  talentProfileId={payload.talentId}
                  open
                  onToggle={() => setActiveSection("")}
                />
              </div>
            )}

            {/* SERVICES */}
            <ProfileAccordionSection
              id="services" primaryType={state.primaryType ? [state.primaryType, ...state.secondaryTypes] : state.secondaryTypes} title={copy.t("Services")}
              sub={copy.t("What this person is booked as. The most important section.")}
              complete={sectionComplete.services} started={sectionStarted.services}
              open={activeSection === "services"}
              onToggle={() => setActiveSection(activeSection === "services" ? "" : "services")}
            >
              {/* SkillSlotPanel — DB-backed, real tenants only.
                  Falls back to legacy ServicesEditor for prototype/demo mode
                  (no real tenant). Career interests render inside SkillSlotPanel
                  once a primary skill is set. */}
              {hasResolvedEngineContext ? (
                <div style={{ marginTop: 6, marginBottom: 14 }}>
                  <SkillSlotPanel
                    talentProfileId={payload.talentId!}
                    isAdmin={adminVisible}
                    viewMode={isSelf ? "talent-self" : "admin"}
                    actions={isSelf ? talentSelfSkillActions : undefined}
                    searchActions={isSelf ? talentSelfSkillSearchActions : undefined}
                    careerInterestActions={isSelf ? talentSelfCareerInterestActions : undefined}
                    onSkillsChanged={() => setTaxonomyVersion((v) => v + 1)}
                  />
                  <ContextSlotPanel
                    talentProfileId={payload.talentId!}
                    talentName={state.stageName}
                    actions={isSelf ? talentSelfContextActions : undefined}
                    catalogActions={isSelf ? talentSelfContextCatalogActions : undefined}
                    onContextsChanged={() => setTaxonomyVersion((v) => v + 1)}
                  />
                </div>
              ) : (
                <>
                  <ServicesEditor
                    allowedParents={allowedParents}
                    hydrating={hydratingMedia && !!payload.talentId && mode !== "create"}
                    primaryType={state.primaryType}
                    secondaryTypes={state.secondaryTypes}
                    specialties={state.specialties}
                    primaryRes={primaryRes}
                    specialtyOptions={specialtyOptions}
                    tenantEnabledPrimarySlugs={liveEnabledPrimarySlugs}
                    tenantEnabledSecondarySlugs={liveEnabledSecondarySlugs}
                    tenantSettingsHref={
                      bridgeTenantIdentity?.slug
                        ? `/${bridgeTenantIdentity.slug}/admin/settings#talent-types`
                        : undefined
                    }
                    onPickPrimary={(id) => {
                      patch({ primaryType: id });
                    }}
                    onClearPrimary={() => {
                      patch({ primaryType: null });
                    }}
                    onToggleSecondary={(id) => {
                      if (id === state.primaryType) return;
                      toggleSet("secondaryTypes")(id);
                    }}
                    onToggleSpecialty={(s) => toggleSet("specialties")(s)}
                  />
                  {/* PR-A — "More…" expander to load the 11 non-public-filter parents */}
                  {!state.primaryType && restParentsLP.length > 0 && (
                    <button type="button" onClick={() => setShowMoreParents(s => !s)} style={{
                      alignSelf: "flex-start", padding: "6px 12px", borderRadius: 999,
                      background: "transparent", border: `1px dashed ${COLORS.border}`,
                      color: COLORS.inkMuted, fontSize: 11.5, fontWeight: 500, cursor: "pointer",
                      fontFamily: FONTS.body,
                    }}>
                      {showMoreParents
                        ? `– Hide ${restParentsLP.length} more`
                        : `+ More categories… (${restParentsLP.length})`}
                    </button>
                  )}
                  {/* M7 fix — "Live taxonomy" replaced with plain English. */}
                  <div className="text-admin-ink-dim text-admin-10h">
                    Showing {visibleParentsLP.length} categories{restParentsLP.length > 0 ? ` · ${restParentsLP.length} more available` : ""}
                    {liveTax.error && ` · ${liveTax.error}`}
                  </div>
                </>
              )}
              {!hasResolvedEngineContext && state.primaryType && (
                <details className="mt-3">
                  <summary style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 6, cursor: "pointer", listStyle: "none", display: "inline-flex", alignItems: "center", gap: 6, userSelect: "none" }} className="text-admin-ink-muted">
                    <span aria-hidden="true" style={{ fontSize: 10, transform: "translateY(-1px)" }}>▸</span>
                    Career interests
                    <span style={{ fontWeight: 500, letterSpacing: 0 }} className="text-admin-ink-dim">· optional · open-to-grow signals</span>
                  </summary>
                  <div className="mt-2">
                    <AspirationsEditor
                      allowedParents={allowedParents}
                      primaryType={state.primaryType}
                      secondaryTypes={state.secondaryTypes}
                      value={state.aspirations}
                      onToggle={(id) => toggleSet("aspirations")(id)}
                    />
                  </div>
                </details>
              )}
            </ProfileAccordionSection>

            {/* LOCATION */}
            <ProfileAccordionSection
              id="location" primaryType={state.primaryType ? [state.primaryType, ...state.secondaryTypes] : state.secondaryTypes} title="Location & service area"
              sub="Current location + upcoming travel."
              complete={sectionComplete.location} started={sectionStarted.location}
              open={activeSection === "location"}
              onToggle={() => setActiveSection(activeSection === "location" ? "" : "location")}
            >
              {payload.talentId && bridgeTenantIdentity?.tenantId ? (
                <>
                  <ProfileShellSectionSaveHint locked={personalProfileLocked} />
                  <LocationSlotPanel
                    talentProfileId={payload.talentId}
                    persistMode="deferred"
                    onHydrated={handleDeferredServiceAreaHydrated}
                    onDesiredChange={handleDeferredServiceAreaChange}
                  />
                </>
              ) : (
                <>
                  <FieldRow label="Current location" catalogId="serviceArea.homeBase" tenantId={workspaceScopeTenantId}>
                    <CityAutocompleteInput
                      value={state.serviceArea.homeBase}
                      placeId={state.serviceArea.homePlaceId}
                      placeholder="e.g. Playa del Carmen"
                      onChange={(city, pid) => patch({ serviceArea: { ...state.serviceArea, homeBase: city, homePlaceId: pid } })}
                    />
                  </FieldRow>
                  <ServiceAreaMap
                    homeBase={state.serviceArea.homeBase}
                    travelKm={state.serviceArea.travelKm}
                    cities={(state.serviceArea.upcomingVisits ?? []).map(v => v.city)}
                  />
                  <FieldRow label={`Travel radius — ${state.serviceArea.travelKm === 999 ? "Anywhere" : `${state.serviceArea.travelKm} km`}`}>
                    <input type="range" min={10} max={999} step={10} value={state.serviceArea.travelKm}
                      onChange={(e) => patch({ serviceArea: { ...state.serviceArea, travelKm: Number(e.target.value) } })}
                      style={{ width: "100%", accentColor: COLORS.accent }}
                    />
                  </FieldRow>
                  <FieldRow label="Travel fee" optional>
                    <ToggleControl value={state.serviceArea.travelFee}
                      onChange={(v) => patch({ serviceArea: { ...state.serviceArea, travelFee: v } })}
                      label="Charge a travel fee outside the home area" />
                  </FieldRow>
                  <FieldRow label="Remote only" optional>
                    <ToggleControl value={!!state.serviceArea.remoteOnly}
                      onChange={(v) => patch({ serviceArea: { ...state.serviceArea, remoteOnly: v } })}
                      label="Talent works remotely / online only" />
                  </FieldRow>
                </>
              )}
              {/* Visiting / Away (upcoming_visits) — deferred concern,
                  unchanged, still written via the global save. */}
              <FieldRow label="Visiting / Away" hint="Add cities the talent will be visiting. Shown on their public page.">
                <UpcomingVisitsEditor
                  visits={state.serviceArea.upcomingVisits ?? []}
                  onChange={(visits) => patch({ serviceArea: { ...state.serviceArea, upcomingVisits: visits } })}
                />
              </FieldRow>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 6 }} className="text-admin-ink-muted">
                  Seasonal windows
                  <span style={{ marginLeft: 6, fontWeight: 500, letterSpacing: 0 }} className="text-admin-ink-dim">· &quot;I&apos;m here X months a year&quot;</span>
                </div>
                <SeasonalEditor windows={state.seasonalWindows} onChange={(w) => patch({ seasonalWindows: w })} />
              </div>
            </ProfileAccordionSection>

            {/* LOGISTICS — travel docs + work-eligibility, split out of
                Location so "where the talent is based" and "what it takes
                to fly them across a border" stay distinct mental models.
                Same state.serviceArea.* slice — pure relocation, no data
                migration. */}
            <ProfileAccordionSection
              id="logistics" primaryType={state.primaryType ? [state.primaryType, ...state.secondaryTypes] : state.secondaryTypes} title="Logistics"
              sub="Travel documents & work eligibility for cross-border bookings."
              complete={sectionComplete.logistics} started={sectionStarted.logistics}
              open={activeSection === "logistics"}
              onToggle={() => setActiveSection(activeSection === "logistics" ? "" : "logistics")}
            >
              {/* ── Travel & work eligibility ────────────────────
                  International booking pre-checks. Engine reads these
                  to filter out talents the client can't legally hire
                  for a cross-border job before sending the inquiry.
                  All optional + admin-visibility by default. */}
              <div style={{ marginTop: 6, padding: "10px 12px", borderRadius: 10, border: `1px solid ${COLORS.borderSoft}` }} className="bg-admin-surface-alt">
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8 }} className="text-admin-ink-muted">
                  Travel & work eligibility
                </div>
                {/* Audit fix #8 — back-reference to Identity for related
                    "where can I legally work" data (nationality + country
                    of residence). Helps the talent see the cluster
                    despite the data being split across two ProfileState
                    slices. */}
                <div style={{ marginBottom: 10, fontSize: 11.5, fontFamily: FONTS.body, display: "inline-flex", alignItems: "center", gap: 6 }} className="text-admin-ink-muted">
                  <span aria-hidden>ℹ️</span>
                  <span>Nationality &amp; country of residence are in <strong>Identity</strong>.</span>
                </div>
                <FieldRow
                  label="Passport status"
                  optional
                  hint="Pre-checks international bookings."
                  visibility={state.dynFieldVisibility["serviceArea.passport"] ?? ["agency"]}
                  onVisibilityChange={(next) => patch({
                    dynFieldVisibility: { ...state.dynFieldVisibility, "serviceArea.passport": next },
                  })}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {[
                      { id: "valid",   label: "Valid" },
                      { id: "expired", label: "Expired" },
                      { id: "none",    label: "None" },
                    ].map(opt => {
                      const active = state.serviceArea.passport === opt.id;
                      return (
                        <button key={opt.id} type="button" onClick={() =>
                          patch({ serviceArea: { ...state.serviceArea, passport: active ? undefined : opt.id as "valid" | "expired" | "none" } })
                        } style={{
                          padding: "6px 11px", borderRadius: 999,
                          border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                          background: active ? "rgba(15,79,62,0.08)" : "#fff",
                          color: active ? COLORS.accentDeep : COLORS.ink,
                          fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                          fontFamily: FONTS.body,
                        }}>{opt.label}</button>
                      );
                    })}
                  </div>
                </FieldRow>
                <div style={{ height: 8 }} />
                <FieldRow
                  label="Driver's license"
                  optional
                  hint="Drives commercial / chauffeur / on-set transport jobs."
                  visibility={state.dynFieldVisibility["serviceArea.driversLicense"] ?? ["agency"]}
                  onVisibilityChange={(next) => patch({
                    dynFieldVisibility: { ...state.dynFieldVisibility, "serviceArea.driversLicense": next },
                  })}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {[
                      { id: "none",          label: "None" },
                      { id: "standard",      label: "Standard" },
                      { id: "international", label: "International" },
                      { id: "commercial",    label: "Commercial" },
                    ].map(opt => {
                      const active = state.serviceArea.driversLicense === opt.id;
                      return (
                        <button key={opt.id} type="button" onClick={() =>
                          patch({ serviceArea: { ...state.serviceArea, driversLicense: active ? undefined : opt.id as "none" | "standard" | "commercial" | "international" } })
                        } style={{
                          padding: "6px 11px", borderRadius: 999,
                          border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                          background: active ? "rgba(15,79,62,0.08)" : "#fff",
                          color: active ? COLORS.accentDeep : COLORS.ink,
                          fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                          fontFamily: FONTS.body,
                        }}>{opt.label}</button>
                      );
                    })}
                  </div>
                </FieldRow>
                <div style={{ height: 8 }} />
                <FieldRow label="Owns a vehicle" optional catalogId="serviceArea.ownsVehicle" tenantId={workspaceScopeTenantId}>
                  <ToggleControl
                    value={!!state.serviceArea.ownsVehicle}
                    onChange={(v) => patch({ serviceArea: { ...state.serviceArea, ownsVehicle: v } })}
                    label="Has access to own vehicle for shoot logistics" />
                </FieldRow>
                <div style={{ height: 8 }} />
                <FieldRow
                  label="Work-eligible countries"
                  optional
                  hint="ISO codes — drives international booking pre-checks."
                  visibility={state.dynFieldVisibility["serviceArea.workEligibility"] ?? ["agency"]}
                  onVisibilityChange={(next) => patch({
                    dynFieldVisibility: { ...state.dynFieldVisibility, "serviceArea.workEligibility": next },
                  })}
                >
                  <ChipsInput label="" placeholder="e.g. ES, FR, MX…"
                    values={state.serviceArea.workEligibility ?? []}
                    onChange={patchWorkEligibility}
                  />
                </FieldRow>
                <div style={{ height: 8 }} />
                <FieldRow
                  label="Visas held"
                  optional
                  hint="Active visa countries beyond home country."
                  visibility={state.dynFieldVisibility["serviceArea.visaCountries"] ?? ["agency"]}
                  onVisibilityChange={(next) => patch({
                    dynFieldVisibility: { ...state.dynFieldVisibility, "serviceArea.visaCountries": next },
                  })}
                >
                  <ChipsInput label="" placeholder="e.g. US (B1/B2), GB…"
                    values={state.serviceArea.visaCountries ?? []}
                    onChange={patchVisaCountries}
                  />
                </FieldRow>
              </div>
            </ProfileAccordionSection>

            {/* VIDEO — hello reel + social/video links */}
            <ProfileAccordionSection
              id="media" primaryType={state.primaryType ? [state.primaryType, ...state.secondaryTypes] : state.secondaryTypes} title="Photos & video"
              sub="Profile photo, cover, gallery, hello reel, and social links."
              complete={sectionComplete.media} started={sectionStarted.media}
              open={activeSection === "media"}
              onToggle={() => setActiveSection(activeSection === "media" ? "" : "media")}
            >
              <HelloReelEditor
                reel={state.helloReel}
                onChange={patchHelloReel}
                talentProfileId={payload.talentId}
              />
              <FieldRow label="Video / social links" optional catalogId="links" tenantId={workspaceScopeTenantId}>
                <ChipsInput label="" placeholder="https://instagram.com/…" values={state.videoLinks ?? []} onChange={patchVideoLinks} />
              </FieldRow>
            </ProfileAccordionSection>

            {/* ALBUMS */}
            <ProfileAccordionSection
              id="albums" primaryType={state.primaryType ? [state.primaryType, ...state.secondaryTypes] : state.secondaryTypes}
              title={isServicesPrimary ? "Work & venue albums" : "Portfolio albums"}
              sub={isServicesPrimary
                ? "Group photos by venue or job — Suites, Hallways, Behind-the-scenes."
                : "Group photos by mood — Editorial, Lookbook, Behind-the-scenes."}
              complete={sectionComplete.albums} started={sectionStarted.albums}
              open={activeSection === "albums"}
              onToggle={() => setActiveSection(activeSection === "albums" ? "" : "albums")}
            >
              <AlbumsEditorPro
                albums={state.albumsPro}
                activeId={state.activeAlbumId}
                onActivate={(id) => patch({ activeAlbumId: id })}
                onChange={(albs) => patch({ albumsPro: albs })}
                loading={hydratingMedia}
              />
            </ProfileAccordionSection>

            {/* POLAROIDS — model-industry standard 5-shot set. Hidden for
                Impronta until tenant/type-level media rules are configurable. */}
            {showPolaroidsSection && (
              <ProfileAccordionSection
                id="polaroids" primaryType={state.primaryType ? [state.primaryType, ...state.secondaryTypes] : state.secondaryTypes} title="Polaroids"
                sub="5-shot set casting directors expect: front, side, back, smile, no-makeup."
                complete={sectionComplete.polaroids} started={sectionStarted.polaroids}
                open={activeSection === "polaroids"}
                onToggle={() => setActiveSection(activeSection === "polaroids" ? "" : "polaroids")}
              >
                <PolaroidsEditor
                  polaroids={state.polaroids}
                  onChange={patchPolaroids}
                  talentProfileId={payload.talentId}
                />
              </ProfileAccordionSection>
            )}

            {/* ABOUT — locale-aware bios + tone + personality */}
            <ProfileAccordionSection
              id="about" primaryType={state.primaryType ? [state.primaryType, ...state.secondaryTypes] : state.secondaryTypes} title="About"
              sub="2–3 sentences per language."
              complete={sectionComplete.about} started={sectionStarted.about}
              open={activeSection === "about"}
              onToggle={() => setActiveSection(activeSection === "about" ? "" : "about")}
            >
              <BiosEditor
                bios={state.bios}
                activeLocale={state.bioActiveLocale}
                onActivateLocale={patchBioActiveLocale}
                onChange={patchBios}
                onRegenerate={onBiosRegenerate}
                primaryLabel={primaryRes?.child.label}
                disabled={personalProfileLocked}
              />
              <PersonalityEditor value={state.personality} onChange={patchPersonality} />
              {/* Languages folded in from the old standalone Languages
                  section — it's factual profile metadata that belongs
                  with the rest of "who this person is". */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: COLORS.inkMuted, marginBottom: 6 }}>
                  Languages
                  <span style={{ marginLeft: 6, fontWeight: 500, letterSpacing: 0 }} className="text-admin-ink-dim">· Languages this talent can use with clients.</span>
                </div>
                {payload.talentId && bridgeTenantIdentity?.tenantId ? (
                  <>
                    <ProfileShellSectionSaveHint locked={personalProfileLocked} />
                    <LanguageSlotPanel
                      talentProfileId={payload.talentId}
                      disabled={personalProfileLocked}
                      persistMode="deferred"
                      onHydrated={handleDeferredLanguagesHydrated}
                      onLanguagesChange={handleDeferredLanguagesChange}
                    />
                  </>
                ) : (
                  <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                      {LANGUAGE_PRESETS.map(p => (
                        <button key={p.id} type="button" onClick={() => {
                          const existing = new Set(state.languages.map(l => l.language.toLowerCase()));
                          const additions = p.langs
                            .filter(l => !existing.has(l.toLowerCase()))
                            .map<ProfileLanguage>((l, i) => ({ language: l, level: i === 0 ? "native" : "fluent" }));
                          if (additions.length > 0) patch({ languages: [...state.languages, ...additions] });
                        }} style={{
                          padding: "5px 11px", borderRadius: 999,
                          border: `1px dashed ${COLORS.border}`,
                          background: "transparent", color: COLORS.inkMuted,
                          fontSize: 11, fontWeight: 500, cursor: "pointer",
                          fontFamily: FONTS.body,
                        }}>{p.label}</button>
                      ))}
                    </div>
                    <LanguagesEditor value={state.languages} onChange={patchLanguages} />
                  </>
                )}
              </div>
              {/* General profile fields — the always-on global groups
                  (Creator / Experience / Media). Moved out of the
                  type-driven Specialty switcher into About so Specialty
                  stays purely type-driven. Same engine, scope="general". */}
              {hasResolvedEngineContext && payload.talentId && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${COLORS.borderSoft}` }}>
                  <LiveCategoryFieldsEditor
                    talentProfileId={payload.talentId}
                    scope="general"
                    refreshKey={taxonomyVersion}
                    viewMode={isSelf ? "talent-self" : "admin"}
                    serverActions={talentSelfFieldActions}
                  />
                </div>
              )}
            </ProfileAccordionSection>

            {/* PROFILE FIELDS — DB-driven, per-talent-type catalog editor.
                The rail nests these dynamic service detail categories under
                Services, while the section id stays `profile_fields`.
                Single-section pattern: like every ProfileAccordion-
                Section, it must ONLY be visible when it is the active rail
                section — otherwise the entire type-specific Details engine
                bleeds into the bottom of every other section (Location,
                Identity, Rates …). We gate with `display` rather than
                unmounting so the `onCountsChange` side-effect keeps the
                rail's Details completion dot live and the editor doesn't
                re-fetch on every visit. */}
            {hasResolvedEngineContext && payload.talentId && (
              <section
                id="pshell-profile_fields"
                style={{
                  display: activeSection === "profile_fields" ? "block" : "none",
                  background: "#fff",
                }}
              >
                {/* Identical title + padding frame to ProfileAccordion-
                    Section so Details aligns with Location / Availability /
                    Rates etc. — consistent look & feel, not a flush-left
                    raw mount. */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "16px 24px 6px", textAlign: "left",
                  fontFamily: FONTS.body,
                }}>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.1 }} className="text-admin-ink">
                      {copy.t(profileFieldHeaderTitle)}
                    </div>
                    <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
                      {copy.t(profileFieldHeaderDescription)}
                    </div>
                  </div>
                </div>
                <div style={{ padding: "0 24px 20px 24px" }}>
                  <LiveCategoryFieldsEditor
                    talentProfileId={payload.talentId}
                    refreshKey={taxonomyVersion}
                    viewMode={isSelf ? "talent-self" : "admin"}
                    serverActions={talentSelfFieldActions}
                    onCountsChange={setProfileFieldCounts}
                    onGroupNavChange={setProfileFieldNavGroups}
                    onRequiredMissingChange={setProfileFieldRequiredMissing}
                    onResolvedFieldsChange={setProfileFieldAllFields}
                    activeGroupKey={activeProfileFieldGroupKey}
                    onActiveGroupChange={setActiveProfileFieldGroupKey}
                    hideInlineCategoryNav
                    hasSelectedTalentType={selectedTalentTypeSlugs.length > 0}
                  />
                </div>
              </section>
            )}

            {/* PHYSICAL & MEASUREMENTS — dedicated accordion mirroring
                the talent surface's "Measurements & features" card.
                Pulls fields tagged `subsection: "physical"` from the
                per-type schema (TAXONOMY_FIELDS). Renders in a 2-col
                grid on desktop / single column on mobile so the
                editing experience matches the surface's grid layout
                and feels like a coherent measurement block, not a
                vertical text-input list. */}
            {dynamicGroups.some(g => g.fields.some(f => f.subsection === "physical")) && (
              <ProfileAccordionSection
                id="physical" primaryType={state.primaryType ? [state.primaryType, ...state.secondaryTypes] : state.secondaryTypes} title="Physical & measurements"
                sub="Height, body sizes, features."
                complete={sectionComplete.physical} started={sectionStarted.physical}
                open={activeSection === "physical"}
                onToggle={() => setActiveSection(activeSection === "physical" ? "" : "physical")}
              >
                {dynamicGroups.map(g => {
                  const physical = g.fields.filter(f => f.subsection === "physical");
                  if (physical.length === 0) return null;
                  return (
                    <div key={g.parent.id} style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 10,
                    }}>
                      <style>{`
                        @container pshell (max-width: 540px) {
                          [data-pshell-physical-grid] { grid-template-columns: 1fr !important; }
                        }
                      `}</style>
                      <div data-pshell-physical-grid style={{ display: "contents" }} />
                      {physical.map(f => (
                        <RegFieldInput key={f.id} field={f}
                          value={state.dynFields[f.id] ?? (f.kind === "multiselect" || f.kind === "chips" ? [] : "")}
                          onChange={(v) => setDyn(f.id, v)}
                          visibility={state.dynFieldVisibility[f.id] ?? f.defaultVisibility}
                          onVisibilityChange={(next) => patch({
                            dynFieldVisibility: { ...state.dynFieldVisibility, [f.id]: next },
                          })}
                          primaryType={state.primaryType ? [state.primaryType, ...state.secondaryTypes] : state.secondaryTypes}
                          tenantId={workspaceScopeTenantId}
                        />
                      ))}
                    </div>
                  );
                })}
              </ProfileAccordionSection>
            )}

            {/* WARDROBE SIZES — separated from physical so a model who
                only wants to fill body data isn't asked about shoes/
                dress in the same breath. Same grid layout. */}
            {dynamicGroups.some(g => g.fields.some(f => f.subsection === "wardrobe")) && (
              <ProfileAccordionSection
                id="wardrobe" primaryType={state.primaryType ? [state.primaryType, ...state.secondaryTypes] : state.secondaryTypes} title="Wardrobe sizes"
                sub="Shoe, dress, suit sizes."
                complete={sectionComplete.wardrobe} started={sectionStarted.wardrobe}
                open={activeSection === "wardrobe"}
                onToggle={() => setActiveSection(activeSection === "wardrobe" ? "" : "wardrobe")}
              >
                {dynamicGroups.map(g => {
                  const wardrobe = g.fields.filter(f => f.subsection === "wardrobe");
                  if (wardrobe.length === 0) return null;
                  return (
                    <div key={g.parent.id} style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 10,
                    }}>
                      {wardrobe.map(f => (
                        <RegFieldInput key={f.id} field={f}
                          value={state.dynFields[f.id] ?? (f.kind === "multiselect" || f.kind === "chips" ? [] : "")}
                          onChange={(v) => setDyn(f.id, v)}
                          visibility={state.dynFieldVisibility[f.id] ?? f.defaultVisibility}
                          onVisibilityChange={(next) => patch({
                            dynFieldVisibility: { ...state.dynFieldVisibility, [f.id]: next },
                          })}
                          primaryType={state.primaryType ? [state.primaryType, ...state.secondaryTypes] : state.secondaryTypes}
                          tenantId={workspaceScopeTenantId}
                        />
                      ))}
                    </div>
                  );
                })}
              </ProfileAccordionSection>
            )}

            {/* DETAILS — leftover catch-all for non-physical, non-wardrobe
                type-specific fields (e.g. years modeling, allergies). */}
            {(dynamicGroups.some(g => g.fields.some(f => !f.subsection)) || workspaceCustomTalentFields.length > 0) && (
              <ProfileAccordionSection
                id="details" primaryType={state.primaryType ? [state.primaryType, ...state.secondaryTypes] : state.secondaryTypes} title="Profile details"
                sub="Fields specific to this kind of work."
                complete={sectionComplete.details} started={sectionStarted.details}
                open={activeSection === "details"}
                onToggle={() => setActiveSection(activeSection === "details" ? "" : "details")}
              >
                {dynamicGroups.map(g => {
                  const other = g.fields.filter(f => !f.subsection);
                  if (other.length === 0) return null;
                  return (
                  <div key={g.parent.id}>
                    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 8 }} className="text-admin-ink-muted">
                      {g.parent.emoji}  {g.parent.label}
                    </div>
                    <div className="flex flex-col gap-2.5">
                      {other.map(f => (
                        <RegFieldInput key={f.id} field={f}
                          value={state.dynFields[f.id] ?? (f.kind === "multiselect" || f.kind === "chips" ? [] : "")}
                          onChange={(v) => setDyn(f.id, v)}
                          visibility={state.dynFieldVisibility[f.id] ?? f.defaultVisibility}
                          onVisibilityChange={(next) => patch({
                            dynFieldVisibility: { ...state.dynFieldVisibility, [f.id]: next },
                          })}
                          primaryType={state.primaryType ? [state.primaryType, ...state.secondaryTypes] : state.secondaryTypes}
                          tenantId={workspaceScopeTenantId}
                        />
                      ))}
                    </div>
                  </div>
                  );
                })}

                {/* Custom workspace fields — agency-specific extras added via Field Catalog */}
                {workspaceCustomTalentFields.length > 0 && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 8 }} className="text-admin-ink-muted">
                      <span className="text-admin-13">✦</span>
                      Custom workspace fields
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 999,
                        background: "rgba(184,135,49,0.14)", color: "#7A5A1F",
                        marginLeft: 4, letterSpacing: 0.4,
                      }}>AGENCY</span>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      {workspaceCustomTalentFields.map(cf => (
                        <CustomWorkspaceFieldInput
                          key={cf.id}
                          field={cf}
                          value={state.dynFields[`custom_${cf.id}`] ?? (cf.kind === "Multi-select" ? [] : "")}
                          onChange={(v) => setDyn(`custom_${cf.id}`, v)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Pointer to add more custom fields — discoverable handoff */}
                {(protoState.plan === "agency" || protoState.plan === "network") && (
                  <button type="button" onClick={() => openDrawer("field-catalog")} style={{
                    alignSelf: "flex-start",
                    padding: "6px 12px", borderRadius: 999,
                    background: "transparent", border: `1px dashed ${COLORS.border}`,
                    color: COLORS.inkMuted,
                    fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 500, cursor: "pointer",
                  }}>
                    + Add custom field
                  </button>
                )}
              </ProfileAccordionSection>
            )}

            {/* AVAILABILITY — moved before Rates per 2026 reset (B8). The
                logical flow is "Are you available? At what price?" not
                "Price first, then schedule." */}
            <ProfileAccordionSection
              id="availability" primaryType={state.primaryType ? [state.primaryType, ...state.secondaryTypes] : state.secondaryTypes} title="Availability"
              sub="Tap a day to block it. Open by default."
              complete={sectionComplete.availability} started={sectionStarted.availability}
              open={activeSection === "availability"}
              onToggle={() => setActiveSection(activeSection === "availability" ? "" : "availability")}
            >
              <AvailabilityGrid
                cells={state.availability}
                onToggle={(date) => {
                  const cur = state.availability.find(c => c.date === date);
                  const cycle: Record<AvailabilityStatus, AvailabilityStatus> = { open: "busy", busy: "blocked", blocked: "open" };
                  if (cur) {
                    if (cur.status === "blocked") {
                      patch({ availability: state.availability.filter(c => c.date !== date) });
                    } else {
                      patch({ availability: state.availability.map(c => c.date === date ? { ...c, status: cycle[c.status] } : c) });
                    }
                  } else {
                    patch({ availability: [...state.availability, { date, status: "busy" }] });
                  }
                }}
              />
              <RecurringPatternEditor
                value={state.recurring}
                vacation={state.vacation}
                onChange={(r) => patch({ recurring: r })}
                onVacationChange={(v) => patch({ vacation: v })}
              />
            </ProfileAccordionSection>

            {/* RATES — now after Availability (B8 swap). */}
            <ProfileAccordionSection
              id="rates" primaryType={state.primaryType ? [state.primaryType, ...state.secondaryTypes] : state.secondaryTypes} title="Rates"
              sub="Day rates, package deals, travel costs."
              complete={sectionComplete.rates} started={sectionStarted.rates}
              open={activeSection === "rates"}
              onToggle={() => setActiveSection(activeSection === "rates" ? "" : "rates")}
            >
              {/* Audit fix #3 — when admin locks "rates", talent sees the
                  whole section read-only with the reason text. The toggle
                  for askForQuote and the editors below all gate on the
                  same path. Without this, the lock chip was decorative. */}
              {isSelf && state.fieldLocks.includes("rates") && (
                <LockedHint reason={state.fieldLockReasons["rates"]} />
              )}

              {/* Audit fix #11 — Rate-card visibility control. Talent and
                  agency need to decide whether numbers show publicly,
                  agency-only, or on-request only. Surfaces alongside
                  the actual rate inputs. */}
              <FieldRow
                label="Who sees these rates?"
                hint="Public on the profile, agency-only on the roster, or on-request via inquiry."
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {([
                    { id: "public" as const,      label: "Public" },
                    { id: "agency-only" as const, label: "Agency only" },
                    { id: "on-request" as const,  label: "On request" },
                  ]).map(opt => {
                    const active = state.rateCardVisibility === opt.id;
                    return (
                      <button key={opt.id} type="button" onClick={() => patch({ rateCardVisibility: opt.id })} style={{
                        padding: "6px 11px", borderRadius: 999,
                        border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                        background: active ? "rgba(15,79,62,0.08)" : "#fff",
                        color: active ? COLORS.accentDeep : COLORS.ink,
                        fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                        fontFamily: FONTS.body,
                      }}>{opt.label}</button>
                    );
                  })}
                </div>
              </FieldRow>
              <FieldRow label="Pricing mode" optional>
                <ToggleControl value={state.askForQuote}
                  onChange={(v) => patch({ askForQuote: v })}
                  disabled={isSelf && state.fieldLocks.includes("rates")}
                  label="Negotiated only — clients see 'Ask for quote' instead of a number" />
              </FieldRow>
              {!state.askForQuote && (
                <div style={{ opacity: isSelf && state.fieldLocks.includes("rates") ? 0.55 : 1, pointerEvents: isSelf && state.fieldLocks.includes("rates") ? "none" : "auto" }}>
                  <RatesEditor
                    rates={state.rates}
                    selectedTypeIds={allSelectedTypeIds}
                    onChange={patchRates}
                  />
                </div>
              )}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 6, marginTop: 6 }} className="text-admin-ink-muted">
                  Package bundles
                </div>
                <PackageRatesEditor packages={state.packageRates} onChange={(p) => patch({ packageRates: p })} />
              </div>
              <FieldRow label="Travel" optional>
                <ToggleControl value={state.travelIncluded}
                  onChange={(v) => patch({ travelIncluded: v })}
                  label="Travel included in rate" />
              </FieldRow>
              <FieldRow label="Lodging" optional>
                <ToggleControl value={state.lodgingIncluded}
                  onChange={(v) => patch({ lodgingIncluded: v })}
                  label="Lodging included in rate" />
              </FieldRow>
              {adminVisible && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  <FieldLockToggle path="rates" locks={state.fieldLocks} onChange={(l) => patch({ fieldLocks: l })} />
                </div>
              )}
            </ProfileAccordionSection>

            {/* BOOKING TERMS — talent commercial preferences (deposit % /
                refund policy / instant-book / fixed rate). Self-saving via
                CommercialTermsEditor (talent_profiles.booking_terms); not
                threaded through the batched profile save. Needs a real
                talentId, so it's hidden in create mode until the row exists. */}
            {payload.talentId && mode !== "create" && (
              <ProfileAccordionSection
                id="commercial_terms" title="Booking terms"
                sub="Default deposit, refund policy and instant-book preferences."
                complete={sectionComplete.commercial_terms} started={sectionStarted.commercial_terms}
                open={activeSection === "commercial_terms"}
                onToggle={() => setActiveSection(activeSection === "commercial_terms" ? "" : "commercial_terms")}
              >
                <CommercialTermsEditor talentId={payload.talentId} />
                {/* S13 — admin parity for the services menu (same self-saving
                    card the talent uses; configuration only). */}
                <TalentServicesMenuCard talentId={payload.talentId} />
              </ProfileAccordionSection>
            )}

            {/* REVIEWS — the talent's RECEIVED (client→talent) reviews, with
                the public average. Self-loading via ProfileReviewsEditor;
                admins get Hide/Unhide, the talent (isSelf) gets Report. Needs
                a real talentId, so hidden in create mode until the row exists. */}
            {payload.talentId && mode !== "create" && (
              <ProfileAccordionSection
                id="reviews" title="Reviews"
                sub="Reviews clients left after working with this talent."
                complete={sectionComplete.reviews} started={sectionStarted.reviews}
                open={activeSection === "reviews"}
                onToggle={() => setActiveSection(activeSection === "reviews" ? "" : "reviews")}
              >
                <ProfileReviewsEditor talentId={payload.talentId} isSelf={isSelf} />
              </ProfileAccordionSection>
            )}

            {/* REFINEMENT — prototype SkillsProEditor is not batch-saved; hide when DB-backed SkillSlotPanel is active. */}
            {!hasResolvedEngineContext && (
            <ProfileAccordionSection
              id="refinement" primaryType={state.primaryType ? [state.primaryType, ...state.secondaryTypes] : state.secondaryTypes} title="Refinement"
              sub="Skills they have. Contexts where they shine."
              complete={sectionComplete.refinement} started={sectionStarted.refinement}
              open={activeSection === "refinement"}
              onToggle={() => setActiveSection(activeSection === "refinement" ? "" : "refinement")}
            >
              <div style={{
                display: "inline-flex", padding: 3, borderRadius: 999,
                background: "rgba(11,11,13,0.04)",
              }}>
                {([
                  { id: "skills" as const,   label: state.skillEntries.length ? `Skills · ${state.skillEntries.length}`   : "Skills" },
                  { id: "contexts" as const, label: state.contexts.length     ? `Best for · ${state.contexts.length}`     : "Best for" },
                ]).map(tb => {
                  const active = refinementTab === tb.id;
                  return (
                    <button key={tb.id} type="button" onClick={() => setRefinementTab(tb.id)} style={{
                      padding: "6px 14px", borderRadius: 999, border: "none",
                      background: active ? "#fff" : "transparent",
                      color: active ? COLORS.ink : COLORS.inkMuted,
                      fontFamily: FONTS.body, fontSize: 12, fontWeight: 600,
                      cursor: "pointer",
                      boxShadow: active ? "0 1px 2px rgba(11,11,13,0.06)" : "none",
                    }}>{tb.label}</button>
                  );
                })}
              </div>
              {refinementTab === "skills" ? (
                <SkillsProEditor entries={state.skillEntries} onChange={setSkill} />
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {CONTEXT_CATALOG.map(c => {
                    const active = state.contexts.includes(c.id);
                    return (
                      <button key={c.id} type="button" onClick={() => toggleSet("contexts")(c.id)} style={{
                        padding: "6px 11px", borderRadius: 999,
                        border: `1.5px solid ${active ? COLORS.indigo : COLORS.borderSoft}`,
                        background: active ? COLORS.indigoSoft : "#fff",
                        color: active ? COLORS.indigoDeep : COLORS.ink,
                        fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 500, cursor: "pointer",
                      }}>{c.label}</button>
                    );
                  })}
                </div>
              )}
            </ProfileAccordionSection>
            )}

            {/* PROFICIENCY HINTS BANNER — Phase 6.3. Services section only. */}
            {(adminVisible || isSelf) && payload.talentId &&
              (activeSection === "" || activeSection === "services") && (
              <div style={{ padding: "0 24px" }}>
                <SkillHintsBanner
                  talentProfileId={payload.talentId}
                  viewMode={adminVisible ? "admin" : "talent-self"}
                />
              </div>
            )}

            {/* PER-AGENCY SKILL OVERRIDES (admin only) — Services section
                only. P3-phase-2: collapsed by default; SkillOverridesPanel
                (and its getResolvedSkills + getAgencySkillOverrides fetch /
                "Loading skill overrides…" state) does not mount until the
                user expands "Advanced agency settings". */}
            {adminVisible && payload.talentId &&
              (activeSection === "" || activeSection === "services") && (
              <AdvancedAgencySettingsSection talentProfileId={payload.talentId} />
            )}

            {/* SKILL FRESHNESS + VERIFICATION-EXPIRY PROMPTS — Phase 6.4. Services section only. */}
            {(adminVisible || isSelf) && payload.talentId &&
              (activeSection === "" || activeSection === "services") && (
              <div style={{ padding: "0 24px" }}>
                <SkillFreshnessBanner
                  talentProfileId={payload.talentId}
                  viewMode={adminVisible ? "admin" : "talent-self"}
                />
              </div>
            )}

            {/* CREDITS — past work / campaigns / editorials */}
            <ProfileAccordionSection
              id="credits" primaryType={state.primaryType ? [state.primaryType, ...state.secondaryTypes] : state.secondaryTypes} title="Credits"
              sub="Past work. Pin your top 3."
              complete={sectionComplete.credits} started={sectionStarted.credits}
              open={activeSection === "credits"}
              onToggle={() => setActiveSection(activeSection === "credits" ? "" : "credits")}
            >
              <CreditsEditor
                credits={state.credits}
                onChange={patchCredits}
              />
            </ProfileAccordionSection>

            {/* LIMITS — hard/soft constraints */}
            <ProfileAccordionSection
              id="limits" primaryType={state.primaryType ? [state.primaryType, ...state.secondaryTypes] : state.secondaryTypes} title="Limits"
              sub="Hard no's. Soft case-by-case. Clients see this on the brief."
              complete={sectionComplete.limits} started={sectionStarted.limits}
              open={activeSection === "limits"}
              onToggle={() => setActiveSection(activeSection === "limits" ? "" : "limits")}
            >
              <LimitsEditor
                limits={state.limits}
                onChange={patchLimits}
              />
            </ProfileAccordionSection>

            {/* FILES — work documents (W-8BEN, NDA, model release, certifications) */}
            <ProfileAccordionSection
              id="files" primaryType={state.primaryType ? [state.primaryType, ...state.secondaryTypes] : state.secondaryTypes} title="Files"
              sub="Tax forms, releases, certifications. Admin-only by default."
              complete={sectionComplete.files} started={sectionStarted.files}
              open={activeSection === "files"}
              onToggle={() => setActiveSection(activeSection === "files" ? "" : "files")}
            >
              <FilesEditor
                files={state.files}
                onChange={patchFiles}
                talentProfileId={payload.talentId}
              />
            </ProfileAccordionSection>

            {/* SOCIAL PROOF */}
            <ProfileAccordionSection
              id="social_proof" primaryType={state.primaryType ? [state.primaryType, ...state.secondaryTypes] : state.secondaryTypes} title="Past clients & testimonials"
              sub="Past clients + 1-line quotes. Verified bookings get a checkmark."
              complete={sectionComplete.social_proof} started={sectionStarted.social_proof}
              open={activeSection === "social_proof"}
              onToggle={() => setActiveSection(activeSection === "social_proof" ? "" : "social_proof")}
            >
              <PastClientsEditor clients={state.pastClients} onChange={patchPastClients} />
            </ProfileAccordionSection>

            {/* VERIFICATIONS */}
            <ProfileAccordionSection
              id="verifications" primaryType={state.primaryType ? [state.primaryType, ...state.secondaryTypes] : state.secondaryTypes} title="Trust & verification"
              sub="Verification level. Higher tier = more visibility."
              complete={sectionComplete.verifications} started={sectionStarted.verifications}
              open={activeSection === "verifications"}
              onToggle={() => setActiveSection(activeSection === "verifications" ? "" : "verifications")}
            >
              {adminVisible && (
                <div style={{ fontSize: 12, lineHeight: 1.45, padding: "10px 12px", borderRadius: 10, background: "rgba(15,79,62,0.06)", border: `1px solid rgba(15,79,62,0.12)`, marginBottom: 12, fontFamily: FONTS.body }} className="text-admin-ink-muted">
                  {copy.t("Trust preview note")}
                </div>
              )}
              <VerificationsEditor
                verifications={state.verifications}
                tier={trust}
                onChange={(v) => patch({ verifications: v })}
                isSelf={isSelf}
              />
              <NextTierCoach tier={trust} verifications={state.verifications} />
            </ProfileAccordionSection>

            {/* ADMIN */}
            {adminVisible && (
              <ProfileAccordionSection
                id="admin" primaryType={state.primaryType ? [state.primaryType, ...state.secondaryTypes] : state.secondaryTypes} title="Admin controls" sub="Visible only to your team."
                complete open={activeSection === "admin"}
                onToggle={() => setActiveSection(activeSection === "admin" ? "" : "admin")}
                accent="amber"
              >
                <FieldRow label="Feature in directory" optional>
                  <ToggleControl value={state.featureInDirectory} onChange={(v) => patch({ featureInDirectory: v })}
                    label="Pin near the top of Discover" />
                </FieldRow>
                <FieldRow label="Internal notes" hint="Visible to your team only.">
                  <textarea value={state.internalNotes} onChange={(e) => patch({ internalNotes: e.target.value })}
                    placeholder="Reliability notes, payment terms, special instructions…"
                    rows={3}
                    style={{
                      width: "100%", boxSizing: "border-box", padding: "10px 12px",
                      borderRadius: 10, border: `1px solid ${COLORS.border}`,
                      fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none",
                      resize: "vertical",
                    }}
                  />
                </FieldRow>

                {/* Audit fix #10 — Emergency contact editor. Lives in
                    the admin section (not identity) because it's
                    booking-time only data — masked on public, visible
                    during active bookings only. Three small inputs
                    side-by-side; production wires a phone-format
                    validator and a relation enum. */}
                <FieldRow
                  label="Emergency contact"
                  hint="Masked on public profile. Visible to coordinators during active bookings only."
                >
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input
                      type="text"
                      placeholder="Name"
                      value={state.emergencyContact.name}
                      onChange={(e) => patch({ emergencyContact: { ...state.emergencyContact, name: e.target.value } })}
                      style={{
                        boxSizing: "border-box", padding: "10px 12px",
                        borderRadius: 10, border: `1px solid ${COLORS.border}`,
                        fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none",
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Relation (e.g. Mother, Manager)"
                      value={state.emergencyContact.relation}
                      onChange={(e) => patch({ emergencyContact: { ...state.emergencyContact, relation: e.target.value } })}
                      style={{
                        boxSizing: "border-box", padding: "10px 12px",
                        borderRadius: 10, border: `1px solid ${COLORS.border}`,
                        fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none",
                      }}
                    />
                    <input
                      type="tel"
                      placeholder="Phone (with country code)"
                      value={state.emergencyContact.phone}
                      onChange={(e) => patch({ emergencyContact: { ...state.emergencyContact, phone: e.target.value } })}
                      style={{
                        gridColumn: "1 / -1",
                        boxSizing: "border-box", padding: "10px 12px",
                        borderRadius: 10, border: `1px solid ${COLORS.border}`,
                        fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none",
                      }}
                    />
                  </div>
                </FieldRow>
                {/* Profile ownership — convert agency-managed to claimable */}
                <FieldRow
                  label="Profile ownership"
                  hint="Hand the keys to the talent so they can edit their own profile + accept inquiries directly."
                >
                  <ProfileOwnershipPanel
                    talentProfileId={payload.talentId}
                    talentName={state.stageName || "this talent"}
                    contactEmail={payload.seed?.contact}
                  />
                </FieldRow>
                {/* Step 7 — Field locks overview. Single panel surfacing
                    every locked path on this profile so admins can see at
                    a glance what the talent can't self-edit, with a per-
                    lock reason for context (why we locked, e.g. "set by
                    contract" or "requires re-verification"). Editing
                    any individual lock still happens in-section via the
                    FieldLockToggle next to the field — this panel is the
                    bird's-eye view + reason store. */}
                <FieldRow
                  label="Locked fields"
                  hint="Talent can't edit these without admin approval. Add a short reason so they understand why."
                >
                  <FieldLocksOverviewPanel
                    locks={state.fieldLocks}
                    reasons={state.fieldLockReasons}
                    onUnlock={(path) => patch({ fieldLocks: state.fieldLocks.filter(p => p !== path) })}
                    onSetReason={(path, reason) => patch({
                      fieldLockReasons: { ...state.fieldLockReasons, [path]: reason },
                    })}
                  />
                </FieldRow>
                {/* #9 — Recent activity / change log */}
                <FieldRow label="Recent activity" hint="Last 5 changes to this profile. Tap to see diff.">
                  <ProfileActivityLog talentProfileId={payload.talentId} />
                </FieldRow>
              </ProfileAccordionSection>
            )}

            <div style={{ height: 16 }} />
          </div>
        </div>

        {/* The bottom mobile-save bar (status pill + Publish CTA) was removed
            in favor of the always-visible header controls (Save button +
            StatusPillDropdown). Killed the footer to reclaim ~56px of vertical
            real estate. The Publish action lives inside the StatusPillDropdown
            (pick "Published") and is gated by the same missing-field rules. */}

        {/* View as client modal */}
        {viewAsClient && (
          <ViewAsClientModal
            stageName={state.stageName}
            tagline={state.tagline}
            primaryRes={primaryRes}
            secondaryTypes={state.secondaryTypes}
            specialties={state.specialties}
            serviceArea={state.serviceArea}
            photos={state.albumsPro.flatMap(a => a.items.map(i => i.url))}
            languages={state.languages}
            trust={trust}
            bios={state.bios}
            onClose={() => setViewAsClient(false)}
          />
        )}

        {/* #8 — Publish celebration */}
        {publishCelebrationOpen && (
          <PublishCelebrationModal
            stageName={state.stageName}
            slug={(state.stageName || "talent").toLowerCase().replace(/\s+/g, "-")}
            tenantSlug={effectiveTenant.slug}
            onClose={() => { setPublishCelebrationOpen(false); closeDrawer(); }}
            onCopyLink={() => toast("Profile link copied")}
            onShare={() => toast("Sharing profile…")}
          />
        )}

        {/* #18 — Talent diff preview before submit (also reusable as
            #15 admin diff view from the approvals queue). */}
        {diffOpen && (
          <ProfileDiffModal
            entries={computeDiff()}
            mode={isSelf ? "talent" : "admin"}
            onClose={() => setDiffOpen(false)}
            onSubmit={() => { setDiffOpen(false); finalSubmit(); }}
            onApproveAll={!isSelf ? () => { setDiffOpen(false); finalSubmit(); } : undefined}
            onRejectAll={!isSelf ? () => { setDiffOpen(false); toast("Changes rejected — talent will be notified"); closeDrawer(); } : undefined}
            // #2 — Per-field decisions actually patch the record. Rejected
            // fields revert to the baseline; approved + undecided fields
            // keep the talent's submission. We dispatch a RESET with the
            // merged state, then commit.
            onApplyDecisions={!isSelf ? (rejected) => {
              const baseline = initialState.current;
              if (!baseline) return;
              const merged: ProfileState = { ...state };
              if (rejected.has("stageName")) merged.identity = { ...merged.identity, stageName: baseline.identity.stageName };
              if (rejected.has("tagline")) merged.tagline = baseline.tagline;
              if (rejected.has("primaryType")) merged.primaryType = baseline.primaryType;
              if (rejected.has("secondaryTypes")) merged.secondaryTypes = baseline.secondaryTypes;
              if (rejected.has("bio")) merged.bios = baseline.bios;
              if (rejected.has("homeBase")) merged.serviceArea = { ...merged.serviceArea, homeBase: baseline.serviceArea.homeBase };
              if (rejected.has("serviceCities")) merged.serviceArea = { ...merged.serviceArea, serviceCities: baseline.serviceArea.serviceCities };
              if (rejected.has("languages")) merged.languages = baseline.languages;
              if (rejected.has("photos")) merged.albumsPro = baseline.albumsPro;
              dispatch({ type: "RESET", state: merged });
              setDiffOpen(false);
              toast(`Applied · approved ${computeDiff().length - rejected.size} · reverted ${rejected.size}`);
            } : undefined}
          />
        )}

        {/* Phase 1 — MediaGalleryDrawer (three-slot photo block) */}
        {galleryDrawerOpen && payload.talentId && tenantSlug && (
          <MediaGalleryDrawer
            open={galleryDrawerOpen}
            onOpenChange={setGalleryDrawerOpen}
            talentId={payload.talentId}
            tenantSlug={tenantSlug}
            assets={galleryAssets}
            onAssetsChange={setGalleryAssets}
            focusSlot={galleryDrawerFocus}
            onSetAvatar={async (mediaAssetId, assetUrl) => {
              const res = await setTalentAvatar(tenantSlug, payload.talentId!, mediaAssetId);
              if (res.ok) {
                // assetUrl covers freshly-cropped assets not yet in
                // galleryAssets; fall back to the list otherwise.
                const url = assetUrl ?? galleryAssets.find(a => a.id === mediaAssetId)?.url;
                if (url) setAvatarPhotoUrl(url);
              }
              return res;
            }}
            onSetHero={async (mediaAssetId, assetUrl) => {
              const res = await setTalentHero(tenantSlug, payload.talentId!, mediaAssetId);
              if (res.ok) {
                const url = assetUrl ?? galleryAssets.find(a => a.id === mediaAssetId)?.url;
                if (url) setHeroPhotoUrl(url);
              }
              return res;
            }}
            onAddToPortfolio={async (storagePath) => {
              const res = await registerPortfolioPhoto(tenantSlug, payload.talentId!, { storagePath });
              if (res.ok) return { ok: true, id: res.data?.id };
              return { ok: false, error: res.error };
            }}
            onDeleteAsset={async (mediaAssetId) => {
              const res = await actionDeleteMediaAssets([mediaAssetId]);
              if (res.ok) {
                setGalleryAssets(prev => prev.filter(a => a.id !== mediaAssetId));
              }
              return res;
            }}
            onImportFromDrive={async (driveUrl) => {
              const res = await actionImportFromGoogleDrive(driveUrl, payload.talentId!);
              if (!res.ok) return { ok: false, error: res.error };
              return { ok: true, assets: res.data.assets };
            }}
            onListDriveFiles={async (driveUrl) => {
              const res = await actionListDriveFolder(driveUrl);
              if (!res.ok) return { ok: false, error: res.error };
              return { ok: true, fileIds: res.data.fileIds };
            }}
            onImportDriveFile={async (fileId, sortOrder) => {
              const res = await actionImportSingleDriveFile(fileId, payload.talentId!, sortOrder);
              if (!res.ok) return { ok: false, error: res.error };
              return { ok: true, asset: res.data };
            }}
            onReorderAssets={async (orderedIds) => {
              const res = await actionReorderMediaAssets(orderedIds);
              return { ok: res.ok, error: res.ok ? undefined : (res as { error?: string }).error };
            }}
            onUploadFile={async (file, variantKind, sourceMediaAssetId) => {
              const fd = new FormData();
              fd.append("file", file);
              const allowed = ["gallery", "card", "hero", "lightbox"] as const;
              const kind = allowed.includes(variantKind as typeof allowed[number])
                ? (variantKind as typeof allowed[number])
                : "gallery";
              const res = await actionUploadAndAssignMedia(fd, payload.talentId!, kind, {}, sourceMediaAssetId ?? null);
              if (!res.ok) return { ok: false, error: res.error };
              return {
                ok: true,
                asset: { id: res.data.id, url: res.data.publicUrl, variantKind: kind, sortOrder: res.data.sortOrder, sourceMediaAssetId: res.data.sourceMediaAssetId },
              };
            }}
            onRevertCrop={async (croppedId) => {
              const res = await actionRevertCropToSource(croppedId);
              if (!res.ok) return { ok: false, error: res.error };
              return { ok: true, sourceMediaAssetId: res.data.sourceMediaAssetId };
            }}
          />
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Phase 4 +20 — supporting helper components
// ════════════════════════════════════════════════════════════════════
