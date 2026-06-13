import type { BuilderNode, BuilderNodeKind } from "@/lib/site-admin/builder-node/types";

export type AddGalleryTab =
  | "layout"
  | "elements"
  | "sections"
  | "connected"
  /** DB-backed published page/section templates (WS2/WS4). */
  | "page_templates";

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
  | "youtube";

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
  /** Surface plan for `required_plan` gating. */
  plan: string | null;
  /** Surface talent tier for `required_talent_tier` gating. */
  talentTier: string | null;
}
