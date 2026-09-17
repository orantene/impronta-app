/**
 * Impronta — THE SHOW (`/p/show`).
 *
 * 2026-09-17 rewrite. The page used to announce a show in production and
 * collect casting. Per the owner (2026-09-17) the production is finished —
 * scenography, wardrobe, dancers, acrobats, choreography and rehearsals are
 * done, and the show is being recorded on Sunday 2026-09-21 — and a new
 * phase starts: SELLING it to hotels, resorts, beach clubs, casinos,
 * restaurants and venues. So the page is now a sales page for venues first,
 * with casting kept as a smaller standing section.
 *
 * HERO IMAGE. The earlier page deliberately ran without a photograph because
 * the library had no stage frame. It now uses a generated stage image from
 * the Lifestyle folder (see `generate-offer-imagery.ts`) as a stand-in until
 * the Sunday recording produces real stills; `pageHero` also accepts a
 * `videoUrl` (YouTube) for the showreel the moment it exists.
 *
 * INQUIRY-FIRST. "Bring the show to my venue" lands on the venue form on
 * this page with the venue type preselected; the inquiry reaches the inbox
 * naming the venue type, and the quote, rider and date are agreed in the
 * thread.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { divisionRosterSection } from "../shared-divisions";
import { offerCard, showVenueHref } from "../shared-offers";
import {
  band,
  centerHead,
  closingCta,
  copy,
  eyebrow,
  featureCard,
  grid,
  headingLine,
  leadForm,
  pageHero,
  processStep,
  statCell,
  type ImprontaRebuildPage,
} from "../shared";

export const SHOW_VENUE_TYPES = [
  "Hotel / resort",
  "Beach club",
  "Restaurant / bar",
  "Casino",
  "Nightclub",
  "Private event / wedding",
  "Other",
] as const;

const hero = pageHero("rb-show", {
  eyebrowText: "Now booking · Riviera Maya",
  line1: "One show.",
  line2: "Your stage.",
  sub: "Show Impronta is a complete live production for hotels, resorts, beach clubs, casinos and restaurants: original scenography, wardrobe, dancers, acrobats and choreography, rehearsed as one company and delivered as one booking.",
  primary: { label: "Bring the show to my venue", href: "#rb-show-venue" },
  secondary: { label: "See what is included", href: "#rb-show-what" },
  footnote: "Production complete · showreel arriving soon · season dates now open",
  imageSlot: "show-hero",
  imageAlt: "Dancers and an acrobat in silhouette under gold stage light at a resort show.",
});

const what = band(
  "rb-show-what",
  [
    centerHead(
      "rb-show-what",
      "What is included",
      "A finished production, not a list of acts",
      "Venues usually book entertainment act by act and then spend the season coordinating it. Show Impronta arrives as one piece: built, dressed, cast and rehearsed by the agency.",
    ),
    grid(
      "rb-show-what-grid",
      3,
      [
        offerCard("rb-show-inc-scenography", {
          imageSlot: "show-scenography",
          imageAlt: "A theatrical stage set under warm spotlights.",
          chip: "Included",
          title: "Original scenography",
          price: "Designed and built by Impronta",
          text: "A set created for the show, sized to travel and to fit a hotel stage, a beach club deck or a restaurant floor.",
          cta: { label: "Ask about staging", href: showVenueHref("Hotel / resort") },
        }),
        offerCard("rb-show-inc-dancers", {
          imageSlot: "show-dancers",
          imageAlt: "Dancers in costume mid-movement during a rehearsal.",
          chip: "Included",
          title: "Dancers, wardrobe and choreography",
          price: "Cast from the Impronta roster",
          text: "A company of dancers already represented and vetted by the agency, in original costumes, performing choreography built for this show and rehearsed together.",
          cta: { label: "See the performers", href: "#rb-show-roster" },
        }),
        offerCard("rb-show-inc-acrobats", {
          imageSlot: "show-acrobats",
          imageAlt: "An aerial acrobat on silks in silhouette against gold stage light.",
          chip: "Included",
          title: "Acrobats and full production",
          price: "One booking, one point of contact",
          text: "Acrobatic acts, music, run of show and the production behind it. Your team confirms a date; the agency delivers the night.",
          cta: { label: "Request a quote", href: showVenueHref("Hotel / resort") },
        }),
      ],
      { layerLabel: "What is included", mobileColumns: 1 },
    ),
  ],
  { borderTop: true, layerLabel: "What is included" },
);

const formats = band(
  "rb-show-formats",
  [
    centerHead(
      "rb-show-formats",
      "Formats",
      "Built for the room you have",
      "The same production, run the way your venue programs entertainment.",
    ),
    grid(
      "rb-show-formats-grid",
      4,
      [
        featureCard(
          "rb-show-fmt-resident",
          "Resident show",
          "A weekly or nightly slot through the season. Guests plan their stay around it; your team plans nothing.",
          { label: "Book a residency", href: showVenueHref("Hotel / resort") },
        ),
        featureCard(
          "rb-show-fmt-special",
          "Special nights",
          "New Year, holiday weekends, brand dinners, anniversaries: one night, full production.",
          { label: "Hold a night", href: showVenueHref("Hotel / resort") },
        ),
        featureCard(
          "rb-show-fmt-venue",
          "Clubs, casinos and restaurants",
          "Floor shows and themed evenings paced for a room that eats, drinks and plays while it watches.",
          { label: "Plan a themed night", href: showVenueHref("Restaurant / bar") },
        ),
        featureCard(
          "rb-show-fmt-guest",
          "Guest activations",
          "Welcome moments, pool and beach interventions, dinner interludes: the company where your guests already are.",
          { label: "Ask about activations", href: showVenueHref("Beach club") },
        ),
      ],
      { layerLabel: "Formats", mobileColumns: 1 },
    ),
  ],
  { layerLabel: "Formats" },
);

const numbers = band(
  "rb-show-numbers",
  [
    {
      id: "rb-show-numbers-grid",
      kind: "container",
      props: {
        layout: "grid",
        columns: 4,
        gap: "m",
        layerLabel: "Show in numbers",
        responsive: { tablet: { columns: 2 }, mobile: { columns: 2 } },
        style: { width: "100%", maxWidthFree: "100%" },
      },
      children: [
        statCell("rb-show-stat-1", "1", "Booking, one contact", false),
        statCell("rb-show-stat-2", "0", "Acts for your team to coordinate", true),
        statCell("rb-show-stat-3", "Ready", "Set, wardrobe and rehearsals done", true),
        statCell("rb-show-stat-4", "<24h", "First reply to a venue", true),
      ],
    },
  ],
  { borderTop: true, layerLabel: "In numbers", paddingY: { desktop: "56px", mobile: "32px" } },
);

const howItWorks = band(
  "rb-show-process",
  [
    centerHead(
      "rb-show-process",
      "For venues",
      "How a venue books it",
      "Four steps from a message to a full house.",
    ),
    grid(
      "rb-show-process-grid",
      4,
      [
        processStep("rb-show-step-1", "01", "Tell us your venue", "Your stage or space, your season, and the nights you would run it."),
        processStep("rb-show-step-2", "02", "We send the rider and the quote", "Space, power, rigging and timing confirmed against the show, with a clear price for your format."),
        processStep("rb-show-step-3", "03", "Hold your dates", "Dates are confirmed in the order they are agreed, before the season fills."),
        processStep("rb-show-step-4", "04", "The company arrives ready", "Cast, rehearsed and teched. Your team runs the night, not the artists."),
      ],
      { layerLabel: "How a venue books it" },
    ),
  ],
  { borderTop: true, layerLabel: "For venues" },
);

const venue = band(
  "rb-show-venue",
  [
    {
      id: "rb-show-venue-inner",
      kind: "container",
      props: {
        layout: "stack",
        align: "center",
        layerLabel: "Venue inquiry",
        style: { width: "100%", maxWidthFree: "720px", marginLeftFree: "auto", marginRightFree: "auto", gap: "0px" },
      },
      children: [
        eyebrow("rb-show-venue-eyebrow", "Book the show"),
        headingLine("rb-show-venue-title", "Bring it to your venue.", { align: "center", layerLabel: "Venue form title" }),
        copy(
          "rb-show-venue-lead",
          "Tell us where and when. A coordinator replies personally with the technical rider, a quote for your format and the dates still open this season.",
          { align: "center", maxWidth: "620px", marginTop: "16px" },
        ),
        leadForm(
          "rb-show-venue-form",
          [
            { id: "rb-show-v-name", name: "name", type: "text", label: "Your name", placeholder: "Name and role", required: true },
            { id: "rb-show-v-venue", name: "venue_name", type: "text", label: "Venue", placeholder: "Hotel, club or restaurant name", required: true },
            { id: "rb-show-v-email", name: "email", type: "email", label: "Email", placeholder: "you@venue.com", required: true },
            { id: "rb-show-v-phone", name: "phone", type: "tel", label: "Phone or WhatsApp", placeholder: "+52 ...", required: true },
            {
              id: "rb-show-v-type",
              name: "venue_type",
              type: "select",
              label: "Type of venue",
              placeholder: "Choose one",
              required: true,
              options: [...SHOW_VENUE_TYPES],
            },
            { id: "rb-show-v-dates", name: "dates", type: "text", label: "When would you run it?", placeholder: "e.g. every Friday from December, or New Year's Eve", required: true },
            { id: "rb-show-v-message", name: "message", type: "textarea", label: "Your stage and your audience", placeholder: "Stage or space, approximate capacity, and anything you already know you want." },
            { id: "rb-show-v-submit", name: "submit", type: "submit", label: "Request the rider and quote" },
          ],
          { layerLabel: "Venue form", maxWidth: "620px" },
        ),
        copy(
          "rb-show-venue-footnote",
          "No commitment · reply within 24 hours · quote and rider before you hold a date",
          { align: "center", size: "small", marginTop: "14px", layerLabel: "Reassurance" },
        ),
      ],
    },
  ],
  { borderTop: true, glow: true, layerLabel: "Book the show" },
);

const roster = divisionRosterSection({
  prefix: "rb-show",
  eyebrowText: "The company",
  title: "Performers on the roster",
  leadText:
    "A live view of the Performers division: the dancers, acrobats and artists the show is cast from.",
  talentTypeKeys: ["performers"],
  emptyStateText:
    "Performer profiles appear here as acts join the roster.",
});
// "See the performers" on the dancers card lands here.
roster.anchorId = "rb-show-roster";

const casting = band(
  "rb-show-casting",
  [
    {
      id: "rb-show-casting-inner",
      kind: "container",
      props: {
        layout: "stack",
        align: "center",
        layerLabel: "Casting",
        style: { width: "100%", maxWidthFree: "720px", marginLeftFree: "auto", marginRightFree: "auto", gap: "0px" },
      },
      children: [
        eyebrow("rb-show-casting-eyebrow", "Casting"),
        headingLine("rb-show-casting-title", "Casting stays open.", {
          align: "center",
          layerLabel: "Casting title",
        }),
        copy(
          "rb-show-casting-lead",
          "Dancers, performers, aerialists, hosts and musicians: as the show books more dates we cast more roles. Tell us what you do and we come back to you. Representation with Impronta is not required to be seen.",
          { align: "center", maxWidth: "620px", marginTop: "16px" },
        ),
        leadForm(
          "rb-show-casting-form",
          [
            { id: "rb-show-f-name", name: "name", type: "text", label: "Name", placeholder: "Your name", required: true },
            { id: "rb-show-f-email", name: "email", type: "email", label: "Email", placeholder: "you@email.com", required: true },
            { id: "rb-show-f-phone", name: "phone", type: "tel", label: "Phone or WhatsApp", placeholder: "+52 ...", required: true },
            { id: "rb-show-f-discipline", name: "discipline", type: "text", label: "What do you do?", placeholder: "e.g. contemporary dancer, aerial hoop, live vocals", required: true },
            { id: "rb-show-f-message", name: "message", type: "textarea", label: "Experience and links", placeholder: "Where you have performed, and a link to video or photos if you have one.", required: true },
            { id: "rb-show-f-submit", name: "submit", type: "submit", label: "Send my details" },
          ],
          { layerLabel: "Casting form", maxWidth: "620px" },
        ),
        copy(
          "rb-show-casting-footnote",
          "No fee to register · we reply to everyone we can use · your details stay with the agency",
          { align: "center", size: "small", marginTop: "14px", layerLabel: "Reassurance" },
        ),
      ],
    },
  ],
  { borderTop: true, layerLabel: "Casting" },
);

const closing = closingCta("rb-show-closing", {
  eyebrowText: "For hotels, resorts and venues",
  line1: "Want it for",
  line2: "your season?",
  sub: "Tell us your venue and the nights you would run it. A coordinator replies personally with the rider, the quote and what is still open.",
  primary: { label: "Bring the show to my venue", href: "#rb-show-venue" },
  secondary: { label: "Talk to the agency", href: "/p/contact" },
});

const tree: BuilderNode[] = [hero, what, formats, numbers, howItWorks, venue, roster, casting, closing];

export const showPage: ImprontaRebuildPage = {
  slug: "show",
  title: "The Show | Impronta",
  seo: {
    meta_title: "Show Impronta | Live Show for Hotels, Resorts & Venues, Riviera Maya",
    meta_description:
      "A complete live show for hotels, resorts, beach clubs, casinos and restaurants on the Riviera Maya: scenography, wardrobe, dancers, acrobats and choreography as one booking. Request the rider and a quote.",
    og_title: "Show Impronta | Live entertainment for hotels and venues, Riviera Maya",
    og_description:
      "One show, your stage. A finished live production cast from the Impronta roster, ready to run at your hotel, club or restaurant. Season dates now open.",
    canonical_url: "/p/show",
    // The show is now being sold: it belongs in the index and the sitemap.
    noindex: false,
    include_in_sitemap: true,
  } as ImprontaRebuildPage["seo"],
  tree,
};
