/**
 * Maison v2: the Rosé proposal (Theme Review artifact, Experience + Builder
 * map tabs) composed from shared widgets only. Every row is an editable
 * builder node or variant; the look comes from the Rosé Look (gallery-meta)
 * plus this Design's token defaults (`MAISON_V2_TOKEN_DEFAULTS`: type roles,
 * buttons, shape, spacing), which the talent edits in the theme drawer. No hex
 * values here.
 *
 * Builder map rows, in order:
 *   header    site_header, section links, ES/EN, booking-mode CTA pill
 *   hero      split, eyebrow, italic-accent heading, lede, CTA + ghost,
 *             photo with inset and the stacked next-free chip
 *   ticker    marquee, `serif` variant with a star separator
 *   work      portfolio, `staggered` layout (filmstrip on phone), framed cards
 *   menu      services_catalog rows as raised cards (`rowStyle: "card"`) + sticky
 *             category rail / chips, 2 columns, 76px thumbs, mode chip, soft pill CTA
 *   reviews   reviews trio (hidden without real reviews)
 *   about     split portrait (arched crop in the skin) + copy
 *   visit     visit facts, 4-up tiles in the skin
 *   faq       accordion bound to talent_faq_items
 *   footer    rich footer (`footer_rich`): big line, intro, booking button, Where and
 *             Contact columns from her profile, light by default (`footer.tone`)
 *
 * Release 2.5 ("look only", v19): section rhythm (page and raised-surface bands,
 * 88px / 48px), header polish, ticker band, framed work cards, menu row cards,
 * FAQ and review cards, About actions, hero chip link and the text-safe accent.
 * Automatic items are token and variant defaults; the menu swap and the About
 * actions are opt-in layout items under their own keys. The matching CSS is the
 * soft chrome (`design-type-system-soft.ts`, switched on by `shape.chrome`).
 *
 * Release 2.7 (hero + footer): the hero headline, eyebrow, lede and proof line are
 * LIVE lines (`liveText`, see `live-text.ts`) that follow her profile at render time,
 * the menu gets its currency intro line, and the footer becomes the light rich footer
 * (`maison-v2-footer.ts`), an opt-in layout swap for sites on the 2.5 dark band.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { styleTokenRef } from "@/lib/site-admin/builder-node/style-token-bindings";
import type { DesignPayload } from "../types";
import {
  aboutBlock,
  aftercareBlock,
  beforeAfterBlock,
  faqBlock,
  heroSplit,
  locationBlock,
  portfolioBlock,
  reviewsBlock,
  visitBlock,
  type KitIdFactory,
} from "../section-kit";
import { seqIds, servicesSection, shell, tuneHeading } from "./design-parts";
import { maisonV2RichFooter } from "./maison-v2-footer";
import { MAISON_V2_TOKEN_DEFAULTS } from "./maison-v2-tokens";

export { MAISON_V2_TOKEN_DEFAULTS };

type Props = Record<string, unknown>;

function propsOf(node: BuilderNode): Props {
  return (node.props ?? {}) as Props;
}

function kidsOf(node: BuilderNode): BuilderNode[] {
  return "children" in node && Array.isArray(node.children) ? node.children : [];
}

function withProps(node: BuilderNode, patch: Props, kids?: BuilderNode[]): BuilderNode {
  return {
    ...node,
    props: { ...propsOf(node), ...patch },
    ...(kids ? { children: kids } : {}),
  } as BuilderNode;
}

function styleOf(node: BuilderNode): Props {
  return (propsOf(node).style as Props | undefined) ?? {};
}

/** A band that spans the page width with the proposal's 48px gutters. */
function fullBleed(node: BuilderNode, extra: Props = {}): BuilderNode {
  const style = styleOf(node);
  const responsive = (style.responsive as Record<string, Props> | undefined) ?? {};
  const extraResponsive = (extra.responsive as Record<string, Props> | undefined) ?? {};
  return withProps(node, {
    style: {
      ...style,
      maxWidth: "full",
      paddingX: "l",
      ...extra,
      responsive: {
        ...responsive,
        ...extraResponsive,
        // The proposal's 18px phone gutter.
        mobile: {
          ...(responsive.mobile ?? {}),
          paddingX: "s",
          paddingLeft: "18px",
          paddingRight: "18px",
          ...(extraResponsive.mobile ?? {}),
        },
      },
    },
  });
}

/**
 * The proposal's section rhythm (`.sec`, release 2.5): 88px above and below on
 * desktop, 48px on the phone, so a band reads as a band. Free padding, so the
 * builder still edits it.
 */
const SEC_PAD: Props = { paddingTop: "88px", paddingBottom: "88px" };
const SEC_PAD_MOBILE: Props = { paddingTop: "48px", paddingBottom: "48px" };

/**
 * A raised-surface band (release 2.5, G-2): hero, reviews, work, the optional
 * blocks, FAQ and visit sit on the page colour; the ticker, menu and About sit
 * on the raised surface, so the page alternates. A token ref, so the palette
 * (and the custom accent) recolours it.
 */
const SURFACE_BAND: Props = { backgroundColor: styleTokenRef("color.surface-raised") };

function withSecPad(style: Props): Props {
  const responsive = (style.responsive as Record<string, Props> | undefined) ?? {};
  return {
    ...style,
    ...SEC_PAD,
    responsive: { ...responsive, mobile: { ...(responsive.mobile ?? {}), ...SEC_PAD_MOBILE } },
  };
}

/** Drop the kit's vertical padding (the proposal's copy column has none). */
function unpadded(style: Props): Props {
  const { paddingY: _y, ...rest } = style;
  void _y;
  return { ...rest, paddingTop: "0px", paddingBottom: "0px" };
}

/** Drop the shared kit radius so the skin's proposal radii apply. */
function unrounded(style: Props): Props {
  const { radius: _radius, ...rest } = style;
  void _radius;
  return rest;
}

/**
 * Hero: 34px photo with the inset top-right (desktop), the stacked next-free
 * chip bottom-left, a booking-mode CTA plus a ghost "See work".
 */
function maisonV2Hero(makeId: KitIdFactory): BuilderNode {
  const hero = tuneHeading(
    heroSplit(makeId, {
      ratio: "50-50",
      chips: false,
      accent: true,
      eyebrow: true,
      minHeight: "64vh",
      inset: true,
      italicAccent: true,
      nextFreeChip: true,
      ctaRow: { primaryLabel: "Book an appointment", primaryHref: "#services", secondaryLabel: "See work" },
    }),
    {
      size: "display",
      letterSpacing: "-0.01em",
      fontWeight: 500,
      lineHeight: "0.93",
      marginTopFree: "6px",
      responsive: { mobile: { lineHeight: "0.98" } },
    },
  );
  const visit = (node: BuilderNode): BuilderNode => {
    const p = propsOf(node);
    const kids = kidsOf(node).map(visit);
    if (node.kind === "container" && p.layerLabel === "Hero actions") {
      // CTA + ghost side by side on the phone too (containers stack by default).
      // `.ctas`: 28px under the lede (18px on the phone), 10px apart.
      return withProps(
        node,
        {
          responsive: { mobile: { layout: "row" } },
          style: { ...styleOf(node), marginTopFree: "28px", gap: "10px", responsive: { mobile: { marginTopFree: "18px" } } },
        },
        kids.length ? kids : undefined,
      );
    }
    if (node.kind === "heading" && p.level === 1) {
      // Release 2.7 (HE-1): her value proposition, "Manos que {i}hablan{/i} por ti.": her own headline,
      // else seeded from her trade, else her name. Live, so a change in her profile shows up.
      return withProps(node, { text: "{{headline}}", liveText: "hero_headline" });
    }
    if (node.kind === "paragraph" && p.text === "{{primaryTypeLabel}}") {
      // Release 2.5 (HE-2): "Nail Artist · Mérida", the trade and the city. Live since 2.7.
      return withProps(node, {
        text: "{{heroEyebrow}}",
        liveText: "hero_eyebrow",
        layerLabel: "Hero eyebrow",
        style: { ...styleOf(node), lineHeight: "1.2" },
      });
    }
    if (node.kind === "paragraph" && p.text === "{{tagline}}") {
      // `.lede`: 22px under the heading (12px on the phone), 1.5 leading. Release 2.7: her tagline, live.
      return withProps(node, {
        liveText: "hero_tagline",
        layerLabel: "Hero lede",
        style: {
          ...styleOf(node),
          lineHeight: "1.5",
          marginTopFree: "22px",
          // `.lede`: 40ch on desktop, 34ch on the phone (HE-9); a px width made the text wrap differently.
          maxWidthFree: "40ch",
          responsive: { mobile: { marginTopFree: "12px", maxWidthFree: "34ch" } },
        },
      });
    }
    if (node.kind === "container" && kids.some((k) => propsOf(k).layerLabel === "Hero actions")) {
      // Proof line under the CTAs (`.proofline`, release 2.5): years of craft,
      // languages, rating and review count. Each part drops out when unknown.
      const proof: BuilderNode = {
        id: makeId(),
        kind: "paragraph",
        props: {
          text: "{{proofLine}}",
          // Release 2.7: live (years of craft, languages, rating, reviews), hidden when she has none.
          liveText: "hero_proof",
          layerLabel: "Hero proof",
          style: { size: "sm", tone: "muted", lineHeight: "1.5", marginTopFree: "16px" },
        },
      } as BuilderNode;
      // `.hero > div`: no padding, the children carry their own rhythm.
      return withProps(node, { style: { ...unpadded(styleOf(node)), gap: "0px" } }, [...kids, proof]);
    }
    if (node.kind === "button" && p.tone === "secondary") {
      return withProps(node, { label: "See work", href: "#gallery", layerLabel: "See work" }, kids.length ? kids : undefined);
    }
    if (node.kind === "next_free_chip") {
      return withProps(node, {
        variant: "stacked",
        // Release 2.5 (HE-6): the chip jumps to the menu.
        href: "#services",
        style: {
          ...styleOf(node),
          left: "22px",
          bottom: "22px",
          responsive: { mobile: { left: "12px", bottom: "12px" } },
        },
      });
    }
    if (node.kind === "image" && p.src === "{{headshotUrl}}") {
      const { aspectRatio: _a, ...rest } = unrounded(styleOf(node));
      void _a;
      return withProps(node, {
        layerLabel: "Hero photo",
        style: { ...rest, aspectRatioFree: "4 / 4.3", responsive: { mobile: { aspectRatioFree: "4 / 4.6" } } },
      });
    }
    if (node.kind === "image" && p.src === "{{gallery1}}") {
      const { bottom: _b, right: _r, maxWidthFree: _m, aspectRatio: _a, ...rest } = unrounded(styleOf(node));
      void _b;
      void _r;
      void _m;
      void _a;
      // Release 2.1: the inset sits bottom-left (above the next-free chip).
      // Its own slotKey makes it a new keyed node, so existing sites take the
      // move as an opt-in layout item rather than an automatic prop change.
      return withProps(node, {
        slotKey: "hero_inset_bl",
        layerLabel: "Hero inset",
        style: { ...rest, left: "-22px", bottom: "92px", width: "32%", aspectRatioFree: "3 / 4", borderWidth: "6px" },
      });
    }
    return kids.length ? withProps(node, {}, kids) : node;
  };
  // The proposal's 1.05fr / .95fr split with a 56px gutter; one column on the phone.
  return fullBleed(visit(hero), {
    paddingTop: "56px",
    paddingBottom: "20px",
    gridTemplateColumns: "1.05fr 0.95fr",
    gap: "56px",
    responsive: { mobile: { paddingX: "s", paddingTop: "22px", paddingBottom: "8px", gridTemplateColumns: "1fr", gap: "18px" } },
  });
}

/** Ticker: italic display words between hairlines, from the talent's own services. */
function maisonV2Ticker(makeId: KitIdFactory): BuilderNode {
  return {
    id: makeId(),
    kind: "marquee",
    props: {
      // Her service names, like the demos (F26). `service1` falls back to the
      // trade when she has no services, so the ticker never runs empty and
      // never repeats the trade next to her real services.
      items: [
        { text: "{{service1}}" },
        { text: "{{service2}}" },
        { text: "{{service3}}" },
      ],
      variant: "serif",
      separator: "star",
      speed: "medium",
      pauseOnHover: true,
      layerLabel: "Ticker",
      // `.tick` (release 2.5): a raised-surface band, 40px above (26px on the phone),
      // 16px of air inside its hairlines. The 38s loop is the soft chrome's.
      style: {
        ...SURFACE_BAND,
        marginTopFree: "40px",
        marginBottomFree: "0px",
        paddingTop: "16px",
        paddingBottom: "16px",
        responsive: { mobile: { marginTopFree: "26px" } },
      },
    },
  } as BuilderNode;
}

/**
 * Ticker + Recent work share the gallery band (a Design's top-level rows are
 * kit sections): the ticker runs edge to edge, the strip keeps the gutters.
 */
function maisonV2Work(makeId: KitIdFactory): BuilderNode {
  const ticker = maisonV2Ticker(makeId);
  const band = portfolioBlock(makeId, {
    layout: "staggered",
    eyebrow: "Recent work",
    heading: "Recent {i}work{/i}",
    showCaptions: true,
    limit: 6,
  });
  const kids = kidsOf(band).map((n) =>
    n.kind === "portfolio"
      ? withProps(n, {
          // Release 2.5 (WK-1..WK-4): raised frames with a name and an arrow, six on the phone strip.
          cardStyle: "framed",
          style: {
            ...styleOf(n),
            paddingX: "l",
            ...SEC_PAD,
            responsive: { mobile: { paddingX: "s", paddingLeft: "18px", paddingRight: "18px", ...SEC_PAD_MOBILE } },
          },
        })
      : n,
  );
  return withProps(
    band,
    { layerLabel: "Ticker and recent work", style: { ...styleOf(band), maxWidth: "full", paddingX: "none", paddingY: "none", gap: "0px" } },
    [ticker, ...kids],
  );
}

function maisonV2Menu(makeId: KitIdFactory): BuilderNode {
  const section = servicesSection(makeId, {
    label: "Menu",
    eyebrow: "The menu",
    title: "Services {i}and prices{/i}",
    layout: "rows",
    categoryNav: "rail",
    stylePreset: "image_led",
    photoRadius: "soft",
    density: "comfortable",
    rowCtaVariant: "outline",
    showPhoto: true,
    showDescription: false,
    columns: 2,
    // Release 2.7 (MN-11): the currency intro line, "Prices in MXN.", editable.
    subtitle: "{{menuSubtitle}}",
  });
  // The band carries the section rhythm: the catalog follows the website
  // theme, which paints its own ground and ignores node padding.
  return fullBleed(
    withProps(
      section,
      { style: { ...withSecPad(styleOf(section)), ...SURFACE_BAND } },
      kidsOf(section).map((n) =>
        n.kind === "services_catalog"
          ? withProps(n, {
              // Release 2.5 (opt-in layout): two columns of raised ROW cards (76px
              // thumb, soft pill button, whole-row click). Replaces the 2.3 photo-on-top
              // cards (`services_two_col`); the own slotKey makes the swap a layout item
              // the talent chooses, not an automatic prop change.
              slotKey: "services_row_cards",
              layout: "rows",
              rowStyle: "card",
              columns: 2,
              showModeChip: true,
              categoryShowAll: true,
              categoryShowCounts: true,
              showStats: false,
              showUsdEquivalent: false,
              pricePlacement: "meta",
              mobileBar: "pill",
              // `.pick`: 34px ink-outline pill; `.menu-wrap` spans the container.
              rowCtaVariant: "pill",
              contentWidth: "full",
              nameLineClamp: 3,
              style: { ...styleOf(n), maxWidth: "full" },
            })
          : n,
      ),
    ),
  );
}

/** About: eyebrow greeting, a display line, the bio; arched portrait in the skin. */
function maisonV2About(makeId: KitIdFactory): BuilderNode {
  const about = aboutBlock(makeId, {
    align: "start",
    accent: true,
    layout: "split",
    greeting: "The detail is {i}my craft{/i}.",
    showFacts: false,
  });
  const visit = (node: BuilderNode): BuilderNode => {
    const p = propsOf(node);
    const kids = kidsOf(node).map(visit);
    if (node.kind === "paragraph" && p.text === "About") {
      return withProps(node, {
        text: "Hello, I'm {{displayName}}",
        layerLabel: "About greeting",
        style: { ...styleOf(node), lineHeight: "1.2" },
      });
    }
    if (node.kind === "heading" && p.layerLabel === "About greeting") {
      // `.about h2`: 6px above, 14px below, 1.02 leading.
      return withProps(node, {
        layerLabel: "About heading",
        style: { ...styleOf(node), lineHeight: "1.02", marginTopFree: "6px", marginBottomFree: "14px" },
      });
    }
    if (node.kind === "paragraph" && p.text === "{{richBio}}") {
      return withProps(node, { style: { ...styleOf(node), lineHeight: "1.5", marginBottomFree: "10px" } });
    }
    if (node.kind === "container" && p.layerLabel === "About copy") {
      // The copy column has no gap; each line carries its own margin. Release 2.5
      // (AB-1): "See services" plus a text link that opens the chat.
      const actions: BuilderNode = {
        id: makeId(),
        kind: "container",
        props: {
          slotKey: "about_actions",
          layerLabel: "About actions",
          layout: "row",
          gap: "m",
          align: "center",
          responsive: { mobile: { layout: "row" } },
          style: { marginTopFree: "20px", gap: "16px", flexWrap: "wrap" },
        },
        children: [
          {
            id: makeId(),
            kind: "button",
            props: { label: "See services", href: "#services", tone: "primary", layerLabel: "About services action" },
          } as BuilderNode,
          {
            id: makeId(),
            kind: "button",
            props: { label: "Write me", href: "#talent-ask", tone: "secondary", layerLabel: "About chat action" },
          } as BuilderNode,
        ],
      } as BuilderNode;
      return withProps(node, { style: { ...styleOf(node), gap: "0px" } }, [...kids, actions]);
    }
    if (node.kind === "image") {
      const { aspectRatio: _a, ...rest } = unrounded(styleOf(node));
      void _a;
      return withProps(node, { style: { ...rest, aspectRatioFree: "4 / 4.4", objectPosition: "50% 25%" } });
    }
    return kids.length ? withProps(node, {}, kids) : node;
  };
  // `.about`: .8fr / 1fr, 64px gutter, centred; stacked on the phone. The kit's
  // own width / gutter (maxWidth wide, paddingX m) must not ride back in through
  // the extra style, or the split stays a 960px column with 24px sides.
  const { marginTop: _mt, maxWidth: _mw, paddingX: _px, paddingY: _py, ...aboutStyle } = styleOf(about);
  void _mt;
  void _mw;
  void _px;
  void _py;
  return fullBleed(visit(withProps(about, { style: aboutStyle })), {
    ...withSecPad({ responsive: aboutStyle.responsive }),
    ...SURFACE_BAND,
    gridTemplateColumns: "0.8fr 1fr",
    gap: "64px",
    responsive: { mobile: { paddingX: "s", ...SEC_PAD_MOBILE, gridTemplateColumns: "1fr", gap: "18px" } },
  });
}

function maisonV2Faq(makeId: KitIdFactory): BuilderNode {
  const faq = faqBlock(makeId, { heading: "What I get {i}asked{/i}", center: false, ask: false });
  const eyebrow: BuilderNode = {
    id: makeId(),
    kind: "paragraph",
    props: {
      text: "Questions",
      layerLabel: "FAQ eyebrow",
      style: {
        textTransform: "uppercase",
        letterSpacing: "0.18em",
        size: "sm",
        lineHeight: "1.2",
        // Release 2.3 (critical, accessibility): the small uppercase eyebrow
        // on the contact band read too faint in the accent colour.
        textColor: styleTokenRef("color.ink"),
      },
    },
  } as BuilderNode;
  // Closed by default (`<details>` in the proposal): visitors open what they need.
  const kids = kidsOf(faq).map((k) => {
    if (k.kind === "accordion") return withProps(k, { startClosed: true });
    if (k.kind === "heading") {
      // `.sec-h h2`: 4px under the eyebrow, 16px above the list, 34px / 58px.
      return withProps(k, {
        style: {
          ...styleOf(k),
          fontSize: "58px",
          lineHeight: "1.02",
          marginTopFree: "4px",
          marginBottomFree: "16px",
          responsive: { mobile: { fontSize: "34px" } },
        },
      });
    }
    return k;
  });
  const { marginBottom: _mb, ...faqStyle } = styleOf(faq);
  void _mb;
  return withProps(
    faq,
    {
      style: withSecPad({
        ...faqStyle,
        maxWidth: "full",
        paddingX: "l",
        gap: "0px",
        responsive: { mobile: { paddingX: "s", paddingLeft: "18px", paddingRight: "18px" } },
      }),
    },
    [eyebrow, ...kids],
  );
}

/** Header: brand line under the name, booking-mode CTA pill to the menu. */
function maisonV2Header(node: BuilderNode): BuilderNode {
  const props = propsOf(node);
  if (node.kind !== "section" || props.sectionTypeKey !== "site_header") return node;
  const sp = (props.sectionProps ?? {}) as Props;
  const brand = (sp.brand ?? {}) as Props;
  const regions = (sp.regions ?? {}) as Record<string, unknown>;
  const cta = { label: "Book an appointment", href: "#services" };
  // `.m-hdr` right side: (Demo pill, painted by the site), ES / EN, the CTA pill.
  // No saved / inquiry icons in the proposal.
  const right = [
    { type: "language", responsive: { mobile: "show" } },
    { type: "cta", ...cta, responsive: { mobile: "hide" } },
  ];
  return withProps(node, {
    sectionProps: {
      ...sp,
      brand: { ...brand, tagline: "{{primaryTypeLabel}}" },
      primaryCta: cta,
      tone: "surface",
      // Phone: wordmark + ES / EN only (the dock carries booking + chat), so
      // the section links hide there and no burger is drawn. Editable per item.
      regions: {
        ...regions,
        center: [
          ...(Array.isArray(regions.center) ? (regions.center as Props[]) : []).map((item) =>
            item.type === "nav" ? { ...item, responsive: { ...((item.responsive as Props) ?? {}), mobile: "hide" } } : item,
          ),
          // Release 2.6 (H-4): the phone section switcher replaces the hidden links.
          // It reads the same menu links, so there is one list to edit.
          { type: "section_switcher", responsive: { desktop: "hide", tablet: "hide", mobile: "show" } },
        ],
        right,
      },
    },
  });
}

/** Full-bleed band with the proposal's section rhythm. */
function padSection(node: BuilderNode): BuilderNode {
  return fullBleed(node, withSecPad(styleOf(node)));
}

/** Reviews: three quote cards (no stars, as proposed), initials + name. */
function maisonV2Reviews(makeId: KitIdFactory): BuilderNode {
  const band = reviewsBlock(makeId, {
    layout: "trio",
    heading: "What they {i}say{/i}",
    eyebrow: "Reviews",
    autoplayMs: 0,
  });
  return padSection(
    withProps(
      band,
      {},
      kidsOf(band).map((n) => (n.kind === "reviews" ? withProps(n, { showRating: false, showDots: false, showArrows: true, limit: 9 }) : n)),
    ),
  );
}

/**
 * The v20 "Before you come" visit band, kept only so the release fixtures can
 * rebuild v20 from code (release 21 swapped it for the Location band).
 */
export function legacyMaisonV2VisitBand(makeId: KitIdFactory): BuilderNode {
  return padSection(
    visitBlock(makeId, {
      layout: "facts",
      heading: "Before you come",
      titleAccent: "come",
      eyebrow: "Your visit",
      band: false,
    }),
  );
}

export function buildMaisonV2Payload(): DesignPayload {
  const id = seqIds("maison-v2");
  return {
    tokenDefaults: { ...MAISON_V2_TOKEN_DEFAULTS },
    shellTree: shell(id, {
      navLinks: [
        // Release 2.5 (H-3): the mockup's five links.
        { label: "Work", href: "#gallery" },
        { label: "Menu and prices", href: "#services" },
        { label: "Reviews", href: "#reviews" },
        { label: "About", href: "#about" },
        // Release 21: Location replaces the Your visit band, so the link follows it.
        { label: "Location", href: "#location" },
      ],
    })
      .map(maisonV2Header)
      .map((n) => maisonV2RichFooter(id, n)),
    // Release 2.8 (order, G-3): the proposal's order, Hero, Work, Menu, Reviews, About, FAQ,
    // Location (the footer is the shell's). Before and after and Aftercare tips are not in
    // the proposal: they stay available as optional blocks below, off the default page.
    homeTree: [
      maisonV2Hero(id),
      maisonV2Work(id),
      maisonV2Menu(id),
      maisonV2Reviews(id),
      maisonV2About(id),
      maisonV2Faq(id),
      // Release 21: Location (driven by the talent's address setting) REPLACES the
      // old "Before you come" visit band, as in the mockup: one place for zone,
      // hours and how to arrive. The visit kit block stays for other designs.
      padSection(locationBlock(id, { band: false })),
    ],
    optionalBlocks: [
      // Release 2.1 (optional block): two-image comparison.
      padSection(beforeAfterBlock(id)),
      // Release 2.4 (optional block): aftercare tips.
      padSection(aftercareBlock(id)),
    ],
  };
}
