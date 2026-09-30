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
 *   work      portfolio, `staggered` layout (filmstrip on phone)
 *   menu      services_catalog rows + sticky category rail, 2 columns,
 *             64px thumbs, mode chip, booking-mode row CTA
 *   reviews   reviews trio (hidden without real reviews)
 *   about     split portrait (arched crop in the skin) + copy
 *   visit     visit facts, 4-up tiles in the skin
 *   faq       accordion bound to talent_faq_items
 *   footer    dark statement band
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { styleTokenRef } from "@/lib/site-admin/builder-node/style-token-bindings";
import type { DesignPayload } from "../types";
import {
  aboutBlock,
  beforeAfterBlock,
  faqBlock,
  heroSplit,
  portfolioBlock,
  reviewsBlock,
  visitBlock,
  type KitIdFactory,
} from "../section-kit";
import { seqIds, servicesSection, shell, tuneHeading } from "./design-parts";
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
 * The proposal's section rhythm (`.sec`): 84px above on desktop, 40px on the
 * phone, a short tail. Free padding, so the builder still edits it.
 */
const SEC_PAD: Props = { paddingTop: "84px", paddingBottom: "10px" };
const SEC_PAD_MOBILE: Props = { paddingTop: "40px", paddingBottom: "8px" };

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
      ctaRow: { primaryLabel: "See services", primaryHref: "#services", secondaryLabel: "See work" },
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
    if (node.kind === "paragraph" && p.text === "{{primaryTypeLabel}}") {
      return withProps(node, { layerLabel: "Hero eyebrow", style: { ...styleOf(node), lineHeight: "1.2" } });
    }
    if (node.kind === "paragraph" && p.text === "{{tagline}}") {
      // `.lede`: 22px under the heading (12px on the phone), 1.5 leading.
      return withProps(node, {
        layerLabel: "Hero lede",
        style: {
          ...styleOf(node),
          lineHeight: "1.5",
          marginTopFree: "22px",
          maxWidthFree: "462px",
          responsive: { mobile: { marginTopFree: "12px" } },
        },
      });
    }
    if (node.kind === "container" && kids.some((k) => propsOf(k).layerLabel === "Hero actions")) {
      // Proof line under the CTAs (`.proofline`): years of craft, the studio.
      const proof: BuilderNode = {
        id: makeId(),
        kind: "paragraph",
        props: {
          text: "{{locationLine}}",
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
      // `.tick`: 22px above, 4px below.
      style: { marginTopFree: "22px", marginBottomFree: "4px" },
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
  });
  // The band carries the section rhythm: the catalog follows the website
  // theme, which paints its own ground and ignores node padding.
  return fullBleed(
    withProps(
      section,
      { style: withSecPad(styleOf(section)) },
      kidsOf(section).map((n) =>
        n.kind === "services_catalog"
          ? withProps(n, {
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
      // The copy column has no gap; each line carries its own margin.
      return withProps(node, { style: { ...styleOf(node), gap: "0px" } }, kids);
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
        textColor: styleTokenRef("color.accent"),
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
        maxWidthFree: "856px",
        gap: "0px",
        responsive: { mobile: { paddingX: "s", paddingLeft: "18px", paddingRight: "18px" } },
      }),
    },
    [eyebrow, ...kids],
  );
}

/**
 * Footer: the proposal's dark band (ink ground, page-colour text) with the
 * big italic line and a "See services" pill. Token refs only.
 */
function maisonV2Footer(makeId: KitIdFactory, node: BuilderNode): BuilderNode {
  const props = propsOf(node);
  if (props.slotKey !== "footer" || node.kind !== "container") return node;
  return {
    ...node,
    props: {
      ...props,
      anchorId: "site-footer",
      align: "start",
      style: {
        ...((props.style as object) ?? {}),
        backgroundColor: styleTokenRef("color.ink"),
        textColor: styleTokenRef("color.background"),
        maxWidth: "full",
        paddingY: "xl",
        paddingX: "l",
        paddingTop: "70px",
        paddingBottom: "120px",
        // Children carry their own rhythm (`.foot` has no gap).
        gap: "0px",
        responsive: { mobile: { paddingX: "s", paddingLeft: "18px", paddingRight: "18px", paddingTop: "40px", paddingBottom: "130px" } },
      },
    },
    children: [
      {
        id: makeId(),
        kind: "heading",
        props: { text: "See you soon.", level: 2, layerLabel: "Footer line", style: { lineHeight: "1" } },
      } as BuilderNode,
      {
        id: makeId(),
        kind: "button",
        props: {
          label: "See services",
          href: "#services",
          tone: "primary",
          layerLabel: "Footer CTA",
          style: { marginTopFree: "18px" },
        },
      } as BuilderNode,
      // Fine print (`.fine`): social names left, "Hecho con Tulala" right.
      {
        id: makeId(),
        kind: "container",
        props: {
          layout: "row",
          gap: "s",
          align: "center",
          layerLabel: "Footer fine print",
          responsive: { mobile: { layout: "row" } },
          style: {
            width: "100%",
            maxWidth: "full",
            justifyContent: "space-between",
            flexWrap: "wrap",
            marginTopFree: "28px",
            gap: "10px",
          },
        },
        children: [
          // Her published links (Instagram, WhatsApp, ...) as names, from the
          // profile; the row hides itself when she has none.
          {
            id: makeId(),
            kind: "social_links",
            props: {
              links: [],
              display: "text",
              ariaLabel: "Social links",
              dataBinding: { sourceKey: "workspace_social_links" },
              layerLabel: "Footer links",
            },
          } as BuilderNode,
          {
            id: makeId(),
            kind: "paragraph",
            props: { text: "Hecho con Tulala", layerLabel: "Footer credit", style: { lineHeight: "1.5" } },
          } as BuilderNode,
        ],
      } as BuilderNode,
    ],
  } as unknown as BuilderNode;
}

/** Header: brand line under the name, booking-mode CTA pill to the menu. */
function maisonV2Header(node: BuilderNode): BuilderNode {
  const props = propsOf(node);
  if (node.kind !== "section" || props.sectionTypeKey !== "site_header") return node;
  const sp = (props.sectionProps ?? {}) as Props;
  const brand = (sp.brand ?? {}) as Props;
  const regions = (sp.regions ?? {}) as Record<string, unknown>;
  const cta = { label: "Menu and prices", href: "#services" };
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
        center: (Array.isArray(regions.center) ? (regions.center as Props[]) : []).map((item) =>
          item.type === "nav" ? { ...item, responsive: { ...((item.responsive as Props) ?? {}), mobile: "hide" } } : item,
        ),
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
      kidsOf(band).map((n) => (n.kind === "reviews" ? withProps(n, { showRating: false, showDots: false }) : n)),
    ),
  );
}

export function buildMaisonV2Payload(): DesignPayload {
  const id = seqIds("maison-v2");
  return {
    tokenDefaults: { ...MAISON_V2_TOKEN_DEFAULTS },
    shellTree: shell(id, {
      navLinks: [
        { label: "Work", href: "#gallery" },
        { label: "Menu and prices", href: "#services" },
        { label: "Reviews", href: "#reviews" },
        { label: "Your visit", href: "#visit" },
      ],
    })
      .map(maisonV2Header)
      .map((n) => maisonV2Footer(id, n)),
    homeTree: [
      maisonV2Hero(id),
      maisonV2Work(id),
      maisonV2Menu(id),
      maisonV2Reviews(id),
      // Release 2.1 (optional block): two-image comparison.
      padSection(beforeAfterBlock(id)),
      maisonV2About(id),
      padSection(
        visitBlock(id, {
          layout: "facts",
          heading: "Before you come",
          titleAccent: "come",
          eyebrow: "Your visit",
          band: false,
        }),
      ),
      maisonV2Faq(id),
    ],
  };
}
