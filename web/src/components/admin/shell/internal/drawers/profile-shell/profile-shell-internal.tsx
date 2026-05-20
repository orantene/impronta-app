"use client";

// ════════════════════════════════════════════════════════════════════
// profile-shell-internal.tsx — Phase 1f THIN BARREL
//
// The 7,263-LOC monolith was decomposed into ./profile-shell-modules/*
// (byte-for-byte bodies) behind this thin barrel.  TalentProfileShellDrawer.tsx
// + the sibling index.ts continue to import from "./profile-shell-internal"
// with byte-identical public surface (every previously-exported symbol is
// re-exported below, grouped by source module).  Behavior unchanged.
//
// See remediation-plan §4 Phase 1f.
// ════════════════════════════════════════════════════════════════════

// ── ./profile-shell-modules/truth-preview ────────────────────────────────
export {
  CustomWorkspaceFieldInput,
  FieldGroupBlock,
  LiveCategoryFieldsPanel,
  TruthChip,
  VIEW_AS_OPTIONS,
  resolvedToVisInput,
  sourceLabel,
  visMeta,
} from "./profile-shell-modules/truth-preview";
export type { ResolvedGroupForUI } from "./profile-shell-modules/truth-preview";

// ── ./profile-shell-modules/profile-state ────────────────────────────────
export {
  LANGUAGE_PRESETS,
  PROFILE_SECTIONS,
  SECTION_META,
  TYPE_DEFAULTS,
  _editorHydrationInFlight,
  _getEditorHydration,
  ageString,
  findChild,
  getTypeDefaults,
  makeInitialProfileState,
  profileReducer,
} from "./profile-shell-modules/profile-state";
export type {
  ProfileAction,
  ProfileSectionId,
  ProfileShellPayload,
  ProfileState,
  TypeDefaults,
  _HydrationInFlight,
} from "./profile-shell-modules/profile-state";

// ── ./profile-shell-modules/profile-editors-core ────────────────────────────────
export {
  AdvancedAgencySettingsSection,
  AvailabilityGrid,
  BiosEditor,
  Legend,
  RatesEditor,
  ServicesEditor,
  VerificationsEditor,
} from "./profile-shell-modules/profile-editors-core";
export type {
  BiosEditorProps,
  RatesEditorProps,
} from "./profile-shell-modules/profile-editors-core";

// ── ./profile-shell-modules/profile-modals ────────────────────────────────
export {
  InviteClaimBanner,
  ProfileDiffModal,
  ProfileOwnershipPanel,
  PublishCelebrationModal,
  ViewAsClientModal,
  celebrationBtnStyle,
  computeProfileDiff,
} from "./profile-shell-modules/profile-modals";
export type { DiffEntry } from "./profile-shell-modules/profile-modals";

// ── ./profile-shell-modules/profile-photos ────────────────────────────────
export {
  CoverPhotoSlot,
  GalleryStrip,
  PhotoSlot,
  ProfileActivityLog,
  ThreeSlotPhotoBlock,
} from "./profile-shell-modules/profile-photos";

// ── ./profile-shell-modules/profile-data-editors ────────────────────────────────
export {
  CreditsEditor,
  FilesEditor,
  LimitsEditor,
  PolaroidsEditor,
} from "./profile-shell-modules/profile-data-editors";
export type {
  CreditsEditorProps,
  CreditsEntry,
  FilesEditorEntry,
  FilesEditorProps,
  LimitsEditorProps,
  LimitsEntry,
  PolaroidsEditorProps,
} from "./profile-shell-modules/profile-data-editors";

// ── ./profile-shell-modules/profile-coach ────────────────────────────────
export {
  FirstTimeHero,
  HeaderPublishCoach,
  PMobileMenuItem,
  ProfileGrowthMetric,
  ProfileShellMobileMenu,
  RequiredCoach,
} from "./profile-shell-modules/profile-coach";

// ── ./profile-shell-modules/profile-identity-fields ────────────────────────────────
export {
  CityAutocompleteInput,
  CollapsibleIdentityField,
  CountryAutocompleteInput,
  ProfileAccordionSection,
  ServiceAreaMap,
  UpcomingVisitsEditor,
} from "./profile-shell-modules/profile-identity-fields";
export type {
  CityPrediction,
  CountrySuggestion,
  VisitEntry,
} from "./profile-shell-modules/profile-identity-fields";

// ── ./profile-shell-modules/profile-identity-editor ────────────────────────────────
export {
  FieldLocksOverviewPanel,
  IdentityEditor,
  IdentitySubLabel,
  LockedHint,
  SmartFooterCTA,
  StatusPillDropdown,
} from "./profile-shell-modules/profile-identity-editor";

// ── ./profile-shell-modules/profile-extras-editors ────────────────────────────────
export {
  AlbumsEditorPro,
  AspirationsEditor,
  FieldLockToggle,
  HelloReelEditor,
  NextTierCoach,
  PackageRatesEditor,
  PastClientsEditor,
  PersonalityEditor,
  RecurringPatternEditor,
  SeasonalEditor,
  SkillsProEditor,
} from "./profile-shell-modules/profile-extras-editors";
export type {
  HelloReelEditorProps,
  PastClientsEditorProps,
  PersonalityEditorProps,
} from "./profile-shell-modules/profile-extras-editors";

// ── ./profile-shell-modules/new-talent-drawer ────────────────────────────────
export { NewTalentDrawer } from "./profile-shell-modules/new-talent-drawer";

// ── ./profile-shell-modules/talent-type-picker ────────────────────────────────
export {
  CsvBulkAddPanel,
  ManagementMethodPicker,
  ParentExpandedView,
  PasteContactModal,
  PrimaryTalentTypeGrid,
  SiblingTopNPicker,
  TYPE_POPULARITY,
  csvCellStyle,
  qaInputStyle,
} from "./profile-shell-modules/talent-type-picker";

