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
