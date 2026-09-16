/**
 * site-templates — shared types for the three layers that compose a new
 * business's site:
 *
 *   Look                 site-wide visual system (shell + 6 pages + theme patch)
 *   BusinessComponent    the per-type blocks a Look's slots receive
 *   ImageResolver        owner media → lifestyle stock → nothing invented
 *
 * A Look is builder trees plus a theme patch. It is not a renderer. Every
 * tree it produces goes through `validateBuilderNodeTree` before it can reach
 * a page, exactly like a hand-placed block. See docs/plans/templates/01-plan.md.
 */

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { BusinessFamilyId } from "@/lib/words/business-types";

// ── Site map ────────────────────────────────────────────────────────────────

/** The six pages every Look ships, keyed by role rather than slug: the slug
 *  is a words-engine decision (Menú / Servicios / Clases), the role is not. */
export const SITE_PAGE_ROLES = [
  "home",
  "catalogue",
  "transaction",
  "about",
  "contact",
  "gallery",
] as const;
export type SitePageRole = (typeof SITE_PAGE_ROLES)[number];

/** Where a business component lands inside a Look. */
export const SLOT_IDS = [
  "home.offer",
  "home.proof",
  "catalogue",
  "transaction",
  "people",
  "hours",
  "map",
  "whatsapp",
  "gallery",
] as const;
export type SlotId = (typeof SLOT_IDS)[number];

/** `anchorId` a Look writes on a root slot container. Normalised form. */
export function slotAnchorId(slot: SlotId): string {
  return `slot-${slot.replace(".", "-")}`;
}

// ── Imagery ─────────────────────────────────────────────────────────────────

export const IMAGE_ROLES = ["hero", "wide", "portrait", "gallery", "team", "detail"] as const;
export type ImageRole = (typeof IMAGE_ROLES)[number];

/** The nine image slots every Look exposes. `gallery-1..4` share the role. */
export const IMAGE_SLOT_KEYS = [
  "hero",
  "wide",
  "portrait",
  "gallery-1",
  "gallery-2",
  "gallery-3",
  "gallery-4",
  "team",
  "detail",
] as const;
export type ImageSlotKey = (typeof IMAGE_SLOT_KEYS)[number];

export function imageRoleForSlot(key: ImageSlotKey): ImageRole {
  return key.startsWith("gallery") ? "gallery" : (key as ImageRole);
}

/** Marker a Look writes as `image.props.src`; resolved before validation. */
export const IMAGE_MARKER_PREFIX = "look://image/";

export interface ResolvedImage {
  src: string;
  alt: { es: string; en: string };
}

/** Owner media first, stock second. Returns null when nothing honest exists. */
export type ImageResolver = (slot: ImageSlotKey, role: ImageRole) => ResolvedImage | null;

// ── Copy ────────────────────────────────────────────────────────────────────

export type SiteLocale = "es" | "en";
export type Bilingual = { es: string; en: string };

/** Marker a Look writes into text/label props: `{{copy.<key>}}`. */
export const COPY_MARKER_RE = /^\{\{copy\.([A-Za-z0-9.-]+)\}\}$/;

/** Identity fields substituted into copy: `{{business.name}}` etc. Optional
 *  segments are written `[[ … {{business.city}} … ]]` and drop out whole when
 *  any placeholder inside is empty, so a missing city never leaves " in ". */
export interface SiteIdentity {
  businessName: string;
  tagline?: string | null;
  city?: string | null;
  logoUrl?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  hours?: string[] | null;
  address?: string | null;
  /** Public slugs per page role (`{{href.<role>}}`). Defaults in `DEFAULT_PAGE_HREFS`. */
  pageHrefs?: Partial<Record<SitePageRole, string>>;
}

export const DEFAULT_PAGE_HREFS: Readonly<Record<SitePageRole, string>> = {
  home: "/",
  catalogue: "/services",
  transaction: "/book",
  about: "/about",
  contact: "/contact",
  gallery: "/gallery",
};

// ── Look ────────────────────────────────────────────────────────────────────

export const LOOK_IDS = [
  "editorial",
  "warm",
  "bold",
  "minimal",
  "dark",
  "playful",
  "classic",
  "studio",
  "coastal",
  "night",
] as const;
export type LookId = (typeof LOOK_IDS)[number];

export interface Look {
  id: LookId;
  title: Bilingual;
  /** The one visual idea this Look explores. Shown on the picker card. */
  axis: Bilingual;
  /** `TOKEN_REGISTRY` keys only; validated by `validateThemePatch`. */
  themePatch: Readonly<Record<string, string>>;
  shell: { header: BuilderNode[]; footer: BuilderNode[] };
  pages: Readonly<Record<SitePageRole, BuilderNode[]>>;
  /** Defaults for every `{{copy.*}}` key the trees reference. */
  copy: Readonly<Record<string, Bilingual>>;
}

// ── Business components ─────────────────────────────────────────────────────

export const COMPONENT_IDS = [
  "menu_board",
  "reserve_table",
  "session_picker",
  "ticket_picker",
  "directory",
  "team",
  "service_list",
  "booking_form",
  "location_hours",
  "whatsapp_order",
  "gallery",
  "proof",
] as const;
export type ComponentId = (typeof COMPONENT_IDS)[number];

/** What a component may read. Facts come from the brief; nothing here is
 *  invented by the registry. Absent → the component's honest empty state. */
export interface ComponentContext {
  locale: SiteLocale;
  family: BusinessFamilyId;
  typeId: string;
  identity: SiteIdentity;
  /** `work.services` names, in the owner's words. */
  services?: string[] | null;
  /** `business.staff_count` when known. */
  staffCount?: number | null;
  /** `work.years_experience` when known. */
  yearsExperience?: number | null;
  /** A real offering id for `session_picker`; never fabricated. */
  offeringId?: string | null;
  /** A real event id for `ticket_picker`; never fabricated. */
  eventId?: string | null;
  /** True when the tenant's roster has publishable people. */
  rosterActive?: boolean;
  /** Reserve verb from the words engine, e.g. "Reservar mesa". */
  transactionLabel?: Bilingual | null;
  images: ImageResolver;
  /** Preview-only example rows; a tenant compose never sets this. */
  example?: boolean;
}

export interface BusinessComponent {
  id: ComponentId;
  slot: SlotId;
  /** Brief fact keys this component reads, for the handoff table. */
  factKeys: readonly string[];
  /** The single honest line shown when the facts are missing. */
  emptyState: Bilingual;
  /** Root-level nodes to splice into the slot. `[]` removes the slot. */
  build(ctx: ComponentContext): BuilderNode[];
}
