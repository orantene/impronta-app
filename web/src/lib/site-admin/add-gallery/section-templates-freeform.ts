/**
 * Freeform Noir & Or section-template builders, split out of the
 * `section-templates.ts` god file to keep it under the 800-line lint cap.
 *
 * These two are the large, fully-freeform editorial templates (a per-slide hero
 * carousel and the "Story House" origin-story split). They are keyed into
 * `SECTION_TEMPLATE_BUILDERS` in `section-templates.ts` and dispatched
 * generically by `buildAddGallerySectionTemplate(templateId)`. On drop each
 * explodes into individually editable nodes on the shared Page Builder Core.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { makeId } from "@/lib/site-admin/builder-node/create";
import {
  tplButton,
  tplContainer,
  tplCtaGroup,
  tplLabeledParagraph,
  tplSection,
  tplSplitColumn,
  tplTitle,
} from "./section-template-nodes";

export function buildHeroSlider(): BuilderNode {
  // Slide 1 — two-column layout: eyebrow + heading + copy + CTAs over a photo
  // (right column intentionally open so the background shows through).
  const slide1 = tplContainer(
    [
      tplSplitColumn(
        [
          tplLabeledParagraph("Talent Agency · Tulum, Mexico", "Eyebrow", {
            size: "sm",
            align: "left",
            textColor: "var(--token-color-primary)",
            textTransform: "uppercase",
            letterSpacing: "0.24em",
          }),
          tplTitle("Faces with an imprint.", 1, {
            align: "left",
            textColor: "#ffffff",
            fontFamily: "Cormorant Garamond, ui-serif, Georgia, serif",
            fontSize: "clamp(2.6rem, 7vw, 6rem)",
            lineHeight: "1",
          }),
          tplLabeledParagraph(
            "A boutique roster of models and creative talent, managed end to end.",
            "Sub",
            { align: "left", textColor: "#e8e4dc" },
          ),
          tplCtaGroup(
            [
              tplButton("Explore the roster", "/roster", { tone: "primary" }),
              tplButton("Start an inquiry", "/contact", { tone: "secondary" }),
            ],
            { align: "start", layerLabel: "Slide 1 Buttons" },
          ),
        ],
        [],
        { ratio: "60-40", layerLabel: "Slide 1 Columns" },
      ),
    ],
    {
      layerLabel: "Slide 1 — Columns over photo",
      layout: "stack",
      align: "stretch",
      style: {
        backgroundImage: "url('/talent-templates/demo/model/01-hero.jpg')",
        backgroundPosition: "center 28%",
        justifyContent: "flex-end",
        paddingLeft: "7vw",
        paddingRight: "7vw",
        paddingTop: "14vh",
        paddingBottom: "12vh",
      },
    },
  );

  // Slide 2 — a STRUCTURALLY different layout: a single centered column.
  const slide2 = tplContainer(
    [
      tplContainer(
        [
          tplLabeledParagraph("New Faces · 2026", "Badge", {
            size: "sm",
            align: "center",
            textColor: "var(--token-color-primary)",
            textTransform: "uppercase",
            letterSpacing: "0.24em",
          }),
          tplTitle("The new class.", 1, {
            align: "center",
            textColor: "#ffffff",
            fontFamily: "Cormorant Garamond, ui-serif, Georgia, serif",
            fontSize: "clamp(2.6rem, 7vw, 6rem)",
            lineHeight: "1",
          }),
          tplCtaGroup([tplButton("Meet them", "/roster", { tone: "primary" })], {
            align: "center",
            layerLabel: "Slide 2 Button",
          }),
        ],
        {
          layerLabel: "Slide 2 Content",
          layout: "stack",
          align: "center",
          gap: "m",
        },
      ),
    ],
    {
      layerLabel: "Slide 2 — Centered",
      layout: "stack",
      align: "center",
      style: {
        backgroundImage: "url('/talent-templates/demo/model/05-editorial.jpg')",
        backgroundPosition: "center 22%",
        justifyContent: "center",
        paddingLeft: "7vw",
        paddingRight: "7vw",
        paddingTop: "14vh",
        paddingBottom: "14vh",
      },
    },
  );

  // Slide 3 — image-only (no text). The eager <img> IS the background layer.
  const slide3: BuilderNode = {
    id: makeId("image"),
    kind: "image",
    props: {
      src: "/talent-templates/demo/model/09-editorial.jpg",
      alt: "Editorial campaign portrait of a model",
      priority: true,
      layerLabel: "Slide 3 — Image only",
    },
  };

  return {
    id: makeId("carousel"),
    kind: "carousel",
    props: {
      variant: "hero",
      layerLabel: "Hero Slider",
      heightMode: "viewport",
      minHeightPx: 620,
      overlay: { scrim: true, tone: "dark", vignette: true, opacity: 0.6 },
      grain: true,
      transition: "crossfade",
      transitionMs: 1600,
      kenBurns: true,
      kenBurnsAmount: 0.1,
      autoplayMs: 5200,
      loop: true,
      pauseOnHover: true,
      controls: {
        dots: true,
        arrows: false,
        progress: false,
        counter: true,
        scrollCue: true,
      },
      contentAlign: "bl",
      contentMode: "per-slide",
    },
    children: [slide1, slide2, slide3],
  };
}

// Story House — "The house" editorial origin story (Noir & Or). A freeform
// `split` (image-left 60-40): child[0] = MEDIA (a ghost card gold-inset frame
// wrapping a 4:5 portrait, brightness 0.92), child[1] = COPY (gold eyebrow with
// a 30px hairline, Cormorant display heading, muted ≤50ch paragraph, italic gold
// pull-quote with a 2px left border, signature block). Single-side borders + the
// inset frame + the eyebrow hairline live in per-node `customCss` (the only safe
// home — borderWidth is uniform). Colors/fonts bind to token sentinels with the
// literal palette as the default. EN/ES seeded per text node via the i18n overlay.
export function buildStoryHouse(): BuilderNode {
  const DISPLAY_FONT =
    "var(--token-typography-heading-font-family, 'Cormorant Garamond', Georgia, serif)";
  const GOLD = "var(--token-color-primary, #c6a14e)";
  const CHAMPAGNE = "var(--token-color-accent, #e0c074)";
  const INK = "var(--token-color-ink, #ece4d3)";

  // ── Media column: ghost card = the gold inset frame; image inside ──────────
  const frameId = makeId("card");
  const storyImage: BuilderNode = {
    id: makeId("image"),
    kind: "image",
    props: {
      src: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1200&q=80",
      alt: "Founder of the agency in the studio",
      priority: false,
      layerLabel: "Story Image",
      style: {
        aspectRatioFree: "4 / 5",
        objectFit: "cover",
        filter: "brightness(0.92)",
        width: "100%",
      },
    },
    i18n: { es: { alt: "Fundadora de la agencia en el estudio" } },
  };
  const mediaFrame: BuilderNode = {
    id: frameId,
    kind: "card",
    props: {
      variant: "ghost",
      layerLabel: "Image Frame",
      style: {
        paddingTop: "14px",
        paddingRight: "14px",
        paddingBottom: "14px",
        paddingLeft: "14px",
        borderColor: "rgba(224,192,116,0.45)",
        overflow: "hidden",
        customCss:
          `{ position: relative; border: 1px solid rgba(224,192,116,0.45); }`,
      },
    },
    children: [storyImage],
  };
  const mediaColumn = tplContainer([mediaFrame], {
    layerLabel: "Media Column",
    layout: "stack",
    gap: "m",
    align: "stretch",
    style: { justifyContent: "center" },
  });

  // ── Copy column ───────────────────────────────────────────────────────────
  const eyebrowId = makeId("paragraph");
  const eyebrow: BuilderNode = {
    id: eyebrowId,
    kind: "paragraph",
    props: {
      text: "The house",
      layerLabel: "Eyebrow",
      style: {
        textColor: GOLD,
        textTransform: "uppercase",
        letterSpacing: "0.28em",
        fontSize: "12px",
        // 30px gold hairline before the eyebrow text.
        customCss:
          `{ display: flex; align-items: center; gap: 14px; }\n[data-builder-node-id="${eyebrowId}"]::before { content: ""; display: inline-block; width: 30px; height: 1px; background: ${GOLD}; }`,
      },
    },
    i18n: { es: { text: "La casa" } },
  };

  const title: BuilderNode = {
    id: makeId("heading"),
    kind: "heading",
    props: {
      text: "Built on instinct and a long memory.",
      level: 2,
      layerLabel: "Title",
      style: {
        align: "left",
        fontFamily: DISPLAY_FONT,
        fontSize: "clamp(2.2rem,4.4vw,3.4rem)",
        lineHeight: "1.05",
        textWrap: "balance",
        textColor: INK,
      },
    },
    i18n: { es: { text: "Construida sobre el instinto y la memoria." } },
  };

  const description: BuilderNode = {
    id: makeId("paragraph"),
    kind: "paragraph",
    props: {
      text: "We started Impronta to represent faces the industry overlooks and to give the ones it already loves a quieter, sharper place to work. Every booking is hand-matched, every contract read twice.",
      layerLabel: "Description",
      style: {
        align: "left",
        tone: "muted",
        maxWidthFree: "50ch",
        lineHeight: "1.7",
      },
    },
    i18n: {
      es: {
        text: "Creamos Impronta para representar rostros que la industria pasa por alto y dar a los que ya ama un lugar más tranquilo y preciso para trabajar. Cada booking se empareja a mano, cada contrato se lee dos veces.",
      },
    },
  };

  const pullQuoteId = makeId("paragraph");
  const pullQuote: BuilderNode = {
    id: pullQuoteId,
    kind: "paragraph",
    props: {
      text: "A face leaves an imprint. Our job is to make sure the right people remember it.",
      layerLabel: "Pull Quote",
      style: {
        align: "left",
        fontStyle: "italic",
        fontFamily: DISPLAY_FONT,
        fontSize: "clamp(1.4rem,2.4vw,1.9rem)",
        textColor: CHAMPAGNE,
        paddingLeft: "20px",
        lineHeight: "1.4",
        // 2px gold left border (single-side → customCss).
        customCss: `{ border-left: 2px solid ${GOLD}; }`,
      },
    },
    i18n: {
      es: {
        text: "Un rostro deja una huella. Nuestro trabajo es que las personas correctas la recuerden.",
      },
    },
  };

  const signatureName: BuilderNode = {
    id: makeId("paragraph"),
    kind: "paragraph",
    props: {
      text: "Impronta",
      layerLabel: "Signature Name",
      style: {
        align: "left",
        fontFamily: DISPLAY_FONT,
        fontSize: "1.5rem",
        textColor: CHAMPAGNE,
      },
    },
    i18n: { es: { text: "Impronta" } },
  };
  const signatureRole: BuilderNode = {
    id: makeId("paragraph"),
    kind: "paragraph",
    props: {
      text: "Founders, Tulum",
      layerLabel: "Signature Role",
      style: {
        align: "left",
        tone: "muted",
        textTransform: "uppercase",
        letterSpacing: "0.2em",
        fontSize: "11px",
      },
    },
    i18n: { es: { text: "Fundadores, Tulum" } },
  };
  const signature = tplContainer([signatureName, signatureRole], {
    layerLabel: "Signature",
    layout: "stack",
    gap: "s",
    align: "start",
  });

  const copyColumn = tplContainer(
    [eyebrow, title, description, pullQuote, signature],
    {
      layerLabel: "Content Column",
      layout: "stack",
      gap: "m",
      align: "start",
      style: { justifyContent: "center" },
    },
  );

  const split: BuilderNode = {
    id: makeId("split"),
    kind: "split",
    props: {
      ratio: "60-40",
      gap: "l",
      collapseOnMobile: true,
      layerLabel: "Split Layout",
      style: { alignItems: "center" },
    },
    // child[0] = media (image-left), child[1] = copy — built explicitly.
    children: [mediaColumn, copyColumn],
  };

  return tplSection("Story House Section", [
    tplContainer([split], {
      layerLabel: "Container",
      layout: "stack",
      style: {
        maxWidthFree: "1280px",
        marginLeftFree: "auto",
        marginRightFree: "auto",
        paddingTop: "9vh",
        paddingBottom: "9vh",
        paddingLeft: "7vw",
        paddingRight: "7vw",
        containerType: "inline-size",
      },
    }),
  ]);
}
