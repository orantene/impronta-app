/**
 * hosts-promoters — division landing page (Impronta rebuild, W4b).
 *
 * Section flow: full-bleed hero → use-case grid FIRST (what we staff) →
 * occasion link rows (where they work) → editorial split (briefed, bilingual,
 * on time) → LIVE ROSTER (directory embed scoped to Hosts & Promoters) →
 * cross-division links → closing inquiry CTA. Deliberately a different rhythm
 * from the models page: staffing-led, occasion-driven, team language.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  closingCta,
  divisionHero,
  divisionRosterSection,
  divisionsCrossLinks,
  editorialSplit,
  linkRows,
  buildUseCaseGrid,
  type DivisionPage,
} from "../shared-divisions";

const P = "div-hp";

const hero = divisionHero({
  prefix: P,
  imageSlot: "hosts-promoters-hero",
  imageAlt:
    "An Impronta model reclining in an open black shirt and light jeans on a white studio backdrop.",
  eyebrowText: "Hosts & Promoters",
  line1: "The face of your brand,",
  line2: "fluent in the room.",
  sub: "Bilingual event hosts, hostesses, brand ambassadors and promotional teams for launches, activations and VIP events across Tulum, Playa del Carmen and the Riviera Maya.",
  primary: { label: "Staff an event", href: "/inquire" },
  secondary: { label: "Browse the roster", href: "/directory" },
});

const useCases = buildUseCaseGrid({
  prefix: P,
  eyebrowText: "What we staff",
  title: "From one host to a full activation team",
  leadText:
    "One person at a door or twenty across a brand village. The division scales to the event, with one coordinator and one invoice.",
  columns: 3,
  items: [
    {
      kicker: "Brand ambassadors",
      title: "Ambassadors and promotional teams",
      body: "Trained talent who learn your product, speak it convincingly in Spanish and English, and represent the brand the way your own team would. Sampling, lead capture and guest engagement included in the brief.",
    },
    {
      kicker: "Hosts & hostesses",
      title: "Event hosts and VIP hostesses",
      body: "Door, guest list, seating and table service presence for galas, hotel events and private dinners. Polished, punctual and briefed on your guest protocol before they arrive.",
    },
    {
      kicker: "MCs & stage",
      title: "MCs and stage hosts",
      body: "Bilingual masters of ceremony who hold a room, keep a program on time and switch languages mid-sentence when the audience needs it. Scripts reviewed with you in advance.",
    },
  ],
});

const occasions = linkRows({
  prefix: P,
  eyebrowText: "Where they work",
  title: "Built for the Riviera Maya event calendar",
  leadText:
    "The division staffs the events this coast actually runs, season after season.",
  rows: [
    "Product launches",
    "Beach club activations",
    "Hotel & resort openings",
    "Trade shows & expos",
    "Galas & corporate dinners",
    "Festival brand villages",
    "Yacht & villa events",
    "Retail & pop-up staffing",
    "Conference hospitality",
  ],
});

const editorial = editorialSplit({
  prefix: P,
  imageSlot: "hosts-promoters-editorial",
  imageAlt:
    "An Impronta model in a cream strapless dress, seated on a wooden chair against a warm studio backdrop.",
  eyebrowText: "The difference",
  line1: "Staff who show up",
  line2: "already briefed.",
  tagline:
    "The worst moment to meet your event staff is the morning of the event. Ours arrive knowing the brand, the run of show and the dress code.",
  body: "Every host and promoter in the division is interviewed by the agency, verified for language level and vetted on real events before joining the roster. Before your event we handle the briefing, wardrobe alignment, schedules and transport coordination, and a single agency coordinator stays reachable for the whole activation. If someone falls ill the night before, replacement is our problem, not yours.",
  listLabel: "Included in every staffing booking",
  bullets: [
    "Bilingual talent, language level verified by the agency",
    "Pre-event briefing, wardrobe and schedule coordination",
    "Backup cover and one coordinator on call throughout",
  ],
  flip: true,
});

const roster = divisionRosterSection({
  prefix: P,
  eyebrowText: "The roster",
  title: "Hosts and promoters on the roster",
  leadText:
    "A live view of the Hosts & Promoters division. Language, experience and availability are agency-verified.",
  talentTypeKeys: ["hosts-promo"],
  emptyStateText:
    "Host and promoter profiles appear here as talent join the roster. Send us your event brief and we will staff it directly.",
});

const crossLinks = divisionsCrossLinks(P, "hosts-promoters");

const closing = closingCta({
  prefix: P,
  eyebrowText: "Staff your event",
  line1: "One brief.",
  line2: "A team in place.",
  sub: "Tell us the date, venue, headcount and languages you need. A coordinator replies with a staffing plan and available talent within a day.",
  primary: { label: "Start a staffing inquiry", href: "/inquire" },
  secondary: { label: "Join as a host", href: "/register" },
});

const tree: BuilderNode[] = [
  hero,
  useCases,
  occasions,
  editorial,
  roster,
  crossLinks,
  closing,
];

export const hostsPromotersPage: DivisionPage = {
  slug: "hosts-promoters",
  title: "Hosts & Promoters",
  tree,
  seo: {
    meta_title:
      "Event Hosts, Hostesses & Brand Ambassadors in Tulum | Impronta",
    meta_description:
      "Bilingual event hosts, hostesses, MCs and brand ambassador teams for launches, activations and VIP events in Tulum, Playa del Carmen and the Riviera Maya. Agency-briefed and coordinated.",
    og_title: "Hosts & Promoters · Impronta, Tulum & Riviera Maya",
    og_description:
      "From one hostess to a full activation team. Bilingual, agency-briefed event staff with one coordinator and one invoice.",
    canonical_url: "/p/hosts-promoters",
    noindex: false,
    include_in_sitemap: true,
  },
  imageSlots: ["hosts-promoters-hero", "hosts-promoters-editorial"],
};
