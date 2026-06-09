import type { BuilderNodeKind } from "@/lib/site-admin/builder-node/types";

export type AddGalleryTab = "layout" | "elements" | "sections" | "connected";

export type AddGalleryInsertMethod =
  | "nativeNode"
  | "sectionTemplate"
  | "sectionEmbed"
  | "connectedNode"
  | "disabledComingSoon"
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
}

export interface AddGalleryCategoryDef {
  id: string;
  label: string;
  tab: AddGalleryTab;
  icon: string;
}
