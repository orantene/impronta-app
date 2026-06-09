import type { AddGalleryItem } from "./types";
import { connected, secEmbed, section } from "./registry-helpers";

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
  secEmbed({
    id: "sec-gallery-strip",
    label: "Gallery Strip",
    description: "Editorial mosaic image rail.",
    category: "gallery-section",
    icon: "gallery-strip",
    sectionEmbedKey: "gallery_strip",
  }),

  // ── Sections / Featured Talent ──────────────────────────────────────────
  secEmbed({
    id: "sec-featured-talent-grid",
    label: "Featured Talent Grid",
    description: "Curated roster highlight grid.",
    category: "featured-talent",
    icon: "talent-grid",
    sectionEmbedKey: "featured_talent",
    connectedSource: "Talent Collection",
    itemKind: "connected",
    searchTerms: ["featured_talent", "agency picks"],
  }),

  // ── Sections / Talent Roster ────────────────────────────────────────────
  secEmbed({
    id: "sec-roster-grid",
    label: "Roster Grid",
    description: "Full filterable talent directory.",
    category: "talent-roster",
    icon: "roster",
    sectionEmbedKey: "directory",
    connectedSource: "Talent Directory",
    itemKind: "connected",
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
  secEmbed({
    id: "sec-cta-banner",
    label: "CTA Banner",
    description: "Conversion band with headline and actions.",
    category: "cta",
    icon: "cta",
    sectionEmbedKey: "cta_banner",
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
  secEmbed({
    id: "sec-faq-accordion",
    label: "FAQ Accordion",
    description: "Collapsible Q&A pairs.",
    category: "faq",
    icon: "faq",
    sectionEmbedKey: "faq_accordion",
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

  // ── Connected / Talent ──────────────────────────────────────────────────
  connected({
    id: "conn-talent-grid",
    label: "Talent Grid",
    description: "Show talent profiles in a responsive grid.",
    category: "talent",
    icon: "talent-grid",
    sectionEmbedKey: "featured_talent",
    connectedSource: "Talent Collection",
    searchTerms: ["featured talent", "roster"],
  }),
  connected({
    id: "conn-featured-talent",
    label: "Featured Talent",
    description: "Highlighted roster block with curated picks.",
    category: "talent",
    icon: "featured-talent",
    sectionEmbedKey: "featured_talent",
    connectedSource: "Talent Collection",
  }),

  // ── Connected / Agency ──────────────────────────────────────────────────
  connected({
    id: "conn-agency-logo",
    label: "Agency Logo",
    description: "Logo image from agency profile.",
    category: "agency",
    icon: "agency-logo",
    sectionEmbedKey: "logo_cloud",
    connectedSource: "Agency Profile",
    searchTerms: ["brand mark"],
  }),

  // ── Connected / Directory ─────────────────────────────────────────────────
  connected({
    id: "conn-talent-search",
    label: "Talent Search Bar",
    description: "Directory search with filters.",
    category: "directory",
    icon: "search",
    sectionEmbedKey: "directory",
    connectedSource: "Talent Directory",
  }),
  connected({
    id: "conn-directory-grid",
    label: "Talent Directory Grid",
    description: "Full roster directory grid.",
    category: "directory",
    icon: "directory-grid",
    sectionEmbedKey: "directory",
    connectedSource: "Talent Directory",
  }),

  // ── Connected / Booking & Inquiry ─────────────────────────────────────────
  connected({
    id: "conn-inquiry-button",
    label: "Inquiry Button",
    description: "Opens inquiry workflow.",
    category: "booking",
    icon: "inquiry",
    sectionEmbedKey: "cta_banner",
    connectedSource: "Inquiry Collection",
  }),
  connected({
    id: "conn-booking-button",
    label: "Booking Button",
    description: "Embedded booking widget.",
    category: "booking",
    icon: "booking",
    sectionEmbedKey: "booking_widget",
    connectedSource: "Booking",
  }),

  // ── Connected / Dynamic Data ────────────────────────────────────────────
  connected({
    id: "conn-collection-grid",
    label: "Collection Grid",
    description: "Grid bound to a talent or content collection.",
    category: "dynamic",
    icon: "collection-grid",
    sectionEmbedKey: "featured_talent",
    connectedSource: "Talent Collection",
    searchTerms: ["repeater", "dynamic"],
  }),
];
