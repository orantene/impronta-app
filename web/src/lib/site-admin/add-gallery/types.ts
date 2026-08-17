import type { BuilderNode, BuilderNodeKind } from "@/lib/site-admin/builder-node/types";

export type AddGalleryTab =
  | "layout"
  | "elements"
  | "sections"
  | "connected"
  /** DB-backed published page/section templates (WS2/WS4). */
  | "page_templates"
  /**
   * WS-A A7 — shell-only tab carrying `shell_header` / `shell_footer` DB
   * templates. Offered ONLY on the site-shell surface (+ the Lab for
   * authoring) via each surface's `allowedTabs`; every page-builder surface
   * omits it, so the live "+" gallery never shows shell templates on a page.
   */
  | "shell";

export type AddGalleryInsertMethod =
  | "nativeNode"
  | "sectionTemplate"
  | "sectionEmbed"
  | "connectedNode"
  | "disabledComingSoon"
  /**
   * DB-backed published template (WS4). Inserts the row's `builder_tree` as an
   * EDITABLE freeform subtree (every node re-minted, immediately editable) via
   * `insertBuilderComponent` → `applyBuilderNodeOperation`. ALLOWED by
   * `assertAddGalleryBuilderTreeOnly` — it never touches `cms_page_sections`
   * or `composition[]`.
   */
  | "dbTemplate"
  /** Developer guard only — must never ship in the agency gallery. */
  | "legacyCompositionSlot"
  | "cmsPageSectionSlot";

export type AddGallerySourceType =
  | "native-freeform"
  | "section-embed"
  | "coming-soon"
  | "advanced";

export type AddGalleryAvailability = "available" | "coming-soon" | "advanced-hidden";

export type AddGalleryPreviewType = "icon-card" | "image-card";

export type AddGalleryItemKind = "static" | "connected" | "advanced";

/** Fine-grained native defaults when one BuilderNodeKind serves many gallery labels. */
export type AddGalleryNativeVariant =
  | "default"
  | "title"
  | "subtitle"
  | "intro"
  | "caption"
  | "badge"
  | "quote"
  | "list"
  | "button"
  | "button-group"
  | "text-link"
  | "icon-button"
  | "whatsapp-button"
  | "inquiry-button"
  | "booking-button"
  | "cover-image"
  | "logo"
  | "gallery"
  | "image-grid"
  | "stack"
  | "row"
  | "card-group"
  | "grid"
  | "image-card"
  | "icon-card"
  | "profile-card"
  | "service-card"
  | "testimonial-card"
  | "cta-card"
  | "download-link"
  | "breadcrumb"
  | "youtube"
  | "instagram"
  | "tiktok"
  | "feed-grid"
  | "feed-masonry"
  | "feed-slider"
  | "feed-stories"
  // Backgrounds story — pre-dressed `container` variants. Every background
  // card MUST name one of these: a no-variant container card would take
  // canonical status for the `container` kind away from `el-container` in
  // `resolveKindGovernance`.
  | "bg-video"
  | "bg-youtube"
  | "bg-image"
  | "bg-gradient";

export interface AddGalleryItem {
  id: string;
  label: string;
  description: string;
  /** Optional education copy — prefer registry-card-copy overrides. */
  infoTooltip?: string;
  tab: AddGalleryTab;
  category: string;
  /** Stable icon key resolved by the gallery UI. */
  icon: string;
  previewType: AddGalleryPreviewType;
  itemKind: AddGalleryItemKind;
  insertMethod: AddGalleryInsertMethod;
  dragSupported: boolean;
  availability: AddGalleryAvailability;
  sourceType: AddGallerySourceType;
  /** Optional connected-data sublabel (e.g. "Talent Collection"). */
  connectedSource?: string;
  requiredPermission?: string;
  searchTerms?: ReadonlyArray<string>;
  nativeKind?: BuilderNodeKind;
  nativeVariant?: AddGalleryNativeVariant;
  sectionEmbedKey?: string;
  sectionTemplateId?: string;
  /** Optional preview image URL for section image cards. */
  previewImageUrl?: string;
  /** DB-backed template id (insertMethod === "dbTemplate"). */
  dbTemplateId?: string;
  /**
   * Resolved freeform subtree for a `dbTemplate` item (the published row's
   * `builder_tree`). Carried on the item so `resolveAddGalleryInsertAction`
   * can re-mint ids + build the insert node without a second DB round-trip.
   * Ids are re-minted at insert time (the source row is shared/immutable).
   */
  dbTemplateTree?: ReadonlyArray<BuilderNode>;
  /** required_plan for a dbTemplate item (already plan-gated server-side). */
  requiredPlan?: "free" | "studio" | "agency" | "network";
  /** target_context for a dbTemplate item (talent | workspace | both | platform). */
  targetContext?: "talent" | "workspace" | "both" | "platform";
  /** required_talent_tier for a dbTemplate item (null when unrestricted). */
  requiredTalentTier?: string | null;
  /** Builder Studio (WS-C C3) — admin default native variant. When set and the
   *  item carries no explicit `nativeVariant`, this variant is applied + recorded
   *  on the inserted node. Carried from the overlay row `default_variant`. */
  defaultVariant?: AddGalleryNativeVariant | string | null;
  /** Builder Studio — admin component defaults: props merged OVER the
   *  variant-resolved props at insert. Plumbed Wave 0; consumed by WS-C. */
  defaultProps?: Record<string, unknown> | null;
  /** Builder Studio — admin per-prop locks (dot-paths) stamped onto the
   *  inserted node so a tenant can't edit them. */
  lockedProps?: ReadonlyArray<string>;
  /**
   * Paid-plan feature. Free workspaces see the card but inserting reports an
   * upgrade message instead of silently failing; publish preflight is the
   * server-side backstop.
   */
  requiresPaidPlan?: boolean;
  /** Builder Studio — default data binding (filterQuery/maxItems/pinnedIds)
   *  baked into a connected component at insert. */
  dataSourceDefaults?: Record<string, unknown> | null;
  /** Builder Studio (WS-D D3) — staged-rollout ceiling 0-100 for a dbTemplate
   *  item. Carried from the row so `gateDbGalleryItems` can bucket the live
   *  tenant. Undefined ⇒ 100 (fully rolled out / back-compat). */
  rolloutPercentage?: number | null;
  /** Builder Studio (WS-D D3) — tenants that ALWAYS see this template (bypass
   *  the % bucket). Carried from the row `tenant_allowlist`. */
  rolloutAllowlist?: ReadonlyArray<string>;
  /** Builder Studio (WS-D D3) — tenants that NEVER see this template. Carried
   *  from the row `tenant_denylist`. */
  rolloutDenylist?: ReadonlyArray<string>;
  /**
   * W3 (all-freeform rebuild) — set when this item is known to insert but not
   * actually WORK on a freeform page (fails builder-tree validation, or lands
   * as an empty/misconfigured connected component). Card stays insertable —
   * this only drives the gallery's red-border + badge flag, never a block.
   *
   * Not set directly on any of the three catalog files (`registry-catalog-
   * elements.ts` / `-sections-connected.ts` / `-backgrounds.ts`) today —
   * `useGalleryCardState` resolves it via a single lookup into
   * `FREEFORM_INCOMPATIBLE` (add-gallery/freeform-compat.ts) keyed by item id,
   * so the catalog files stay untouched. Left on the item type (rather than
   * only in the lookup map) so a future DB-backed item can also carry one.
   */
  freeformIncompatible?: { note: string } | null;
}

export interface AddGalleryCategoryDef {
  id: string;
  label: string;
  tab: AddGalleryTab;
  icon: string;
}

/**
 * Everything the live Add Gallery needs to fetch the merged catalog (code
 * items ∪ gated published DB templates) for ONE surface. Derived from the
 * surface's `BuilderContextConfig` + the resolved plan, threaded onto the
 * EditContext value as a STABLE memoized object and passed to the
 * `fetchSurfaceGalleryItems` server action.
 *
 * Trust note: `plan` / `talentTier` / `surfaceTarget` only gate which template
 * CARDS the gallery shows. Published templates are readable by any
 * authenticated user (RLS gates on `status='published'`, not entitlement), so
 * this is a cosmetic/UX filter — not a hard access boundary.
 */
export interface GallerySurfaceDescriptor {
  /** Gallery tabs offered on this surface (`galleryPolicy.allowedTabs`). */
  allowedTabs: ReadonlyArray<AddGalleryTab>;
  /** Whether DB-backed templates are merged in (`galleryPolicy.allowDbTemplates`). */
  allowDbTemplates: boolean;
  /** Surface subject target for `target_context` gating (talent | workspace | platform | null). */
  surfaceTarget: "talent" | "workspace" | "both" | "platform" | null;
  /**
   * X4 — the PRECISE one of the four real builder surfaces, for per-surface
   * catalog-overlay subtraction (orthogonal to `surfaceTarget`). Null on the
   * homepage / platform_lab (availability-only). Sourced from
   * `galleryPolicy.surfaceKey`.
   */
  surfaceKey:
    | "talent_profile"
    | "talent_shell"
    | "workspace_page"
    | "workspace_shell"
    | null;
  /**
   * X6 — true ONLY for the Builder Lab surface, turning on the independent
   * `lab_enabled` overlay axis (a Lab-hidden component is dropped from the Lab's
   * own gallery). Orthogonal to `surfaceKey`/`surfaceTarget`. Sourced from
   * `galleryPolicy.isLab`; omitted/false on every tenant surface + the homepage.
   */
  isLab?: boolean;
  /** Surface plan for `required_plan` gating. */
  plan: string | null;
  /** Surface talent tier for `required_talent_tier` gating. */
  talentTier: string | null;
  /** Builder Studio — the live tenant id (for staged-rollout bucketing of
   *  templates). Null on platform/lab surfaces ⇒ no rollout gating (show all).
   *  Plumbed Wave 0; consumed by WS-D. */
  tenantId: string | null;
}
