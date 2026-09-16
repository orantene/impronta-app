import { buildLook } from "./shared";

/** Look `dark` — Polarity: dark canvas, one saturated accent. */
export const darkLook = buildLook({
  id: "dark",
  title: { es: "Oscuro", en: "Dark" },
  axis: { es: "Polaridad: lienzo oscuro, un acento saturado", en: "Polarity: dark canvas, one saturated accent" },
  themePatch: {
    "color.background": "#0f0f10",
    "color.ink": "#f2f2f0",
    "color.neutral": "#f2f2f0",
    "color.primary": "#e6533c",
    "color.secondary": "#b9b9b4",
    "color.accent": "#e6533c",
    "color.muted": "#9a9a95",
    "color.line": "#26262a",
    "color.surface-raised": "#18181b",
    "typography.heading-preset": "sans",
    "typography.body-preset": "refined-sans",
    "typography.scale-preset": "standard",
    "typography.tracking-preset": "tight",
    "radius.scale-preset": "soft",
    "shadow.preset": "ambient",
    "motion.preset": "refined",
    "density.section-padding": "standard",
    "background.mode": "editorial-noir",
    "shell.header-variant": "espresso-column",
    "shell.footer-variant": "espresso-column",
  },
  recipe: {
    hero: "split",
    heroBand: "surface",
    heroMinHeight: "78svh",
    offer: "split",
    proofBand: "surface",
    closing: "accent",
    gallery: "masonry",
    cardVariant: "elevated",
    imageRadius: "md",
    header: "left-nav",
    footer: "columns",
    headingStyle: {"fontWeight": 600, "letterSpacing": "-0.015em"},
    displayStyle: {"size": "display", "fontWeight": 700, "letterSpacing": "-0.03em", "textWrap": "balance"},
    sectionPadding: "xl",
  },
  copyOverrides: {

  },
});
