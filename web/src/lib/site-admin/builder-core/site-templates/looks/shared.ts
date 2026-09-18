/**
 * looks/shared.ts — the page skeletons every Look is built from.
 *
 * A Look file supplies a `LookRecipe` (which hero, which offer layout, which
 * gallery, which header, radii, type styles) plus a theme patch and copy
 * overrides. This module turns the recipe into the six page trees and the
 * shell. The recipe axis is what makes ten Looks genuinely different while the
 * site map, slots and image roles stay identical, so any business type's
 * components drop into any Look.
 *
 * No colour literals: bands use theme-paired `style.background`, type uses
 * `token:` refs (D-TPL-10). No business-type words in copy (static test).
 */

import type { BuilderNode, BuilderNodeStyleValue } from "@/lib/site-admin/builder-node/types";

import { LOOK_COPY_DEFAULTS } from "../copy";
import { band, btn, card, copy, ctas, divider, eyebrow, grid, h, img, masonry, p, row, slot, spacer, split, stack, tplId } from "../dsl";
import type { Bilingual, Look, LookId, SitePageRole } from "../types";
import { cinematicHero, liftCard, marqueeBand, railGallery, reveal, stagger, stickyStory, zoomPicture, type RevealPreset } from "./v2-sections";

type Style = BuilderNodeStyleValue & Record<string, unknown>;
type Bg = "none" | "surface" | "muted" | "accent" | "contrast";

export interface LookRecipe {
  hero: "left" | "centered" | "split" | "fullbleed" | "stacked" | "banded" | "cinematic";
  heroBand: Bg;
  heroMinHeight: string;
  offer: "split" | "cards" | "prose" | "list";
  proofBand: Bg;
  closing: Bg;
  gallery: "masonry" | "grid" | "strip" | "rail";
  cardVariant: "elevated" | "outline" | "ghost";
  imageRadius: "none" | "sm" | "md" | "lg";
  header: "left-nav" | "centered" | "split" | "minimal";
  footer: "columns" | "line" | "stacked";
  headingStyle: Style;
  displayStyle: Style;
  eyebrowStyle?: Style;
  bodyStyle?: Style;
  sectionPadding: "l" | "xl";
  /** Extra decoration a recipe opts into. */
  rulesBetweenSections?: boolean;
  // ── Looks v2 (D-TPL-36): motion and the cinematic sections ────────────────
  /** Entrance animation on every section and staggered children; off = v1 static. */
  motion?: RevealPreset;
  /** A scrolling strip of the business's words under the hero. */
  marquee?: boolean;
  /** One oversized line on a contrast band after the hero. */
  statement?: boolean;
  /** Pinned picture beside three scrolling blocks, in place of the offer split. */
  story?: "sticky";
  /** Cards lift and their pictures zoom on hover. */
  lift?: boolean;
}

// ── Small pieces ────────────────────────────────────────────────────────────

const HREF: Record<SitePageRole, string> = {
  home: "/",
  catalogue: "{{href.catalogue}}",
  transaction: "{{href.transaction}}",
  about: "{{href.about}}",
  contact: "{{href.contact}}",
  gallery: "{{href.gallery}}",
};
export const LOOK_HREF_PLACEHOLDERS = HREF;

function eye(r: LookRecipe, key: string, extra: Style = {}): BuilderNode {
  const n = eyebrow(copy(key));
  n.props = { ...n.props, style: { ...(n.props as { style: Style }).style, ...(r.eyebrowStyle ?? {}), ...extra } };
  return n;
}
function title(r: LookRecipe, key: string, level: 1 | 2 | 3 = 2, extra: Style = {}): BuilderNode {
  return h(level, copy(key), { ...(level === 1 ? r.displayStyle : r.headingStyle), ...extra });
}
function body(r: LookRecipe, key: string, extra: Style = {}): BuilderNode {
  return p(copy(key), { ...(r.bodyStyle ?? {}), ...extra });
}
function primary(): BuilderNode {
  return btn(copy("action.primary"), HREF.transaction, "primary");
}
function secondary(key = "action.secondary", href = HREF.contact): BuilderNode {
  return btn(copy(key), href, "secondary");
}
/** A button styled as a plain text link (the shell trees use the same trick). */
function textLink(key: string, href: string): BuilderNode {
  return btn(copy(key), href, "secondary", { backgroundColor: "transparent", borderWidth: "0px", paddingLeft: "0px", paddingRight: "0px", textColor: "token:color.primary", textDecoration: "underline" });
}
/** On an accent/contrast band the theme's primary button would vanish into
 *  the band; invert it explicitly so the pair stays readable. */
function bandButtons(bg: Bg, align: "start" | "center" = "center"): BuilderNode {
  if (bg === "accent" || bg === "contrast") {
    const inv: Style = { backgroundColor: "token:color.background", textColor: "token:color.ink", borderColor: "token:color.background" };
    const ghost: Style = { backgroundColor: "transparent", textColor: "token:color.background", borderColor: "token:color.background" };
    return ctas([btn(copy("action.primary"), HREF.transaction, "primary", inv), btn(copy("action.secondary"), HREF.contact, "secondary", ghost)], align);
  }
  return ctas([primary(), secondary()], align);
}
function picture(r: LookRecipe, key: Parameters<typeof img>[0], ratio: Style["aspectRatio"], extra: Style = {}, priority = false): BuilderNode {
  return img(key, { aspectRatio: ratio, radius: r.imageRadius, ...extra }, priority);
}
function section(r: LookRecipe, children: BuilderNode[], opts: Parameters<typeof band>[1] = {}): BuilderNode {
  const kids = r.motion ? stagger(children, r.motion) : children;
  return band(kids, { paddingY: r.sectionPadding, ...opts });
}
function maybeRule(r: LookRecipe): BuilderNode[] {
  // `divider` is not a root kind; a hairline band carries it.
  return r.rulesBetweenSections ? [band([divider()], { paddingY: "s", maxWidth: "wide" })] : [];
}

// ── Hero variants ───────────────────────────────────────────────────────────

function hero(r: LookRecipe): BuilderNode[] {
  const copyStack = (align: "start" | "center") =>
    stack(
      [eye(r, "home.hero.eyebrow"), title(r, "home.hero.headline", 1), body(r, "home.hero.sub", { size: "lg" }), ctas([primary(), secondary()], align)],
      { maxWidth: align === "center" ? "reading" : "wide", align: align === "center" ? "center" : "left" },
      { gap: "m", align },
    );
  switch (r.hero) {
    // Boxed heroes take their height from their content: a min-height with
    // vertical centring left a ~200px void under the header at 1440.
    case "left":
      return [section(r, [copyStack("start"), picture(r, "hero", "21:9", {}, true)], { background: r.heroBand })];
    case "centered":
      return [section(r, [copyStack("center"), picture(r, "hero", "16:9", {}, true)], { background: r.heroBand, align: "center" })];
    case "split":
      return [section(r, [split(copyStack("start"), picture(r, "hero", "1:1", {}, true), "50-50")], { background: r.heroBand })];
    case "fullbleed":
      return [
        {
          id: tplId("container"),
          kind: "container",
          props: {
            layout: "stack",
            align: "start",
            layerLabel: "Hero",
            // Ink backdrop + light copy: on a light Look that is a dark scrim
            // with light text, on a dark Look the inverse; readable either way.
            style: { position: "relative", overflow: "hidden", maxWidthFree: "100%", width: "100%", minHeight: r.heroMinHeight, backgroundColor: "token:color.ink" },
          },
          children: [
            picture(r, "hero", "auto", { position: "absolute", width: "100%", height: "100%", opacity: 0.45, radius: "none" }, true),
            band(
              [stack([eye(r, "home.hero.eyebrow", { textColor: "token:color.background", tone: "default" }), title(r, "home.hero.headline", 1, { textColor: "token:color.background" }), body(r, "home.hero.sub", { size: "lg", textColor: "token:color.background" }), bandButtons("contrast", "start")], { maxWidth: "wide" }, { gap: "m" })],
              { paddingY: "xl", style: { position: "relative", minHeight: r.heroMinHeight, justifyContent: "flex-end" } },
            ),
          ],
        },
      ];
    case "stacked":
      return [section(r, [picture(r, "hero", "21:9", {}, true), copyStack("start")], { background: r.heroBand })];
    case "cinematic":
      return [
        cinematicHero({
          slides: ["hero", "wide", "gallery-1"],
          eyebrowKey: "home.hero.eyebrow",
          headingKey: "home.hero.headline",
          subKey: "home.hero.sub",
          primary: { labelKey: "action.primary", href: HREF.transaction },
          secondary: { labelKey: "nav.catalogue", href: HREF.catalogue },
          align: "bl",
          tone: "dark",
        }),
        ...(r.marquee ? [marqueeBand(["home.hero.headline", "home.hero.eyebrow", "nav.catalogue", "nav.gallery", "nav.contact"], { style: { background: "surface" } })] : []),
        ...(r.statement ? [section(r, [h(2, copy("home.statement"), { ...r.displayStyle, textColor: "token:color.background", align: "center", textWrap: "balance" })], { background: "contrast", align: "center", maxWidth: "wide" })] : []),
      ];
    case "banded":
      return [
        section(
          r,
          [stack([eye(r, "home.hero.eyebrow", { textColor: "token:color.background", tone: "default" }), title(r, "home.hero.headline", 1, { textColor: "token:color.background" }), body(r, "home.hero.sub", { size: "lg", textColor: "token:color.background" }), bandButtons("accent", "start")], { maxWidth: "wide" }, { gap: "m" })],
          { background: "accent", paddingY: "xl", style: { minHeight: r.heroMinHeight } },
        ),
        section(r, [picture(r, "hero", "21:9", {}, true)], { paddingY: "s" }),
      ];
  }
}

// ── Home ────────────────────────────────────────────────────────────────────

function offer(r: LookRecipe): BuilderNode {
  const copyBlock = stack([eye(r, "home.offer.eyebrow"), title(r, "home.offer.headline"), body(r, "home.offer.body"), ctas([secondary("action.about", HREF.about)])], {}, { gap: "m" });
  if (r.story === "sticky") {
    return stickyStory({
      imageSlot: "wide",
      eyebrowKey: "home.offer.eyebrow",
      headlineKey: "home.offer.headline",
      blockKeys: [
        { title: "home.story.1.title", body: "home.story.1.body" },
        { title: "home.story.2.title", body: "home.story.2.body" },
        { title: "home.story.3.title", body: "home.story.3.body" },
      ],
      side: "media-left",
      variant: "minimal",
      style: r.motion ? reveal(r.motion) : {},
    });
  }
  const cardOf = (children: BuilderNode[]) => (r.lift ? liftCard(children, r.cardVariant === "ghost" ? { paddingX: "s", paddingY: "s" } : {}) : card(children, r.cardVariant));
  const framed = (key: Parameters<typeof img>[0], ratio: Style["aspectRatio"]) => (r.lift ? zoomPicture(key, { aspectRatio: ratio }, { radius: r.imageRadius }) : picture(r, key, ratio));
  switch (r.offer) {
    case "split":
      return section(r, [split(copyBlock, picture(r, "wide", "4:3"), "50-50")]);
    case "cards":
      return section(r, [
        copyBlock,
        grid(
          [
            cardOf([framed("portrait", "4:3"), h(3, copy("nav.catalogue"), r.headingStyle), textLink("nav.catalogue", HREF.catalogue)]),
            cardOf([framed("detail", "4:3"), h(3, copy("nav.about"), r.headingStyle), textLink("action.about", HREF.about)]),
            cardOf([framed("wide", "4:3"), h(3, copy("nav.gallery"), r.headingStyle), textLink("action.gallery", HREF.gallery)]),
          ],
          3,
        ),
      ]);
    case "prose":
      return section(r, [copyBlock, picture(r, "wide", "21:9")], { maxWidth: "reading" });
    case "list":
      return section(r, [row([copyBlock, picture(r, "portrait", "3:4", { maxWidth: "narrow" })], {}, { align: "start", gap: "l" })]);
  }
}

function galleryTeaser(r: LookRecipe): BuilderNode {
  const head = stack([eye(r, "home.gallery.eyebrow"), title(r, "home.gallery.headline")], {}, { gap: "s" });
  if (r.gallery === "rail") {
    return section(r, [head, railGallery(["gallery-1", "gallery-2", "gallery-3", "gallery-4", "detail"], { perView: 3, ratio: "3:4" }), ctas([secondary("action.gallery", HREF.gallery)])], { maxWidth: "full", style: { paddingX: "m" } });
  }
  const frames = [picture(r, "gallery-1", "4:3"), picture(r, "gallery-2", "3:4"), picture(r, "gallery-3", "1:1"), picture(r, "gallery-4", "4:3")];
  const media = r.gallery === "masonry" ? masonry(frames, 4) : r.gallery === "strip" ? row(frames, {}, { gap: "s" }) : grid(frames, 4);
  return section(r, [head, media, ctas([secondary("action.gallery", HREF.gallery)])]);
}

function closing(r: LookRecipe): BuilderNode {
  const strong = r.closing === "accent" || r.closing === "contrast";
  const ink: Style = strong ? { textColor: "token:color.background" } : {};
  return section(r, [stack([title(r, "home.closing.headline", 2, { ...ink, align: "center" }), body(r, "home.closing.body", { ...ink, align: "center" }), bandButtons(r.closing, "center")], { maxWidth: "reading", align: "center" }, { align: "center", gap: "m" })], {
    background: r.closing,
    align: "center",
  });
}

function home(r: LookRecipe): BuilderNode[] {
  return [
    ...hero(r),
    ...maybeRule(r),
    offer(r),
    slot("home.offer"),
    slot("home.proof"),
    ...maybeRule(r),
    galleryTeaser(r),
    slot("whatsapp"),
    closing(r),
  ];
}

// ── Inner pages ─────────────────────────────────────────────────────────────

function pageHead(r: LookRecipe, prefix: string, withIntro = true): BuilderNode {
  const children = [eye(r, `${prefix}.eyebrow`), title(r, `${prefix}.headline`, 1)];
  if (withIntro) children.push(body(r, `${prefix}.intro`, { size: "lg" }));
  return section(r, [stack(children, { maxWidth: "reading" }, { gap: "s" })], { paddingY: "l" });
}

function catalogue(r: LookRecipe): BuilderNode[] {
  return [pageHead(r, "catalogue"), slot("catalogue"), slot("whatsapp"), closing(r)];
}

function transaction(r: LookRecipe): BuilderNode[] {
  return [pageHead(r, "transaction"), slot("transaction"), slot("whatsapp")];
}

function about(r: LookRecipe): BuilderNode[] {
  return [
    section(r, [stack([eye(r, "about.eyebrow"), title(r, "about.headline", 1)], { maxWidth: "reading" }, { gap: "s" })], { paddingY: "l" }),
    section(r, [split(stack([body(r, "about.body", { size: "lg" }), body(r, "about.body2")], {}, { gap: "m" }), picture(r, "portrait", "3:4"), "60-40")]),
    slot("people"),
    section(r, [picture(r, "wide", "21:9")], { paddingY: "s" }),
    closing(r),
  ];
}

function contact(r: LookRecipe): BuilderNode[] {
  return [
    section(r, [stack([eye(r, "contact.eyebrow"), title(r, "contact.headline", 1), body(r, "contact.intro", { size: "lg" }), ctas([primary()])], { maxWidth: "reading" }, { gap: "s" })], { paddingY: "l" }),
    slot("whatsapp"),
    slot("map"),
    section(r, [stack([h(3, copy("contact.socials.title"), r.headingStyle), socials()], {}, { gap: "s" })], { paddingY: "l" }),
  ];
}

function gallery(r: LookRecipe): BuilderNode[] {
  return [section(r, [stack([eye(r, "gallery.eyebrow"), title(r, "gallery.headline", 1)], { maxWidth: "reading" }, { gap: "s" })], { paddingY: "l" }), slot("gallery"), closing(r)];
}

function socials(): BuilderNode {
  const id = tplId("social");
  return {
    id,
    kind: "social_links",
    props: {
      size: "md",
      shape: "circle",
      ariaLabel: "Social",
      links: [
        { id: `${id}-ig`, platform: "instagram", href: "{{business.instagram}}" },
        { id: `${id}-fb`, platform: "facebook", href: "{{business.facebook}}" },
      ],
      style: {},
    },
  };
}

// ── Shell ───────────────────────────────────────────────────────────────────

function navLinks(): Array<{ id: string; label: string; href: string }> {
  const id = tplId("nav");
  return (["catalogue", "transaction", "about", "gallery", "contact"] as const).map((role, i) => ({
    id: `${id}-l${i}`,
    label: copy(`nav.${role}`),
    href: HREF[role],
  }));
}

function brand(r: LookRecipe, align: "left" | "center" = "left", extra: Style = {}): BuilderNode {
  const wordmark = h(2, copy("home.hero.headline"), { ...r.headingStyle, size: "md", align, textWrap: "nowrap", ...extra } as Style);
  wordmark.props = { ...wordmark.props, layerLabel: "Brand name" };
  return row(
    [
      { id: tplId("image"), kind: "image", props: { src: "{{business.logo}}", alt: "{{business.name}}", href: "/", layerLabel: "Brand logo", style: { height: "40px", width: "auto", objectFit: "contain", radius: "none" } } },
      wordmark,
    ],
    { width: "auto", flexGrow: 0, flexShrink: 0 },
    { gap: "s" },
  );
}

function navNode(style: Style = {}): BuilderNode {
  return {
    id: tplId("nav"),
    kind: "nav",
    props: {
      links: navLinks(),
      collapseAt: "tablet",
      mobileMenuVariant: "drawer-right",
      menuLabel: copy("nav.menuLabel"),
      menu: { ctaLabel: copy("action.primary"), ctaHref: HREF.transaction, showSocial: false },
      // Links inherit colour; pin them to the theme ink so a light Look on a
      // dark host (or the reverse) never paints an invisible nav.
      style: { textColor: "token:color.ink", width: "auto", flexGrow: 1, flexShrink: 1, whiteSpace: "nowrap", ...style },
    },
  };
}

/** Header rows stay rows on a phone (brand left, menu button right). */
function headerRow(children: BuilderNode[], style: Style = {}): BuilderNode {
  const node = row(children, { justifyContent: "space-between", flexWrap: "nowrap", ...style }, { gap: "m" });
  (node as { props: Record<string, unknown> }).props = { ...node.props, responsive: { mobile: { layout: "row" } } };
  return node;
}
/** The header's call to action; on a phone the drawer carries it instead. */
function headerCta(): BuilderNode {
  const b = primary();
  b.props = { ...b.props, style: { ...(b.props as { style: Style }).style, flexShrink: 0, responsive: { mobile: { visibility: "hidden" } } } };
  return b;
}

/**
 * Over a cinematic hero the header floats: absolutely positioned at the top,
 * no background, light type. The hero's scrim is always dark (v2-sections),
 * so white is the one honest literal here regardless of the Look's own ink;
 * the header does not persist on scroll (award-tier pattern; the mobile
 * drawer and the footer nav carry the links further down).
 */
const OVERLAY_INK = "#ffffff";

function header(r: LookRecipe): BuilderNode[] {
  const overlay = r.hero === "cinematic";
  const gutter: Style = overlay
    ? { paddingX: "m", paddingY: "m", maxWidth: "full", maxWidthFree: "100%", width: "100%", background: "none", position: "absolute", top: "0px", left: "0px", zIndex: 40, textColor: OVERLAY_INK }
    : { paddingX: "m", paddingY: "s", maxWidth: "full", maxWidthFree: "100%", width: "100%", background: "surface" };
  const ink: Style = overlay ? { textColor: OVERLAY_INK } : {};
  const nav = (style: Style) => navNode({ ...style, ...ink });
  const mark = (align: "left" | "center" = "left") => brand(r, align, ink);
  switch (r.header) {
    case "left-nav":
      return [headerRow([mark(), nav({ justifyContent: "flex-end" }), headerCta()], gutter)];
    case "centered": {
      // Desktop: wordmark above a centred nav. Phone: one row, brand + menu.
      const node = stack([mark("center"), nav({ justifyContent: "center", flexGrow: 0 })], { ...gutter, alignItems: "center" }, { gap: "s", align: "center" });
      (node as { props: Record<string, unknown> }).props = { ...node.props, responsive: { mobile: { layout: "row", align: "center" } } };
      return [node];
    }
    case "split":
    {
      // Equal flex on both wings keeps the wordmark truly centred.
      const wing = ctas([headerCta()], "end");
      (wing as { props: Record<string, unknown> }).props = { ...wing.props, style: { flexGrow: 1, flexBasis: "0%", width: "auto" } };
      return [headerRow([nav({ justifyContent: "flex-start", flexGrow: 1, flexBasis: "0%" }), mark("center"), wing], gutter)];
    }
    case "minimal":
      return [headerRow([mark(), nav({ justifyContent: "flex-end" })], gutter)];
  }
}

function footer(r: LookRecipe): BuilderNode[] {
  const rights = p(copy("footer.rights"), { size: "sm", tone: "muted" });
  const tagline = p(copy("footer.tagline"), { size: "sm", tone: "muted" });
  const links = navNode({ justifyContent: "flex-start", fontSize: "0.85rem", flexGrow: 0 });
  switch (r.footer) {
    case "columns":
      return [
        band(
          [
            row([stack([h(3, copy("home.hero.headline"), r.headingStyle), tagline], { width: "auto", flexGrow: 0 }, { gap: "s" }), navNode({ justifyContent: "flex-end", fontSize: "0.9rem" })], { justifyContent: "space-between", flexWrap: "wrap" }, { align: "start" }),
            divider(),
            row([rights, socials()], { justifyContent: "space-between" }),
          ],
          { background: "muted", paddingY: "l" },
        ),
      ];
    case "line":
      return [band([row([rights, links, socials()], { justifyContent: "space-between" })], { background: "surface", paddingY: "m", maxWidth: "full" })];
    case "stacked":
      return [band([stack([h(2, copy("home.hero.headline"), r.displayStyle), tagline, links, socials(), spacer("s"), rights], { align: "center" }, { gap: "m", align: "center" })], { background: "contrast", paddingY: "xl", maxWidth: "full", align: "center" })];
  }
}

// ── Assemble ────────────────────────────────────────────────────────────────

export function buildLook(input: {
  id: LookId;
  title: Bilingual;
  axis: Bilingual;
  themePatch: Record<string, string>;
  recipe: LookRecipe;
  copyOverrides?: Record<string, Bilingual>;
}): Look {
  const r = input.recipe;
  return {
    id: input.id,
    title: input.title,
    axis: input.axis,
    themePatch: input.themePatch,
    shell: { header: header(r), footer: footer(r) },
    pages: {
      home: home(r),
      catalogue: catalogue(r),
      transaction: transaction(r),
      about: about(r),
      contact: contact(r),
      gallery: gallery(r),
    },
    copy: { ...LOOK_COPY_DEFAULTS, ...(input.copyOverrides ?? {}) },
  };
}
