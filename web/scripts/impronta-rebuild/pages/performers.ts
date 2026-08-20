/**
 * performers — division landing page (Impronta rebuild, W4b).
 *
 * Section flow: full-bleed hero → full-bleed plate EARLY (statement, sets the
 * theatrical register) → use-case grid (show acts / ambient & roaming /
 * ceremony) → editorial split (production-minded: riders, insurance, site
 * checks) → LIVE ROSTER (directory embed scoped to Performers) →
 * cross-division links → closing inquiry CTA. The early plate and
 * production-logistics emphasis distinguish it from the staffing-led hosts
 * page and the casting-led models page.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  closingCta,
  divisionHero,
  divisionRosterSection,
  divisionsCrossLinks,
  editorialSplit,
  fullBleedPlate,
  buildUseCaseGrid,
  type DivisionPage,
} from "../shared-divisions";

const P = "div-pf";

const hero = divisionHero({
  prefix: P,
  imageSlot: "performers-hero",
  imageAlt:
    "An Impronta model in a burgundy dress, seated on the floor of the agency studio against a white backdrop.",
  eyebrowText: "The Performers Division",
  line1: "Moments your guests",
  line2: "talk about for years.",
  sub: "Fire and LED acts, aerialists, dancers and character performers for weddings, beach clubs, hotels and brand events across Tulum and the Riviera Maya, produced and coordinated by the agency.",
  primary: { label: "Book a performance", href: "/inquire" },
  secondary: { label: "Browse the roster", href: "/directory" },
});

const plate = fullBleedPlate({
  prefix: P,
  imageSlot: "performers-plate",
  imageAlt:
    "An Impronta model seated on a stool in a black top and shorts, photographed against a white studio backdrop.",
  numeral: "II.",
  line: "A show is not an add-on. It is the part of the night people remember.",
});

const useCases = buildUseCaseGrid({
  prefix: P,
  eyebrowText: "What we produce",
  title: "Three ways to hold a room",
  leadText:
    "From a headline show block to a presence that moves through the crowd, the division builds entertainment around your run of show.",
  columns: 3,
  items: [
    {
      kicker: "Show acts",
      title: "Headline show blocks",
      body: "Fire, LED and aerial acts choreographed as a featured moment in the program. We plan the stage, rigging and safety envelope with your venue so the show lands exactly where the night peaks.",
    },
    {
      kicker: "Ambient & roaming",
      title: "Ambient and roaming performance",
      body: "Stilt walkers, living statues, character acts and dancers who move through the event rather than stopping it. Ideal for beach club days, brand villages and cocktail hours that need energy without a stage.",
    },
    {
      kicker: "Ceremony & weddings",
      title: "Ceremony and wedding moments",
      body: "Entrance dancers, first-dance choreography, cenote and jungle ceremony performers. We work from your planner's timeline and rehearse to the minute, in a setting where a second take does not exist.",
    },
  ],
});

const editorial = editorialSplit({
  prefix: P,
  imageSlot: "performers-editorial",
  imageAlt:
    "An Impronta model in a black lace top with both hands behind her head, against a warm brown studio backdrop.",
  eyebrowText: "Production-minded",
  line1: "Great shows are",
  line2: "planned, not improvised.",
  tagline:
    "Anyone can send a performer. We deliver a performance: teched, timed and safe for your venue.",
  body: "Every act in the division is reviewed live by the agency before it is offered to a client. For each booking we confirm the technical rider, power and space requirements, and the safety plan, including fire permissions where venues require them. Your event gets a single coordinator who advances the show with the venue, schedules soundchecks and holds the timeline, so your production team is never chasing an artist an hour before doors.",
  listLabel: "Every booking includes",
  bullets: [
    "Acts reviewed live by the agency before they reach a client",
    "Technical rider, space and safety requirements advanced with the venue",
    "One coordinator holding the show timeline on the day",
  ],
});

const roster = divisionRosterSection({
  prefix: P,
  eyebrowText: "The roster",
  title: "Performers currently represented",
  leadText:
    "A live view of the Performers division. Acts, disciplines and availability are agency-verified.",
  talentTypeKeys: ["performers"],
  emptyStateText:
    "Performer profiles appear here as acts join the roster. Tell us the moment you are planning and we will propose acts directly.",
});

const crossLinks = divisionsCrossLinks(P, "performers");

const closing = closingCta({
  prefix: P,
  eyebrowText: "Plan the moment",
  line1: "Describe the night.",
  line2: "We stage the show.",
  sub: "Share your date, venue and the moment you want to create. A coordinator replies with acts, staging needs and a clear quote.",
  primary: { label: "Start a performance inquiry", href: "/inquire" },
  secondary: { label: "Apply as a performer", href: "/register" },
});

const tree: BuilderNode[] = [
  hero,
  plate,
  useCases,
  editorial,
  roster,
  crossLinks,
  closing,
];

export const performersPage: DivisionPage = {
  slug: "performers",
  title: "Performers",
  tree,
  seo: {
    meta_title:
      "Performers & Entertainment in Tulum & Riviera Maya | Impronta",
    meta_description:
      "Fire and LED shows, aerialists, dancers and character acts for weddings, beach clubs and brand events in Tulum and the Riviera Maya. Agency-produced with riders, safety and timelines handled.",
    og_title: "Performers · Impronta, Tulum & Riviera Maya",
    og_description:
      "Headline show blocks, roaming acts and ceremony moments, produced and coordinated by the agency.",
    canonical_url: "/p/performers",
    noindex: false,
    include_in_sitemap: true,
  },
  imageSlots: ["performers-hero", "performers-plate", "performers-editorial"],
};
