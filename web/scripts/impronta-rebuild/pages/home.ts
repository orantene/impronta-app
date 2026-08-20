/**
 * Impronta rebuild — HOME (`/p/home`).
 *
 * Flow: full-bleed photographic hero → discipline marquee → featured talent
 * (live roster) → division tiles → editorial plate I → agency statement →
 * how it works → social proof → stats → editorial plate II → dual conversion
 * band (clients / talent) → closing CTA.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  buildFeaturedTalentDecomposedSection,
  gridOnlyFeaturedTalentConfig,
} from "@/lib/site-admin/builder-node/featured-talent-freeform";
import {
  band,
  bulletRow,
  centerHead,
  closingCta,
  copy,
  ctaRow,
  eyebrow,
  fullBleedPlate,
  goldButton,
  grid,
  headingLine,
  lineButton,
  pageHero,
  photoTile,
  processStep,
  quoteCard,
  statCell,
  CARD,
  CARD_BORDER,
  IMAGE_SLOT,
  SERIF,
  TEXT,
  type ImprontaRebuildPage,
} from "../shared";

// ── hero ─────────────────────────────────────────────────────────────────────
const hero = pageHero("rb-home", {
  eyebrowText: "Models & Talent Agency · Tulum · Riviera Maya",
  line1: "Faces that carry",
  line2: "the Riviera Maya.",
  sub: "Impronta is a boutique talent and model agency in Tulum and Playa del Carmen. Models, hosts, performers, DJs and culinary talent, every one of them met, vetted and represented by an agency that answers for the booking end to end.",
  primary: { label: "Book talent", href: "/contact" },
  secondary: { label: "Explore the roster", href: "/directory" },
  footnote: "Agency-managed end to end · first reply within 24 hours",
  imageSlot: "home-hero",
  // Impronta's own reel ("Portada Pag Fuego"). It replaced a third-party
  // placeholder the day its YouTube "Allow embedding" setting was turned on —
  // a video can be PUBLIC and still refuse to play off youtube.com, which is
  // why the seeder's oembed preflight gates this field.
  videoUrl: "https://www.youtube.com/watch?v=c9ARKE2WNxA",
  imageAlt: "Editorial photograph of an Impronta model at golden hour on the Riviera Maya coast.",
});

// ── discipline marquee (curated Tulala component) ────────────────────────────
const marquee: BuilderNode = {
  id: "rb-home-marquee",
  kind: "section_embed",
  props: {
    sectionTypeKey: "marquee",
    layerLabel: "Discipline Marquee",
    config: {
      items: [
        { text: "Fashion Models", href: "/p/fashion-models" },
        { text: "Hosts & Promoters", href: "/p/hosts-promoters" },
        { text: "Performers", href: "/p/performers" },
        { text: "Music & DJs", href: "/p/music-djs" },
        { text: "Full Roster", href: "/directory" },
      ],
      speed: "slow",
      direction: "left",
      separator: "diamond",
      variant: "text",
      presentation: {
        background: "espresso",
        containerWidth: "full-bleed",
        paddingTop: "tight",
        paddingBottom: "tight",
        dividerTop: "thin-line",
        animation: { entry: "fade", reducedMotion: "respect" },
        customCss:
          ".site-marquee { background: var(--token-color-background, #0a0a0a); border-top: 1px solid var(--token-color-line, #1f1f22); border-bottom: 1px solid var(--token-color-line, #1f1f22); } .site-marquee__link, .site-marquee__item > span:not(.site-marquee__sep) { color: var(--token-color-ink, #f4f4f5); font-family: var(--site-heading-font, inherit); font-style: italic; text-decoration: none; } .site-marquee__sep { color: var(--token-color-accent, #d4af37); } .site-marquee__sep::before { content: '\\2726'; } .site-marquee__sep { font-size: 0; } .site-marquee__sep::before { font-size: 1rem; }",
      },
    },
  },
};

// ── featured talent (live roster; W5 curation can swap the manual codes) ─────
const featured: BuilderNode = buildFeaturedTalentDecomposedSection({
  rootId: "rb-home-featured",
  eyebrow: "Selected",
  headline: "FEATURED TALENT",
  subheadline: "",
  seeAllLabel: "Explore the roster",
  seeAllHref: "/directory",
  // The wrapper has to clear the section's own "wide" (1280px) container or
  // the grid renders at 906px — four 210px cards on a 1440px screen, with
  // every name and city ellipsized. 1400 leaves room for the section's
  // gutters and still stops short of a full-bleed row on a large display.
  contentMaxWidth: "1400px",
  embedConfig: gridOnlyFeaturedTalentConfig({
    limit: 4,
    variant: "grid",
    showCity: true,
    showName: true,
    showBadge: false,
    cardChrome: "v11-noir",
    requestCta: { href: "/contact", label: "Request" },
    sourceMode: "manual_pick",
    actionStyle: "outline-duo",
    cardVariant: "editorial",
    headerAlign: "center",
    layoutPreset: "v11-showcase",
    presentation: {
      align: "center",
      background: "canvas",
      dividerTop: "thin-line",
      // "editorial" is clamp(72px, 9vw, 132px) — 130px of empty canvas above
      // AND below the cards, on top of the freeform header's own 48px. The
      // roster read as marooned in the middle of the section.
      paddingTop: "tight",
      paddingBottom: "standard",
      containerWidth: "wide",
      animation: { entry: "fade-up", reducedMotion: "respect" },
    },
    showLanguages: true,
    columnsDesktop: 4,
    emptyStateText: "Featured profiles appear here as talent are added to the roster.",
    imageTreatment: "cinematic",
    showPrimaryType: true,
    showAvailability: true,
    showBookmarkIcon: true,
    showSecondaryType: true,
    // Verified live profiles (flagship home uses the same set).
    manualProfileCodes: ["TAL-00036", "TAL-00033", "TAL-00034", "TAL-00035", "TAL-00037"],
    parentCategoryDisplay: false,
  }),
});

// ── divisions ────────────────────────────────────────────────────────────────
const divisions = band(
  "rb-home-divisions",
  [
    centerHead(
      "rb-home-divisions",
      "The divisions",
      "One agency, four disciplines",
      "Every division is a working roster, not a category label. Browse the discipline your brief needs, or search the full directory across all of them.",
    ),
    grid(
      "rb-home-divisions-grid",
      3,
      [
        photoTile("rb-home-div-fashion", {
          imageSlot: "home-division-fashion",
          imageAlt: "Impronta fashion model in an editorial look, photographed against Tulum architecture.",
          title: "Fashion Models",
          subtitle: "Editorial, runway, campaign and e-commerce",
          href: "/p/fashion-models",
        }),
        photoTile("rb-home-div-hosts", {
          imageSlot: "home-division-hosts",
          imageAlt: "Impronta event hostess welcoming guests at a beachfront brand activation.",
          title: "Hosts & Promoters",
          subtitle: "Event hosts, hostesses and brand ambassadors",
          href: "/p/hosts-promoters",
        }),
        photoTile("rb-home-div-performers", {
          imageSlot: "home-division-performers",
          imageAlt: "Impronta performer mid-show under stage light at a Tulum venue.",
          title: "Performers",
          subtitle: "Dancers, acts and live entertainment",
          href: "/p/performers",
        }),
        photoTile("rb-home-div-music", {
          imageSlot: "home-division-music",
          imageAlt: "Impronta DJ behind the decks at an open-air Riviera Maya event.",
          title: "Music & DJs",
          subtitle: "DJs, musicians and curated sound",
          href: "/p/music-djs",
        }),
        {
          id: "rb-home-div-all",
          kind: "container",
          props: {
            layout: "stack",
            align: "start",
            layerLabel: "Full roster tile",
            style: {
              gap: "10px",
              justifyContent: "flex-end",
              // Typed prop; the renderer honors ratio on containers now.
              aspectRatioFree: "0.78",
              backgroundColor: CARD,
              borderColor: CARD_BORDER,
              borderWidth: "1px",
              borderStyle: "solid",
              borderRadius: "4px",
              paddingTop: "24px",
              paddingBottom: "24px",
              paddingLeft: "24px",
              paddingRight: "24px",
              transitionProperty: "border-color",
              transitionDuration: "240ms",
              transitionTimingFunction: "ease",
              hover: { borderColor: "var(--token-color-primary)" },
              responsive: { mobile: { aspectRatioFree: "auto" } },
            },
          },
          children: [
            {
              id: "rb-home-div-all-title",
              kind: "heading",
              props: {
                text: "The full roster",
                level: 3,
                layerLabel: "Tile title",
                style: { fontFamily: SERIF, fontSize: "22px", fontWeight: 500, textColor: TEXT, marginBottomFree: "0px", align: "left" },
              },
            },
            copy(
              "rb-home-div-all-sub",
              "Search every represented profile by discipline, look, language and city.",
              { align: "left", size: "small", marginTop: "0px", layerLabel: "Tile subtitle" },
            ),
            lineButton("rb-home-div-all-cta", "Open the directory", "/directory"),
          ],
        },
      ],
      { layerLabel: "Division tiles" },
    ),
  ],
  { borderTop: true, layerLabel: "Divisions" },
);

// ── editorial plates ─────────────────────────────────────────────────────────
const plate1 = fullBleedPlate("rb-home-1", {
  imageSlot: "home-plate-runway",
  imageAlt: "Full-bleed editorial photograph of a model walking through a dramatic Tulum setting.",
  numeral: "I.",
  line: "She does not walk the runway. She decides where it leads.",
});

const plate2 = fullBleedPlate("rb-home-2", {
  imageSlot: "home-plate-atelier",
  imageAlt: "Behind the scenes at an Impronta production, the team at work around the talent.",
  numeral: "II.",
  line: "Behind every face, a room of people answerable for every detail.",
});

// ── statement ────────────────────────────────────────────────────────────────
const statement = band(
  "rb-home-statement",
  [
    {
      id: "rb-home-statement-split",
      kind: "split",
      props: {
        ratio: "40-60",
        gap: "l",
        collapseOnMobile: true,
        layerLabel: "Portrait + promise",
        style: { width: "100%", maxWidthFree: "100%", alignItems: "center" },
      },
      children: [
        {
          id: "rb-home-statement-image",
          kind: "image",
          props: {
            src: IMAGE_SLOT("home-statement-portrait"),
            alt: "Editorial portrait of a represented Impronta talent, lit against a dark studio backdrop.",
            layerLabel: "Editorial portrait",
            style: {
              width: "100%",
              aspectRatioFree: "0.8",
              objectFit: "cover",
              objectPosition: "center top",
              borderRadius: "4px",
              boxShadow: "0 40px 110px rgba(0,0,0,0.45)",
            },
          },
        },
        {
          id: "rb-home-statement-copy",
          kind: "container",
          props: {
            layout: "stack",
            align: "start",
            layerLabel: "Statement copy",
            style: { gap: "0px", maxWidthFree: "640px" },
          },
          children: [
            eyebrow("rb-home-statement-eyebrow", "The Impronta way", "left"),
            headingLine("rb-home-statement-line1", "We do not list faces.", { align: "left", layerLabel: "Headline line 1" }),
            headingLine("rb-home-statement-line2", "We stand behind them.", { align: "left", accent: true, layerLabel: "Headline line 2 (accent)" }),
            copy(
              "rb-home-statement-body",
              "Anyone can build a directory. We built an agency. Before a face reaches your shortlist it has been met in person, its portfolio reviewed, its availability confirmed and its rates agreed. When you book through Impronta, a real coordinator is answerable for every detail, from the first reply to the wrap of the event.",
              { align: "left", maxWidth: "560px", marginTop: "20px" },
            ),
            {
              id: "rb-home-statement-list",
              kind: "container",
              props: {
                layout: "stack",
                align: "start",
                layerLabel: "Ideal for",
                style: { gap: "0px", marginTopFree: "28px", width: "100%", maxWidthFree: "560px" },
              },
              children: [
                bulletRow("rb-home-statement-row-1", "Reviewed, agency-approved talent only"),
                bulletRow("rb-home-statement-row-2", "Availability confirmed before you commit"),
                bulletRow("rb-home-statement-row-3", "Rates, usage and logistics handled for you"),
              ],
            },
          ],
        },
      ],
    },
  ],
  { borderTop: true, layerLabel: "Statement" },
);

// ── how it works ─────────────────────────────────────────────────────────────
const process = band(
  "rb-home-process",
  [
    centerHead("rb-home-process", "How it works", "A clear, professional process"),
    grid(
      "rb-home-process-grid",
      4,
      [
        processStep("rb-home-step-1", "01", "Tell us the brief", "Dates, market, budget range and the look or skill you need. A sentence is enough to start."),
        processStep("rb-home-step-2", "02", "We shortlist options", "A curated selection from the roster, with availability already checked against your dates."),
        processStep("rb-home-step-3", "03", "Confirm talent", "You choose. We secure the booking, agree rates and usage, and put it in writing."),
        processStep("rb-home-step-4", "04", "We coordinate", "Call times, fittings, logistics and on-site coordination, handled by the agency."),
      ],
      { layerLabel: "Steps" },
    ),
  ],
  { borderTop: true, layerLabel: "How it works" },
);

// ── social proof ─────────────────────────────────────────────────────────────
// OWNER-CONFIRM: replace with real client quotes before launch (flagged in the PR).
const proof = band(
  "rb-home-proof",
  [
    centerHead("rb-home-proof", "Client words", "Booked once, booked again"),
    grid(
      "rb-home-proof-grid",
      3,
      [
        quoteCard(
          "rb-home-quote-1",
          "The shortlist landed the same day, availability already confirmed. We cast a full activation team in one call.",
          "Event producer",
          "Tulum",
        ),
        quoteCard(
          "rb-home-quote-2",
          "One coordinator, one thread, zero chasing. The talent arrived briefed, on time and camera-ready.",
          "Brand marketing lead",
          "Mexico City",
        ),
        quoteCard(
          "rb-home-quote-3",
          "We have worked with agencies in three countries. The level of care here is what kept us coming back.",
          "Creative director",
          "Riviera Maya",
        ),
      ],
      { layerLabel: "Quotes" },
    ),
  ],
  { borderTop: true, layerLabel: "Social proof" },
);

// ── stats ────────────────────────────────────────────────────────────────────
// OWNER-CONFIRM: figures mirror the flagship home; confirm before launch.
const stats = band(
  "rb-home-stats",
  [
    centerHead("rb-home-stats", "By the numbers", "A working agency, not a listing site"),
    {
      id: "rb-home-stats-row",
      kind: "container",
      props: {
        layout: "grid",
        columns: 4,
        gap: "m",
        layerLabel: "Stat row",
        responsive: { tablet: { columns: 2 }, mobile: { layout: "stack", columns: 1 } },
        style: { width: "100%", maxWidthFree: "100%", gap: "0px" },
      },
      children: [
        statCell("rb-home-stat-talent", "27+", "Represented talent", false),
        statCell("rb-home-stat-divisions", "5", "Divisions", true),
        statCell("rb-home-stat-reply", "<24h", "First reply", true),
        statCell("rb-home-stat-managed", "100%", "Agency-managed", true),
      ],
    },
  ],
  { borderTop: true, layerLabel: "Stats" },
);

// ── dual conversion band ─────────────────────────────────────────────────────
function conversionCard(
  idPrefix: string,
  eb: string,
  title: string,
  body: string,
  primary: { label: string; href: string },
  secondary: { label: string; href: string },
): BuilderNode {
  return {
    id: `${idPrefix}-card`,
    kind: "container",
    props: {
      layout: "stack",
      align: "start",
      layerLabel: title,
      style: {
        gap: "0px",
        backgroundColor: CARD,
        borderColor: CARD_BORDER,
        borderWidth: "1px",
        borderStyle: "solid",
        borderRadius: "8px",
        paddingTop: "44px",
        paddingBottom: "44px",
        paddingLeft: "36px",
        paddingRight: "36px",
        height: "100%",
      },
    },
    children: [
      eyebrow(`${idPrefix}-eyebrow`, eb, "left"),
      headingLine(`${idPrefix}-title`, title, { align: "left", size: "card", level: 3 }),
      copy(`${idPrefix}-body`, body, { align: "left", marginTop: "14px" }),
      ctaRow(`${idPrefix}-actions`, [
        goldButton(`${idPrefix}-primary`, primary.label, primary.href),
        lineButton(`${idPrefix}-secondary`, secondary.label, secondary.href),
      ], "left"),
    ],
  };
}

const dualCta = band(
  "rb-home-dual",
  [
    {
      id: "rb-home-dual-split",
      kind: "split",
      props: {
        ratio: "50-50",
        gap: "l",
        collapseOnMobile: true,
        layerLabel: "Two paths",
        style: { width: "100%", maxWidthFree: "1100px", marginLeftFree: "auto", marginRightFree: "auto", alignItems: "stretch" },
      },
      children: [
        conversionCard(
          "rb-home-dual-clients",
          "For clients",
          "Casting for a brand, event or production?",
          "Tell us the brief and your dates. A coordinator replies personally with a shortlist of available, agency-approved talent.",
          { label: "Start an inquiry", href: "/contact" },
          { label: "How booking works", href: "/p/for-clients" },
        ),
        conversionCard(
          "rb-home-dual-talent",
          "For talent",
          "Model, host, performer, DJ or chef?",
          "Apply for representation. If your profile fits the roster, we meet in person, build your professional profile and put you in front of real briefs.",
          { label: "Apply for representation", href: "/register" },
          { label: "What representation means", href: "/p/become-a-model" },
        ),
      ],
    },
  ],
  { borderTop: true, glow: true, layerLabel: "Two paths" },
);

// ── closing ──────────────────────────────────────────────────────────────────
const closing = closingCta("rb-home-closing", {
  eyebrowText: "Start",
  line1: "The right face is",
  line2: "one brief away.",
  sub: "Tell us who you are looking for and where. We match the talent, confirm the availability and coordinate the rest.",
  primary: { label: "Start an inquiry", href: "/contact" },
  secondary: { label: "Browse the roster", href: "/directory" },
});

const tree: BuilderNode[] = [
  hero,
  marquee,
  featured,
  divisions,
  plate1,
  statement,
  process,
  proof,
  stats,
  plate2,
  dualCta,
  closing,
];

export const homePage: ImprontaRebuildPage = {
  slug: "home",
  title: "Impronta, Models & Talent Agency",
  seo: {
    meta_title: "Impronta | Boutique Model & Talent Agency in Tulum, Riviera Maya",
    meta_description:
      "Impronta is a boutique model and talent agency in Tulum and Playa del Carmen. Book vetted models, event hosts, performers, DJs and private chefs, agency-managed end to end.",
    og_title: "Impronta, Models & Talent Agency, Tulum",
    og_description:
      "Vetted models, hosts, performers, DJs and culinary talent on the Riviera Maya. One brief, one coordinator, a shortlist within 24 hours.",
    canonical_url: "/p/home",
    noindex: false,
    include_in_sitemap: true,
    json_ld: {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Impronta",
      alternateName: "Impronta Models & Talent Agency",
      description:
        "Boutique model and talent agency in Tulum and Playa del Carmen, Mexico. Representation and bookings for models, event hosts, performers, DJs and culinary talent across the Riviera Maya.",
      url: "https://impronta.tulala.digital",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Tulum",
        addressRegion: "Quintana Roo",
        addressCountry: "MX",
      },
      areaServed: ["Tulum", "Playa del Carmen", "Riviera Maya", "Cancun", "Mexico City"],
      knowsAbout: [
        "model agency",
        "talent agency",
        "event staffing",
        "brand ambassadors",
        "entertainment booking",
      ],
    },
  },
  tree,
};
