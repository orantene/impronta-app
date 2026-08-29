/** Short card copy + optional education tooltip per gallery item id. */
export type AddGalleryCardCopy = {
  /** One short sentence shown on the card face. */
  description: string;
  /** Longer guidance — shown in the info popover only. */
  infoTooltip?: string;
};

export const ADD_GALLERY_CARD_COPY: Readonly<
  Record<string, AddGalleryCardCopy>
> = {
  // ── Elements / Text ─────────────────────────────────────────────────────
  "el-title": {
    description: "Primary page or section heading.",
    infoTooltip:
      "Use this for the main headline of a page or section. Usually styled as H1 or H2.",
  },
  "el-subtitle": {
    description: "Secondary heading below the title.",
    infoTooltip:
      "Use this to support the main title with a smaller heading.",
  },
  "el-intro": {
    description: "Short lead text above or below a headline.",
    infoTooltip:
      "Use this for a small introductory line, category label, or lead-in text. Do not call this Eyebrow/Kicker.",
  },
  "el-paragraph": {
    description: "Body copy block.",
    infoTooltip:
      "Use this for normal page text, descriptions, and supporting copy.",
  },
  "el-rich-text": {
    description: "Formatted multi-paragraph content.",
    infoTooltip:
      "Use this when you need bold, links, lists, or multiple paragraphs in one block.",
  },
  "el-caption": {
    description: "Small supporting text under media.",
    infoTooltip:
      "Use this for image credits, footnotes, or short labels beneath photos and videos.",
  },
  "el-badge": {
    description: "Small label or status tag.",
    infoTooltip:
      "Use this for status chips, category labels, or compact highlights beside a headline.",
  },
  "el-quote": {
    description: "Pull quote or blockquote.",
    infoTooltip:
      "Use this for client quotes, editorial pull quotes, or emphasized statements.",
  },
  "el-list": {
    description: "Bulleted or numbered list.",
    infoTooltip:
      "Use this for feature lists, steps, or grouped bullet points.",
  },

  // ── Elements / Buttons ──────────────────────────────────────────────────
  "el-button": {
    description: "Primary call-to-action button.",
    infoTooltip:
      "Use this for actions like open page, scroll to section, WhatsApp, inquiry, booking, or download.",
  },
  "el-button-group": {
    description: "Grouped primary and secondary actions.",
    infoTooltip:
      "Use this when a section needs two or more related buttons side by side.",
  },
  "el-text-link": {
    description: "Inline text link styled as a button.",
    infoTooltip:
      "Use this for lightweight actions that should read as a link, not a filled button.",
  },
  "el-icon-button": {
    description: "Compact icon-forward action.",
    infoTooltip:
      "Use this for social, share, play, or utility actions where the icon carries the meaning.",
  },
  "el-book-now": {
    description: "Opens the existing booking page.",
    infoTooltip:
      "Use this to send visitors to /book. It uses the existing button, not an inline scheduler.",
  },
  "el-whatsapp": {
    description: "Opens a WhatsApp chat.",
    infoTooltip:
      "Use this to start a WhatsApp conversation with a preset agency number or message.",
  },
  "el-inquiry-button": {
    description: "Opens the inquiry flow.",
    infoTooltip:
      "Use this to route visitors into your agency inquiry workflow from any page section.",
  },
  "el-booking-button": {
    description: "Embedded booking widget CTA.",
    infoTooltip:
      "Use this to surface booking or availability actions tied to your agency booking setup.",
  },
  "el-download-link": {
    description: "Button linking to a downloadable file.",
    infoTooltip:
      "Use this for press kits, rate cards, lookbooks, or any file download action.",
  },

  // ── Elements / Media ────────────────────────────────────────────────────
  "el-image": {
    description: "Single responsive image.",
    infoTooltip:
      "Use this for one photo or graphic with alt text and responsive sizing.",
  },
  "el-cover-image": {
    description: "Wide hero-style image.",
    infoTooltip:
      "Use this for full-width cover photography behind or beside hero copy.",
  },
  "el-logo": {
    description: "Brand mark image.",
    infoTooltip:
      "Use this to place a logo image in a header, footer, or partner strip.",
  },
  "el-icon": {
    description: "Decorative or functional icon.",
    infoTooltip:
      "Use this for feature icons, service symbols, or small visual markers.",
  },
  "el-video": {
    description: "Hosted or uploaded video.",
    infoTooltip:
      "Use this for inline video players, showreels, or background motion.",
  },
  "el-gallery": {
    description: "Curated image gallery section.",
    infoTooltip:
      "Use this for editorial galleries, portfolios, or grouped photography.",
  },
  "el-image-grid": {
    description: "Responsive masonry image grid.",
    infoTooltip:
      "Use this for uneven photo grids, lookbooks, or mixed-aspect portfolios.",
  },
  "el-carousel": {
    description: "Swipeable media carousel.",
    infoTooltip:
      "Use this for rotating images, talent highlights, or swipeable cards.",
  },

  // ── Elements / Layout ───────────────────────────────────────────────────
  "el-section": {
    description: "Top-level page section row.",
    infoTooltip:
      "Use this as a full-width page band that groups related content and spacing.",
  },
  "el-container": {
    description: "Stack or row content wrapper.",
    infoTooltip:
      "Use this to group blocks, control max width, and manage inner spacing.",
  },
  "el-columns": {
    description: "Flexible multi-column layout.",
    infoTooltip:
      "Use this to create 1–12 columns. Configure column count, gap, and responsive stacking in the inspector.",
  },
  "el-grid": {
    description: "CSS grid layout block.",
    infoTooltip:
      "Use this for precise row/column layouts with gap and alignment controls.",
  },
  "el-stack": {
    description: "Vertical stack container.",
    infoTooltip:
      "Use this to stack elements top-to-bottom with consistent spacing.",
  },
  "el-row": {
    description: "Horizontal row container.",
    infoTooltip:
      "Use this to align items in a horizontal row with wrap and gap controls.",
  },
  "el-card": {
    description: "Bordered content card.",
    infoTooltip:
      "Use this as a generic content container with padding, border, and radius.",
  },
  "el-card-group": {
    description: "Row of related cards.",
    infoTooltip:
      "Use this to present multiple cards in a responsive row or grid.",
  },
  "el-spacer": {
    description: "Vertical breathing room.",
    infoTooltip:
      "Use this to add deliberate vertical space between sections or blocks.",
  },
  "el-divider": {
    description: "Horizontal rule between blocks.",
    infoTooltip:
      "Use this to separate content with a subtle line or decorative divider.",
  },

  // ── Elements / Cards ────────────────────────────────────────────────────
  "el-image-card": {
    description: "Card with image and copy.",
    infoTooltip:
      "Use this for editorial cards that pair photography with a title and short text.",
  },
  "el-text-card": {
    description: "Copy-forward content card.",
    infoTooltip:
      "Use this for service summaries, notes, or text-only feature cards.",
  },
  "el-icon-card": {
    description: "Icon-led feature card.",
    infoTooltip:
      "Use this for benefits, services, or process steps led by an icon.",
  },
  "el-profile-card": {
    description: "Portrait and bio card layout.",
    infoTooltip:
      "Use this for people profiles, talent spotlights, or team member cards.",
  },
  "el-service-card": {
    description: "Service title with short description.",
    infoTooltip:
      "Use this for agency services, packages, or offering summaries.",
  },
  "el-testimonial-card": {
    description: "Client quote in a card.",
    infoTooltip:
      "Use this for single-client quotes with name and role attribution.",
  },
  "el-pricing-card": {
    description: "Plan summary with price and CTA.",
    infoTooltip:
      "Use this for one pricing tier with features and a conversion button.",
  },
  "el-cta-card": {
    description: "Compact conversion card.",
    infoTooltip:
      "Use this for small promotional cards with headline and action.",
  },

  // ── Elements / Interactive ──────────────────────────────────────────────
  "el-accordion": {
    description: "Expandable detail panels.",
    infoTooltip:
      "Use this for FAQs, specs, or collapsible content groups.",
  },
  "el-tabs": {
    description: "Tabbed content panels.",
    infoTooltip:
      "Use this to switch between related content views without leaving the section.",
  },

  // ── Elements / Forms ────────────────────────────────────────────────────
  "el-contact-form": {
    description: "Name, email, and message fields.",
    infoTooltip:
      "Use this for general contact or message forms on marketing pages.",
  },
  "el-submit-button": {
    description: "Form submit action.",
    infoTooltip:
      "Use this as the primary submit control inside a form block.",
  },

  // ── Elements / Marketing ────────────────────────────────────────────────
  "el-cta-banner": {
    description: "Conversion band with headline.",
    infoTooltip:
      "Use this for full-width calls to action with supporting copy and buttons.",
  },
  "el-stats-counter": {
    description: "Key metrics in large type.",
    infoTooltip:
      "Use this to highlight agency stats like talent count, markets, or bookings.",
  },
  "el-testimonial": {
    description: "Social proof quote section.",
    infoTooltip:
      "Use this for client testimonials with attribution and optional imagery.",
  },
  "el-faq-group": {
    description: "Collapsible frequently asked questions.",
    infoTooltip:
      "Use this for grouped FAQ content with expand/collapse behavior.",
  },
  "el-logo-strip": {
    description: "Client or press logo row.",
    infoTooltip:
      "Use this for partner logos, press mentions, or brand credibility strips.",
  },

  // ── Elements / Utility ──────────────────────────────────────────────────
  "el-breadcrumb": {
    description: "Page hierarchy navigation trail.",
    infoTooltip:
      "Use this to show where the visitor is within your site structure.",
  },
  "el-search-bar": {
    description: "Site or directory search input.",
    infoTooltip:
      "Use this to add talent directory search and filter entry points.",
  },

  // ── Elements / Social & Embed ─────────────────────────────────────────
  "el-youtube": {
    description: "Embedded YouTube player.",
    infoTooltip:
      "Use this to embed a YouTube video by URL with responsive sizing.",
  },
  "el-embed-url": {
    description: "Generic iframe embed block.",
    infoTooltip:
      "Use this for Spotify, SoundCloud, maps, or any supported embed URL.",
  },
  "el-external-link": {
    description: "Button linking to an external URL.",
    infoTooltip:
      "Use this for outbound links to websites, documents, or third-party tools.",
  },

  // ── Sections ────────────────────────────────────────────────────────────
  "sec-hero-centered": {
    description: "Centered headline and primary actions.",
    infoTooltip:
      "A balanced hero with headline, intro, and CTA centered on the page.",
  },
  "sec-hero-split": {
    description: "Headline beside editorial photography.",
    infoTooltip:
      "Use when the hero story and hero image should sit side by side.",
  },
  "sec-hero-search": {
    description: "Search-first hero with query bar.",
    infoTooltip:
      "Use for directory-first homepages where visitors search talent immediately.",
  },
  "sec-hero-minimal": {
    description: "Focused headline with one action.",
    infoTooltip:
      "Use for clean landing pages with a single message and one CTA.",
  },
  "sec-hero-video": {
    description: "Hero with background or inline video.",
    infoTooltip:
      "Use when motion or showreel footage should lead the first screen.",
  },
  "sec-about-simple": {
    description: "Agency story with supporting copy.",
    infoTooltip:
      "A straightforward about section with headline and narrative paragraphs.",
  },
  "sec-about-split": {
    description: "Story beside portrait or brand imagery.",
    infoTooltip:
      "Use when about copy should sit next to photography or brand visuals.",
  },
  "sec-about-stats": {
    description: "Credibility metrics beside your story.",
    infoTooltip:
      "Pair agency narrative with key numbers like talent count or markets served.",
  },
  "sec-services-grid": {
    description: "Service cards in a responsive grid.",
    infoTooltip:
      "Present multiple services as equal-weight cards in a grid.",
  },
  "sec-services-list": {
    description: "Simple bullet-style service overview.",
    infoTooltip:
      "Use for a compact services list without heavy card chrome.",
  },
  "sec-gallery-grid": {
    description: "Masonry image showcase.",
    infoTooltip:
      "Use for portfolio grids, lookbooks, or editorial photography walls.",
  },
  "sec-gallery-strip": {
    description: "Editorial mosaic image rail.",
    infoTooltip:
      "Use for horizontal or mosaic gallery strips with varied image sizes.",
  },
  "sec-featured-talent-grid": {
    description: "Curated roster highlight grid.",
    infoTooltip:
      "Connected to your Talent Collection. Shows agency-curated featured profiles.",
  },
  "sec-talent-discipline": {
    description: "Category grid with featured Models pod and discipline cards.",
    infoTooltip:
      "Intro Text and Title are freeform layers — double-click them on the canvas to edit copy. Select Discipline Grid → Edit Content for category cards, images, and taxonomy source.",
  },
  "sec-roster-grid": {
    description: "Full filterable talent directory.",
    infoTooltip:
      "Connected to your Talent Directory. Visitors can browse and filter the roster.",
  },
  "sec-testimonials-trio": {
    description: "Three client quote cards.",
    infoTooltip:
      "Use for social proof with three balanced testimonial cards.",
  },
  "sec-cta-banner": {
    description: "Conversion band with headline.",
    infoTooltip:
      "Use mid-page or pre-footer to drive inquiries, bookings, or applications.",
  },
  "sec-cta-split": {
    description: "Message and action in a split layout.",
    infoTooltip:
      "Use when CTA copy and action should sit in a two-column band.",
  },
  "sec-faq-accordion": {
    description: "Collapsible Q&A pairs.",
    infoTooltip:
      "Use for agency FAQs with expandable answers.",
  },
  "sec-contact-form": {
    description: "Message form with contact fields.",
    infoTooltip:
      "Use for a dedicated contact section with name, email, and message fields.",
  },
  "sec-pricing": {
    description: "Plan comparison pricing section.",
    infoTooltip:
      "Use to compare packages or service tiers with pricing cards.",
  },
  "sec-footer": {
    description: "Site footer with links and contact.",
    infoTooltip:
      "Use for standard footer navigation, contact, and legal links.",
  },

  // ── Connected ───────────────────────────────────────────────────────────
  "conn-talent-grid": {
    description: "Talent profiles in a responsive grid.",
    infoTooltip:
      "Connected to Talent Collection. Shows roster profiles with photos, roles, and inquiry actions.",
  },
  "conn-featured-talent": {
    description: "Highlighted roster block with curated picks.",
    infoTooltip:
      "Connected to Talent Collection. Displays agency-selected featured talent.",
  },
  "conn-talent-discipline": {
    description: "Discipline category grid with featured pod layout.",
    infoTooltip:
      "Connected to your directory taxonomy. Shows Models, hosts, performers, and other discipline cards with explore links.",
  },
  "conn-talent-card": {
    description: "Single bound talent profile card.",
    infoTooltip:
      "Connected to Talent Collection. Shows one talent profile with dynamic fields.",
  },
  "conn-agency-logo": {
    description: "Logo image from agency profile.",
    infoTooltip:
      "Connected to Agency Profile. Pulls your live agency logo automatically.",
  },
  "conn-talent-search": {
    description: "Directory search with filters.",
    infoTooltip:
      "Connected to Talent Directory. Adds search and filter controls for the roster.",
  },
  "conn-directory-grid": {
    description: "Full roster directory grid.",
    infoTooltip:
      "Connected to Talent Directory. Renders the searchable talent grid experience.",
  },
  "conn-inquiry-button": {
    description: "Opens inquiry workflow.",
    infoTooltip:
      "Connected to Inquiry Collection. Routes visitors into your inquiry flow.",
  },
  "conn-booking-button": {
    description: "Embedded booking widget.",
    infoTooltip:
      "Connected to Booking. Surfaces booking or availability actions on the page.",
  },
  "conn-collection-grid": {
    description: "Grid bound to a content collection.",
    infoTooltip:
      "Connected to a collection source. Repeats items from talent or content data.",
  },
  "conn-dynamic-text": {
    description: "Text bound to any data source.",
    infoTooltip:
      "Connected data field. Displays dynamic text such as talent name, role, or bio.",
  },
  "conn-repeater": {
    description: "Repeat items from a collection.",
    infoTooltip:
      "Connected repeater. Loops over collection items to build custom lists or grids.",
  },
};
