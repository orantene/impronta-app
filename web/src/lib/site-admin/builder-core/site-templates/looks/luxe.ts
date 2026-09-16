import { buildLook } from "./shared";

/**
 * Look `luxe` — Looks v2 flagship for beauty (D-TPL-36): porcelain canvas
 * with a rose primary (reads on the dark hero scrim) and a plum accent, editorial serif at display
 * size, full-viewport Ken Burns hero over the tenant's own pictures, marquee,
 * a plum statement band, sticky story with the picture on the right, lifting
 * cards, gallery rail, blur-in reveals. Pillowy radii, ambient shadows.
 */
export const luxeLook = buildLook({
  id: "luxe",
  title: { es: "Luxe", en: "Luxe" },
  axis: { es: "Porcelana y ciruela: editorial, luminoso, con movimiento", en: "Porcelain and plum: editorial, luminous, in motion" },
  themePatch: {
    "color.background": "#f7f5f2",
    "color.ink": "#1c1418",
    "color.neutral": "#1c1418",
    "color.primary": "#c9376b",
    "color.secondary": "#8a6a7e",
    "color.accent": "#5b2350",
    "color.muted": "#6f6169",
    "color.line": "#e6dfe2",
    "color.surface-raised": "#ffffff",
    "typography.heading-preset": "editorial-serif",
    "typography.body-preset": "refined-sans",
    "typography.scale-preset": "editorial",
    "radius.scale-preset": "pillowy",
    "shadow.preset": "ambient",
    "motion.preset": "editorial",
    "density.section-padding": "airy",
    "background.mode": "mesh-blush",
    "shell.header-variant": "editorial-sticky",
    "shell.footer-variant": "serif-editorial",
  },
  recipe: {
    hero: "cinematic",
    heroBand: "none",
    heroMinHeight: "100svh",
    offer: "cards",
    proofBand: "surface",
    closing: "contrast",
    gallery: "rail",
    cardVariant: "elevated",
    imageRadius: "lg",
    header: "centered",
    footer: "columns",
    headingStyle: { fontWeight: 500, letterSpacing: "-0.01em" },
    displayStyle: { size: "display", fontWeight: 400, letterSpacing: "-0.02em", textWrap: "balance" },
    eyebrowStyle: { letterSpacing: "0.24em", textTransform: "uppercase" },
    sectionPadding: "xl",
    motion: "blur-in",
    marquee: true,
    statement: true,
    story: "sticky",
    lift: true,
  },
  copyOverrides: {
    "home.statement": { es: "Tiempo para ti, hecho con cuidado.", en: "Time for you, made with care." },
    "home.closing.headline": { es: "Reserva tu momento", en: "Book your moment" },
    "home.closing.body": { es: "Escríbenos y elegimos juntos el día y la hora.", en: "Write to us and we will pick the day and the time together." },
  },
});
