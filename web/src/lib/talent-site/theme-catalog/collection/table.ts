/**
 * Table (TH14 of the owner screenshots): a private-chef dinner menu. DRAFT
 * design (not in FINISHED_GALLERY_SLUGS, no demos assigned).
 *
 * Read off the screenshot (assumptions are in the PR notes): dark warm page,
 * cream text, one gold accent; Playfair-style serif display with an italic
 * accent word; ruled "carta" price rows with roman numerals; a masonry of
 * dinner photos with captions; before-the-dinner lists; the chef story; a big
 * closing line. Every font, size, colour and shape is an editable token.
 */
import type { DesignPayload } from "../types";
import { aboutBlock, heroSplit, portfolioBlock } from "../section-kit";
import { contactSection, seqIds, servicesSection, shell, tuneHeading } from "./design-parts";

export const TABLE_HEADING_FONT = "Playfair Display, Georgia, serif";
export const TABLE_BODY_FONT = "DM Sans, system-ui, sans-serif";

/** Sampled from TH14: warm near-black page, cream ink, gold accent. */
export const TABLE_PALETTE = {
  page: "#17130E",
  surface: "#221C14",
  line: "#3A3126",
  ink: "#F4EBDD",
  accent: "#E3BE7B",
  onAccent: "#17130E",
  muted: "#B7AB98",
} as const;

export const TABLE_STYLE_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  "button.radius": "4px",
  "button.height": "44px",
  "button.padding-x": "18px",
  "button.font-size": "13px",
  "button.font-weight": "600",
  "shape.rule-width": "1px",
  "type.display-weight": "500",
  "type.display-tracking": "-0.01em",
  "type.label-size": "11px",
  "type.label-weight": "600",
  "type.label-tracking": "0.16em",
};

export const TABLE_REGISTRY_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  "radius.base": "sm",
  "shadow.preset": "none",
};

export const TABLE_DESIGN_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  ...TABLE_STYLE_TOKEN_DEFAULTS,
  ...TABLE_REGISTRY_TOKEN_DEFAULTS,
};

export function buildTablePayload(): DesignPayload {
  const id = seqIds("table");
  const hero = tuneHeading(
    heroSplit(id, { ratio: "60-40", chips: false, accent: true, eyebrow: true, minHeight: "64vh", italicAccent: true }),
    { fontWeight: 500, letterSpacing: "-0.01em" },
  );
  return {
    tokenDefaults: { ...TABLE_STYLE_TOKEN_DEFAULTS },
    shellTree: shell(id, {
      navLinks: [
        { label: "The menu", href: "#services" },
        { label: "Work", href: "#gallery" },
        { label: "About", href: "#about" },
        { label: "Contact", href: "#contact" },
      ],
    }),
    homeTree: [
      hero,
      servicesSection(id, {
        label: "The menu",
        eyebrow: "The menu",
        title: "What I {i}cook{/i}",
        layout: "rate_card",
        categoryNav: "none",
        stylePreset: "editorial",
        photoRadius: "square",
        density: "comfortable",
        rowCtaVariant: "outline",
        showPhoto: false,
        showDescription: true,
        showDelivery: true,
      }),
      portfolioBlock(id, { layout: "masonry", columns: 3, heading: "Recent {i}nights{/i}", showCaptions: true }),
      aboutBlock(id, { layout: "split", align: "start", accent: true }),
      contactSection(id, { heading: "Your night, your table.", faqHeading: "Before the dinner" }),
    ],
  };
}
