/**
 * Prism (TH19): several disciplines, one offer matrix. DRAFT design (not
 * finished, no demos assigned).
 *
 * Read off the screenshot (assumptions are in the PR notes): white page,
 * ink display type with a green full stop, mono labels, one green accent; a
 * top "show" filter that dims what is outside a discipline, a bento hero with
 * figures, an offer matrix with a dot per discipline, project cards with
 * facts, the about with tools, a dark closing band. Every font, size, colour
 * and shape is an editable token.
 */
import type { DesignPayload } from "../types";
import { aboutBlock, heroCentered, portfolioBlock } from "../section-kit";
import { contactSection, seqIds, servicesSection, shell, tuneHeading } from "./design-parts";

export const PRISM_HEADING_FONT = "Inter, system-ui, sans-serif";
export const PRISM_BODY_FONT = "Inter, system-ui, sans-serif";
export const PRISM_LABEL_FONT = "IBM Plex Mono, ui-monospace, Menlo, monospace";

/** Sampled from TH19: white page, near-black ink, green. */
export const PRISM_PALETTE = {
  page: "#F6F6F4",
  surface: "#FFFFFF",
  line: "#E1E1DD",
  ink: "#0E1111",
  accent: "#0F7A54",
  onAccent: "#FFFFFF",
  muted: "#5E6460",
} as const;

export const PRISM_STYLE_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  "button.radius": "8px",
  "button.height": "40px",
  "button.padding-x": "16px",
  "button.font-size": "13px",
  "button.font-weight": "600",
  "shape.rule-width": "1px",
  "type.display-weight": "700",
  "type.display-tracking": "-0.04em",
  "type.label-size": "10px",
  "type.label-weight": "500",
  "type.label-tracking": "0.08em",
};

export const PRISM_REGISTRY_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  "radius.base": "md",
  "shadow.preset": "none",
  "shell.header-nav-font": PRISM_LABEL_FONT,
};

export const PRISM_DESIGN_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  ...PRISM_STYLE_TOKEN_DEFAULTS,
  ...PRISM_REGISTRY_TOKEN_DEFAULTS,
};

export function buildPrismPayload(): DesignPayload {
  const id = seqIds("prism");
  const hero = tuneHeading(heroCentered(id, { chips: true, accent: true }), { fontWeight: 700, letterSpacing: "-0.04em" });
  return {
    tokenDefaults: { ...PRISM_STYLE_TOKEN_DEFAULTS },
    shellTree: shell(id, { navChrome: "filter_bar", navLinks: [{ label: "Offers", href: "#services" }, { label: "Work", href: "#gallery" }, { label: "About", href: "#about" }] }),
    homeTree: [
      hero,
      servicesSection(id, {
        label: "Offers",
        eyebrow: "Offers",
        title: "Pick a discipline, see what fits.",
        layout: "matrix",
        categoryNav: "pills",
        stylePreset: "compact",
        photoRadius: "square",
        density: "compact",
        rowCtaVariant: "outline",
        showPhoto: false,
        showDescription: false,
        showDelivery: true,
        maxWidth: "full",
        contentWidth: "full",
      }),
      portfolioBlock(id, { layout: "grid", columns: 3, heading: "One portfolio, all disciplines.", showCaptions: true, tagFilter: true }),
      aboutBlock(id, { layout: "split", align: "start", accent: false }),
      contactSection(id, { heading: "Have a project in mind?", faqHeading: "Before we start" }),
    ],
  };
}
