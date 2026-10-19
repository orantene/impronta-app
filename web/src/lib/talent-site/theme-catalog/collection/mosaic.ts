/**
 * Mosaic (TH32): two disciplines, one portfolio. DRAFT design (not finished,
 * no demos assigned).
 *
 * Read off the screenshot (assumptions are in the PR notes): warm off-white
 * page, near-black display type in a heavy grotesk, one raspberry accent; the
 * two disciplines up top as big tiles, services as image-led cards, a single
 * mixed portfolio with a chip filter, a two-image about, a wide place band and
 * a huge closing line. Every font, size, colour and shape is an editable token.
 */
import type { DesignPayload } from "../types";
import { aboutBlock, heroCover, portfolioBlock } from "../section-kit";
import { contactSection, seqIds, servicesSection, shell, tuneHeading } from "./design-parts";

export const MOSAIC_HEADING_FONT = "Bricolage Grotesque, system-ui, sans-serif";
export const MOSAIC_BODY_FONT = "Inter, system-ui, sans-serif";

/** Sampled from TH32: warm off-white, ink, raspberry. */
export const MOSAIC_PALETTE = {
  page: "#F5F3EE",
  surface: "#FFFFFF",
  line: "#E4E0D8",
  ink: "#16151A",
  accent: "#C42F55",
  onAccent: "#FFFFFF",
  muted: "#6B6872",
} as const;

export const MOSAIC_STYLE_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  "button.radius": "999px",
  "button.height": "42px",
  "button.padding-x": "20px",
  "button.font-size": "13px",
  "button.font-weight": "600",
  "type.display-weight": "800",
  "type.display-tracking": "-0.04em",
  "type.label-size": "10px",
  "type.label-weight": "700",
  "type.label-tracking": "0.14em",
};

export const MOSAIC_REGISTRY_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  "radius.base": "lg",
  "radius.scale-preset": "soft",
  "shadow.preset": "none",
};

export const MOSAIC_DESIGN_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  ...MOSAIC_STYLE_TOKEN_DEFAULTS,
  ...MOSAIC_REGISTRY_TOKEN_DEFAULTS,
};

export function buildMosaicPayload(): DesignPayload {
  const id = seqIds("mosaic");
  const hero = tuneHeading(heroCover(id, { accent: true }), { fontWeight: 800, letterSpacing: "-0.04em" });
  return {
    tokenDefaults: { ...MOSAIC_STYLE_TOKEN_DEFAULTS },
    shellTree: shell(id, { navChrome: "side_rail", navLinks: [{ label: "Work", href: "#gallery" }, { label: "Services", href: "#services" }, { label: "About", href: "#about" }, { label: "Contact", href: "#contact" }] }),
    homeTree: [
      hero,
      servicesSection(id, {
        label: "Services",
        eyebrow: "Services",
        title: "Pick a {i}chapter{/i}",
        layout: "featured",
        categoryNav: "pills",
        stylePreset: "image_led",
        photoRadius: "soft",
        density: "comfortable",
        rowCtaVariant: "solid",
        showPhoto: true,
        columns: 2,
      }),
      portfolioBlock(id, { layout: "masonry", columns: 3, heading: "One {i}portfolio{/i}", showCaptions: true, tagFilter: true }),
      aboutBlock(id, { layout: "split", align: "start", accent: true }),
      contactSection(id, { heading: "Photos, site, or both.", faqHeading: "Good to know" }),
    ],
  };
}
