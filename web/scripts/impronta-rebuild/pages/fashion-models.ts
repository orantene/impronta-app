/**
 * fashion-models — division landing page (Impronta rebuild, W4b).
 *
 * NOTE: slugged `fashion-models`, not `models` — /models is a reserved
 * platform route.
 *
 * Section flow: full-bleed hero → editorial split (the board standard) →
 * use-case grid (campaigns / e-commerce / runway) → stats band → LIVE ROSTER
 * (directory embed scoped to the Models division) → full-bleed plate →
 * cross-division links → closing inquiry CTA.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  closingCta,
  divisionHero,
  divisionRosterSection,
  divisionsCrossLinks,
  editorialSplit,
  fullBleedPlate,
  statBand,
  buildUseCaseGrid,
  type DivisionPage,
} from "../shared-divisions";

const P = "div-fm";

const hero = divisionHero({
  prefix: P,
  imageSlot: "fashion-models-hero",
  imageAlt:
    "Editorial fashion model in resortwear photographed at golden hour on a Tulum beach.",
  eyebrowText: "The Models Division",
  line1: "Faces that carry",
  line2: "the campaign.",
  sub: "Editorial, commercial and runway models based in Tulum and Playa del Carmen, cast to your brief and coordinated by the agency from first option to final usage.",
  primary: { label: "Book models", href: "/inquire" },
  secondary: { label: "See the board", href: "/directory" },
});

const editorial = editorialSplit({
  prefix: P,
  imageSlot: "fashion-models-editorial",
  imageAlt:
    "Black-and-white studio portrait of a represented Impronta model against a dark backdrop.",
  eyebrowText: "The board standard",
  line1: "Editorial polish.",
  line2: "Commercial reliability.",
  tagline:
    "A face that photographs beautifully is the start. A model who arrives prepared, on time and on brief is the standard.",
  body: "Every model on the Impronta board has been met, measured and reviewed by the agency before a client ever sees them. Digitals are current, measurements are accurate, and availability is confirmed before we send options. Whether you are shooting a swim campaign at a beach club, a lookbook in a jungle villa or e-commerce in studio, we shortlist from talent we actually know, brief them on your production, and stay reachable through the shoot day.",
  listLabel: "Every option comes with",
  bullets: [
    "Current digitals and accurate measurements",
    "Availability confirmed before you shortlist",
    "Rates, usage and releases agreed through the agency",
  ],
});

const useCases = buildUseCaseGrid({
  prefix: P,
  eyebrowText: "What clients book",
  title: "One board, three kinds of production",
  leadText:
    "The Riviera Maya is a working location, not just a backdrop. These are the productions our models are booked for most.",
  columns: 3,
  items: [
    {
      kicker: "Campaign & editorial",
      title: "Brand campaigns and editorial stories",
      body: "Swim, resortwear and lifestyle campaigns shot on the beaches, cenotes and haciendas of the Riviera Maya. We cast to your creative direction and coordinate fittings, call sheets and usage so the production stays on schedule.",
    },
    {
      kicker: "E-commerce & lookbook",
      title: "E-commerce, lookbook and content days",
      body: "High-volume shoot days need models who hold energy from the first look to the fortieth. We place experienced e-commerce models who know the rhythm, plus size-accurate fits confirmed before the day.",
    },
    {
      kicker: "Runway & showroom",
      title: "Runway, showroom and fit work",
      body: "Resort shows, hotel fashion events and designer showrooms across Tulum and Playa del Carmen. Walk experience is verified, and we staff full lineups with one point of contact instead of twelve.",
    },
  ],
});

const proof = statBand({
  prefix: P,
  eyebrowText: "How the division works",
  cells: [
    { value: "1", label: "Brief to start" },
    { value: "<24h", label: "First reply" },
    { value: "100%", label: "Agency-managed" },
    { value: "0", label: "Casting fees for clients" },
  ],
});

const roster = divisionRosterSection({
  prefix: P,
  eyebrowText: "The board",
  title: "Models currently represented",
  leadText:
    "A live view of the Models division. Every profile is agency-verified, with confirmed availability behind it.",
  talentTypeKeys: ["models"],
  emptyStateText:
    "Model profiles appear here as talent join the board. Send us your brief and we will shortlist directly.",
});

const plate = fullBleedPlate({
  prefix: P,
  imageSlot: "fashion-models-plate",
  imageAlt:
    "Model walking away from camera along the shoreline at dusk, dress moving in the wind.",
  numeral: "I.",
  line: "She is not a search result. She is represented.",
});

const crossLinks = divisionsCrossLinks(P, "fashion-models");

const closing = closingCta({
  prefix: P,
  eyebrowText: "Cast from the board",
  line1: "Tell us the look.",
  line2: "We send the faces.",
  sub: "Share your dates, market and creative direction. A coordinator replies with a tailored shortlist, availability already confirmed.",
  primary: { label: "Start a casting inquiry", href: "/inquire" },
  secondary: { label: "Apply as a model", href: "/register" },
});

const tree: BuilderNode[] = [
  hero,
  editorial,
  useCases,
  proof,
  roster,
  plate,
  crossLinks,
  closing,
];

export const fashionModelsPage: DivisionPage = {
  slug: "fashion-models",
  title: "Fashion Models",
  tree,
  seo: {
    meta_title: "Fashion Models in Tulum & Riviera Maya | Impronta",
    meta_description:
      "Book editorial, commercial and runway models in Tulum and Playa del Carmen. Agency-verified profiles, confirmed availability and full booking coordination by Impronta.",
    og_title: "Fashion Models · Impronta, Tulum & Riviera Maya",
    og_description:
      "Editorial, commercial and runway models cast to your brief. Agency-managed from first option to final usage.",
    canonical_url: "/p/fashion-models",
    noindex: false,
    include_in_sitemap: true,
  },
  imageSlots: [
    "fashion-models-hero",
    "fashion-models-editorial",
    "fashion-models-plate",
  ],
};
