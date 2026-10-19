/**
 * Ribbon (TH15): a bridal / events timeline. DRAFT design (not finished, no
 * demos assigned).
 *
 * Read off the screenshot (assumptions are in the PR notes): warm cream page,
 * deep green accent, Cormorant-style serif with an italic accent word; a
 * centered cover with the name, a stats strip, a "from the date to the last
 * dance" run of steps, a three-package comparison, a FAQ, a photo grid, a
 * reviews quote, the closing line. Header is a quiet bar with chapter dots.
 * Every font, size, colour and shape is an editable token.
 */
import type { DesignPayload } from "../types";
import { aboutBlock, heroCentered, portfolioBlock } from "../section-kit";
import { reviewsBlock } from "../section-kit-bands";
import { contactSection, seqIds, servicesSection, shell, tuneHeading } from "./design-parts";

export const RIBBON_HEADING_FONT = "Cormorant Garamond, Georgia, serif";
export const RIBBON_BODY_FONT = "Jost, system-ui, sans-serif";

/** Sampled from TH15: cream page, soft ink, deep green accent. */
export const RIBBON_PALETTE = {
  page: "#F3EFE7",
  surface: "#FBF9F4",
  line: "#DAD3C5",
  ink: "#2A2823",
  accent: "#3E5648",
  onAccent: "#FFFFFF",
  muted: "#7A746A",
} as const;

export const RIBBON_STYLE_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  "button.radius": "2px",
  "button.height": "44px",
  "button.padding-x": "20px",
  "button.font-size": "12px",
  "button.font-weight": "500",
  "shape.rule-width": "1px",
  "type.display-weight": "400",
  "type.display-tracking": "-0.01em",
  "type.label-size": "10px",
  "type.label-weight": "500",
  "type.label-tracking": "0.2em",
};

export const RIBBON_REGISTRY_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  "radius.base": "none",
  "shadow.preset": "none",
};

export const RIBBON_DESIGN_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  ...RIBBON_STYLE_TOKEN_DEFAULTS,
  ...RIBBON_REGISTRY_TOKEN_DEFAULTS,
};

export function buildRibbonPayload(): DesignPayload {
  const id = seqIds("ribbon");
  const hero = tuneHeading(heroCentered(id, { chips: false, accent: false }), {
    fontWeight: 400,
    letterSpacing: "-0.01em",
  });
  return {
    tokenDefaults: { ...RIBBON_STYLE_TOKEN_DEFAULTS },
    shellTree: shell(id, { navChrome: "chapter_dots", navLinks: [{ label: "Packages", href: "#services" }, { label: "Work", href: "#gallery" }, { label: "About", href: "#about" }, { label: "Contact", href: "#contact" }] }),
    homeTree: [
      hero,
      servicesSection(id, {
        label: "Packages",
        eyebrow: "Packages",
        title: "Three ways to {i}go with you{/i}",
        layout: "matrix",
        categoryNav: "none",
        stylePreset: "clean",
        photoRadius: "square",
        density: "comfortable",
        rowCtaVariant: "outline",
        showPhoto: false,
        showDescription: false,
        showDelivery: false,
        maxWidth: "full",
        contentWidth: "full",
      }),
      portfolioBlock(id, { layout: "grid", columns: 4, heading: "Updos, waves and {i}veils{/i}", showCaptions: true }),
      reviewsBlock(id, { layout: "single", heading: "What brides say" }),
      aboutBlock(id, { layout: "split", align: "start", accent: false }),
      contactSection(id, { heading: "Your date, {i}first{/i}.", faqHeading: "Before you {i}decide{/i}", center: true }),
    ],
  };
}
