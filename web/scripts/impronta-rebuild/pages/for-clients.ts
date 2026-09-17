/**
 * Impronta rebuild — FOR CLIENTS (`/p/for-clients`).
 *
 * The client conversion funnel. Flow: photographic hero → who we work with
 * (nine client segments from the owner's 2026-09-17 commercial map, each an
 * anchor + a prefilled brief) → what agency-managed means (split) → booking
 * process → editorial plate → divisions rail → social proof → FAQ teaser →
 * closing CTA.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { briefHref, segmentCard, type SegmentCardInput } from "../shared-offers";
import {
  band,
  bulletRow,
  centerHead,
  closingCta,
  copy,
  eyebrow,
  faqAccordion,
  featureCard,
  statCell,
  grid,
  headingLine,
  lineButton,
  pageHero,
  photoTile,
  processStep,
  quoteCard,
  IMAGE_SLOT,
  type ImprontaRebuildPage,
} from "../shared";

const hero = pageHero("rb-clients", {
  eyebrowText: "For clients · Tulum · Playa del Carmen · Riviera Maya",
  line1: "Models, hosts, performers",
  line2: "and shows, booked as one.",
  sub: "Brands, event producers, hotels, agencies and casting directors book models, hosts, dancers, DJs and complete live shows through Impronta for one reason: the shortlist is real. Vetted talent, confirmed availability, agreed rates and a coordinator who answers for all of it.",
  primary: { label: "Start an inquiry", href: "/contact" },
  secondary: { label: "Browse the roster", href: "/directory" },
  footnote: "No account needed · first reply within 24 hours",
  imageSlot: "for-clients-hero",
  imageAlt: "Close-up studio portrait of an Impronta model, one hand at her jaw, against a pale backdrop.",
});

/**
 * WHO WE WORK WITH — the owner's 2026-09-17 commercial map, fourteen target
 * areas folded into nine cards a visitor can scan. Each card's node id is an
 * in-page anchor (`/p/for-clients#rb-clients-seg-hotels`) that the homepage
 * services strip and the header menu deep-link into, and every CTA lands on
 * the contact brief with "What are you booking?" already filled in.
 */
const SEGMENTS: ReadonlyArray<{ key: string } & SegmentCardInput> = [
  {
    key: "brands",
    chip: "01 · Fashion",
    title: "Fashion brands & designers",
    intro: "Faces and full production for the collection, the campaign and the feed.",
    bullets: [
      "Photo productions with models",
      "Advertising campaigns",
      "Collection launches",
      "Catalogues and social content",
      "Runway shows and presentations",
    ],
    cta: { label: "Book a campaign", href: briefHref("Fashion campaign / production with models") },
  },
  {
    key: "activations",
    chip: "02 · Brands & companies",
    title: "Activations & promotions",
    intro: "The people your brand is remembered by, from the door to the demo.",
    bullets: [
      "Hosts, hostesses and promoters",
      "Brand activations and product launches",
      "Staff for events",
      "Models for campaigns and content",
      "Promotional experiences",
    ],
    cta: { label: "Staff an activation", href: briefHref("Brand activation / promotional staff") },
  },
  {
    key: "private",
    chip: "03 · Private",
    title: "Private events & celebrations",
    intro: "Birthdays, weddings and the nights that need a production behind them.",
    bullets: [
      "Birthdays and bachelor(ette) parties",
      "Weddings and destination weddings",
      "Themed and corporate parties",
      "Luxury private events",
      "Personalised entertainment",
    ],
    cta: { label: "Plan my event", href: briefHref("Private event / wedding entertainment") },
  },
  {
    key: "hotels",
    chip: "04 · Hospitality",
    title: "Hotels, resorts & beach clubs",
    intro: "Complete shows and the talent to fill a season of guest programming.",
    bullets: [
      "Show Impronta: a complete live production",
      "Dancers, acrobats and themed shows",
      "Models, hosts and animation",
      "Guest activations",
      "Special productions for hotel events",
    ],
    cta: { label: "See the show for hotels", href: "/p/show" },
  },
  {
    key: "nightlife",
    chip: "05 · Nightlife",
    title: "Casinos, bars, clubs & restaurants",
    intro: "Resident or one-night entertainment that turns a room into a destination.",
    bullets: [
      "Resident and special shows",
      "Dancers, performers and acrobats",
      "Go-go dancers and models",
      "Themed events",
      "Special presentations for chosen nights",
    ],
    cta: { label: "Plan a night", href: briefHref("Show / performers for a club, bar or restaurant") },
  },
  {
    key: "runway",
    chip: "06 · Runway",
    title: "Fashion shows & runway production",
    intro: "From the casting to the last look: the whole show, produced as one.",
    bullets: [
      "Models and casting",
      "Organisation and production",
      "Choreography and wardrobe",
      "Hair and makeup",
      "Full runway production",
    ],
    cta: { label: "Produce my show", href: briefHref("Fashion show / runway production") },
  },
  {
    key: "audiovisual",
    chip: "07 · Production",
    title: "Audiovisual production",
    intro: "Talent and production for the camera, still or moving.",
    bullets: [
      "Models for photo and video",
      "Content for social media",
      "Advertising and music videos",
      "Brand campaigns",
      "Content for hotels and restaurants",
    ],
    cta: { label: "Cast my production", href: briefHref("Audiovisual production / content shoot") },
  },
  {
    key: "corporate",
    chip: "08 · Corporate & agencies",
    title: "Corporate events & agency partners",
    intro: "Entertainment and staff for company events, and a roster your agency can sell.",
    bullets: [
      "Hosts, presenters and performers for corporate events",
      "Entertainment and activations for companies",
      "Partnerships with advertising, marketing and event agencies",
      "Talent supplied for your own clients' briefs",
      "One coordinator, one agreement",
    ],
    cta: { label: "Talk partnerships", href: briefHref("Corporate event / agency partnership") },
  },
  {
    key: "studio",
    chip: "09 · Studio & tourists",
    title: "Studio experiences & courses",
    intro: "Photo sessions, posing courses and model-for-a-day experiences at our studio.",
    bullets: [
      "Studio photo sessions from $1,500 MXN",
      "Model for a Day experience",
      "Posing and self-makeup courses",
      "Themed and vintage-era shoots",
      "Experiences for visitors and groups",
    ],
    cta: { label: "See experiences and prices", href: "/p/experiences" },
  },
];


/**
 * Structured data for the client page: the FAQ (rich result eligible) and
 * the nine services as an ItemList. Kept in sync by hand with the cards
 * above; `impronta-rebuild-pages.test.ts` pins the shape.
 */
export const FOR_CLIENTS_JSON_LD = [
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "How fast can you staff a booking?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Standard briefs get a shortlist within 24 hours. For urgent briefs in Tulum or Playa del Carmen we have confirmed same-day teams.",
        },
      },
      {
        "@type": "Question",
        name: "How does pricing work?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Every shortlist comes with clear rates for the exact scope of your brief: time, usage and travel included. You approve the number before anything is confirmed.",
        },
      },
      {
        "@type": "Question",
        name: "Can I contact talent directly?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Bookings run through the agency, which keeps availability real, rates fair and the coordinator accountable to you.",
        },
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Impronta services for clients",
    itemListElement: SEGMENTS.map((seg, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Service",
        name: seg.title,
        description: seg.intro,
        provider: { "@type": "Organization", name: "Impronta", url: "https://improntamodels.com" },
        areaServed: ["Tulum", "Playa del Carmen", "Cancun", "Riviera Maya"],
        url: `https://improntamodels.com/for-clients#rb-clients-seg-${seg.key}`,
      },
    })),
  },
];

const segments = band(
  "rb-clients-segments",
  [
    centerHead(
      "rb-clients-segments",
      "Who we work with",
      "From a single face to a full show",
      "Impronta works with individuals, brands, companies, agencies, hotels, restaurants, bars, clubs, casinos and event organisers. Find your brief below; every card opens a message to a coordinator.",
    ),
    grid(
      "rb-clients-segments-grid",
      3,
      SEGMENTS.map((s) => segmentCard(`rb-clients-seg-${s.key}`, s)),
      { layerLabel: "Client segments", mobileColumns: 1 },
    ),
  ],
  { borderTop: true, layerLabel: "Who we work with" },
);

const managed = band(
  "rb-clients-managed",
  [
    {
      id: "rb-clients-managed-split",
      kind: "split",
      props: {
        ratio: "40-60",
        gap: "l",
        collapseOnMobile: true,
        layerLabel: "What agency-managed means",
        style: { width: "100%", maxWidthFree: "100%", alignItems: "center" },
      },
      children: [
        {
          id: "rb-clients-managed-image",
          kind: "image",
          props: {
            src: IMAGE_SLOT("for-clients-managed"),
            alt: "An Impronta model in a cream shirt, seated against a white studio backdrop.",
            layerLabel: "Coordination photograph",
            style: {
              width: "100%",
              aspectRatioFree: "0.8",
              objectFit: "cover",
              objectPosition: "center",
              borderRadius: "4px",
              boxShadow: "0 40px 110px rgba(0,0,0,0.45)",
            },
          },
        },
        {
          id: "rb-clients-managed-copy",
          kind: "container",
          props: {
            layout: "stack",
            align: "start",
            layerLabel: "Managed copy",
            style: { gap: "0px", maxWidthFree: "640px" },
          },
          children: [
            eyebrow("rb-clients-managed-eyebrow", "Agency-managed", "left"),
            headingLine("rb-clients-managed-line1", "You brief once.", { align: "left", layerLabel: "Headline line 1" }),
            headingLine("rb-clients-managed-line2", "We carry the rest.", { align: "left", accent: true, layerLabel: "Headline line 2 (accent)" }),
            copy(
              "rb-clients-managed-body",
              "Booking direct means chasing availability, negotiating rates one by one and hoping everyone shows. Booking through Impronta means one thread, one agreement and one coordinator accountable from the first reply to the wrap.",
              { align: "left", maxWidth: "560px", marginTop: "20px" },
            ),
            {
              id: "rb-clients-managed-list",
              kind: "container",
              props: {
                layout: "stack",
                align: "start",
                layerLabel: "Included",
                style: { gap: "0px", marginTopFree: "28px", width: "100%", maxWidthFree: "560px" },
              },
              children: [
                bulletRow("rb-clients-managed-row-1", "Curated shortlist against your brief, not a search-results dump"),
                bulletRow("rb-clients-managed-row-2", "Availability confirmed before you see a name"),
                bulletRow("rb-clients-managed-row-3", "Rates, usage and image rights agreed in writing"),
                bulletRow("rb-clients-managed-row-4", "Call times, fittings and logistics coordinated by the agency"),
                bulletRow("rb-clients-managed-row-5", "A named coordinator on the day, not a ticket queue"),
              ],
            },
          ],
        },
      ],
    },
  ],
  { borderTop: true, layerLabel: "Agency-managed" },
);

const process = band(
  "rb-clients-process",
  [
    centerHead("rb-clients-process", "How booking works", "From brief to booked in four steps"),
    grid(
      "rb-clients-process-grid",
      4,
      [
        processStep("rb-clients-step-1", "01", "Send the brief", "Dates, market, budget range and the look or skill you need. A sentence is enough."),
        processStep("rb-clients-step-2", "02", "Review the shortlist", "Curated options with photos, rates and confirmed availability, usually within 24 hours."),
        processStep("rb-clients-step-3", "03", "Confirm in writing", "You choose. We lock the talent, agree final terms and send one clear agreement."),
        processStep("rb-clients-step-4", "04", "We run the day", "Briefed talent, coordinated logistics and a named contact until the wrap."),
      ],
      { layerLabel: "Steps", mobileColumns: 2 },
    ),
  ],
  { borderTop: true, layerLabel: "Process" },
);

/**
 * WHY IMPRONTA — replaces the editorial plate ("24h · One brief in. One
 * shortlist back."), which the owner read as saying nothing. Four claims the
 * site already makes elsewhere, each with the reason it matters to a client.
 */
const why = band(
  "rb-clients-why",
  [
    centerHead(
      "rb-clients-why",
      "Why book through Impronta",
      "What you get that a direct booking cannot give you",
      "Every face on the roster was met in person. Every availability is confirmed before you see a name. Every booking has one coordinator who answers for it.",
    ),
    {
      id: "rb-clients-why-grid",
      kind: "container",
      props: {
        layout: "grid",
        columns: 4,
        gap: "m",
        layerLabel: "Proof points",
        responsive: { tablet: { columns: 2 }, mobile: { columns: 2 } },
        style: { width: "100%", maxWidthFree: "100%" },
      },
      children: [
        statCell("rb-clients-why-1", "<24h", "First reply with a shortlist", false),
        statCell("rb-clients-why-2", "100%", "Talent met and vetted in person", true),
        statCell("rb-clients-why-3", "1", "Coordinator and one agreement per booking", true),
        statCell("rb-clients-why-4", "EN · ES", "Bilingual talent and briefs", true),
      ],
    },
    grid(
      "rb-clients-why-cards",
      3,
      [
        featureCard(
          "rb-clients-why-c1",
          "Availability before names",
          "You never fall for a face that cannot make the date. The shortlist only carries talent confirmed for your dates and city.",
        ),
        featureCard(
          "rb-clients-why-c2",
          "Rates and usage in writing",
          "Time, usage rights, travel and overtime agreed in one document before anyone is booked. The invoice matches the quote.",
        ),
        featureCard(
          "rb-clients-why-c3",
          "One thread to the wrap",
          "Call times, fittings, logistics and changes go through your coordinator. You run the event; we run the people.",
        ),
      ],
      { layerLabel: "Why Impronta", mobileColumns: 1 },
    ),
  ],
  { borderTop: true, layerLabel: "Why Impronta" },
);

const divisions = band(
  "rb-clients-divisions",
  [
    centerHead(
      "rb-clients-divisions",
      "Our talents",
      "Build the whole team from one roster",
      "Mix disciplines in a single brief: a face for the campaign, hosts for the door, a DJ for the room and a chef for the table.",
    ),
    grid(
      "rb-clients-divisions-grid",
      3,
      [
        photoTile("rb-clients-div-fashion", {
          imageSlot: "for-clients-division-fashion",
          imageAlt: "An Impronta fashion model lying on the studio floor in a black bodysuit, sheer tights and heels, against a warm tan backdrop.",
          title: "Fashion Models",
          subtitle: "Campaign, editorial, runway, e-commerce",
          href: "/p/fashion-models",
        }),
        photoTile("rb-clients-div-hosts", {
          imageSlot: "for-clients-division-hosts",
          imageAlt: "An Impronta model in a white tank top and wide light jeans, leaning against a wooden chair on a white backdrop.",
          title: "Hosts & Promoters",
          subtitle: "Hosts, hostesses, brand ambassadors",
          href: "/p/hosts-promoters",
        }),
        photoTile("rb-clients-div-performers", {
          imageSlot: "for-clients-division-performers",
          imageAlt: "Smiling studio portrait of an Impronta model in a white top, one hand at her chin, against a white backdrop.",
          title: "Performers",
          subtitle: "Dancers, acts, live entertainment",
          href: "/p/performers",
        }),
        photoTile("rb-clients-div-music", {
          imageSlot: "for-clients-division-music",
          imageAlt: "An Impronta model in a short black dress with a choker, photographed against a warm tan studio backdrop.",
          title: "Music & DJs",
          subtitle: "DJs, musicians, curated sound",
          href: "/p/music-djs",
        }),
        photoTile("rb-clients-div-roster", {
          imageSlot: "for-clients-division-roster",
          imageAlt: "An Impronta model in a white top with both arms raised above her head, against a white studio backdrop.",
          title: "The Full Roster",
          subtitle: "Search everyone, filter by anything",
          href: "/directory",
        }),
      ],
      { layerLabel: "Division tiles", mobileColumns: 2 },
    ),
  ],
  { borderTop: true, layerLabel: "Divisions" },
);

// OWNER-CONFIRM: replace with real client quotes before launch (flagged in the PR).
const proof = band(
  "rb-clients-proof",
  [
    centerHead("rb-clients-proof", "Client words", "The second booking says more than the first"),
    grid(
      "rb-clients-proof-grid",
      3,
      [
        quoteCard(
          "rb-clients-quote-1",
          "Four hostesses, two languages, one day of lead time. They delivered all of it and the follow-up invoice matched the quote exactly.",
          "Hotel events manager",
          "Playa del Carmen",
        ),
        quoteCard(
          "rb-clients-quote-2",
          "The difference is the coordinator. Someone owned our booking from the brief to the breakdown of the set.",
          "Production company",
          "Mexico City",
        ),
        quoteCard(
          "rb-clients-quote-3",
          "We stopped casting from social media. The vetting here is the product.",
          "Brand founder",
          "Tulum",
        ),
      ],
      { layerLabel: "Quotes", mobileSlider: true },
    ),
  ],
  { borderTop: true, layerLabel: "Social proof" },
);

const faqTeaser = band(
  "rb-clients-faq",
  [
    centerHead("rb-clients-faq", "Before you ask", "The three questions every client asks"),
    faqAccordion("rb-clients-faq-accordion", [
      {
        id: "rb-clients-faq-1",
        question: "How fast can you staff a booking?",
        answer:
          "Standard briefs get a shortlist within 24 hours. For urgent briefs in Tulum or Playa del Carmen we have confirmed same-day teams; tell us the timeline and we will be straight about what is possible.",
      },
      {
        id: "rb-clients-faq-2",
        question: "How does pricing work?",
        answer:
          "Every shortlist comes with clear rates for the exact scope of your brief: time, usage and travel included. You approve the number before anything is confirmed, and the agreement matches the quote.",
      },
      {
        id: "rb-clients-faq-3",
        question: "Can I contact talent directly?",
        answer:
          "Bookings run through the agency. That is what keeps availability real, rates fair and the coordinator accountable to you. You meet and work with the talent; the logistics stay with us.",
      },
    ]),
    {
      id: "rb-clients-faq-more",
      kind: "container",
      props: {
        layout: "row",
        align: "center",
        layerLabel: "All questions link",
        style: { gap: "16px", justifyContent: "center", marginTopFree: "8px" },
      },
      children: [lineButton("rb-clients-faq-cta", "Read the full FAQ", "/p/faq")],
    },
  ],
  { borderTop: true, layerLabel: "FAQ teaser" },
);

const closing = closingCta("rb-clients-closing", {
  eyebrowText: "Start",
  line1: "Your shortlist is",
  line2: "a brief away.",
  sub: "Tell us the dates, the place and the look. A coordinator replies personally within 24 hours.",
  primary: { label: "Start an inquiry", href: "/contact" },
  secondary: { label: "Browse the roster", href: "/directory" },
});

const tree: BuilderNode[] = [
  hero,
  segments,
  managed,
  process,
  why,
  divisions,
  proof,
  faqTeaser,
  closing,
];

export const forClientsPage: ImprontaRebuildPage = {
  slug: "for-clients",
  title: "For Clients",
  seo: {
    meta_title: "Talent, Shows & Production for Brands, Events & Hotels | Impronta",
    meta_description:
      "Book models, hosts, dancers, acrobats, DJs and complete shows through Impronta for campaigns, activations, weddings, hotels, clubs, runway and audiovisual production. One brief, a vetted shortlist within 24 hours.",
    og_title: "Cast the brief, not the chaos",
    og_description:
      "Vetted talent, confirmed availability, agreed rates and a named coordinator. How booking through Impronta works.",
    canonical_url: "/p/for-clients",
    noindex: false,
    include_in_sitemap: true,
    json_ld: FOR_CLIENTS_JSON_LD,
  },
  tree,
};
