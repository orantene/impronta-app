/**
 * Impronta rebuild — PRIVACY POLICY (`/p/privacy`).
 *
 * Plain-language template draft, clearly marked for owner and counsel review
 * (Mexico's LFPDPPP applies to a Mexican agency handling personal data).
 * Flow: compact hero → numbered clauses → closing links.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  band,
  closingCta,
  copy,
  legalClause,
  pageHero,
  type ImprontaRebuildPage,
} from "../shared";

const hero = pageHero("rb-privacy", {
  eyebrowText: "Legal",
  line1: "Privacy",
  line2: "policy.",
  sub: "What we collect, why we collect it and who ever sees it, explained the way we would want it explained to us.",
  compact: true,
});

const body = band(
  "rb-privacy-body",
  [
    {
      id: "rb-privacy-inner",
      kind: "container",
      props: {
        layout: "stack",
        align: "start",
        layerLabel: "Privacy body",
        style: {
          width: "100%",
          maxWidthFree: "820px",
          marginLeftFree: "auto",
          marginRightFree: "auto",
          gap: "28px",
        },
      },
      children: [
        copy(
          "rb-privacy-updated",
          "Last updated: August 2026",
          { align: "left", size: "small", marginTop: "0px", layerLabel: "Last updated" },
        ),
        legalClause("rb-privacy-1", "1. Who is responsible", [
          "Impronta, a boutique model and talent agency operating in Tulum and Playa del Carmen, Quintana Roo, Mexico, is responsible for the personal data collected through this site. Questions about this policy reach us through the contact page at /p/contact.",
        ]),
        legalClause("rb-privacy-2", "2. What we collect", [
          "Booking inquiries: your name, email, phone number if you share it, and the details of your brief.",
          "Talent applications: your name, contact details, the photos and materials you submit, and profile information such as disciplines, languages, measurements where relevant to the work, and availability.",
          "Site operation: technical data such as pages visited and approximate region, used to keep the site working and secure.",
        ]),
        legalClause("rb-privacy-3", "3. Why we collect it", [
          "To answer your inquiry and prepare a shortlist, to review applications and manage representation, to prepare bookings, agreements and invoices, and to keep the site secure. We do not sell personal data, and we do not use your inquiry to send marketing you did not ask for.",
        ]),
        legalClause("rb-privacy-4", "4. Who sees it", [
          "Client briefs are seen by the agency team coordinating them. Talent profiles on the public roster show only what the profile is set to show; application materials that are not published stay internal.",
          "Data is processed by the service providers that run this site's hosting, database and email delivery, under their own security obligations. Beyond that, personal data leaves the agency only when a booking requires it, for example sharing a confirmed talent's details on a call sheet, or when the law requires it.",
        ]),
        legalClause("rb-privacy-5", "5. Photos and talent profiles", [
          "Published roster photos and profile details appear with the talent's agreement as part of representation. Talent can ask for their profile or specific photos to be updated or removed at any time; the change reaches the live site as fast as the team can process it.",
        ]),
        legalClause("rb-privacy-6", "6. How long we keep it", [
          "Inquiries and briefs are kept while the conversation and any resulting booking are live, and afterwards for the agency's legitimate record-keeping and legal obligations. Application materials for applicants who do not join the roster are not kept longer than needed to close the application.",
        ]),
        legalClause("rb-privacy-7", "7. Your rights", [
          "Under Mexican data-protection law you can ask to access, correct, delete or stop certain uses of your personal data (ARCO rights). Send the request through the contact page at /p/contact; we will confirm your identity and answer within the legal timeframe.",
        ]),
        legalClause("rb-privacy-8", "8. Cookies and analytics", [
          "The site uses the cookies needed for it to function, and basic analytics to understand which pages are used. It does not run third-party advertising trackers.",
        ]),
        legalClause("rb-privacy-9", "9. Changes to this policy", [
          "When this policy changes, the current version and its last-updated date are published on this page. Material changes to how data is used will be flagged clearly on the site.",
        ]),
      ],
    },
  ],
  { borderTop: true, layerLabel: "Privacy" },
);

const closing = closingCta("rb-privacy-closing", {
  eyebrowText: "Next",
  line1: "Your data, handled.",
  line2: "Your brief, awaited.",
  sub: "Send it knowing exactly where it goes and who reads it.",
  primary: { label: "Contact the agency", href: "/p/contact" },
  secondary: { label: "Terms of service", href: "/p/terms" },
});

const tree: BuilderNode[] = [hero, body, closing];

export const privacyPage: ImprontaRebuildPage = {
  slug: "privacy",
  title: "Privacy Policy",
  seo: {
    meta_title: "Privacy Policy | Impronta",
    meta_description:
      "How Impronta handles personal data from booking inquiries, talent applications and the public roster: what is collected, why, who sees it and the ARCO rights you hold under Mexican law.",
    og_title: "Impronta Privacy Policy",
    og_description: "What we collect, why we collect it and who ever sees it, in plain language.",
    canonical_url: "/p/privacy",
    noindex: false,
    include_in_sitemap: true,
  },
  tree,
};
