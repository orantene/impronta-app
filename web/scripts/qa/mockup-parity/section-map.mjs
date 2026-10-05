/**
 * Section map: mockup selector <-> product selector, in mockup page order.
 *
 * Product anchors come from the kit: `stampKitSection` stamps `anchorId` = slotKey
 * (hero, about, services, gallery, reviews, visit, location), so the product ids are
 * #hero #gallery #services #reviews #about #location. FAQ, header and footer have no
 * kit slot, so they resolve by structure (`fn:` resolvers, see analyze.mjs).
 *
 * `expects` are shared by both sides (the mockup is checked with the same rules as a
 * self-test, so a rule that fails on the mockup is a bad rule, not a product bug).
 * Kinds: sel (>= min visible matches), text (regex on visible text, `re` is a key of
 * LOCALE_TEXT or a raw pattern), countText, plus the specials eyebrow and ctaPair.
 */
export const LOCALE_TEXT = {
  nextFree: "(hoy|mañana|today|tomorrow|pr[oó]xim|next|libre|available|disponible)",
  proof: "(años|years|reseñas|reviews)",
  menuIntro: "(MXN|USD|precios|prices|pesos)",
  price: "(\\$|MXN|USD|desde|from|cotizar|quote)",
  where: "(dónde|donde|where|ubicaci|location|visita|visit)",
  contact: "(contacto|contact|instagram|escrib|message)",
  policy: "(pol[ií]ticas|privacidad|t[eé]rminos|cookies|policies|privacy|terms)",
  navCta: "(men[uú]|servicios|reserv|book|citas|services)",
  langSwitch: "(\\bES\\b[\\s\\S]*\\bEN\\b|\\bEN\\b[\\s\\S]*\\bES\\b)",
};

export const SECTIONS = [
  {
    key: "header",
    label: "Header",
    mockup: [".m-hdr", "#m-hdr"],
    product: ["fn:header"],
    expects: [
      // phones collapse the links into one section-menu button (mockup behaviour)
      { name: "section links (>= 3) or section menu", kind: "sel", sel: "a, button", min: 3, alt: "[aria-haspopup], [aria-expanded]" },
      { name: "booking-mode CTA pill (desktop)", kind: "text", re: "navCta", minWidth: 1000 },
      { name: "ES/EN switch", kind: "text", re: "langSwitch" },
    ],
  },
  {
    key: "hero",
    label: "Hero",
    mockup: ["section.hero", "#hero"],
    product: ["#hero", "[data-slot-key='hero']", "[data-anchor-id='hero']"],
    expects: [
      { name: "eyebrow", kind: "eyebrow" },
      { name: "headline (h1)", kind: "sel", sel: "h1", min: 1 },
      { name: "lede paragraph", kind: "sel", sel: "p", min: 1 },
      { name: "CTA pair (2 actions)", kind: "ctaPair" },
      { name: "proof line", kind: "text", re: "proof" },
      { name: "next-free chip", kind: "text", re: "nextFree" },
      { name: "hero photo", kind: "sel", sel: "img", min: 1 },
    ],
  },
  {
    key: "work",
    label: "Work / portfolio",
    mockup: ["#s-work"],
    product: ["#gallery", "#work", "#portfolio", "[data-slot-key='gallery']"],
    optional: true,
    expects: [
      { name: "heading", kind: "sel", sel: "h2, h3", min: 1 },
      { name: "photos (>= 3)", kind: "sel", sel: "img", min: 3 },
    ],
  },
  {
    key: "menu",
    label: "Menu (#services)",
    mockup: ["#s-menu"],
    product: ["#services", "[data-slot-key='services']"],
    expects: [
      { name: "heading", kind: "sel", sel: "h2", min: 1 },
      { name: "menu intro line (currency)", kind: "text", re: "menuIntro" },
      { name: "row cards (>= 3 thumbs)", kind: "sel", sel: "img", min: 3 },
      { name: "prices on rows", kind: "text", re: "price" },
    ],
  },
  {
    key: "reviews",
    label: "Reviews",
    mockup: ["#s-revs"],
    product: ["#reviews", "[data-slot-key='reviews']"],
    optional: true, // hidden without real reviews, by design
    expects: [
      { name: "heading", kind: "sel", sel: "h2", min: 1 },
      { name: "review cards (>= 1)", kind: "sel", sel: "q, blockquote, figure", min: 1 },
    ],
  },
  {
    key: "about",
    label: "About",
    mockup: ["#s-about"],
    product: ["#about", "[data-slot-key='about']"],
    expects: [
      { name: "heading", kind: "sel", sel: "h2", min: 1 },
      { name: "portrait", kind: "sel", sel: "img", min: 1 },
      { name: "actions (>= 1)", kind: "sel", sel: "a, button", min: 1 },
    ],
  },
  {
    key: "faq",
    label: "FAQ",
    mockup: ["#s-faq"],
    product: ["#faq", "[data-slot-key='faq']", "fn:faq"],
    optional: true,
    expects: [
      { name: "heading", kind: "sel", sel: "h2", min: 1 },
      { name: "questions (>= 2)", kind: "sel", sel: "details, [aria-expanded]", min: 2 },
    ],
  },
  {
    key: "location",
    label: "Location (#location)",
    mockup: ["#s-loc"],
    product: ["#location", "#visit", "[data-slot-key='location']", "[data-slot-key='visit']"],
    expects: [
      { name: "heading", kind: "sel", sel: "h2", min: 1 },
      { name: "location rows (text)", kind: "text", re: "where" },
      { name: "actions (directions / chat)", kind: "sel", sel: "a, button", min: 1 },
    ],
  },
  {
    key: "footer",
    label: "Footer",
    mockup: ["#s-foot"],
    product: ["#s-foot", "fn:footer"],
    expects: [
      { name: "big line (h2)", kind: "sel", sel: "h2", min: 1 },
      { name: "Where column", kind: "text", re: "where" },
      { name: "Contact column", kind: "text", re: "contact" },
      { name: "booking button", kind: "sel", sel: "a, button", min: 1 },
    ],
  },
  {
    key: "socket",
    label: "Footer socket",
    mockup: [".bstrip"],
    product: [".tulala-socket", "fn:socket"],
    expects: [
      { name: "policy links (>= 3)", kind: "countText", re: "policy", min: 3, sel: "a, button" },
      { name: "Tulala attribution", kind: "text", re: "(Tulala)" },
    ],
  },
];

/** Order the sections must appear in (document order), per the mockup. */
export const ORDER = ["header", "hero", "work", "menu", "reviews", "about", "faq", "location", "footer", "socket"];

/** Interaction states, driven in run.mjs. */
export const STATE_KEYS = ["chat", "dock", "booking"];

/** UI strings that must never appear on a Spanish site. Whole words, case sensitive. */
export const ES_DENYLIST = [
  "Book now", "Book", "Services", "Menu", "Reviews", "About me", "Contact us", "Location",
  "Send", "Next", "Back", "Close", "Open chat", "Chat with", "Ask", "Next available", "Today at",
  "Show more", "See all", "Read more", "Get in touch", "Prices", "Learn more", "Sign in",
  "Directions", "Opening hours", "Continue", "Add to booking", "Your booking",
];

/** Unaccented spellings of place names that must keep their accent. */
export const ACCENT_DENYLIST = ["Merida", "Cancun", "Mexico", "Queretaro", "Yucatan", "Michoacan", "San Luis Potosi", "Nuevo Leon"];

/** Never click anything whose accessible name matches this (read-only guarantee). */
export const NEVER_CLICK = "(enviar|send|pagar|\\bpay\\b|publicar|publish|confirm|submit|place order|checkout)";
