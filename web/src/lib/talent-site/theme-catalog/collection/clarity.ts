/**
 * Clarity (TH24): a calm, plain-language health / consultation site built
 * around "how it works". DRAFT design (not finished, no demos assigned).
 *
 * Read off the screenshot (assumptions are in the PR notes): cool white page,
 * deep teal accent, one sans family; a portrait beside the headline with
 * plain promises and a facts strip; a three-step request (pick, what happens,
 * confirm); what to bring and expect; the space photos beside a FAQ; an area
 * map card; a closing question. No trade is named and no price, hour or
 * promise is invented: those come from the talent's own data. Every font,
 * size, colour and shape is an editable token.
 */
import type { DesignPayload } from "../types";
import { aboutBlock, heroSplit, portfolioBlock } from "../section-kit";
import { areaBlock } from "../section-kit-proof";
import { taskPickerBlock } from "../section-kit-tasks";
import { contactSection, seqIds, servicesSection, shell, tuneHeading } from "./design-parts";

export const CLARITY_HEADING_FONT = "Instrument Sans, system-ui, sans-serif";
export const CLARITY_BODY_FONT = "Inter, system-ui, sans-serif";

/** Sampled from TH24: cool off-white page, slate ink, deep teal. */
export const CLARITY_PALETTE = {
  page: "#F3F7F7",
  surface: "#FFFFFF",
  line: "#DCE6E6",
  ink: "#1B2B2E",
  accent: "#0F6B6B",
  onAccent: "#FFFFFF",
  muted: "#5B6E71",
} as const;

export const CLARITY_STYLE_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  "button.radius": "10px",
  "button.height": "46px",
  "button.padding-x": "22px",
  "button.font-size": "14px",
  "button.font-weight": "600",
  "shape.rule-width": "1px",
  "type.display-weight": "500",
  "type.display-tracking": "-0.02em",
  "type.label-size": "11px",
  "type.label-weight": "600",
  "type.label-tracking": "0.1em",
};

export const CLARITY_REGISTRY_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  "radius.base": "md",
  "shadow.preset": "none",
};

export const CLARITY_DESIGN_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  ...CLARITY_STYLE_TOKEN_DEFAULTS,
  ...CLARITY_REGISTRY_TOKEN_DEFAULTS,
};

export function buildClarityPayload(): DesignPayload {
  const id = seqIds("clarity");
  const hero = tuneHeading(heroSplit(id, { ratio: "40-60", chips: false, accent: true, eyebrow: true, minHeight: "52vh" }), {
    fontWeight: 500,
    letterSpacing: "-0.02em",
  });
  return {
    tokenDefaults: { ...CLARITY_STYLE_TOKEN_DEFAULTS },
    shellTree: shell(id, { navChrome: "bottom_tab", navLinks: [{ label: "Services", href: "#services" }, { label: "Work", href: "#gallery" }, { label: "About", href: "#about" }, { label: "Contact", href: "#contact" }] }),
    homeTree: [
      hero,
      taskPickerBlock(id, { title: "Your request in three steps" }),
      servicesSection(id, {
        label: "Services",
        eyebrow: "Step 1",
        title: "What do you need?",
        layout: "rows",
        categoryNav: "none",
        stylePreset: "clean",
        photoRadius: "soft",
        density: "comfortable",
        rowCtaVariant: "solid",
        showPhoto: false,
        showDescription: true,
        showDelivery: true,
      }),
      portfolioBlock(id, { layout: "filmstrip", heading: "The space", showCaptions: true }),
      areaBlock(id, {}),
      aboutBlock(id, { layout: "stack", align: "start", accent: false }),
      contactSection(id, { heading: "Shall we start?", faqHeading: "Common questions" }),
    ],
  };
}
