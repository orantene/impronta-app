/**
 * Builder-node composition preset — Noir & Or "Leave your imprint." CTA banner.
 *
 * Full-bleed pre-footer conversion banner. Returns a freeform `BuilderNode`
 * tree (never a fixed-prop block): on drop it explodes into individually
 * editable nodes on the shared Page Builder Core render path.
 *
 * Layering (matches `impronta.css` `.cta*`):
 *   - absolute cover `image` (objectPosition "center 35%", brightness 0.7,
 *     zIndex -1, priority:true — this is the likely LCP),
 *   - dark top-down scrim `container` (gradient backgroundImage, pointerEvents
 *     none),
 *   - centered content `container` (relative, zIndex 2, white text; inset
 *     champagne hairline frame via customCss ::before — clamp inset exceeds the
 *     16-char escape caps so it lives in customCss).
 *
 * Section vertical padding uses `16vh`/customCss instead of the spec's
 * `clamp(94px,14vw,200px)` (24 chars) because paddingTop/Bottom escapes cap at
 * 16 chars. The display line is a flexWrap row of two headings ("Leave your" +
 * italic-champagne "imprint.") so each word is editable. Colors/fonts bind to
 * token sentinels with the literal Noir & Or palette as the default. EN/ES
 * seeded per text node via the node-level i18n overlay.
 *
 * Registered + dispatched from `composition-presets.ts`.
 */
import type { BuilderNode } from "./types";
import { makeId, createImage } from "./create";

const DISPLAY_FONT =
  "var(--token-typography-heading-font-family, 'Cormorant Garamond', Georgia, serif)";
const CHAMPAGNE = "var(--token-color-secondary, #e0c074)";
const GOLD = "var(--token-color-primary, #c6a14e)";
const ESPRESSO = "var(--token-color-background, #100e13)";

export function createCtaBannerSpotlightPreset(): Exclude<
  BuilderNode,
  { kind: "section" }
> {
  // Background cover image — absolute, behind everything, eager (LCP).
  const image = createImage(3, {
    position: "absolute",
    top: "0",
    right: "0",
    bottom: "0",
    left: "0",
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center 35%",
    // zIndex 0 (NOT -1): the section has an opaque espresso background, so a
    // z-index:-1 image is painted BEHIND it and fully hidden. 0 puts the cover
    // above the section bg, below the scrim (z1) + content (z2).
    // band-dark.jpg is a dark runway frame — lift it so the scene reads, but
    // keep it moody/premium (not washed out).
    filter: "brightness(1.16) saturate(1.1) contrast(1.03)",
    zIndex: 0,
  });
  const ctaImg = image as Extract<BuilderNode, { kind: "image" }>;
  ctaImg.props.src = "/talent-templates/demo/impronta-2026/band-dark.jpg";
  ctaImg.props.priority = true;
  ctaImg.props.alt = "Impronta talent on the runway";
  image.i18n = { es: { alt: "Talento de Impronta en pasarela" } };

  // Top-down dark scrim — pure CSS gradient (no extra request), non-interactive.
  const scrim: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      style: {
        position: "absolute",
        top: "0",
        right: "0",
        bottom: "0",
        left: "0",
        backgroundImage:
          "linear-gradient(180deg, rgba(8,7,10,0.46), rgba(8,7,10,0.66))",
        pointerEvents: "none",
        zIndex: 1,
      },
    },
    children: [],
  };

  // Eyebrow.
  const eyebrow: BuilderNode = {
    id: makeId("paragraph"),
    kind: "paragraph",
    props: {
      text: "Work with Impronta",
      style: {
        textColor: CHAMPAGNE,
        textTransform: "uppercase",
        letterSpacing: "0.24em",
        fontSize: "11px",
        align: "center",
        revealOnView: "fade-up",
      },
    },
    i18n: { es: { text: "Trabaja con Impronta" } },
  };

  // Display line — flexWrap row of two editable headings.
  const wordOne: BuilderNode = {
    id: makeId("heading"),
    kind: "heading",
    props: {
      text: "Leave your",
      level: 2,
      style: {
        fontFamily: DISPLAY_FONT,
        fontWeight: 600,
        fontSize: "clamp(2.8rem,6.4vw,5.8rem)",
        lineHeight: "1",
        textColor: "#ffffff",
      },
    },
    i18n: { es: { text: "Deja tu" } },
  };
  const wordTwo: BuilderNode = {
    id: makeId("heading"),
    kind: "heading",
    props: {
      text: "imprint.",
      level: 2,
      style: {
        fontFamily: DISPLAY_FONT,
        fontWeight: 600,
        fontStyle: "italic",
        fontSize: "clamp(2.8rem,6.4vw,5.8rem)",
        lineHeight: "1",
        textColor: CHAMPAGNE,
      },
    },
    i18n: { es: { text: "huella." } },
  };
  const displayLine: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "row",
      style: {
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "baseline",
        gap: "0.4ch",
        marginTopFree: "22px",
        marginBottomFree: "14px",
        revealOnView: "fade-up",
        revealDelay: "0.08s",
      },
    },
    children: [wordOne, wordTwo],
  };

  // Supporting copy.
  const copy: BuilderNode = {
    id: makeId("paragraph"),
    kind: "paragraph",
    props: {
      text: "From editorial to runway, we cast faces that leave a mark. Tell us about your project and we will line up the right talent.",
      style: {
        textColor: "rgba(255,255,255,0.84)",
        maxWidthFree: "46ch",
        marginLeftFree: "auto",
        marginRightFree: "auto",
        marginBottomFree: "38px",
        align: "center",
        lineHeight: "1.6",
        revealOnView: "fade-up",
        revealDelay: "0.16s",
      },
    },
    i18n: {
      es: {
        text: "De la editorial a la pasarela, casteamos rostros que dejan huella. Cuéntanos sobre tu proyecto y reuniremos al talento ideal.",
      },
    },
  };

  // Primary CTA — gold filled, funnels into the directory inquiry surface.
  const ctaPrimary: BuilderNode = {
    id: makeId("button"),
    kind: "button",
    props: {
      label: "Cast Impronta",
      href: "/directory",
      tone: "primary",
      style: {
        backgroundImage: `linear-gradient(135deg, ${GOLD}, ${CHAMPAGNE})`,
        textColor: ESPRESSO,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        fontSize: "12px",
        paddingTop: "16px",
        paddingBottom: "16px",
        paddingLeft: "30px",
        paddingRight: "30px",
        hover: { translate: "0 -3px" },
        transition: "transform .35s ease",
      },
    },
    i18n: { es: { label: "Castea Impronta" } },
  };

  // Secondary CTA — outline, fills on hover, → tenant talent registration.
  const ctaSecondary: BuilderNode = {
    id: makeId("button"),
    kind: "button",
    props: {
      label: "Get scouted",
      href: "/join",
      tone: "secondary",
      style: {
        backgroundColor: "transparent",
        textColor: "#ffffff",
        borderColor: "rgba(255,255,255,0.55)",
        borderWidth: "1px",
        borderStyle: "solid",
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        fontSize: "12px",
        paddingTop: "16px",
        paddingBottom: "16px",
        paddingLeft: "30px",
        paddingRight: "30px",
        hover: { backgroundColor: "#ffffff", color: ESPRESSO },
        transition: "background-color .35s ease, color .35s ease",
      },
    },
    i18n: { es: { label: "Ser descubierto" } },
  };

  const ctaGroup: BuilderNode = {
    id: makeId("cta_group"),
    kind: "cta_group",
    props: {
      layout: "row",
      gap: "m",
      align: "center",
      style: {
        flexWrap: "wrap",
        justifyContent: "center",
        revealOnView: "fade-up",
        revealDelay: "0.24s",
      },
    },
    children: [ctaPrimary, ctaSecondary],
  };

  // Centered content layer — relative, above the scrim; inset champagne hairline
  // frame via customCss (the clamp inset exceeds the inset escape caps).
  const contentId = makeId("container");
  const contentCss = `{ position: relative; }
[data-builder-node-id="${contentId}"]::before { content: ""; position: absolute; inset: clamp(18px,3vw,40px); border: 1px solid rgba(224,192,116,0.4); pointer-events: none; }`;
  const content: BuilderNode = {
    id: contentId,
    kind: "container",
    props: {
      layout: "stack",
      style: {
        position: "relative",
        zIndex: 2,
        maxWidthFree: "1440px",
        marginLeftFree: "auto",
        marginRightFree: "auto",
        alignItems: "center",
        textColor: "#ffffff",
        customCss: contentCss,
      },
    },
    children: [eyebrow, displayLine, copy, ctaGroup],
  };

  return {
    id: makeId("container"),
    kind: "container",
    props: {
      htmlTag: "section",
      layout: "stack",
      style: {
        position: "relative",
        overflow: "hidden",
        backgroundColor: ESPRESSO,
        paddingTop: "16vh",
        paddingBottom: "16vh",
        paddingLeft: "24px",
        paddingRight: "24px",
        containerType: "inline-size",
      },
    },
    children: [image, scrim, content],
  };
}
