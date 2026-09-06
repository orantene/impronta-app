import type { AddGalleryItem } from "./types";
import { connected, section } from "./registry-helpers";

export const ADD_GALLERY_SECTIONS_CONNECTED_ITEMS: ReadonlyArray<AddGalleryItem> = [
  // ── Sections / Hero ─────────────────────────────────────────────────────
  section({
    id: "sec-hero-centered",
    label: "Hero Centered",
    description: "Centered headline, intro, and primary actions.",
    category: "hero",
    icon: "hero-centered",
    sectionTemplateId: "hero-centered",
    searchTerms: ["hero"],
  }),
  section({
    id: "sec-hero-split",
    label: "Hero Split Image",
    description: "Headline beside editorial photography.",
    category: "hero",
    icon: "hero-split",
    sectionTemplateId: "hero-split",
  }),
  section({
    id: "sec-hero-search",
    label: "Hero Search",
    description: "Search-first hero with directory query bar.",
    category: "hero",
    icon: "hero-search",
    sectionTemplateId: "hero-search",
    searchTerms: ["hero_search", "directory search"],
  }),
  section({
    id: "sec-hero-minimal",
    label: "Hero Minimal",
    description: "Focused headline with a single action.",
    category: "hero",
    icon: "hero-minimal",
    sectionTemplateId: "hero-minimal",
  }),
  section({
    id: "sec-hero-slider",
    label: "Hero Slider",
    description:
      "Full-screen freeform slider — each slide is its own layout (columns, photo background, headings, buttons) with crossfade, Ken Burns, autoplay and dots.",
    category: "hero",
    icon: "hero-split",
    sectionTemplateId: "hero-slider",
    searchTerms: [
      "hero",
      "slider",
      "carousel",
      "slideshow",
      "full screen",
      "ken burns",
      "noir",
    ],
  }),
  section({
    id: "sec-hero-spotlight",
    label: "Hero Spotlight",
    description: "Full-bleed photo with a left-anchored headline, description, and actions.",
    category: "hero",
    icon: "hero-split",
    sectionTemplateId: "hero-spotlight",
    searchTerms: ["hero", "spotlight", "full bleed", "photo", "overlay", "cover"],
  }),

  // ── Sections / About ────────────────────────────────────────────────────
  section({
    id: "sec-about-simple",
    label: "About Simple",
    description: "Agency story with supporting copy.",
    category: "about",
    icon: "about",
    sectionTemplateId: "about",
  }),
  section({
    id: "sec-about-split",
    label: "About Split Image",
    description: "Story beside portrait or brand imagery.",
    category: "about",
    icon: "about-split",
    sectionTemplateId: "about-split",
  }),
  section({
    id: "sec-story-house",
    label: "Story House",
    description:
      "Editorial origin story — 4:5 portrait in a gold inset frame beside a Cormorant heading, muted copy, italic gold pull-quote, and signature.",
    category: "about",
    icon: "about-split",
    sectionTemplateId: "story-house",
    searchTerms: [
      "story",
      "about",
      "origin",
      "the house",
      "founders",
      "editorial",
      "noir",
    ],
  }),
  section({
    id: "sec-about-stats",
    label: "About Stats",
    description: "Credibility metrics beside your story.",
    category: "about",
    icon: "about-stats",
    sectionTemplateId: "about-stats",
  }),

  // ── Sections / Services ─────────────────────────────────────────────────
  section({
    id: "sec-services-grid",
    label: "Services Grid",
    description: "Service cards in a responsive grid.",
    category: "services",
    icon: "services",
    sectionTemplateId: "services",
  }),
  section({
    id: "sec-services-list",
    label: "Services List",
    description: "Simple bullet-style service overview.",
    category: "services",
    icon: "services-list",
    sectionTemplateId: "services-list",
  }),
  section({
    id: "sec-menu-display",
    label: "Menu - display only",
    description:
      "Decorative static menu with item names and prices. Not connected to workspace orders.",
    category: "services",
    icon: "services-list",
    sectionTemplateId: "menu-display",
    searchTerms: ["menu", "display only", "static menu", "decorative menu", "prices"],
  }),

  // ── Sections / Gallery ──────────────────────────────────────────────────
  section({
    id: "sec-gallery-grid",
    label: "Gallery Grid",
    description: "Masonry image showcase.",
    category: "gallery-section",
    icon: "gallery",
    sectionTemplateId: "gallery",
  }),
  section({
    id: "sec-gallery-strip",
    label: "Gallery Strip",
    description: "Editorial mosaic image rail.",
    category: "gallery-section",
    icon: "gallery-strip",
    sectionTemplateId: "gallery-strip",
  }),

  // ── Sections / Featured Talent ──────────────────────────────────────────
  section({
    id: "sec-featured-talent-grid",
    label: "Featured Talent Grid",
    description: "Curated roster highlight grid with editable intro layers.",
    category: "featured-talent",
    icon: "talent-grid",
    sectionTemplateId: "featured-talent-wrapper",
    itemKind: "connected",
    connectedSource: "Talent Collection",
    sourceType: "native-freeform",
    searchTerms: ["featured_talent", "agency picks"],
  }),

  // ── Sections / Talent Roster ────────────────────────────────────────────
  section({
    id: "sec-talent-discipline",
    label: "Talent by Discipline",
    description:
      "Featured-pod category grid — Models, hosts, performers, and more.",
    category: "talent-roster",
    icon: "talent-grid",
    sectionTemplateId: "talent-discipline-wrapper",
    itemKind: "connected",
    connectedSource: "Talent Directory",
    sourceType: "native-freeform",
    searchTerms: [
      "talent_type_grid",
      "discipline",
      "browse by type",
      "categories",
      "roster",
    ],
  }),
  section({
    id: "sec-roster-grid",
    label: "Roster Grid",
    description: "Full filterable talent directory with intro layers.",
    category: "talent-roster",
    icon: "roster",
    sectionTemplateId: "roster-wrapper",
    itemKind: "connected",
    connectedSource: "Talent Directory",
    sourceType: "native-freeform",
    searchTerms: ["directory", "roster"],
  }),

  // ── Sections / Testimonials ─────────────────────────────────────────────
  section({
    id: "sec-testimonials-trio",
    label: "Testimonials Trio",
    description: "Three elegant client quote cards.",
    category: "testimonials",
    icon: "testimonials",
    sectionTemplateId: "testimonials-trio",
    searchTerms: ["testimonial", "social proof"],
  }),

  // ── Sections / CTA ──────────────────────────────────────────────────────
  section({
    id: "sec-cta-banner",
    label: "CTA Banner",
    description: "Conversion band with headline and actions.",
    category: "cta",
    icon: "cta",
    sectionTemplateId: "cta-banner",
  }),
  section({
    id: "sec-cta-split",
    label: "CTA Split",
    description: "Message and action in a split layout.",
    category: "cta",
    icon: "cta-split",
    sectionTemplateId: "cta-split",
  }),

  // ── Sections / FAQ ──────────────────────────────────────────────────────
  section({
    id: "sec-faq-accordion",
    label: "FAQ Accordion",
    description: "Collapsible Q&A pairs.",
    category: "faq",
    icon: "faq",
    sectionTemplateId: "faq-accordion",
  }),

  // ── Sections / Contact ──────────────────────────────────────────────────
  section({
    id: "sec-contact-form",
    label: "Contact Form",
    description: "Message form with name and email fields.",
    category: "contact",
    icon: "contact-form",
    sectionTemplateId: "contact-form",
  }),

  // ── Connected / Talent (canonical featured-talent wrapper) ────────────────
  connected({
    id: "conn-talent-grid",
    label: "Talent Grid",
    description: "Show talent profiles in a responsive grid with editable intro.",
    category: "talent",
    icon: "talent-grid",
    insertMethod: "sectionTemplate",
    sectionTemplateId: "featured-talent-wrapper",
    sourceType: "native-freeform",
    connectedSource: "Talent Collection",
    searchTerms: ["featured talent", "roster"],
  }),
  connected({
    id: "conn-featured-talent",
    label: "Featured Talent",
    description: "Highlighted roster block with curated picks and intro layers.",
    category: "talent",
    icon: "featured-talent",
    insertMethod: "sectionTemplate",
    sectionTemplateId: "featured-talent-wrapper",
    sourceType: "native-freeform",
    connectedSource: "Talent Collection",
  }),
  connected({
    id: "conn-talent-discipline",
    label: "Talent by Discipline",
    description:
      "Category grid with featured Models pod and discipline cards (dynamic or manual).",
    category: "talent",
    icon: "talent-grid",
    insertMethod: "sectionTemplate",
    sectionTemplateId: "talent-discipline-wrapper",
    sourceType: "native-freeform",
    connectedSource: "Talent Directory",
    searchTerms: [
      "talent_type_grid",
      "discipline",
      "browse by type",
      "categories",
    ],
  }),

  // ── Connected / NATIVE data blocks (WS7 Phase 0) ────────────────────────
  // These two are `nativeNode` inserts — a real BuilderNode kind, rendered by
  // the shared builder renderer from server-resolved tenant data. They are the
  // native replacements for the `section_embed` round-trip to the curated
  // `hero_search` / `talent_type_grid` sections, which is why `sourceType` is
  // `native-freeform` rather than the `connected()` helper's `section-embed`
  // default. Insertion goes through `createNativeNodeForGalleryItem` →
  // `createBuilderNode(kind)`, i.e. the builder tree only — the same path
  // `assertAddGalleryBuilderTreeOnly` polices.
  connected({
    id: "conn-hero-search-native",
    label: "Search Hero",
    description:
      "Search-first hero: headline, a live directory search bar, quick filters and a roster-derived talent count.",
    category: "hero",
    icon: "hero-search",
    insertMethod: "nativeNode",
    nativeKind: "hero_search",
    sourceType: "native-freeform",
    connectedSource: "Talent Directory",
    searchTerms: [
      "hero_search",
      "hero",
      "search",
      "directory search",
      "find talent",
      "stat",
      "count",
    ],
  }),
  connected({
    id: "conn-talent-discipline-native",
    label: "Talent by Discipline",
    description:
      "Discipline cards derived from your own roster's taxonomy, each linking into the directory.",
    category: "talent",
    icon: "talent-grid",
    insertMethod: "nativeNode",
    nativeKind: "talent_type_grid",
    sourceType: "native-freeform",
    connectedSource: "Talent Directory",
    searchTerms: [
      "talent_type_grid",
      "discipline",
      "browse by type",
      "categories",
      "taxonomy",
    ],
  }),

  // ── BUILDER 2027 · P2A — NATIVE roster bands ────────────────────────────
  // The three cards here insert a real BuilderNode kind, not a `section_embed`
  // bridge into the frozen curated section of the same name. They sit beside
  // the existing `conn-directory-grid` / `conn-talent-search` embed cards for
  // the same reason the WS7 native cards sat beside the curated hero: existing
  // pages keep working, new pages get the native kind, and the bridge can be
  // deleted later without a data migration.
  connected({
    id: "conn-directory-native",
    label: "Directory",
    description:
      "Your roster as a filterable grid, scoped by talent type, tag or a hand-picked list.",
    category: "directory",
    icon: "directory-grid",
    insertMethod: "nativeNode",
    nativeKind: "directory",
    sourceType: "native-freeform",
    connectedSource: "Talent Directory",
    searchTerms: [
      "directory",
      "roster",
      "grid",
      "talent",
      "filter",
      "search",
      "browse",
      "people",
      "team",
      "native",
    ],
  }),
  connected({
    id: "conn-featured-talent-native",
    label: "Featured Talent",
    description:
      "A curated showcase of talent cards, picked by hand or filled automatically from your roster.",
    category: "talent",
    icon: "profile-card",
    insertMethod: "nativeNode",
    nativeKind: "featured_talent",
    sourceType: "native-freeform",
    connectedSource: "Talent Directory",
    searchTerms: [
      "featured_talent",
      "featured",
      "showcase",
      "spotlight",
      "cards",
      "curated",
      "native",
    ],
  }),
  connected({
    id: "conn-location-map-native",
    label: "Location Map",
    description:
      "A map with a copy panel over it and a pin for every city, sourced by hand or from where your roster lives.",
    category: "directory",
    icon: "globe",
    insertMethod: "nativeNode",
    nativeKind: "location_map",
    sourceType: "native-freeform",
    connectedSource: "Talent Directory",
    searchTerms: [
      "location_map",
      "map",
      "cities",
      "pins",
      "where we work",
      "markets",
      "territory",
      "native",
    ],
  }),

  // ── Connected / Agency ──────────────────────────────────────────────────
  connected({
    id: "conn-agency-logo",
    label: "Agency Logo",
    description: "Press and client logo row with editable title.",
    category: "agency",
    icon: "agency-logo",
    insertMethod: "sectionTemplate",
    sectionTemplateId: "agency-logo",
    sourceType: "native-freeform",
    connectedSource: "Agency Profile",
    searchTerms: ["brand mark", "logo cloud"],
  }),

  // ── Connected / Directory (dynamic embeds — Class C) ────────────────────
  connected({
    id: "conn-talent-search",
    label: "Talent Search Bar",
    description: "Live directory search with filters (dynamic embed).",
    category: "directory",
    icon: "search",
    sectionEmbedKey: "directory",
    connectedSource: "Talent Directory",
  }),
  connected({
    id: "conn-directory-grid",
    label: "Talent Directory Grid",
    description: "Full roster directory grid (dynamic embed).",
    category: "directory",
    icon: "directory-grid",
    sectionEmbedKey: "directory",
    connectedSource: "Talent Directory",
  }),

  // ── Connected / Booking & Inquiry ─────────────────────────────────────────
  connected({
    id: "conn-inquiry-button",
    label: "Inquiry Button",
    description: "Compact inquiry CTA with editable copy.",
    category: "booking",
    icon: "inquiry",
    insertMethod: "sectionTemplate",
    sectionTemplateId: "inquiry-cta",
    sourceType: "native-freeform",
    connectedSource: "Inquiry Collection",
  }),
  connected({
    id: "conn-booking-button",
    label: "Booking Button",
    description: "Embedded booking widget (dynamic embed).",
    category: "booking",
    icon: "booking",
    sectionEmbedKey: "booking_widget",
    connectedSource: "Booking",
  }),
  connected({
    id: "conn-menu-board-native",
    label: "Menu - orderable",
    description: "Workspace menu with quantity steppers and an order form for published items.",
    category: "booking",
    icon: "booking",
    insertMethod: "nativeNode",
    nativeKind: "menu_board",
    sourceType: "native-freeform",
    connectedSource: "Workspace Menu",
    searchTerms: ["menu board", "menu_order", "order food", "catering", "workspace menu"],
  }),
  connected({
    id: "conn-reserve-table-native",
    label: "Reserve a table",
    description:
      "A guest picks party size, date and time and books a real table, held as an order the host stand can see.",
    category: "booking",
    icon: "booking",
    insertMethod: "nativeNode",
    nativeKind: "reserve_table",
    sourceType: "native-freeform",
    connectedSource: "Reservations",
    searchTerms: [
      "reserve",
      "reservation",
      "book a table",
      "booking",
      "restaurant",
      "party size",
      "availability",
    ],
  }),
  connected({
    id: "conn-session-picker-native",
    label: "Book a session",
    description:
      "A guest picks an upcoming session or class and books a seat, held as an order; the seat past capacity is refused.",
    category: "booking",
    icon: "booking",
    insertMethod: "nativeNode",
    nativeKind: "session_picker",
    sourceType: "native-freeform",
    connectedSource: "Sessions",
    searchTerms: [
      "session",
      "class",
      "book a seat",
      "booking",
      "schedule",
      "sign up",
      "capacity",
    ],
  }),
  connected({
    id: "conn-ticket-picker-native",
    label: "Buy tickets",
    description:
      "A guest picks a night and a ticket for one of your events and pays by card; a seat past capacity is refused.",
    category: "booking",
    icon: "booking",
    insertMethod: "nativeNode",
    nativeKind: "ticket_picker",
    sourceType: "native-freeform",
    connectedSource: "Events",
    searchTerms: [
      "ticket",
      "tickets",
      "event",
      "night",
      "buy",
      "checkout",
      "door",
    ],
  }),
  connected({
    id: "conn-qr-code-native",
    label: "QR code",
    description:
      "A scannable code for one of your links. Point a phone at it and it opens the link.",
    category: "booking",
    icon: "booking",
    insertMethod: "nativeNode",
    nativeKind: "qr_code",
    sourceType: "native-freeform",
    connectedSource: "QR & Links",
    searchTerms: [
      "qr",
      "qr code",
      "scan",
      "link",
      "print",
      "table tent",
      "share",
    ],
  }),

  // ── Connected / Dynamic Data ────────────────────────────────────────────
  connected({
    id: "conn-collection-grid",
    label: "Collection Grid",
    description: "Grid bound to a talent collection with editable intro.",
    category: "dynamic",
    icon: "collection-grid",
    insertMethod: "sectionTemplate",
    sectionTemplateId: "featured-talent-wrapper",
    sourceType: "native-freeform",
    connectedSource: "Talent Collection",
    searchTerms: ["repeater", "dynamic"],
  }),
];
