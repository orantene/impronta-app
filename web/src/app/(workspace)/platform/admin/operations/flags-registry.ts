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
  | { kind: "select"; options: ReadonlyArray<{ value: string; label: string }> }
  | { kind: "number"; min?: number; max?: number; placeholder?: number }
  | { kind: "text"; placeholder?: string };

export type FlagDef = {
  key: string;
  label: string;
  description: string;
  control: FlagControl;
};

export type FlagGroup = {
  id: string;
  title: string;
  blurb: string;
  flags: ReadonlyArray<FlagDef>;
};

const AI_PROVIDER_OPTIONS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
] as const;

const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

const FONT_PRESET_OPTIONS = [
  { value: "impronta", label: "Impronta" },
  { value: "editorial", label: "Editorial" },
] as const;

export const FLAG_GROUPS: ReadonlyArray<FlagGroup> = [
  {
    id: "ai",
    title: "AI features",
    blurb: "Search, refine, explanations, and translation toggles. Provider switch is the chat/NLU model; embeddings stay OpenAI.",
    flags: [
      {
        key: "ai_provider",
        label: "AI provider",
        description: "Chat / NLU provider for AI features.",
        control: { kind: "select", options: AI_PROVIDER_OPTIONS },
      },
      {
        key: "ai_translations_enabled",
        label: "AI translations",
        description: "AI-assisted translation workflows (admin).",
        control: { kind: "toggle" },
      },
      {
        key: "ai_embeddings_semantic_enabled",
        label: "Semantic embeddings",
        description: "Vector / semantic retrieval (requires OpenAI embeddings + indexing).",
        control: { kind: "toggle" },
      },
      {
        key: "ai_search_enabled",
        label: "AI search",
        description: "AI-powered search experience.",
        control: { kind: "toggle" },
      },
      {
        key: "ai_rerank_enabled",
        label: "AI re-rank",
        description: "Re-rank search results with the AI model.",
        control: { kind: "toggle" },
      },
      {
        key: "ai_explanations_enabled",
        label: "AI explanations",
        description: "Show AI-generated match explanations.",
        control: { kind: "toggle" },
      },
      {
        key: "ai_refine_enabled",
        label: "AI refine",
        description: "AI-assisted query refinement suggestions.",
        control: { kind: "toggle" },
      },
      {
        key: "ai_draft_enabled",
        label: "AI draft",
        description: "AI-assisted drafting helpers.",
        control: { kind: "toggle" },
      },
      {
        key: "ai_search_quality_v2",
        label: "Search quality v2",
        description: "Stronger hybrid merge (RRF) + hybrid continuation cursor.",
        control: { kind: "toggle" },
      },
      {
        key: "ai_refine_v2",
        label: "Refine v2",
        description: "Richer refine suggestions (Chunk 3).",
        control: { kind: "toggle" },
      },
      {
        key: "ai_explanations_v2",
        label: "Explanations v2",
        description: "Richer explanations (Chunk 4).",
        control: { kind: "toggle" },
      },
    ],
  },
  {
    id: "public",
    title: "Public site",
    blurb: "Storefront-facing levers: directory visibility, inquiry intake, and contact channels.",
    flags: [
      {
        key: "directory_public",
        label: "Public directory",
        description: "Whether the public talent directory is visible.",
        control: { kind: "toggle" },
      },
      {
        key: "inquiries_open",
        label: "Inquiries open",
        description: "Whether public visitors can submit inquiries.",
        control: { kind: "toggle" },
      },
      {
        key: "contact_email",
        label: "Contact email",
        description: "Public-facing contact address.",
        control: { kind: "text", placeholder: "hello@example.com" },
      },
      {
        key: "agency_whatsapp_number",
        label: "WhatsApp number",
        description: "Public WhatsApp contact number.",
        control: { kind: "text", placeholder: "+52 ..." },
      },
    ],
  },
  {
    id: "appearance",
    title: "Appearance",
    blurb: "Theme + typography defaults for the public site and dashboard.",
    flags: [
      {
        key: "site_theme",
        label: "Public site theme",
        description: "Default theme for the public storefront.",
        control: { kind: "select", options: THEME_OPTIONS },
      },
      {
        key: "dashboard_theme",
        label: "Dashboard theme",
        description: "Default theme for the workspace dashboard.",
        control: { kind: "select", options: THEME_OPTIONS },
      },
      {
        key: "public_font_preset",
        label: "Public font preset",
        description: "Curated typography stack for the public site.",
        control: { kind: "select", options: FONT_PRESET_OPTIONS },
      },
    ],
  },
  {
    id: "inquiry",
    title: "Inquiry engine",
    blurb: "The coordinator-driven inquiry workflow: enable v2 and tune its timing windows.",
    flags: [
      {
        key: "inquiry_engine_v2_enabled",
        label: "Inquiry engine v2",
        description: "Enable the v2 inquiry workflow engine.",
        control: { kind: "toggle" },
      },
      {
        key: "coordinator_timeout_hours",
        label: "Coordinator timeout (hours)",
        description: "Hours before a coordinator step times out. Default 24.",
        control: { kind: "number", min: 0, max: 8760, placeholder: 24 },
      },
      {
        key: "inquiry_expiry_hours",
        label: "Inquiry expiry (hours)",
        description: "Hours before an open inquiry expires. Default 72.",
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
