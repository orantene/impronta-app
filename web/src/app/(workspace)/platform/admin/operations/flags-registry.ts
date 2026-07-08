// Platform HQ · Operations — real feature-flags registry.
//
// Single source of truth for the editable platform-default settings exposed in
// the Operations feature-flags surface. Each entry maps a `public.settings` key
// to a human label, description, group, and control type. The page server
// component reads live values; the server action (flags-actions.ts) validates
// writes against the same control definitions.
//
// Keys + value shapes were taken from the canonical getters:
//   • AI            → @/lib/settings/ai-feature-flags
//   • Public site   → @/lib/public-settings
//   • Appearance    → @/lib/site-theme, @/lib/dashboard-theme, @/lib/site-font-preset
//   • Inquiry       → @/lib/inquiry/inquiry-settings

export type FlagControl =
  | { kind: "toggle" }
  | {
      kind: "select";
      // `labelKey` (optional) localizes the option label; glossary/proper-noun
      // options (provider names) omit it and render the English `label`.
      options: ReadonlyArray<{ value: string; label: string; labelKey?: string }>;
    }
  | { kind: "number"; min?: number; max?: number; placeholder?: number }
  | { kind: "text"; placeholder?: string };

export type FlagDef = {
  key: string;
  /** English label — kept for non-localized consumers + as an i18n fallback. */
  label: string;
  /** English description — kept for non-localized consumers + as a fallback. */
  description: string;
  /** Catalog key for the localized label (rendered via t() at the panel). */
  labelKey: string;
  /** Catalog key for the localized description (rendered via t() at the panel). */
  descriptionKey: string;
  control: FlagControl;
};

export type FlagGroup = {
  id: string;
  title: string;
  blurb: string;
  /** Catalog keys for the localized group title + blurb. */
  titleKey: string;
  blurbKey: string;
  flags: ReadonlyArray<FlagDef>;
};

// Provider option labels are proper nouns (glossary) — no labelKey, render English.
const AI_PROVIDER_OPTIONS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
] as const;

const THEME_OPTIONS = [
  { value: "light", label: "Light", labelKey: "dashboard.platform.operations.optLight" },
  { value: "dark", label: "Dark", labelKey: "dashboard.platform.operations.optDark" },
] as const;

const FONT_PRESET_OPTIONS = [
  // "Impronta" is a glossary term; keep the word but the key resolves to it in both locales.
  { value: "impronta", label: "Impronta", labelKey: "dashboard.platform.operations.optImpronta" },
  { value: "editorial", label: "Editorial", labelKey: "dashboard.platform.operations.optEditorial" },
] as const;

export const FLAG_GROUPS: ReadonlyArray<FlagGroup> = [
  {
    id: "ai",
    title: "AI features",
    blurb: "Search, refine, explanations, and translation toggles. Provider switch is the chat/NLU model; embeddings stay OpenAI.",
    titleKey: "dashboard.platform.operations.groupAiTitle",
    blurbKey: "dashboard.platform.operations.groupAiBlurb",
    flags: [
      {
        key: "ai_provider",
        label: "AI provider",
        description: "Chat / NLU provider for AI features.",
        labelKey: "dashboard.platform.operations.flagAiProviderLabel",
        descriptionKey: "dashboard.platform.operations.flagAiProviderDesc",
        control: { kind: "select", options: AI_PROVIDER_OPTIONS },
      },
      {
        key: "ai_translations_enabled",
        label: "AI translations",
        description: "AI-assisted translation workflows (admin).",
        labelKey: "dashboard.platform.operations.flagAiTranslationsLabel",
        descriptionKey: "dashboard.platform.operations.flagAiTranslationsDesc",
        control: { kind: "toggle" },
      },
      {
        key: "ai_embeddings_semantic_enabled",
        label: "Semantic embeddings",
        description: "Vector / semantic retrieval (requires OpenAI embeddings + indexing).",
        labelKey: "dashboard.platform.operations.flagAiEmbeddingsLabel",
        descriptionKey: "dashboard.platform.operations.flagAiEmbeddingsDesc",
        control: { kind: "toggle" },
      },
      {
        key: "ai_search_enabled",
        label: "AI search",
        description: "AI-powered search experience.",
        labelKey: "dashboard.platform.operations.flagAiSearchLabel",
        descriptionKey: "dashboard.platform.operations.flagAiSearchDesc",
        control: { kind: "toggle" },
      },
      {
        key: "ai_rerank_enabled",
        label: "AI re-rank",
        description: "Re-rank search results with the AI model.",
        labelKey: "dashboard.platform.operations.flagAiRerankLabel",
        descriptionKey: "dashboard.platform.operations.flagAiRerankDesc",
        control: { kind: "toggle" },
      },
      {
        key: "ai_explanations_enabled",
        label: "AI explanations",
        description: "Show AI-generated match explanations.",
        labelKey: "dashboard.platform.operations.flagAiExplanationsLabel",
        descriptionKey: "dashboard.platform.operations.flagAiExplanationsDesc",
        control: { kind: "toggle" },
      },
      {
        key: "ai_refine_enabled",
        label: "AI refine",
        description: "AI-assisted query refinement suggestions.",
        labelKey: "dashboard.platform.operations.flagAiRefineLabel",
        descriptionKey: "dashboard.platform.operations.flagAiRefineDesc",
        control: { kind: "toggle" },
      },
      {
        key: "ai_draft_enabled",
        label: "AI draft",
        description: "AI-assisted drafting helpers.",
        labelKey: "dashboard.platform.operations.flagAiDraftLabel",
        descriptionKey: "dashboard.platform.operations.flagAiDraftDesc",
        control: { kind: "toggle" },
      },
      {
        key: "ai_search_quality_v2",
        label: "Search quality v2",
        description: "Stronger hybrid merge (RRF) + hybrid continuation cursor.",
        labelKey: "dashboard.platform.operations.flagSearchQualityV2Label",
        descriptionKey: "dashboard.platform.operations.flagSearchQualityV2Desc",
        control: { kind: "toggle" },
      },
      {
        key: "ai_refine_v2",
        label: "Refine v2",
        description: "Richer refine suggestions (Chunk 3).",
        labelKey: "dashboard.platform.operations.flagRefineV2Label",
        descriptionKey: "dashboard.platform.operations.flagRefineV2Desc",
        control: { kind: "toggle" },
      },
      {
        key: "ai_explanations_v2",
        label: "Explanations v2",
        description: "Richer explanations (Chunk 4).",
        labelKey: "dashboard.platform.operations.flagExplanationsV2Label",
        descriptionKey: "dashboard.platform.operations.flagExplanationsV2Desc",
        control: { kind: "toggle" },
      },
    ],
  },
  {
    id: "public",
    title: "Public site",
    blurb: "Storefront-facing levers: directory visibility, inquiry intake, and contact channels.",
    titleKey: "dashboard.platform.operations.groupPublicTitle",
    blurbKey: "dashboard.platform.operations.groupPublicBlurb",
    flags: [
      {
        key: "directory_public",
        label: "Public directory",
        description: "Whether the public talent directory is visible.",
        labelKey: "dashboard.platform.operations.flagDirectoryPublicLabel",
        descriptionKey: "dashboard.platform.operations.flagDirectoryPublicDesc",
        control: { kind: "toggle" },
      },
      {
        key: "inquiries_open",
        label: "Inquiries open",
        description: "Whether public visitors can submit inquiries.",
        labelKey: "dashboard.platform.operations.flagInquiriesOpenLabel",
        descriptionKey: "dashboard.platform.operations.flagInquiriesOpenDesc",
        control: { kind: "toggle" },
      },
      {
        key: "contact_email",
        label: "Contact email",
        description: "Public-facing contact address.",
        labelKey: "dashboard.platform.operations.flagContactEmailLabel",
        descriptionKey: "dashboard.platform.operations.flagContactEmailDesc",
        control: { kind: "text", placeholder: "hello@example.com" },
      },
      {
        key: "agency_whatsapp_number",
        label: "WhatsApp number",
        description: "Public WhatsApp contact number.",
        labelKey: "dashboard.platform.operations.flagWhatsappLabel",
        descriptionKey: "dashboard.platform.operations.flagWhatsappDesc",
        control: { kind: "text", placeholder: "+52 ..." },
      },
    ],
  },
  {
    id: "appearance",
    title: "Appearance",
    blurb: "Theme + typography defaults for the public site and dashboard.",
    titleKey: "dashboard.platform.operations.groupAppearanceTitle",
    blurbKey: "dashboard.platform.operations.groupAppearanceBlurb",
    flags: [
      {
        key: "site_theme",
        label: "Public site theme",
        description: "Default theme for the public storefront.",
        labelKey: "dashboard.platform.operations.flagSiteThemeLabel",
        descriptionKey: "dashboard.platform.operations.flagSiteThemeDesc",
        control: { kind: "select", options: THEME_OPTIONS },
      },
      {
        key: "dashboard_theme",
        label: "Dashboard theme",
        description: "Default theme for the workspace dashboard.",
        labelKey: "dashboard.platform.operations.flagDashboardThemeLabel",
        descriptionKey: "dashboard.platform.operations.flagDashboardThemeDesc",
        control: { kind: "select", options: THEME_OPTIONS },
      },
      {
        key: "public_font_preset",
        label: "Public font preset",
        description: "Curated typography stack for the public site.",
        labelKey: "dashboard.platform.operations.flagFontPresetLabel",
        descriptionKey: "dashboard.platform.operations.flagFontPresetDesc",
        control: { kind: "select", options: FONT_PRESET_OPTIONS },
      },
    ],
  },
  {
    id: "inquiry",
    title: "Inquiry engine",
    blurb: "The coordinator-driven inquiry workflow: enable v2 and tune its timing windows.",
    titleKey: "dashboard.platform.operations.groupInquiryTitle",
    blurbKey: "dashboard.platform.operations.groupInquiryBlurb",
    flags: [
      {
        key: "inquiry_engine_v2_enabled",
        label: "Inquiry engine v2",
        description: "Enable the v2 inquiry workflow engine.",
        labelKey: "dashboard.platform.operations.flagInquiryEngineV2Label",
        descriptionKey: "dashboard.platform.operations.flagInquiryEngineV2Desc",
        control: { kind: "toggle" },
      },
      {
        key: "coordinator_timeout_hours",
        label: "Coordinator timeout (hours)",
        description: "Hours before a coordinator step times out. Default 24.",
        labelKey: "dashboard.platform.operations.flagCoordinatorTimeoutLabel",
        descriptionKey: "dashboard.platform.operations.flagCoordinatorTimeoutDesc",
        control: { kind: "number", min: 0, max: 8760, placeholder: 24 },
      },
      {
        key: "inquiry_expiry_hours",
        label: "Inquiry expiry (hours)",
        description: "Hours before an open inquiry expires. Default 72.",
        labelKey: "dashboard.platform.operations.flagInquiryExpiryLabel",
        descriptionKey: "dashboard.platform.operations.flagInquiryExpiryDesc",
        control: { kind: "number", min: 0, max: 8760, placeholder: 72 },
      },
    ],
  },
] as const;

// Flat registry for O(1) validation lookups in the write action.
export const FLAG_REGISTRY: Record<string, FlagDef> = Object.fromEntries(
  FLAG_GROUPS.flatMap((g) => g.flags.map((f) => [f.key, f] as const)),
);

export type FlagKey = string;
