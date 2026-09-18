import { buildLook } from "./shared";

/**
 * Look `tide` — Looks v2 flagship for wellness (D-TPL-36): deep sea-green
 * canvas, sand accent, airy serif at display size, full-viewport Ken Burns
 * hero, marquee, a pale statement band, sticky story, gallery rail, slow
 * fade-in reveals. Soft radii, no hard shadows.
 */
export const tideLook = buildLook({
  id: "tide",
  title: { es: "Marea", en: "Tide" },
  axis: { es: "Verde profundo y arena: calma, aire, movimiento lento", en: "Deep green and sand: calm, air, slow motion" },
  themePatch: {
    "color.background": "#0f2622",
    "color.ink": "#eef3ee",
    "color.neutral": "#eef3ee",
    "color.primary": "#d9b98a",
    "color.secondary": "#8fb3a3",
    "color.accent": "#f1d9a7",
    "color.muted": "#a7bcb2",
    "color.line": "#1f3a34",
    "color.surface-raised": "#163530",
    "typography.heading-preset": "editorial-serif",
    "typography.body-preset": "sans",
    "typography.scale-preset": "editorial",
    "radius.scale-preset": "pillowy",
    "shadow.preset": "none",
    "motion.preset": "editorial",
    "density.section-padding": "airy",
    "background.mode": "mesh-sage",
    "shell.header-variant": "editorial-sticky",
    "shell.footer-variant": "serif-editorial",
  },
  recipe: {
    hero: "cinematic",
    heroBand: "none",
    heroMinHeight: "100svh",
    offer: "cards",
    proofBand: "surface",
    closing: "accent",
    gallery: "rail",
    cardVariant: "ghost",
    imageRadius: "lg",
    header: "split",
    footer: "line",
    headingStyle: { fontWeight: 400, letterSpacing: "0" },
    displayStyle: { size: "display", fontWeight: 400, letterSpacing: "-0.015em", textWrap: "balance" },
    eyebrowStyle: { letterSpacing: "0.26em", textTransform: "uppercase" },
    sectionPadding: "xl",
    motion: "fade-in",
    marquee: true,
    statement: true,
    story: "sticky",
    lift: true,
  },
  copyOverrides: {
    "home.statement": { es: "Respira. Aquí el tiempo va más despacio.", en: "Breathe. Time moves slower here." },
    "home.closing.headline": { es: "Empieza por un mensaje", en: "Start with a message" },
    "home.closing.body": { es: "Cuéntanos qué necesitas y te decimos por dónde empezar.", en: "Tell us what you need and we will say where to begin." },
  },
});
