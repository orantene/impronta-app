import type { TranslationDomainLocaleMode } from "@/lib/language-settings/types";

/** Validated against `app_locales` / `LanguageSettings.adminLocales` at runtime. */
export type LocaleCode = string;

export type ContentClass = "ugc" | "cms" | "product_messages";

export type StorageStrategy =
  | "paired_columns"
  | "asymmetric_bio"
  | "locale_rows"
  | "message_bundle";

export type StalenessPolicy =
  | "paired_timestamps"
  | "asymmetric_status"
  | "peer_updated_at"
  | "none";

export type CoverageWeight = "required" | "optional" | "excluded";

export type EditorMode = "full_edit" | "cms_linkout" | "gap_report";

/**
 * Translation Center row health for live-edit locales (bios, taxonomy, CMS copy, etc.).
 * No editorial “publish” semantics — save updates live fields; approval stays on profile/media flows.
 */
export type TranslationHealthState = "missing" | "complete" | "language_issue" | "needs_attention";

export type TranslationIntegrityFlag =
  | "source_wrong_language"
  | "target_wrong_language"
  | "identical_cross_locale"
  | "suspected_mixed"
  | "source_missing_target_present";

/** Discriminator for `translation-center-quick-edit-actions` saves. */
export type TranslationQuickSaveKind =
  | "talent_bio_es"
  | "talent_bio_quick"
  | "talent_bio_promote_draft"
  | "talent_bio_promote_en_draft"
  | "taxonomy_name_es"
  | "location_display_es"
  | "field_value_i18n"
  | "none";

export type TranslationInlineEditorFieldDTO = {
  key: string;
  label: string;
  kind: "text" | "textarea" | "readonly";
};

/**
 * Adapter-driven inline editing contract (also reusable as admin quick-edit metadata).
 */
export type TranslationUnitInlineEditDTO = {
  can_inline_edit: boolean;
  editor_fields: TranslationInlineEditorFieldDTO[];
  save_action: TranslationQuickSaveKind;
  /** Legacy optional second save kind — unused in Translation Center UI (no publish / merge buttons). */
  publish_action: TranslationQuickSaveKind | null;
  publish_secondary_action: TranslationQuickSaveKind | null;
  publish_secondary_label: string | null;
  /** Legacy flag — Translation Center uses live-only saves for bios. */
  create_draft_on_edit: boolean;
  /** Full-page editor when inline is unavailable or staff prefers deep context. */
  open_full_editor_url: string;
};

export type TranslationDomainDefinition = {
  id: string;
  title: string;
  description?: string;
  groupKey: string;
  /** Groups UI tabs — multiple domains can share one tab. */
  navTabKey: string;
  navTabLabel: string;
  navTabOrder: number;
  contentClass: ContentClass;
  storageStrategy: StorageStrategy;
  stalenessPolicy: StalenessPolicy;
  workflow: "none" | "target_only" | "asymmetric_bio";
  editorMode: EditorMode;
  coverageWeight: CoverageWeight;
  /** Adapter implementation id (unique handler). */
  adapterId: string;
  sortOrder: number;
  /** How many locales this domain can score today (plan: dynamic languages). */
  supportedLocaleMode: TranslationDomainLocaleMode;
};

export type TranslationUnitDTO = {
  domainId: string;
  adapterId: string;
  entityType: string;
  entityId: string;
  /** e.g. talent_profile_id when entity is a field_values row */
  parentEntityId?: string | null;
  fieldKey: string;
  groupKey: string;
  contentClass: ContentClass;
  displayLabel: string;
  health: TranslationHealthState;
  integrityFlags: TranslationIntegrityFlag[];
  /** Summary for table column */
  localeSummary: string;
  updatedAt: string | null;
  /** @deprecated Prefer `inlineEdit.open_full_editor_url` — kept for stable deep links. */
  adminHref: string;
  inlineEdit: TranslationUnitInlineEditDTO;
};

export type DomainAggregateDTO = {
  domainId: string;
  title: string;
  navTabKey: string;
  contentClass: ContentClass;
  coverageWeight: CoverageWeight;
  counts: {
    missing: number;
    complete: number;
    needs_attention: number;
    language_issue: number;
    /** Rows considered for strict coverage denominator (required only). */
    applicableRequired: number;
    /** Required rows with acceptable target locale coverage */
    filledRequired: number;
  };
};

export type TranslationCenterBootstrap = {
  domains: DomainAggregateDTO[];
  /** Active locales for admin (from `app_locales`). */
  languageSettings: import("@/lib/language-settings/types").LanguageSettings;
  /** Rolled up by nav tab for overview cards */
  tabRollups: Record<
    string,
    {
      missing: number;
      complete: number;
      needs_attention: number;
      language_issue: number;
      applicableRequired: number;
      filledRequired: number;
    }
  >;
  global: {
    missing: number;
    complete: number;
    needs_attention: number;
    language_issue: number;
    applicableRequired: number;
    filledRequired: number;
    strictCoveragePercent: number | null;
  };
};

export type ListUnitsParams = {
  domainId?: string;
  navTabKey: string;
  q: string;
  statusFilter: string;
  limit: number;
  offset: number;
  bioSort?: string;
  taxonomySort?: string;
  locationSort?: string;
  sortDir: "asc" | "desc";
};

export type ListUnitsResult = {
  units: TranslationUnitDTO[];
  hasMore: boolean;
  loadError: string | null;
};
