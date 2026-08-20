/**
 * Impronta rebuild — FOR CLIENTS (`/p/for-clients`).
 *
 * The client conversion funnel. Flow: photographic hero → what you can book
 * (occasions) → what agency-managed means (split) → booking process →
 * editorial plate → divisions rail → social proof → FAQ teaser → closing CTA.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  band,
  bulletRow,
  centerHead,
  closingCta,
  copy,
  eyebrow,
  faqAccordion,
  fullBleedPlate,
  grid,
  headingLine,
  linkRow,
  lineButton,
  pageHero,
  photoTile,
  processStep,
  quoteCard,
  IMAGE_SLOT,
  type ImprontaRebuildPage,
} from "../shared";

const hero = pageHero("rb-clients", {
  eyebrowText: "For clients",
  line1: "Cast the brief,",
  line2: "not the chaos.",
  sub: "Brands, event producers, hotels, photographers and casting directors book through Impronta for one reason: the shortlist is real. Vetted talent, confirmed availability, agreed rates and a coordinator who answers for all of it.",
  primary: { label: "Start an inquiry", href: "/contact" },
  secondary: { label: "Browse the roster", href: "/directory" },
  footnote: "No account needed · first reply within 24 hours",
  imageSlot: "for-clients-hero",
  imageAlt: "Close-up studio portrait of an Impronta model, one hand at her jaw, against a pale backdrop.",
});

const occasions = band(
  "rb-clients-occasions",
  [
    centerHead(
      "rb-clients-occasions",
      "Best for",
      "Whatever the brief, there is a roster for it",
      "The occasions we staff most, from single-face campaigns to full activation teams.",
    ),
    {
      id: "rb-clients-occasions-grid",
      kind: "container",
      props: {
        layout: "grid",
        columns: 3,
        gap: "m",
        layerLabel: "Occasion rows",
        responsive: { tablet: { columns: 2 }, mobile: { layout: "stack", columns: 1 } },
        style: { width: "100%", maxWidthFree: "100%", gap: "0px 48px" },
      },
      children: [
        linkRow("rb-clients-occ-campaigns", "Fashion & Brand Campaigns", "/directory"),
        linkRow("rb-clients-occ-launches", "Product Launches", "/directory"),
        linkRow("rb-clients-occ-events", "Events & Galas", "/directory"),
        linkRow("rb-clients-occ-hospitality", "Hospitality & VIP", "/directory"),
        linkRow("rb-clients-occ-shoots", "Editorial & E-commerce Shoots", "/directory"),
        linkRow("rb-clients-occ-activations", "Brand Activations", "/directory"),
        linkRow("rb-clients-occ-weddings", "Destination Weddings", "/directory"),
        linkRow("rb-clients-occ-music", "Music & Entertainment", "/directory"),
        linkRow("rb-clients-occ-culinary", "Private Dining & Culinary", "/directory"),
      ],
    },
  ],
  { borderTop: true, layerLabel: "Occasions" },
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

const plate = fullBleedPlate("rb-clients", {
  imageSlot: "for-clients-plate",
  imageAlt: "An Impronta model with long blonde hair in a black strapless top, photographed against a pale studio backdrop.",
  numeral: "24h",
  line: "One brief in. One shortlist back. Within a day.",
});

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
  occasions,
  managed,
  process,
  plate,
  divisions,
  proof,
  faqTeaser,
  closing,
];

export const forClientsPage: ImprontaRebuildPage = {
  slug: "for-clients",
  title: "For Clients",
  seo: {
    meta_title: "Book Talent in Tulum & Riviera Maya | Impronta for Clients",
    meta_description:
      "How brands, event producers, hotels and casting directors book models, hosts, performers, DJs and chefs through Impronta: one brief, a vetted shortlist within 24 hours, and a coordinator who runs the day.",
    og_title: "Cast the brief, not the chaos",
    og_description:
      "Vetted talent, confirmed availability, agreed rates and a named coordinator. How booking through Impronta works.",
    canonical_url: "/p/for-clients",
    noindex: false,
    include_in_sitemap: true,
  },
  tree,
};
