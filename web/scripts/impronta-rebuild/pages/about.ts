/**
 * Impronta rebuild — ABOUT (`/p/about`).
 *
 * Flow: photographic hero → origin story split → what we believe (values) →
 * editorial plate → the divisions strip → stats → closing CTA.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  band,
  centerHead,
  closingCta,
  copy,
  eyebrow,
  featureCard,
  fullBleedPlate,
  grid,
  headingLine,
  linkRow,
  pageHero,
  statCell,
  IMAGE_SLOT,
  type ImprontaRebuildPage,
} from "../shared";

const hero = pageHero("rb-about", {
  eyebrowText: "The agency",
  line1: "An imprint, not",
  line2: "an inventory.",
  sub: "Impronta means imprint. It is the mark a face leaves on a campaign, and the mark an agency leaves on the people it represents. This is the story of ours.",
  imageSlot: "about-hero",
  imageAlt: "An Impronta model photographed in the agency studio against a plain backdrop.",
  compact: true,
});

const story = band(
  "rb-about-story",
  [
    {
      id: "rb-about-story-split",
      kind: "split",
      props: {
        ratio: "40-60",
        gap: "l",
        collapseOnMobile: true,
        layerLabel: "Story",
        style: { width: "100%", maxWidthFree: "100%", alignItems: "center" },
      },
      children: [
        {
          id: "rb-about-story-image",
          kind: "image",
          props: {
            src: IMAGE_SLOT("about-story"),
            alt: "An Impronta model in a burgundy dress, seated on the floor of the agency studio against a white backdrop.",
            layerLabel: "Story photograph",
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
          id: "rb-about-story-copy",
          kind: "container",
          props: {
            layout: "stack",
            align: "start",
            layerLabel: "Story copy",
            style: { gap: "0px", maxWidthFree: "640px" },
          },
          children: [
            eyebrow("rb-about-story-eyebrow", "Our story", "left"),
            headingLine("rb-about-story-line1", "Born on the Riviera Maya,", { align: "left", layerLabel: "Headline line 1" }),
            headingLine("rb-about-story-line2", "built for its briefs.", { align: "left", accent: true, layerLabel: "Headline line 2 (accent)" }),
            copy(
              "rb-about-story-p1",
              "Tulum and Playa del Carmen became one of the busiest creative corridors in Latin America almost overnight. Hotels, festivals, fashion brands and production houses arrived faster than the local talent infrastructure could grow. Bookings ran on group chats and luck.",
              { align: "left", maxWidth: "580px", marginTop: "20px" },
            ),
            copy(
              "rb-about-story-p2",
              "Impronta was founded to close that gap: a boutique agency that scouts, vets and represents the region's strongest models, hosts, performers, DJs and culinary talent, and stands behind every booking with real coordination. Small enough to know every face on the roster. Professional enough to answer for each one.",
              { align: "left", maxWidth: "580px", marginTop: "14px" },
            ),
            copy(
              "rb-about-story-p3",
              "Today the roster works across the Riviera Maya and travels for briefs in Mexico City and beyond, one coordinator and one written agreement at a time.",
              { align: "left", maxWidth: "580px", marginTop: "14px" },
            ),
          ],
        },
      ],
    },
  ],
  { borderTop: true, layerLabel: "Story" },
);

const values = band(
  "rb-about-values",
  [
    centerHead(
      "rb-about-values",
      "What we believe",
      "The standards behind the roster",
    ),
    grid(
      "rb-about-values-grid",
      3,
      [
        featureCard(
          "rb-about-value-1",
          "Every face, met in person",
          "No profile joins the roster from an inbox. We meet every talent, review their work and agree on how they want to be represented before a client ever sees them.",
        ),
        featureCard(
          "rb-about-value-2",
          "Representation, not listing",
          "Talent are represented people, not products. We negotiate their rates, protect their image rights and make sure every job is one they said yes to.",
        ),
        featureCard(
          "rb-about-value-3",
          "One accountable coordinator",
          "Every booking has a named coordinator who answers for the details: call times, fittings, logistics and the follow-through after the wrap.",
        ),
        featureCard(
          "rb-about-value-4",
          "Local depth, real reach",
          "We live where we cast. That means faces who know the light, the venues and the pace of the Riviera Maya, and an agency that can travel when the brief does.",
        ),
        featureCard(
          "rb-about-value-5",
          "Clear terms, in writing",
          "Rates, usage and scope are agreed before the booking is confirmed. No surprises for the client, no surprises for the talent.",
        ),
        featureCard(
          "rb-about-value-6",
          "Long careers over quick jobs",
          "We build portfolios, coach on set behavior and match talent to briefs that grow them. A roster that lasts is worth more than a booking that closes.",
        ),
      ],
      { layerLabel: "Values" },
    ),
  ],
  { borderTop: true, layerLabel: "Values" },
);

const plate = fullBleedPlate("rb-about", {
  imageSlot: "about-plate",
  imageAlt: "An Impronta model in a white tank top and denim, one hand in her hair, against a white studio backdrop.",
  numeral: "Est.",
  line: "The agency the Riviera Maya was missing.",
});

const divisionsStrip = band(
  "rb-about-divisions",
  [
    centerHead(
      "rb-about-divisions",
      "Our talents",
      "Four disciplines, one standard",
      "Every talent is curated by the same rules: met in person, vetted, represented.",
    ),
    {
      id: "rb-about-divisions-rows",
      kind: "container",
      props: {
        layout: "grid",
        columns: 2,
        gap: "m",
        layerLabel: "Division links",
        responsive: { mobile: { layout: "stack", columns: 1 } },
        style: { width: "100%", maxWidthFree: "920px", marginLeftFree: "auto", marginRightFree: "auto", gap: "0px 48px" },
      },
      children: [
        linkRow("rb-about-div-fashion", "Fashion Models", "/p/fashion-models"),
        linkRow("rb-about-div-hosts", "Hosts & Promoters", "/p/hosts-promoters"),
        linkRow("rb-about-div-performers", "Performers", "/p/performers"),
        linkRow("rb-about-div-music", "Music & DJs", "/p/music-djs"),
        linkRow("rb-about-div-all", "The full roster", "/directory"),
      ],
    },
  ],
  { borderTop: true, layerLabel: "Divisions" },
);

// OWNER-CONFIRM: figures mirror the flagship home; confirm before launch.
const stats = band(
  "rb-about-stats",
  [
    {
      id: "rb-about-stats-row",
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
        statCell("rb-about-stat-talent", "27+", "Represented talent", false),
        statCell("rb-about-stat-divisions", "5", "Talent categories", true),
        statCell("rb-about-stat-markets", "3", "Working markets", true),
        statCell("rb-about-stat-managed", "100%", "Agency-managed", true),
      ],
    },
  ],
  { borderTop: true, layerLabel: "Stats" },
);

const closing = closingCta("rb-about-closing", {
  eyebrowText: "Meet us",
  line1: "Put a face to",
  line2: "the agency.",
  sub: "Whether you are casting a brief or building a career, the conversation starts the same way.",
  primary: { label: "Start an inquiry", href: "/contact" },
  secondary: { label: "Apply as talent", href: "/register" },
});

const tree: BuilderNode[] = [hero, story, values, plate, divisionsStrip, stats, closing];

export const aboutPage: ImprontaRebuildPage = {
  slug: "about",
  title: "About Impronta",
  seo: {
    meta_title: "About Impronta | Boutique Talent Agency, Tulum & Playa del Carmen",
    meta_description:
      "Impronta is a boutique model and talent agency born on the Riviera Maya. Every face on the roster is met in person, vetted and represented, with one coordinator answerable for every booking.",
    og_title: "About Impronta, the agency the Riviera Maya was missing",
    og_description:
      "Met in person. Vetted. Represented. The story and standards behind Tulum's boutique model and talent agency.",
    canonical_url: "/p/about",
    noindex: false,
    include_in_sitemap: true,
  },
  tree,
};
