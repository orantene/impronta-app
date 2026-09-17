/**
 * Impronta — EXPERIENCES & PHOTO SESSIONS (`/p/experiences`).
 *
 * The page that sells what Alejandra already has ready to sell (owner list,
 * 2026-09-17): the "Modelo por un día" experience on 27 September, the
 * October posing course, four studio photo packages and the vintage-era
 * session. Prices are in MXN, per person, and are COPY on the cards so the
 * team edits them in the inspector; the same six products exist in the
 * workspace Menu as offerings, which is the record the inbox and the counter
 * charge against.
 *
 * INQUIRY-FIRST. Every card lands on the booking form at the bottom of this
 * page with the product preselected (`?f_experience=` prefill). Seats, exact
 * time and payment are confirmed in the thread — the owner has not fixed a
 * start time or a seat cap for the 27 September date, and a form that says
 * "we confirm your seat by message" is honest where a live seat counter
 * would be a guess. The `session_picker` block is the upgrade once she does.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { experienceInquiryHref, offerCard } from "../shared-offers";
import {
  band,
  bulletRow,
  centerHead,
  closingCta,
  copy,
  eyebrow,
  faqAccordion,
  grid,
  headingLine,
  leadForm,
  pageHero,
  processStep,
  type ImprontaRebuildPage,
} from "../shared";

/** The product names exactly as they appear in the workspace Menu. */
export const EXPERIENCE_PRODUCTS = {
  // Bilingual on purpose: the same option list serves both language sites
  // (select options are not per-locale) and the inbox line reads the same
  // whoever sent it.
  modelForADay: "Model for a Day / Modelo por un día · 27 Sep",
  posing: "Posing Course / Curso de Posing · October",
  selfMakeup: "Self-makeup workshop / Taller de automaquillaje",
  sessionStudio: "Photo session: studio + photographer / estudio + fotógrafo",
  sessionMakeup: "Photo session + makeup artist / + maquilladora",
  sessionComplete: "Complete session / Sesión completa",
  sessionVintage: "Vintage-era photos / Fotos de época",
  notSure: "Not sure yet / Aún no lo sé",
} as const;

const hero = pageHero("rb-exp", {
  eyebrowText: "Impronta Studio · Experiences",
  line1: "Step in front of",
  line2: "the camera.",
  sub: "Courses, one-day experiences and professional photo sessions at Impronta's own studio on the Riviera Maya. Open to everyone: you do not need to be represented by the agency to book.",
  primary: { label: "Book an experience", href: "#rb-exp-book" },
  secondary: { label: "See the photo sessions", href: "#rb-exp-sessions" },
  footnote: "Prices in MXN · small groups · we confirm your place by message within 24 hours",
  imageSlot: "experiences-hero",
  imageAlt: "A photo session in progress at the Impronta studio, seen from behind the photographer.",
});

const upcoming = band(
  "rb-exp-upcoming",
  [
    centerHead(
      "rb-exp-upcoming",
      "Courses & experiences",
      "Learn what the camera sees",
      "Small groups, working models and photographers, and a studio built for exactly this. Come for a career, or come for the day.",
    ),
    grid(
      "rb-exp-upcoming-grid",
      3,
      [
        offerCard("rb-exp-offer-model-day", {
          imageSlot: "exp-model-for-a-day",
          imageAlt: "A posing coach directing a small group during a studio experience.",
          chip: "27 September 2026 · one day",
          title: "Model for a Day",
          price: "$2,500 MXN",
          priceNote: "per person",
          text: "One day inside the agency: posing direction from the Impronta team, a styled session with a professional photographer, and edited images to keep. No experience needed.",
          cta: { label: "Reserve my seat", href: experienceInquiryHref(EXPERIENCE_PRODUCTS.modelForADay) },
          footnote: "Limited seats · we confirm by message",
        }),
        offerCard("rb-exp-offer-posing", {
          imageSlot: "exp-posing-course",
          imageAlt: "An instructor demonstrating a pose in front of a studio mirror.",
          chip: "October 2026 · course",
          title: "Posing Course",
          price: "$7,000 MXN",
          priceNote: "per person",
          text: "The complete course on posing for photo and runway: angles, movement, expression and casting presence, taught by the people who direct it every week. Dates confirmed on sign-up.",
          cta: { label: "Join the October course", href: experienceInquiryHref(EXPERIENCE_PRODUCTS.posing) },
          footnote: "Small group · dates confirmed on sign-up",
        }),
        offerCard("rb-exp-offer-makeup", {
          imageSlot: "exp-self-makeup",
          imageAlt: "Brushes and palettes at a makeup station under a ring light.",
          chip: "Coming soon · workshop",
          title: "Self-Makeup Workshop",
          price: "Date and price to be announced",
          text: "Camera-ready makeup you can do yourself, taught by the makeup artists who prepare our talent for castings and shoots. Join the list and you hear first.",
          cta: { label: "Join the list", href: experienceInquiryHref(EXPERIENCE_PRODUCTS.selfMakeup) },
        }),
      ],
      { layerLabel: "Experiences", mobileColumns: 1 },
    ),
  ],
  { borderTop: true, layerLabel: "Courses & experiences" },
);

const sessions = band(
  "rb-exp-sessions",
  [
    centerHead(
      "rb-exp-sessions",
      "Photo sessions",
      "Your session, your images",
      "Book Impronta's studio with a professional photographer. Every package includes the studio, direction on set and edited images delivered ready to use.",
    ),
    grid(
      "rb-exp-sessions-grid",
      4,
      [
        offerCard("rb-exp-offer-s1", {
          imageSlot: "exp-session-studio",
          imageAlt: "A photographer at work on a seamless studio backdrop.",
          chip: "Photo session",
          title: "Studio + photographer",
          price: "$1,500 MXN",
          priceNote: "per session",
          text: "The studio, a professional photographer and 10 edited photographs. The cleanest way to get images you can actually send.",
          cta: { label: "Book this session", href: experienceInquiryHref(EXPERIENCE_PRODUCTS.sessionStudio) },
        }),
        offerCard("rb-exp-offer-s2", {
          imageSlot: "exp-session-makeup",
          imageAlt: "A makeup artist preparing a client before a studio session.",
          chip: "Photo session",
          title: "Studio + photographer + makeup",
          price: "$2,500 MXN",
          priceNote: "per session",
          text: "Everything in the studio session, plus a professional makeup artist on set so you arrive as you are and leave camera-ready.",
          cta: { label: "Book this session", href: experienceInquiryHref(EXPERIENCE_PRODUCTS.sessionMakeup) },
        }),
        offerCard("rb-exp-offer-s3", {
          imageSlot: "exp-session-complete",
          imageAlt: "Wardrobe, hair tools and a lit mirror ready for a complete studio session.",
          chip: "Photo session",
          title: "Complete session",
          price: "From $3,000 MXN",
          priceNote: "per session",
          text: "Studio, photographer, makeup, hair and styling: the full production for a portfolio, a personal brand or a milestone. We confirm the exact price with your brief.",
          cta: { label: "Book this session", href: experienceInquiryHref(EXPERIENCE_PRODUCTS.sessionComplete) },
        }),
        offerCard("rb-exp-offer-s4", {
          imageSlot: "exp-session-vintage",
          imageAlt: "A vintage-era styled photo set with period props and sepia light.",
          chip: "Themed session",
          title: "Vintage-era photos",
          price: "$3,000 MXN",
          priceNote: "per session",
          text: "A period-styled shoot: wardrobe, makeup and set designed around an era, from the 1920s to the 1970s. A portrait that looks like it was found, not taken.",
          cta: { label: "Book this session", href: experienceInquiryHref(EXPERIENCE_PRODUCTS.sessionVintage) },
        }),
      ],
      { layerLabel: "Photo packages", mobileColumns: 1 },
    ),
  ],
  { borderTop: true, layerLabel: "Photo sessions", noRise: true },
);

const includes = band(
  "rb-exp-includes",
  [
    {
      id: "rb-exp-includes-split",
      kind: "split",
      props: {
        ratio: "50-50",
        gap: "l",
        collapseOnMobile: true,
        layerLabel: "What is included / how it works",
        style: { width: "100%", maxWidthFree: "100%", alignItems: "flex-start" },
      },
      children: [
        {
          id: "rb-exp-includes-copy",
          kind: "container",
          props: {
            layout: "stack",
            align: "start",
            layerLabel: "Every session includes",
            style: { gap: "0px", maxWidthFree: "560px", width: "100%" },
          },
          children: [
            eyebrow("rb-exp-includes-eyebrow", "Every session includes", "left"),
            headingLine("rb-exp-includes-line1", "A real studio,", { align: "left", layerLabel: "Headline line 1" }),
            headingLine("rb-exp-includes-line2", "not a wall and a phone.", { align: "left", accent: true, layerLabel: "Headline line 2 (accent)" }),
            {
              id: "rb-exp-includes-list",
              kind: "container",
              props: {
                layout: "stack",
                align: "start",
                layerLabel: "Included",
                style: { gap: "0px", marginTopFree: "24px", width: "100%", maxWidthFree: "560px" },
              },
              children: [
                bulletRow("rb-exp-inc-1", "Impronta's studio, professional lighting and a photographer who shoots talent every week"),
                bulletRow("rb-exp-inc-2", "Direction on set, so you are never left to pose on your own"),
                bulletRow("rb-exp-inc-3", "Edited images delivered digitally, ready for an agency, a client or your own feed"),
                bulletRow("rb-exp-inc-4", "Makeup, hair and styling on the packages that include them"),
                bulletRow("rb-exp-inc-5", "No representation needed: sessions and courses are open to everyone"),
              ],
            },
          ],
        },
        {
          id: "rb-exp-how",
          kind: "container",
          props: {
            layout: "stack",
            align: "start",
            layerLabel: "How booking works",
            style: { gap: "18px", width: "100%" },
          },
          children: [
            eyebrow("rb-exp-how-eyebrow", "How it works", "left"),
            processStep("rb-exp-step-1", "01", "Choose and send", "Pick the experience or session and send the form. A sentence about what the images are for is enough."),
            processStep("rb-exp-step-2", "02", "We confirm the details", "Date, time, what to bring and how to pay, by message, before you commit to anything."),
            processStep("rb-exp-step-3", "03", "Studio day", "Direction from the first frame. Bring your looks; the studio handles light, set and pace."),
            processStep("rb-exp-step-4", "04", "Your images", "Edited and delivered, ready for your book, your brand or your wall."),
          ],
        },
      ],
    },
  ],
  { borderTop: true, layerLabel: "Included + process" },
);

const faq = band(
  "rb-exp-faq",
  [
    centerHead("rb-exp-faq", "Good to know", "Questions people ask before booking"),
    faqAccordion("rb-exp-faq-accordion", [
      {
        id: "rb-exp-q1",
        question: "Do I need to be a model, or represented by Impronta?",
        answer: "No. Courses and sessions are open to everyone, from first-timers to working talent. Being represented by the agency is not required, and booking a session does not commit you to anything else.",
      },
      {
        id: "rb-exp-q2",
        question: "Where is the studio?",
        answer: "The Impronta studio is on the Riviera Maya. The exact address and directions come with your confirmation message.",
      },
      {
        id: "rb-exp-q3",
        question: "How do I pay, and when?",
        answer: "Prices are in Mexican pesos (MXN). Once we confirm your date we send the payment options; a seat on a course or a dated experience is held once the payment is in.",
      },
      {
        id: "rb-exp-q4",
        question: "Can I bring my own clothes and references?",
        answer: "Please do. Bring two or three looks and any references you like; we plan the frames around them. Packages with styling add pieces from the studio wardrobe.",
      },
      {
        id: "rb-exp-q5",
        question: "How many people are in a course or experience?",
        answer: "Small groups on purpose, so everyone gets direction. Seats are confirmed in the order the bookings arrive.",
      },
      {
        id: "rb-exp-q6",
        question: "Can a brand or a group book a private session?",
        answer: "Yes. Tell us the group size or the brief in the form and we quote a private date, including a production day for brands with casting, crew and call sheet.",
      },
    ]),
  ],
  { borderTop: true, layerLabel: "FAQ" },
);

const book = band(
  "rb-exp-book",
  [
    {
      id: "rb-exp-book-inner",
      kind: "container",
      props: {
        layout: "stack",
        align: "center",
        layerLabel: "Booking form",
        style: { width: "100%", maxWidthFree: "720px", marginLeftFree: "auto", marginRightFree: "auto", gap: "0px" },
      },
      children: [
        eyebrow("rb-exp-book-eyebrow", "Book"),
        headingLine("rb-exp-book-title", "Reserve your place.", { align: "center", layerLabel: "Booking title" }),
        copy(
          "rb-exp-book-lead",
          "Tell us which experience or session and roughly when. We reply with the date, what to bring and how to pay, so you know everything before you commit.",
          { align: "center", maxWidth: "620px", marginTop: "16px" },
        ),
        leadForm(
          "rb-exp-form",
          [
            { id: "rb-exp-f-name", name: "name", type: "text", label: "Name", placeholder: "Your name", required: true },
            { id: "rb-exp-f-email", name: "email", type: "email", label: "Email", placeholder: "you@email.com", required: true },
            { id: "rb-exp-f-phone", name: "phone", type: "tel", label: "Phone or WhatsApp", placeholder: "+52 ...", required: true },
            {
              id: "rb-exp-f-experience",
              name: "experience",
              type: "select",
              label: "What would you like to book?",
              placeholder: "Choose an experience or session",
              required: true,
              options: [
                EXPERIENCE_PRODUCTS.modelForADay,
                EXPERIENCE_PRODUCTS.posing,
                EXPERIENCE_PRODUCTS.selfMakeup,
                EXPERIENCE_PRODUCTS.sessionStudio,
                EXPERIENCE_PRODUCTS.sessionMakeup,
                EXPERIENCE_PRODUCTS.sessionComplete,
                EXPERIENCE_PRODUCTS.sessionVintage,
                EXPERIENCE_PRODUCTS.notSure,
              ],
            },
            { id: "rb-exp-f-dates", name: "dates", type: "text", label: "When suits you?", placeholder: "e.g. any Saturday in October, or a specific date", required: true },
            { id: "rb-exp-f-message", name: "message", type: "textarea", label: "Anything else we should know?", placeholder: "How many people, what the images are for, looks or references you have in mind." },
            { id: "rb-exp-f-submit", name: "submit", type: "submit", label: "Send my request" },
          ],
          { layerLabel: "Booking form", maxWidth: "620px" },
        ),
        copy(
          "rb-exp-book-footnote",
          "No account needed · we reply within 24 hours · date, seats and payment confirmed by message",
          { align: "center", size: "small", marginTop: "14px", layerLabel: "Reassurance" },
        ),
      ],
    },
  ],
  { borderTop: true, glow: true, layerLabel: "Book", noRise: true },
);

const closing = closingCta("rb-exp-closing", {
  eyebrowText: "Not sure which one?",
  line1: "Tell us what the",
  line2: "images are for.",
  sub: "A portfolio, a brand, a birthday or a first step into modelling: say it in a sentence and we point you to the right session.",
  primary: { label: "Ask the studio", href: "/p/contact" },
  secondary: { label: "See the agency studio", href: "/p/studio" },
});

const tree: BuilderNode[] = [hero, upcoming, sessions, includes, faq, book, closing];

export const experiencesPage: ImprontaRebuildPage = {
  slug: "experiences",
  title: "Experiences & Photo Sessions | Impronta",
  seo: {
    meta_title: "Model for a Day, Posing Course & Studio Photo Sessions | Impronta, Riviera Maya",
    meta_description:
      "Book a professional photo session, the Model for a Day experience (27 Sep) or the October posing course at Impronta's studio on the Riviera Maya. Prices in MXN, open to everyone.",
    og_title: "Experiences & Photo Sessions at Impronta Studio, Riviera Maya",
    og_description:
      "Photo sessions from $1,500 MXN, Model for a Day on 27 September and a posing course in October. Book at Impronta's studio.",
    canonical_url: "/p/experiences",
    noindex: false,
    include_in_sitemap: true,
  },
  tree,
};
