/**
 * Impronta rebuild — THE SHOW (`/p/show`).
 *
 * Alejandra is building a show to sell to Riviera Maya resorts. This page is
 * the announcement and the intake: what the show is, who it is for, and a
 * casting form for the performers who want to be in it.
 *
 * TWO DELIBERATE ABSENCES, both for the same reason.
 *
 * The hero has NO photograph. Every image in this tenant's library is a studio
 * portrait on seamless — there is no stage, no audience, no production frame.
 * A page that opens "the show is coming" over a studio headshot undersells the
 * show and mis-describes the picture. The gradient hero is the honest and, at
 * this stage, the stronger of the two: a coming-soon announcement is allowed to
 * be typographic.
 *
 * The gallery underneath is the LIVE PERFORMERS ROSTER rather than placeholder
 * tiles. Placeholder tiles resolve to whatever the fallback picks, which would
 * put unrelated portraits under a heading promising show photography. The
 * roster is true today — these are the acts a resort would be buying — and the
 * page is freeform, so production stills can replace it in the builder the day
 * they exist.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { divisionRosterSection } from "../shared-divisions";
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
  type ImprontaRebuildPage,
} from "../shared";

const hero = pageHero("rb-show", {
  eyebrowText: "Coming soon",
  line1: "A show built for",
  line2: "the Riviera Maya.",
  sub: "Impronta is producing an original stage show for resorts, beach clubs and hotels along the coast: one production, cast and rehearsed by the agency, that arrives ready to run on your stage.",
  primary: { label: "Register your interest", href: "#rb-show-casting" },
  secondary: { label: "Talk to the agency", href: "/p/contact" },
  footnote: "In production · casting open to performers now",
});

const what = band(
  "rb-show-what",
  [
    centerHead(
      "rb-show-what",
      "The production",
      "One show, cast and rehearsed as a company",
      "Resorts book entertainment act by act and then spend the season coordinating it. This is the other way round: a single production, cast from the agency roster, rehearsed together, and delivered as one booking with one point of contact.",
    ),
    grid(
      "rb-show-what-grid",
      3,
      [
        featureCard(
          "rb-show-what-1",
          "Built as one piece",
          "Not a bill of separate acts sharing a stage. The show is choreographed and paced as a single evening, so it holds a room from the first cue to the last.",
        ),
        featureCard(
          "rb-show-what-2",
          "Cast from the roster",
          "Dancers, performers and hosts already represented and already vetted by Impronta. The people on your stage are people the agency answers for.",
        ),
        featureCard(
          "rb-show-what-3",
          "One booking, one contact",
          "Cast, rehearsal, staging needs and the run of show come through the agency. Your team confirms a date, not a dozen artists.",
        ),
      ],
      { layerLabel: "What the show is" },
    ),
  ],
  { borderTop: true, layerLabel: "The production" },
);

const howItWorks = band(
  "rb-show-process",
  [
    centerHead(
      "rb-show-process",
      "For venues",
      "How a resort books it",
      "The show is still in production. Venues who want it for the coming season can hold a date now.",
    ),
    grid(
      "rb-show-process-grid",
      4,
      [
        processStep("rb-show-step-1", "01", "Tell us your venue", "Your stage or space, your season, and the night you would run it."),
        processStep("rb-show-step-2", "02", "We advance the staging", "Space, power, rigging and timing, confirmed against what the show needs."),
        processStep("rb-show-step-3", "03", "Hold your date", "Dates are confirmed in the order they are agreed, before the season fills."),
        processStep("rb-show-step-4", "04", "The company arrives ready", "Cast, rehearsed and teched. Your team runs the night, not the artists."),
      ],
      { layerLabel: "How a venue books it" },
    ),
  ],
  { layerLabel: "For venues" },
);

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
        headingLine("rb-show-casting-title", "We are now casting.", {
          align: "center",
          layerLabel: "Casting title",
        }),
        copy(
          "rb-show-casting-lead",
          "Dancers, performers, aerialists, hosts and musicians: tell us what you do and we will come back to you as casting opens for each role. Representation with Impronta is not required to be seen.",
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

const roster = divisionRosterSection({
  prefix: "rb-show",
  eyebrowText: "The company",
  title: "Performers already on the roster",
  leadText:
    "A live view of the Performers division. These are the acts the show is being cast from.",
  talentTypeKeys: ["performers"],
  emptyStateText:
    "Performer profiles appear here as acts join the roster.",
});

const closing = closingCta("rb-show-closing", {
  eyebrowText: "For resorts and venues",
  line1: "Want it for",
  line2: "your season?",
  sub: "Tell us your venue and the night you would run it. A coordinator replies personally with what the show needs and what is still open.",
  primary: { label: "Talk to the agency", href: "/p/contact" },
  secondary: { label: "See the roster", href: "/directory" },
});

const tree: BuilderNode[] = [hero, what, howItWorks, casting, roster, closing];

export const showPage: ImprontaRebuildPage = {
  slug: "show",
  title: "The Show | Impronta",
  seo: {
    meta_title: "The Impronta Show | Original stage production, Riviera Maya",
    meta_description:
      "Impronta is producing an original stage show for Riviera Maya resorts, beach clubs and hotels: one company, cast and rehearsed by the agency. Casting open to performers now.",
    og_title: "The Impronta Show | Original stage production, Riviera Maya",
    og_description:
      "An original stage show for Riviera Maya resorts, cast and rehearsed by Impronta. Venues can hold a date; performers can register for casting.",
    canonical_url: "/p/show",
    // Unannounced production: the page is linked from the homepage so the owner
    // can show it to venues, but it stays out of the index until she says the
    // show is public. One flag to flip.
    noindex: true,
    include_in_sitemap: false,
  } as ImprontaRebuildPage["seo"],
  tree,
};
