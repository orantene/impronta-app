/**
 * Impronta rebuild — TERMS OF SERVICE (`/p/terms`).
 *
 * Plain-language template draft, clearly marked for owner and counsel review.
 * Flow: compact hero → template notice → numbered clauses → closing links.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  band,
  closingCta,
  copy,
  legalClause,
  legalTemplateNotice,
  pageHero,
  type ImprontaRebuildPage,
} from "../shared";

const hero = pageHero("rb-terms", {
  eyebrowText: "Legal",
  line1: "Terms of",
  line2: "service.",
  sub: "The ground rules for using this site and booking through the agency, written to be read, not skimmed past.",
  compact: true,
});

const body = band(
  "rb-terms-body",
  [
    {
      id: "rb-terms-inner",
      kind: "container",
      props: {
        layout: "stack",
        align: "start",
        layerLabel: "Terms body",
        style: {
          width: "100%",
          maxWidthFree: "820px",
          marginLeftFree: "auto",
          marginRightFree: "auto",
          gap: "28px",
        },
      },
      children: [
        legalTemplateNotice(
          "rb-terms-notice",
          "Template draft. These terms are a plain-language starting point prepared for Impronta and have not yet been reviewed by legal counsel. Before relying on them, the agency should have them reviewed and adapted to its current corporate details and Mexican law.",
        ),
        copy(
          "rb-terms-updated",
          "Last updated: August 2026",
          { align: "left", size: "small", marginTop: "0px", layerLabel: "Last updated" },
        ),
        legalClause("rb-terms-1", "1. Who we are", [
          "This website is operated by Impronta, a boutique model and talent agency working in Tulum, Playa del Carmen and the wider Riviera Maya, Mexico. In these terms, \"Impronta\", \"the agency\", \"we\" and \"us\" refer to the agency, and \"you\" refers to anyone using this site, sending an inquiry, or applying for representation.",
        ]),
        legalClause("rb-terms-2", "2. What this site is for", [
          "The site presents the agency's represented roster, receives booking inquiries from clients, and receives applications from talent seeking representation. Roster profiles, photos and availability are provided for evaluating a potential booking through the agency and for no other purpose.",
        ]),
        legalClause("rb-terms-3", "3. Bookings run through the agency", [
          "All bookings of represented talent are arranged through Impronta. Sending an inquiry is not a confirmed booking: a booking exists only once the agency has confirmed the talent, the dates, the scope and the fee in writing.",
          "Contacting represented talent directly to circumvent the agency, or using this site to solicit talent for work outside an agency agreement, is not permitted.",
        ]),
        legalClause("rb-terms-4", "4. Quotes, fees and payment", [
          "Quotes state the scope they cover: time, deliverables, usage and travel. The agreed quote becomes the contract price for that scope; work outside it is quoted separately. Payment terms, including any deposit, are stated on the agreement or invoice for each booking.",
        ]),
        legalClause("rb-terms-5", "5. Changes and cancellations", [
          "Each booking agreement states its own change and cancellation terms, agreed before you confirm. Tell your coordinator about changes as early as possible; where the schedule allows, we rework the booking rather than cancel it.",
        ]),
        legalClause("rb-terms-6", "6. Photos and content on this site", [
          "The photography, profiles and text on this site belong to the agency, the talent, or the photographers who created them, and are protected by copyright. You may not copy, republish or use them, including for casting decks or social media, without written permission from the agency.",
        ]),
        legalClause("rb-terms-7", "7. Talent applications", [
          "Applying for representation is free. Submitting an application does not create a representation relationship: representation begins only when both sides sign a written agreement. You must own or have rights to the photos and materials you submit, and they must be honest and recent.",
        ]),
        legalClause("rb-terms-8", "8. Acceptable use", [
          "Do not use this site to send unlawful, deceptive or abusive content, to scrape or bulk-collect profiles or photos, to misrepresent who you are, or to interfere with the operation of the site.",
        ]),
        legalClause("rb-terms-9", "9. Liability", [
          "The site is provided as is. To the extent permitted by law, the agency is not liable for indirect losses arising from use of the site itself. Liability arising from a confirmed booking is governed by that booking's written agreement.",
        ]),
        legalClause("rb-terms-10", "10. Privacy", [
          "How we handle personal data, from inquiries to talent applications, is described in the privacy policy at /p/privacy. It is part of these terms.",
        ]),
        legalClause("rb-terms-11", "11. Changes to these terms", [
          "We may update these terms as the agency and the law evolve. The current version is always published on this page with its last-updated date. Material changes to booking terms never apply retroactively to an already-confirmed booking.",
        ]),
        legalClause("rb-terms-12", "12. Contact and governing law", [
          "Questions about these terms reach the agency through the contact page at /p/contact. These terms are governed by the laws of Mexico, and any dispute is subject to the competent courts of the state of Quintana Roo.",
        ]),
      ],
    },
  ],
  { borderTop: true, layerLabel: "Terms" },
);

const closing = closingCta("rb-terms-closing", {
  eyebrowText: "Next",
  line1: "Read it, good.",
  line2: "Now the work.",
  sub: "The roster is open and the coordinator is a message away.",
  primary: { label: "Browse the roster", href: "/directory" },
  secondary: { label: "Privacy policy", href: "/p/privacy" },
});

const tree: BuilderNode[] = [hero, body, closing];

export const termsPage: ImprontaRebuildPage = {
  slug: "terms",
  title: "Terms of Service",
  seo: {
    meta_title: "Terms of Service | Impronta",
    meta_description:
      "The terms for using the Impronta site, sending booking inquiries and applying for representation: bookings run through the agency, quotes state their scope, and photos stay protected.",
    og_title: "Impronta Terms of Service",
    og_description: "The ground rules for using the site and booking through the agency, in plain language.",
    canonical_url: "/p/terms",
    noindex: false,
    include_in_sitemap: true,
  },
  tree,
};
