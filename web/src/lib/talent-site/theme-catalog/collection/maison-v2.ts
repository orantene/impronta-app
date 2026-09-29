/**
 * Maison v2: the Rosé proposal (Theme Review artifact, Experience + Builder
 * map tabs) composed from shared widgets only. Every row is an editable
 * builder node or variant; the look comes from the Rosé Look (gallery-meta)
 * plus the design skin (`design-skins.ts`), never from hex values here.
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
  faqBlock,
  heroSplit,
  portfolioBlock,
  reviewsBlock,
  visitBlock,
  type KitIdFactory,
} from "../section-kit";
import { seqIds, servicesSection, shell, tuneHeading } from "./design-parts";

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
  return withProps(node, {
    style: {
      ...style,
      maxWidth: "full",
      paddingX: "l",
      ...extra,
      responsive: { ...responsive, mobile: { ...(responsive.mobile ?? {}), paddingX: "s" } },
    },
  });
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
      ctaRow: { primaryLabel: "Reserve a time", primaryHref: "#services", secondaryLabel: "See work" },
    }),
    { size: "display", letterSpacing: "-0.02em", fontWeight: 450 },
  );
  const visit = (node: BuilderNode): BuilderNode => {
    const p = propsOf(node);
    const kids = kidsOf(node).map(visit);
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
      return withProps(node, { layerLabel: "Hero photo", style: { ...rest, aspectRatioFree: "4 / 4.3" } });
    }
    if (node.kind === "image" && p.src === "{{gallery1}}") {
      const { bottom: _b, maxWidthFree: _m, aspectRatio: _a, ...rest } = unrounded(styleOf(node));
      void _b;
      void _m;
      void _a;
      return withProps(node, {
        layerLabel: "Hero inset",
        style: { ...rest, right: "-26px", top: "38px", width: "34%", aspectRatioFree: "3 / 4", borderWidth: "6px" },
      });
    }
    return kids.length ? withProps(node, {}, kids) : node;
  };
  return fullBleed(visit(hero), { paddingY: "l" });
}

/** Ticker: italic display words between hairlines, from the talent's own services. */
function maisonV2Ticker(makeId: KitIdFactory): BuilderNode {
  return {
    id: makeId(),
    kind: "marquee",
    props: {
      items: [
        { text: "{{primaryTypeLabel}}" },
        { text: "{{service1}}" },
        { text: "{{service2}}" },
        { text: "{{service3}}" },
      ],
      variant: "serif",
      separator: "star",
      speed: "medium",
      pauseOnHover: true,
      layerLabel: "Ticker",
      style: { marginTop: "m" },
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
            marginTop: "l",
            responsive: { mobile: { paddingX: "s" } },
          },
        })
      : n,
  );
  return withProps(
    band,
    { layerLabel: "Ticker and recent work", style: { ...styleOf(band), maxWidth: "full", paddingX: "none", paddingY: "none" } },
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
  return fullBleed(
    withProps(
      section,
      {},
      kidsOf(section).map((n) =>
        n.kind === "services_catalog"
          ? withProps(n, {
              showModeChip: true,
              categoryShowAll: true,
              categoryShowCounts: true,
              showStats: false,
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
      return withProps(node, { text: "Hello, I'm {{displayName}}", layerLabel: "About greeting" });
    }
    if (node.kind === "heading" && p.layerLabel === "About greeting") {
      return withProps(node, { layerLabel: "About heading" });
    }
    if (node.kind === "image") {
      const { aspectRatio: _a, ...rest } = unrounded(styleOf(node));
      void _a;
      return withProps(node, { style: { ...rest, aspectRatioFree: "4 / 4.4", objectPosition: "50% 25%" } });
    }
    return kids.length ? withProps(node, {}, kids) : node;
  };
  return fullBleed(visit(about));
}

function maisonV2Faq(makeId: KitIdFactory): BuilderNode {
  const faq = faqBlock(makeId, { heading: "What I get {i}asked{/i}", center: false, ask: false });
  const eyebrow: BuilderNode = {
    id: makeId(),
    kind: "paragraph",
    props: {
      text: "Questions",
      layerLabel: "FAQ eyebrow",
      style: { textTransform: "uppercase", letterSpacing: "0.18em", size: "sm", textColor: styleTokenRef("color.accent") },
    },
  } as BuilderNode;
  const kids = kidsOf(faq);
  return withProps(
    faq,
    { style: { ...styleOf(faq), maxWidth: "full", paddingX: "l", maxWidthFree: "760px" } },
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
        paddingY: "xl",
        paddingX: "l",
      },
    },
    children: [
      {
        id: makeId(),
        kind: "heading",
        props: { text: "See you soon.", level: 2, layerLabel: "Footer line" },
      } as BuilderNode,
      {
        id: makeId(),
        kind: "button",
        props: { label: "See services", href: "#services", tone: "primary", layerLabel: "Footer CTA" },
      } as BuilderNode,
      ...kidsOf(node),
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
  const cta = { label: "Reserve a time", href: "#services" };
  const right = Array.isArray(regions.right)
    ? (regions.right as Props[]).map((it) => (it?.type === "cta" ? { ...it, ...cta, responsive: { mobile: "hide" } } : it))
    : regions.right;
  return withProps(node, {
    sectionProps: {
      ...sp,
      brand: { ...brand, tagline: "{{primaryTypeLabel}}" },
      primaryCta: cta,
      tone: "surface",
      regions: { ...regions, right },
    },
  });
}

export function buildMaisonV2Payload(): DesignPayload {
  const id = seqIds("maison-v2");
  return {
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
      fullBleed(
        reviewsBlock(id, {
          layout: "trio",
          heading: "What they {i}say{/i}",
          eyebrow: "Reviews",
          autoplayMs: 0,
        }),
      ),
      maisonV2About(id),
      fullBleed(
        visitBlock(id, {
          layout: "facts",
          heading: "Before you come",
          titleAccent: "come",
          eyebrow: "Your visit",
          band: false,
        }),
        { paddingY: "l" },
      ),
      maisonV2Faq(id),
    ],
  };
}
