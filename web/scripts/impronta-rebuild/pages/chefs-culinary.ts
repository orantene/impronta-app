/**
 * chefs-culinary — division landing page (Impronta rebuild, W4b).
 *
 * Section flow: full-bleed hero → use-case grid (private dining / events &
 * catering / brand & content) → editorial split (menu to brief) → full-bleed
 * plate (statement) → LIVE ROSTER (directory embed scoped to Chefs &
 * Culinary) → cross-division links → closing inquiry CTA. Taste-and-table
 * language: menus, sourcing and service, not castings or stages.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  closingCta,
  divisionHero,
  divisionRosterSection,
  divisionsCrossLinks,
  editorialSplit,
  fullBleedPlate,
  useCaseGrid,
  type DivisionPage,
} from "../shared-divisions";

const P = "div-ch";

const hero = divisionHero({
  prefix: P,
  imageSlot: "chefs-culinary-hero",
  imageAlt:
    "Private chef plating a tasting course at a candlelit villa dinner table in Tulum.",
  eyebrowText: "Chefs & Culinary",
  line1: "Dinner is",
  line2: "the destination.",
  sub: "Private chefs, mixologists and full culinary teams for villas, events and brand productions across Tulum and the Riviera Maya. Menus written to your brief, service coordinated by the agency.",
  primary: { label: "Book a chef", href: "/inquire" },
  secondary: { label: "Browse the roster", href: "/directory" },
});

const useCases = useCaseGrid({
  prefix: P,
  eyebrowText: "What we serve",
  title: "Three tables, one standard",
  leadText:
    "From a villa dinner for eight to a wedding for two hundred, the division builds the menu, the team and the service plan.",
  columns: 3,
  items: [
    {
      kicker: "Private dining",
      title: "Villa dinners and tasting menus",
      body: "A private chef in your villa kitchen, cooking a menu written for your table. Local sourcing from Yucatecan markets and fishermen, dietary requirements handled in advance, and the kitchen left spotless.",
    },
    {
      kicker: "Events & catering",
      title: "Weddings and event catering",
      body: "Full culinary teams for jungle weddings, beach dinners and corporate retreats: chefs, sous chefs, service staff and mixologists under one coordinator, with menus scaled to headcount and venue logistics.",
    },
    {
      kicker: "Brand & content",
      title: "Brand productions and food styling",
      body: "Chefs and mixologists for hotel menu development, product launches and content shoots. Camera-ready plating, repeatable builds for multiple takes, and talent comfortable presenting on camera.",
    },
  ],
});

const editorial = editorialSplit({
  prefix: P,
  imageSlot: "chefs-culinary-editorial",
  imageAlt:
    "Chef at a market stall selecting fresh produce, woven baskets of chiles and herbs in the foreground.",
  eyebrowText: "Menu to brief",
  line1: "The menu is written",
  line2: "for your table.",
  tagline:
    "A great private dinner starts days before the first course, at the market, in the menu draft, in the questions we ask about your guests.",
  body: "Every chef and mixologist in the division has cooked for the agency before cooking for a client. When you book, we collect the brief: guest count, dietary needs, the occasion and the mood, then the chef drafts a menu for your approval before anything is purchased. Sourcing leans local, from Yucatecan producers and the morning catch, and the agency coordinates kitchen access, equipment, staffing and timing with your villa or venue so service runs like a restaurant that happens to be your terrace.",
  listLabel: "Every booking includes",
  bullets: [
    "A menu drafted to your brief and approved before purchase",
    "Dietary requirements and sourcing confirmed in advance",
    "Kitchen logistics and service staffing coordinated by the agency",
  ],
});

const plate = fullBleedPlate({
  prefix: P,
  imageSlot: "chefs-culinary-plate",
  imageAlt:
    "Long dinner table set on the sand at dusk, lanterns lit, courses being served to guests.",
  numeral: "IV.",
  line: "The best restaurant in Tulum tonight is your table.",
});

const roster = divisionRosterSection({
  prefix: P,
  eyebrowText: "The roster",
  title: "Chefs and culinary talent represented",
  leadText:
    "A live view of the Chefs & Culinary division. Cuisines, formats and availability are agency-verified.",
  talentTypeKeys: ["chefs-culinary"],
  emptyStateText:
    "Chef profiles appear here as culinary talent join the roster. Tell us about your table and we will propose chefs directly.",
});

const crossLinks = divisionsCrossLinks(P, "chefs-culinary");

const closing = closingCta({
  prefix: P,
  eyebrowText: "Set the table",
  line1: "Describe the dinner.",
  line2: "We bring the kitchen.",
  sub: "Share your date, guest count and the occasion. A coordinator replies with chef options, sample menus and a clear quote.",
  primary: { label: "Start a culinary inquiry", href: "/inquire" },
  secondary: { label: "Join as culinary talent", href: "/register" },
});

const tree: BuilderNode[] = [
  hero,
  useCases,
  editorial,
  plate,
  roster,
  crossLinks,
  closing,
];

export const chefsCulinaryPage: DivisionPage = {
  slug: "chefs-culinary",
  title: "Chefs & Culinary",
  tree,
  seo: {
    meta_title:
      "Private Chefs & Culinary Talent in Tulum & Riviera Maya | Impronta",
    meta_description:
      "Book private chefs, mixologists and full culinary teams for villa dinners, weddings and brand productions in Tulum and the Riviera Maya. Menus written to your brief, service coordinated by Impronta.",
    og_title: "Chefs & Culinary — Impronta, Tulum & Riviera Maya",
    og_description:
      "Private chefs, mixologists and culinary teams. Menus to brief, local sourcing, agency-coordinated service.",
    canonical_url: "/p/chefs-culinary",
    noindex: false,
    include_in_sitemap: true,
  },
  imageSlots: [
    "chefs-culinary-hero",
    "chefs-culinary-editorial",
    "chefs-culinary-plate",
  ],
};
