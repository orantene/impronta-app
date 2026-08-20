/**
 * Impronta rebuild — CONTACT (`/p/contact`).
 *
 * Flow: compact hero → form + direct channels split → what happens next →
 * FAQ pointer → closing CTA to the roster.
 *
 * SEEDING NOTE: the form uses the internal action; W5 / the integrator must set
 * `sectionId` on the form node to a real `cms_sections` row id at seed time.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  band,
  bulletRow,
  centerHead,
  closingCta,
  copy,
  eyebrow,
  headingLine,
  leadForm,
  lineButton,
  pageHero,
  processStep,
  grid,
  CARD,
  CARD_BORDER,
  CONTACT_EMAIL,
  type ImprontaRebuildPage,
} from "../shared";

const hero = pageHero("rb-contact", {
  eyebrowText: "Contact",
  line1: "Say it in",
  line2: "a sentence.",
  sub: "A brief, a date and a place is all we need to start. A coordinator, not an autoresponder, replies within 24 hours.",
  // The owner's ask: a visitor landing on Contact should see the OTHER path
  // immediately - build a lineup from the roster instead of writing a brief.
  // The directory link already existed twice on this page (a quiet line button
  // in the Direct card, and the closing CTA at the very bottom); what was
  // missing was one you can see without scrolling.
  primary: { label: "Start browsing talent now", href: "/directory" },
  compact: true,
});

const formSection = band(
  "rb-contact-main",
  [
    {
      id: "rb-contact-split",
      kind: "split",
      props: {
        ratio: "60-40",
        gap: "l",
        collapseOnMobile: true,
        layerLabel: "Form + channels",
        style: { width: "100%", maxWidthFree: "1100px", marginLeftFree: "auto", marginRightFree: "auto", alignItems: "flex-start" },
      },
      children: [
        {
          id: "rb-contact-form-col",
          kind: "container",
          props: {
            layout: "stack",
            align: "start",
            layerLabel: "Inquiry form",
            style: { gap: "0px", width: "100%" },
          },
          children: [
            eyebrow("rb-contact-form-eyebrow", "Tell us the brief", "left"),
            headingLine("rb-contact-form-title", "What are you casting?", { align: "left", layerLabel: "Form title" }),
            copy(
              "rb-contact-form-lead",
              "Campaign, activation, event, dinner or shoot: give us the outline and we come back with a shortlist and clear next steps.",
              { align: "left", maxWidth: "540px", marginTop: "16px" },
            ),
            leadForm(
              "rb-contact-form",
              [
                { id: "rb-contact-f-name", name: "name", type: "text", label: "Name", placeholder: "Your name", required: true },
                { id: "rb-contact-f-email", name: "email", type: "email", label: "Email", placeholder: "you@company.com", required: true },
                { id: "rb-contact-f-phone", name: "phone", type: "tel", label: "Phone (optional)", placeholder: "+52 ..." },
                { id: "rb-contact-f-brief", name: "brief", type: "text", label: "What are you booking?", placeholder: "e.g. two bilingual hosts for a product launch in Tulum", required: true },
                { id: "rb-contact-f-message", name: "message", type: "textarea", label: "Dates, place and details", placeholder: "Dates, venue or city, budget range if you have one, and anything else we should know.", required: true },
                { id: "rb-contact-f-submit", name: "submit", type: "submit", label: "Send the brief" },
              ],
              { layerLabel: "Inquiry form", maxWidth: "620px" },
            ),
            copy(
              "rb-contact-form-footnote",
              "No account needed · replies within 24 hours · your brief stays between us",
              { align: "left", size: "small", marginTop: "14px", layerLabel: "Reassurance" },
            ),
          ],
        },
        {
          id: "rb-contact-channels",
          kind: "container",
          props: {
            layout: "stack",
            align: "start",
            layerLabel: "Direct channels",
            style: {
              gap: "0px",
              width: "100%",
              backgroundColor: CARD,
              borderColor: CARD_BORDER,
              borderWidth: "1px",
              borderStyle: "solid",
              borderRadius: "8px",
              paddingTop: "36px",
              paddingBottom: "36px",
              paddingLeft: "30px",
              paddingRight: "30px",
            },
          },
          children: [
            eyebrow("rb-contact-channels-eyebrow", "Direct", "left"),
            headingLine("rb-contact-channels-title", "Prefer to write us directly?", { align: "left", size: "card", level: 3 }),
            copy(
              "rb-contact-channels-body",
              "Email works too. Same inbox, same coordinator, same 24-hour promise.",
              { align: "left", marginTop: "12px" },
            ),
            {
              id: "rb-contact-channels-actions",
              kind: "container",
              props: {
                layout: "stack",
                align: "stretch",
                layerLabel: "Channel buttons",
                style: { gap: "12px", marginTopFree: "22px", width: "100%" },
              },
              children: [
                lineButton("rb-contact-email-cta", "Email the agency", `mailto:${CONTACT_EMAIL}`),
                lineButton("rb-contact-directory-cta", "Browse talent first", "/directory"),
              ],
            },
            {
              id: "rb-contact-where",
              kind: "container",
              props: {
                layout: "stack",
                align: "start",
                layerLabel: "Where we work",
                style: { gap: "0px", marginTopFree: "30px", width: "100%" },
              },
              children: [
                eyebrow("rb-contact-where-eyebrow", "Where we work", "left"),
                bulletRow("rb-contact-where-1", "Tulum · Playa del Carmen · Riviera Maya"),
                bulletRow("rb-contact-where-2", "Cancun and the Yucatan Peninsula"),
                bulletRow("rb-contact-where-3", "Mexico City and travel briefs on request"),
              ],
            },
          ],
        },
      ],
    },
  ],
  { borderTop: true, layerLabel: "Contact" },
);

const next = band(
  "rb-contact-next",
  [
    centerHead("rb-contact-next", "What happens next", "Three steps from brief to booking"),
    grid(
      "rb-contact-next-grid",
      3,
      [
        processStep("rb-contact-step-1", "01", "We read the brief", "A coordinator reviews your dates and requirements the same day it lands."),
        processStep("rb-contact-step-2", "02", "You get a shortlist", "Available, agency-approved options that fit the brief, usually within 24 hours."),
        processStep("rb-contact-step-3", "03", "We confirm and coordinate", "You choose, we secure the talent and handle rates, logistics and the paperwork."),
      ],
      { layerLabel: "Next steps" },
    ),
    {
      id: "rb-contact-faq-pointer",
      kind: "container",
      props: {
        layout: "row",
        align: "center",
        layerLabel: "FAQ pointer",
        responsive: { mobile: { layout: "stack", align: "stretch" } },
        style: { gap: "16px", justifyContent: "center", marginTopFree: "12px" },
      },
      children: [
        lineButton("rb-contact-faq-cta", "Questions first? Read the FAQ", "/p/faq"),
      ],
    },
  ],
  { borderTop: true, layerLabel: "What happens next" },
);

const closing = closingCta("rb-contact-closing", {
  eyebrowText: "Or start looking",
  line1: "The roster is",
  line2: "already open.",
  sub: "Browse every represented profile by discipline, language and city, then send the brief when a face stops you.",
  primary: { label: "Explore the roster", href: "/directory" },
  secondary: { label: "About the agency", href: "/p/about" },
});

const tree: BuilderNode[] = [hero, formSection, next, closing];

export const contactPage: ImprontaRebuildPage = {
  slug: "contact",
  title: "Contact Impronta",
  seo: {
    meta_title: "Contact Impronta | Book Talent in Tulum & the Riviera Maya",
    meta_description:
      "Send your brief to Impronta, the boutique model and talent agency in Tulum and Playa del Carmen. A coordinator replies within 24 hours with a shortlist of available, vetted talent.",
    og_title: "Contact Impronta, say it in a sentence",
    og_description:
      "A brief, a date and a place is all we need to start. A coordinator replies within 24 hours.",
    canonical_url: "/p/contact",
    noindex: false,
    include_in_sitemap: true,
  },
  tree,
};
