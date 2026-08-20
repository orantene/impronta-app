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
  buildLocationDiscoveryDecomposedSection,
  gridOnlyLocationDiscoveryConfig,
} from "@/lib/site-admin/builder-node/location-discovery-freeform";

import {
  band,
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
  GOLD,
  IMAGE_SLOT,
  SERIF,
  TEXT,
  type ImprontaRebuildPage,
} from "../shared";

// ── hero ─────────────────────────────────────────────────────────────────────
const hero = pageHero("rb-home", {
  eyebrowText: "International Models & Talent Agency · Riviera Maya",
  line1: "Faces that carry",
  line2: "the Riviera Maya.",
  sub: "Impronta is a boutique talent and model agency based on the Riviera Maya, working internationally. Models, hosts, performers, DJs and culinary talent, every one of them met, vetted and represented by an agency that answers for the booking end to end.",
  primary: { label: "Book talent", href: "/contact" },
  secondary: { label: "Explore the roster", href: "/directory" },
  footnote: "Agency-managed end to end · first reply within 24 hours",
  imageSlot: "home-hero",
  // Impronta's own reel ("Portada Pag Fuego"). It replaced a third-party
  // placeholder the day its YouTube "Allow embedding" setting was turned on —
  // a video can be PUBLIC and still refuse to play off youtube.com, which is
  // why the seeder's oembed preflight gates this field.
  videoUrl: "https://www.youtube.com/watch?v=c9ARKE2WNxA",
  imageAlt:
    "An Impronta model in a black bodysuit and tinted sunglasses, photographed against a warm tan studio backdrop.",
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
  // Every other eyebrow on this page is gold, uppercase and widely tracked
  // (see `eyebrow()` in shared.ts). This one shipped as the component's muted
  // grey default, so the section read as though it came from another site.
  eyebrowStyle: {
    fontFamily: SERIF,
    fontSize: "12px",
    fontWeight: 600,
    letterSpacing: "0.32em",
    textTransform: "uppercase",
    textColor: GOLD,
    tone: undefined,
  },
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

/**
 * The wide roster tile that closes the divisions grid.
 *
 * photoTile pins a portrait ratio, which is right for a discipline tile and
 * wrong for a banner spanning two columns: as a grid item it should take the
 * height of the portrait beside it. So the ratio comes off and `gridColumn`
 * goes on — the two edits that turn a column tile into a row tile.
 */
function rosterBannerTile(): BuilderNode {
  const tile = photoTile("rb-home-div-all", {
    imageSlot: "home-division-roster",
    imageAlt: "An Impronta model in a white top with both arms raised above her head, against a white studio backdrop.",
    title: "The full roster",
    subtitle: "Search everyone, filter by discipline, language and city",
    href: "/directory",
  });
  const props = tile.props as { style: Record<string, unknown> };
  const { aspectRatioFree: _dropped, responsive: _r, ...rest } = props.style;
  props.style = {
    ...rest,
    gridColumn: "span 2",
    // Phones stack the grid, so the span is inert there and the tile falls
    // back to a normal photo tile shape.
    responsive: { mobile: { gridColumn: "auto", aspectRatioFree: "4 / 5" } },
  };
  return tile;
}

// ── divisions ────────────────────────────────────────────────────────────────
const divisions = band(
  "rb-home-divisions",
  [
    centerHead(
      "rb-home-divisions",
      "Our talents",
      "One agency, four disciplines",
      "Each one is a working roster with real people on it. Browse the talent your brief needs, or search the full directory across all of them.",
    ),
    grid(
      "rb-home-divisions-grid",
      3,
      [
        photoTile("rb-home-div-fashion", {
          imageSlot: "home-division-fashion",
          imageAlt: "An Impronta fashion model in a black bodysuit and tinted sunglasses, seated against a warm tan studio backdrop.",
          title: "Fashion Models",
          subtitle: "Editorial, runway, campaign and e-commerce",
          href: "/p/fashion-models",
        }),
        photoTile("rb-home-div-hosts", {
          imageSlot: "home-division-hosts",
          imageAlt: "An Impronta model crouching in a black bodysuit and black heels, photographed against a white studio backdrop.",
          title: "Hosts & Promoters",
          subtitle: "Event hosts, hostesses and brand ambassadors",
          href: "/p/hosts-promoters",
        }),
        photoTile("rb-home-div-performers", {
          imageSlot: "home-division-performers",
          imageAlt: "Close-up studio portrait of an Impronta model with her hands framing her face, against a pale backdrop.",
          title: "Performers",
          subtitle: "Dancers, acts and live entertainment",
          href: "/p/performers",
        }),
        photoTile("rb-home-div-music", {
          imageSlot: "home-division-music",
          imageAlt: "An Impronta model in a white tank top and light jeans, smiling in front of a pale studio backdrop.",
          title: "Music & DJs",
          subtitle: "DJs, musicians and curated sound",
          href: "/p/music-djs",
        }),
        // The roster tile is the one DESTINATION among four disciplines, so
        // it earns the two cells the 3-column grid would otherwise leave
        // empty. Built from the same photoTile as its neighbours — a bare
        // dark rectangle at 805x501 read as a hole in the page, and matching
        // the siblings gives it a photo, a caption and the same EXPLORE
        // affordance instead of a lone button.
        rosterBannerTile(),
      ],
      { layerLabel: "Division tiles" },
    ),
  ],
  { borderTop: true, layerLabel: "Divisions" },
);

// ── editorial plates ─────────────────────────────────────────────────────────
const plate1 = fullBleedPlate("rb-home-1", {
  imageSlot: "home-plate-runway",
  imageAlt: "An Impronta model reclining in an open white shirt and light jeans on a white studio backdrop.",
  numeral: "I.",
  line: "She does not walk the runway. She decides where it leads.",
});

/**
 * This slot used to hold plate II — a serif line over a white-background studio
 * portrait, which is the weakest thing on the page: white photograph, light
 * type, nothing to read. It becomes the studio promo, which has something to
 * sell and an image that is genuinely about its subject (a studio frame, on a
 * page about the studio). `git show` on the commit before this restores it.
 */
const studioPromo = band(
  "rb-home-2",
  [
    {
      id: "rb-home-2-split",
      kind: "split",
      props: {
        ratio: "50-50",
        gap: "l",
        collapseOnMobile: true,
        layerLabel: "The studio",
        style: { width: "100%", maxWidthFree: "100%", alignItems: "center" },
      },
      children: [
        {
          id: "rb-home-2-copy",
          kind: "container",
          props: {
            layout: "stack",
            align: "start",
            layerLabel: "Studio copy",
            style: { gap: "0px", maxWidthFree: "560px" },
          },
          children: [
            eyebrow("rb-home-2-eyebrow", "The studio", "left"),
            headingLine("rb-home-2-line1", "Book the room", { align: "left", layerLabel: "Headline line 1" }),
            headingLine("rb-home-2-line2", "where the work happens.", { align: "left", accent: true, layerLabel: "Headline line 2 (accent)" }),
            copy(
              "rb-home-2-body",
              "Impronta has its own photo studio, and you do not need to be represented by the agency to use it. Book a session for your first portfolio, for a book that no longer looks like you, or simply for good photographs of yourself.",
              { align: "left", maxWidth: "520px", marginTop: "20px" },
            ),
            ctaRow(
              "rb-home-2-cta",
              [goldButton("rb-home-2-book", "Book a session", "/p/studio")],
              "left",
            ),
          ],
        },
        {
          id: "rb-home-2-image",
          kind: "image",
          props: {
            src: IMAGE_SLOT("studio-session"),
            alt: "An Impronta model seated in an open white shirt and ripped jeans, hand at his chin, against a white studio backdrop.",
            layerLabel: "Studio frame",
            style: {
              width: "100%",
              aspectRatioFree: "0.85",
              objectFit: "cover",
              objectPosition: "center top",
              borderRadius: "4px",
              boxShadow: "0 40px 110px rgba(0,0,0,0.45)",
            },
          },
        },
      ],
    },
  ],
  { borderTop: true, layerLabel: "The studio" },
);

// ── the show (teaser) ────────────────────────────────────────────────────────
/**
 * This slot used to hold "We do not list faces. We stand behind them." — the
 * agency-positioning statement. The owner replaced it with the show teaser, and
 * the guarantees it made are already stated in full on For Clients, so nothing
 * was lost from the site. `git show` on the commit before this one restores it.
 *
 * The portrait stays exactly where it was, so the section keeps its shape and
 * the owner can swap in a production still from the builder the day one exists.
 */
const showTeaser = band(
  "rb-home-statement",
  [
    {
      id: "rb-home-statement-split",
      kind: "split",
      props: {
        ratio: "40-60",
        gap: "l",
        collapseOnMobile: true,
        layerLabel: "The show",
        style: { width: "100%", maxWidthFree: "100%", alignItems: "center" },
      },
      children: [
        {
          id: "rb-home-statement-image",
          kind: "image",
          props: {
            src: IMAGE_SLOT("home-statement-portrait"),
            alt: "An Impronta model standing in a white shirt over a black top and light jeans, against a grey studio backdrop.",
            layerLabel: "Portrait",
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
            layerLabel: "Show copy",
            style: { gap: "0px", maxWidthFree: "640px" },
          },
          children: [
            eyebrow("rb-home-statement-eyebrow", "Coming soon", "left"),
            headingLine("rb-home-statement-line1", "A show built for", { align: "left", layerLabel: "Headline line 1" }),
            headingLine("rb-home-statement-line2", "the Riviera Maya.", { align: "left", accent: true, layerLabel: "Headline line 2 (accent)" }),
            copy(
              "rb-home-statement-body",
              "Impronta is producing an original stage show for resorts, beach clubs and hotels along the coast: one company, cast from the roster and rehearsed by the agency, that arrives ready to run on your stage. Venues can hold a date now, and casting is open to performers.",
              { align: "left", maxWidth: "560px", marginTop: "20px" },
            ),
            ctaRow(
              "rb-home-statement-cta",
              [goldButton("rb-home-statement-more", "Read more", "/p/show")],
              "left",
            ),
          ],
        },
      ],
    },
  ],
  { borderTop: true, layerLabel: "The show" },
);

// ── how it works ─────────────────────────────────────────────────────────────
const process = band(
  "rb-home-process",
  [
    centerHead("rb-home-process", "How it works", "Build your lineup, send it in one message"),
    grid(
      "rb-home-process-grid",
      4,
      [
        // The site HAS a browse -> save -> send flow and the homepage never
        // explained it, which is also why the header's heart and send icons
        // read as decoration. These four steps are that flow, in order.
        //
        // NO IMAGES YET, deliberately. processStep can carry one (see
        // shared.ts) and the owner asked for generated lifestyle frames, but
        // OpenAI returns billing_hard_limit_reached, and every photograph in
        // the library is a studio portrait - nothing in it honestly depicts
        // "send it as one message". A portrait pretending to be a screenshot
        // of a shortlist is worse than a clean numbered list. The moment
        // generation is available, four slots drop straight in.
        processStep(
          "rb-home-step-1",
          "01",
          "Browse the whole roster",
          "Every represented face, filterable by discipline, language and city.",
        ),
        processStep(
          "rb-home-step-2",
          "02",
          "Save the ones you like",
          "The heart on any profile keeps your shortlist while you browse.",
        ),
        processStep(
          "rb-home-step-3",
          "03",
          "Send it as one message",
          "Your whole lineup reaches a coordinator in a single brief.",
        ),
        processStep(
          "rb-home-step-4",
          "04",
          "We confirm and coordinate",
          "Availability, rates and logistics, handled end to end. First reply within 24 hours.",
        ),
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
    centerHead("rb-home-stats", "By the numbers", "An agency that answers for every booking"),
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

// ── events ───────────────────────────────────────────────────────────────────
/**
 * The owner: "we organize your event and party... or start collecting your
 * talent for your next event", pointing at the directory.
 *
 * Built as a band rather than a page, because the funnel already exists and was
 * simply never named on the homepage: the directory IS the lineup-collection
 * tool (browse, heart, send), and contact is the brief intake. What was missing
 * was the sentence that says events are a thing this agency staffs end to end.
 *
 * The primary action is the directory, not the form. Someone planning an event
 * wants to see faces before they write a brief, and sending them to the roster
 * is also what teaches the save-and-send flow the numbered band explains.
 */
const events = band(
  "rb-home-events",
  [
    centerHead(
      "rb-home-events",
      "Events",
      "Your event, staffed end to end",
      "One brief covers all of it: hosts and hostesses for the door, performers for the moment the night peaks, a DJ to hold the room, and the faces your brand is remembered by. Build the lineup yourself from the roster, or tell us the date and we build it for you.",
    ),
    ctaRow(
      "rb-home-events-cta",
      [
        goldButton("rb-home-events-primary", "Start building your lineup", "/directory"),
        lineButton("rb-home-events-secondary", "Tell us about your event", "/p/contact"),
      ],
      "center",
    ),
  ],
  { borderTop: true, layerLabel: "Events" },
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

// ── where the roster works (live map, talent orbiting each city) ─────────────
//
// mapStyle "talent_orbit" is the REAL Google map with talent photographs
// orbiting each city pin; the default "editorial" is a hand-drawn SVG with
// text pins. The section falls back to editorial on its own if the map key or
// the city coordinates are missing, so this asks for the good one and degrades
// rather than breaking. Verified before seeding: the tenant's google_maps
// integration is connected, and Playa del Carmen (37 talent), Cancun (4),
// Buenos Aires (2) and Tulum (1) all carry latitude/longitude. Mexico City is
// deliberately absent — its location row has no coordinates, so the renderer
// would drop it anyway.
//
// source "roster_cities" keeps the list honest: it derives from who is
// actually on the roster instead of a hand-typed list that goes stale the way
// the pinned featured-talent codes did.
const locations = buildLocationDiscoveryDecomposedSection({
  rootId: "rb-home-locations",
  eyebrow: "Where we work",
  // Same gold-caps treatment every other eyebrow on the page carries.
  eyebrowStyle: {
    fontFamily: SERIF,
    fontSize: "12px",
    fontWeight: 600,
    letterSpacing: "0.32em",
    textTransform: "uppercase",
    textColor: GOLD,
    tone: undefined,
  },
  headline: "Local faces, international reach",
  subheadline:
    "The roster lives on the Riviera Maya and travels for the brief. Hover a city to see the faces working it.",
  seeAllLabel: "Browse the roster",
  seeAllHref: "/directory",
  embedConfig: gridOnlyLocationDiscoveryConfig({
    source: "roster_cities",
    mapStyle: "talent_orbit",
    showMap: true,
    showCount: true,
    maxItems: 8,
    layout: "grid",
    emptyStateText: "Markets appear here as talent join the roster.",
    presentation: {
      align: "center",
      background: "canvas",
      paddingTop: "tight",
      paddingBottom: "standard",
      containerWidth: "wide",
    },
  }),
});

const tree: BuilderNode[] = [
  hero,
  marquee,
  featured,
  divisions,
  locations,
  plate1,
  showTeaser,
  process,
  proof,
  stats,
  studioPromo,
  dualCta,
  events,
  closing,
];

export const homePage: ImprontaRebuildPage = {
  slug: "home",
  title: "Impronta, Models & Talent Agency",
  seo: {
    meta_title: "Impronta | International Model & Talent Agency, Riviera Maya",
    meta_description:
      "Impronta is a boutique model and talent agency based on the Riviera Maya, working internationally. Book vetted models, event hosts, performers, DJs and private chefs, agency-managed end to end.",
    og_title: "Impronta, International Models & Talent Agency",
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
