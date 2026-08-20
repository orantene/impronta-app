/**
 * music-djs — division landing page (Impronta rebuild, W4b).
 *
 * Section flow: full-bleed hero → editorial split (sound to brief, flipped) →
 * occasion link rows (venues & occasions) → stats band (booking mechanics) →
 * LIVE ROSTER (directory embed scoped to Music & DJs) → full-bleed plate →
 * cross-division links → closing inquiry CTA. Venue-fluent, sound-first
 * language: a DJ booking page, not a casting page.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  closingCta,
  divisionHero,
  divisionRosterSection,
  divisionsCrossLinks,
  editorialSplit,
  fullBleedPlate,
  linkRows,
  statBand,
  type DivisionPage,
} from "../shared-divisions";

const P = "div-dj";

const hero = divisionHero({
  prefix: P,
  imageSlot: "music-djs-hero",
  imageAlt:
    "An Impronta model with dark curly hair reclining in an open white shirt and light jeans on a white studio backdrop.",
  eyebrowText: "Music & DJs",
  line1: "The night has",
  line2: "a soundtrack.",
  sub: "Resident-caliber DJs, live musicians and hybrid sets for beach clubs, hotels, villas, weddings and brand events across Tulum and the Riviera Maya, booked and coordinated by the agency.",
  primary: { label: "Book the sound", href: "/inquire" },
  secondary: { label: "Browse the roster", href: "/directory" },
});

const editorial = editorialSplit({
  prefix: P,
  imageSlot: "music-djs-editorial",
  imageAlt:
    "An Impronta model in a white tank top and light jeans, lying on her side against a white studio backdrop.",
  eyebrowText: "Sound to brief",
  line1: "Not a playlist.",
  line2: "A set built for your room.",
  tagline:
    "The right DJ reads a terrace at sunset differently from a dance floor at one in the morning. That reading is what you are booking.",
  body: "Every artist in the division has been heard live by the agency before joining the roster. When you book, we match the artist to your crowd, venue and hour, agree the musical direction with you in advance, and coordinate the practical side: equipment and booth requirements, set times, sound limits and local curfews that Tulum venues actually enforce. Live percussion, sax or vocals can be layered over a set for the moments that deserve a lift.",
  listLabel: "Every booking includes",
  bullets: [
    "Artists heard live by the agency before they reach the roster",
    "Musical direction agreed to your brief before the event",
    "Equipment, set times and venue sound limits coordinated for you",
  ],
  flip: true,
});

const occasions = linkRows({
  prefix: P,
  eyebrowText: "Rooms we play",
  title: "From sunset terraces to late floors",
  leadText:
    "The division covers the settings where music decides whether the event works.",
  rows: [
    "Beach club residencies",
    "Hotel & rooftop sunsets",
    "Villa & yacht parties",
    "Wedding ceremonies & receptions",
    "Brand events & launches",
    "Dinner & lounge sets",
    "Festival side stages",
    "Live + DJ hybrid shows",
    "Corporate & gala evenings",
  ],
});

const proof = statBand({
  prefix: P,
  eyebrowText: "Booking mechanics",
  cells: [
    { value: "<24h", label: "First reply" },
    { value: "1", label: "Coordinator per event" },
    { value: "100%", label: "Sets agreed to brief" },
  ],
});

const roster = divisionRosterSection({
  prefix: P,
  eyebrowText: "The roster",
  title: "DJs and musicians on the roster",
  leadText:
    "A live view of the Music & DJs division. Styles, formats and availability are agency-verified.",
  talentTypeKeys: ["music-djs"],
  emptyStateText:
    "Artist profiles appear here as musicians join the roster. Tell us the room and the hour and we will propose artists directly.",
});

const plate = fullBleedPlate({
  prefix: P,
  imageSlot: "music-djs-plate",
  imageAlt:
    "Smiling studio portrait of an Impronta model in a black top and choker, against a warm tan backdrop.",
  numeral: "III.",
  line: "People forget the lineup. They remember how the night felt.",
});

const crossLinks = divisionsCrossLinks(P, "music-djs");

const closing = closingCta({
  prefix: P,
  eyebrowText: "Set the tone",
  line1: "Tell us the room.",
  line2: "We bring the sound.",
  sub: "Share the venue, the date and the energy you want. A coordinator replies with matched artists, formats and a clear quote.",
  primary: { label: "Start a booking inquiry", href: "/inquire" },
  secondary: { label: "Join as an artist", href: "/register" },
});

const tree: BuilderNode[] = [
  hero,
  editorial,
  occasions,
  proof,
  roster,
  plate,
  crossLinks,
  closing,
];

export const musicDjsPage: DivisionPage = {
  slug: "music-djs",
  title: "Music & DJs",
  tree,
  seo: {
    meta_title: "DJs & Live Music in Tulum & Riviera Maya | Impronta",
    meta_description:
      "Book resident-caliber DJs, live musicians and hybrid sets for beach clubs, villas, weddings and brand events in Tulum and the Riviera Maya. Sets matched to your brief, logistics handled by the agency.",
    og_title: "Music & DJs · Impronta, Tulum & Riviera Maya",
    og_description:
      "Resident-caliber DJs and live musicians, matched to your room and coordinated end to end.",
    canonical_url: "/p/music-djs",
    noindex: false,
    include_in_sitemap: true,
  },
  imageSlots: ["music-djs-hero", "music-djs-editorial", "music-djs-plate"],
};
