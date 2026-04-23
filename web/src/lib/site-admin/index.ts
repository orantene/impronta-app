/**
 * Phase 5 — Agency Site Admin public surface.
 *
 * Barrel re-export for the site-admin module. Import from this path in
 * admin routes, server actions, and storefront reads:
 *   import { tagFor, requirePhase5Capability } from "@/lib/site-admin";
 */

export {
  PHASE_5_CAPABILITIES,
  type Phase5Capability,
  rolePhase5HasCapability,
  hasPhase5Capability,
  requirePhase5Capability,
} from "./capabilities";

export {
  PLATFORM_LOCALES,
  DEFAULT_PLATFORM_LOCALE,
  type Locale,
  isLocale,
  localeSchema,
  supportedLocalesSchema,
  localeSettingsSchema,
  type LocaleSettings,
} from "./locales";

export {
  SITE_ADMIN_SURFACE,
  type SiteAdminSurface,
  tagFor,
  tenantBustTags,
} from "./cache-tags";

export {
  PHASE_5_ERROR_CODES,
  type Phase5ErrorCode,
  type Phase5Result,
  versionConflict,
  ok,
  fail,
} from "./concurrency";

export {
  AUDIT_DIFF_SUMMARY_MAX,
  type Phase5AuditEvent,
  emitAuditEvent,
} from "./audit";

export {
  PLATFORM_RESERVED_SLUGS,
  type PlatformReservedSlug,
  tenantSlugRefinement,
  isReservedSlug,
} from "./reserved-routes";

export {
  TEMPLATE_REGISTRY,
  type TemplateKey,
  getTemplate,
  listTemplates,
  homepageTemplate,
  standardPageTemplate,
} from "./templates/registry";

export {
  SECTION_REGISTRY,
  type SectionTypeKey,
  getSectionType,
  listAgencyVisibleSections,
  heroSection,
} from "./sections/registry";

export {
  TOKEN_REGISTRY,
  type TokenSpec,
  type TokenScope,
  getToken,
  listAgencyConfigurableTokens,
  listAgencyConfigurableTokensByGroup,
  isTokenOverridable,
  validateThemePatch,
  tokenDefaults,
} from "./tokens/registry";

export {
  THEME_PRESETS,
  type ThemePreset,
  getThemePreset,
  listThemePresets,
} from "./presets/theme-presets";

export {
  resolveDesignTokens,
  designTokensToCssVars,
  designTokensToDataAttrs,
  listProjectedTokens,
  type ResolveDesignTokensInput,
} from "./tokens/resolve";

export {
  STARTER_KIT_MODES,
  STARTER_KIT_OVERWRITE_BEHAVIORS,
  type StarterKitMode,
  type StarterKitOverwriteBehavior,
  type StarterKitManifest,
  starterKitManifestSchema,
} from "./starter-kits/contract";

export {
  PREVIEW_JWT_ISSUER,
  PREVIEW_JWT_TTL_SECONDS,
  type PreviewClaims,
  type SignedPreview,
  type PreviewVerifyResult,
  signPreviewJwt,
  verifyPreviewJwt,
} from "./preview/jwt";

export {
  PREVIEW_COOKIE_NAME,
  PREVIEW_COOKIE_MAX_AGE_SECONDS,
  type PreviewCookieOptions,
  PREVIEW_COOKIE_OPTIONS,
} from "./preview/cookie";

export {
  type PreviewState,
  PREVIEW_OFF,
  readPreviewFromRequest,
  previewMatchesTenant,
} from "./preview/middleware";

export {
  identityFormSchema,
  type IdentityFormInput,
  type IdentityFormValues,
} from "./forms/identity";

export {
  brandingFormSchema,
  type BrandingFormInput,
  type BrandingFormValues,
} from "./forms/branding";

export {
  NAV_ZONES,
  NAV_MAX_DEPTH,
  NAV_MAX_ITEMS_PER_MENU,
  navZoneSchema,
  navHrefSchema,
  navItemDraftSchema,
  navReorderSchema,
  navItemDeleteSchema,
  navTreeNodeSchema,
  navTreeSchema,
  navPublishSchema,
  type NavZone,
  type NavItemDraftInput,
  type NavItemDraftValues,
  type NavReorderInput,
  type NavReorderValues,
  type NavItemDeleteInput,
  type NavItemDeleteValues,
  type NavTreeValues,
  type NavPublishInput,
  type NavPublishValues,
} from "./forms/navigation";

export {
  PAGE_SLUG_MAX,
  PAGE_TITLE_MAX,
  PAGE_BODY_MAX,
  PAGE_META_TITLE_MAX,
  PAGE_META_DESCRIPTION_MAX,
  PAGE_OG_TITLE_MAX,
  PAGE_OG_DESCRIPTION_MAX,
  PAGE_CANONICAL_MAX,
  AGENCY_SELECTABLE_TEMPLATE_KEYS,
  ALL_TEMPLATE_KEYS,
  PAGE_STATUSES,
  type PageStatusLiteral,
  agencyTemplateKeySchema,
  anyTemplateKeySchema,
  pageSlugSchema,
  pageHeroSchema,
  pageUpsertSchema,
  pagePublishSchema,
  pageArchiveSchema,
  pageDeleteSchema,
  pageRestoreRevisionSchema,
  pagePreviewStartSchema,
  type PageUpsertInput,
  type PageUpsertValues,
  type PagePublishInput,
  type PagePublishValues,
  type PageArchiveInput,
  type PageArchiveValues,
  type PageDeleteInput,
  type PageDeleteValues,
  type PageRestoreRevisionInput,
  type PageRestoreRevisionValues,
  type PagePreviewStartInput,
  type PagePreviewStartValues,
} from "./forms/pages";

export {
  SECTION_NAME_MAX,
  SECTION_STATUSES,
  ALL_SECTION_TYPE_KEYS,
  sectionTypeKeySchema,
  sectionNameSchema,
  validateSectionProps,
  sectionUpsertSchema,
  sectionPublishSchema,
  sectionArchiveSchema,
  sectionDeleteSchema,
  sectionDuplicateSchema,
  sectionRestoreRevisionSchema,
  type SectionStatusLiteral,
  type PropsValidateResult,
  type SectionUpsertInput,
  type SectionUpsertValues,
  type SectionPublishInput,
  type SectionPublishValues,
  type SectionArchiveInput,
  type SectionArchiveValues,
  type SectionDeleteInput,
  type SectionDeleteValues,
  type SectionDuplicateInput,
  type SectionDuplicateValues,
  type SectionRestoreRevisionInput,
  type SectionRestoreRevisionValues,
} from "./forms/sections";

export {
  HOMEPAGE_SLOT_KEYS,
  HOMEPAGE_REQUIRED_SLOT_KEYS,
  homepageSlotKeySchema,
  homepageMetadataSchema,
  homepageSlotEntrySchema,
  homepageSlotsSchema,
  homepageSaveDraftSchema,
  homepagePublishSchema,
  homepageRestoreRevisionSchema,
  type HomepageMetadataInput,
  type HomepageMetadataValues,
  type HomepageSlotsInput,
  type HomepageSlotsValues,
  type HomepageSaveDraftInput,
  type HomepageSaveDraftValues,
  type HomepagePublishInput,
  type HomepagePublishValues,
  type HomepageRestoreRevisionInput,
  type HomepageRestoreRevisionValues,
} from "./forms/homepage";

export {
  designPatchSchema,
  designSaveDraftSchema,
  designPublishSchema,
  designRestoreRevisionSchema,
  type DesignPatchInput,
  type DesignPatchValues,
  type DesignSaveDraftInput,
  type DesignSaveDraftValues,
  type DesignPublishInput,
  type DesignPublishValues,
  type DesignRestoreRevisionInput,
  type DesignRestoreRevisionValues,
} from "./forms/design";
