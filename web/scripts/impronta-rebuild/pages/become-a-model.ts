/**
 * Impronta rebuild — BECOME A MODEL (`/p/become-a-model`).
 *
 * The talent conversion funnel. Flow: photographic hero → what representation
 * means (cards) → who we look for (divisions) → editorial plate → how applying
 * works → what to prepare → FAQ teaser → closing CTA to /register.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  band,
  bulletRow,
  centerHead,
  closingCta,
  copy,
  eyebrow,
  faqAccordion,
  featureCard,
  fullBleedPlate,
  grid,
  headingLine,
  linkRow,
  lineButton,
  pageHero,
  processStep,
  IMAGE_SLOT,
  type ImprontaRebuildPage,
} from "../shared";

const hero = pageHero("rb-model", {
  eyebrowText: "For talent",
  line1: "Your face works.",
  line2: "We make it a career.",
  sub: "Impronta represents models, hosts, performers, DJs and culinary talent across Tulum, Playa del Carmen and the Riviera Maya. If you are serious about the work, we put you in front of real briefs, with an agency negotiating on your side.",
  primary: { label: "Apply for representation", href: "/register" },
  secondary: { label: "Meet the roster", href: "/directory" },
  footnote: "Free to apply · we review every application personally",
  imageSlot: "become-a-model-hero",
  imageAlt: "An Impronta model reclining in an open white shirt and light ripped jeans on a white studio backdrop.",
});

const representation = band(
  "rb-model-representation",
  [
    centerHead(
      "rb-model-representation",
      "What representation means",
      "An agency on your side of the table",
      "Representation is not a listing on a website. It is a working relationship with people whose job is your career.",
    ),
    grid(
      "rb-model-representation-grid",
      3,
      [
        featureCard(
          "rb-model-rep-1",
          "Real briefs, not exposure",
          "Campaigns, events, shoots and residencies from brands, hotels and producers who book through the agency. Paid work with terms in writing.",
        ),
        featureCard(
          "rb-model-rep-2",
          "Your rates, negotiated",
          "We agree your rates with you, then defend them with clients. Usage, image rights and overtime are part of the agreement, not an afterthought.",
        ),
        featureCard(
          "rb-model-rep-3",
          "A professional profile",
          "A managed portfolio on the Impronta roster: curated photos, your disciplines, languages and availability, presented the way casting directors expect.",
        ),
        featureCard(
          "rb-model-rep-4",
          "No client chasing",
          "Clients brief the agency, the agency briefs you. You never negotiate your own fee at the door or chase an invoice after the wrap.",
        ),
        featureCard(
          "rb-model-rep-5",
          "Coaching and growth",
          "Portfolio direction, on-set standards and honest feedback after castings. We build talent who get booked again, not once.",
        ),
        featureCard(
          "rb-model-rep-6",
          "Local base, wider reach",
          "The Riviera Maya is the home market; briefs travel to Cancun, Mexico City and beyond. Your profile works while you do.",
        ),
      ],
      { layerLabel: "Representation" },
    ),
  ],
  { borderTop: true, layerLabel: "What representation means" },
);

const whoWeSeek = band(
  "rb-model-who",
  [
    {
      id: "rb-model-who-split",
      kind: "split",
      props: {
        ratio: "40-60",
        gap: "l",
        collapseOnMobile: true,
        layerLabel: "Who we look for",
        style: { width: "100%", maxWidthFree: "100%", alignItems: "center" },
      },
      children: [
        {
          id: "rb-model-who-image",
          kind: "image",
          props: {
            src: IMAGE_SLOT("become-a-model-who"),
            alt: "An Impronta model seated on the studio floor in a black bodysuit, sheer tights and heels, against a warm tan backdrop.",
            layerLabel: "Casting photograph",
            style: {
              width: "100%",
              aspectRatioFree: "0.8",
              objectFit: "cover",
              objectPosition: "center",
              borderRadius: "4px",
              boxShadow: "0 40px 110px rgba(0,0,0,0.45)",
            },
          },
        },
        {
          id: "rb-model-who-copy",
          kind: "container",
          props: {
            layout: "stack",
            align: "start",
            layerLabel: "Who copy",
            style: { gap: "0px", maxWidthFree: "640px" },
          },
          children: [
            eyebrow("rb-model-who-eyebrow", "Who we look for", "left"),
            headingLine("rb-model-who-line1", "Four divisions.", { align: "left", layerLabel: "Headline line 1" }),
            headingLine("rb-model-who-line2", "One standard.", { align: "left", accent: true, layerLabel: "Headline line 2 (accent)" }),
            copy(
              "rb-model-who-body",
              "We scout for presence, professionalism and range, not one look. Experience helps; reliability and attitude decide. If you are early in your career but serious, apply anyway and say so.",
              { align: "left", maxWidth: "560px", marginTop: "20px" },
            ),
            {
              id: "rb-model-who-rows",
              kind: "container",
              props: {
                layout: "stack",
                align: "start",
                layerLabel: "Division rows",
                style: { gap: "0px", marginTopFree: "24px", width: "100%", maxWidthFree: "560px" },
              },
              children: [
                linkRow("rb-model-who-fashion", "Fashion Models", "/p/fashion-models"),
                linkRow("rb-model-who-hosts", "Hosts & Promoters", "/p/hosts-promoters"),
                linkRow("rb-model-who-performers", "Performers", "/p/performers"),
                linkRow("rb-model-who-music", "Music & DJs", "/p/music-djs"),
              ],
            },
          ],
        },
      ],
    },
  ],
  { borderTop: true, layerLabel: "Who we look for" },
);

const plate = fullBleedPlate("rb-model", {
  imageSlot: "become-a-model-plate",
  imageAlt: "An Impronta model crouching in a black bodysuit with both hands in her hair, against a warm tan studio backdrop.",
  numeral: "You.",
  line: "The roster is curated. That is exactly why it works.",
});

const applying = band(
  "rb-model-applying",
  [
    centerHead("rb-model-applying", "How applying works", "Four steps, no fees, no promises we cannot keep"),
    grid(
      "rb-model-applying-grid",
      4,
      [
        processStep("rb-model-step-1", "01", "Apply online", "Create your profile with basic details, photos and the disciplines you work in. It takes minutes."),
        processStep("rb-model-step-2", "02", "We review personally", "A real person looks at every application against what the roster and current briefs need."),
        processStep("rb-model-step-3", "03", "We meet", "If there is a fit, we invite you to meet in person or on a call. Questions go both ways."),
        processStep("rb-model-step-4", "04", "You join the roster", "We agree terms and rates, build your profile and put you forward for briefs that fit."),
      ],
      { layerLabel: "Steps", mobileColumns: 2 },
    ),
  ],
  { borderTop: true, layerLabel: "How applying works" },
);

const prepare = band(
  "rb-model-prepare",
  [
    {
      id: "rb-model-prepare-inner",
      kind: "container",
      props: {
        layout: "stack",
        align: "start",
        layerLabel: "What to prepare",
        style: { width: "100%", maxWidthFree: "760px", marginLeftFree: "auto", marginRightFree: "auto", gap: "0px" },
      },
      children: [
        eyebrow("rb-model-prepare-eyebrow", "Before you apply", "left"),
        headingLine("rb-model-prepare-title", "What to have ready", { align: "left" }),
        copy(
          "rb-model-prepare-lead",
          "You do not need a professional portfolio to apply. You do need honest, recent material we can judge fairly.",
          { align: "left", maxWidth: "620px", marginTop: "16px" },
        ),
        {
          id: "rb-model-prepare-list",
          kind: "container",
          props: {
            layout: "stack",
            align: "start",
            layerLabel: "Checklist",
            style: { gap: "0px", marginTopFree: "24px", width: "100%" },
          },
          children: [
            bulletRow("rb-model-prepare-1", "Recent photos in natural light, minimal editing, no heavy filters"),
            bulletRow("rb-model-prepare-2", "Your disciplines and real experience, stated plainly"),
            bulletRow("rb-model-prepare-3", "Languages you work in and the cities you can reach"),
            bulletRow("rb-model-prepare-4", "Links to work you are proud of, if you have them"),
            bulletRow("rb-model-prepare-5", "Your general availability, so briefs can find you"),
          ],
        },
      ],
    },
  ],
  { borderTop: true, layerLabel: "What to prepare" },
);

const faqTeaser = band(
  "rb-model-faq",
  [
    centerHead("rb-model-faq", "Before you ask", "The questions every applicant asks"),
    faqAccordion("rb-model-faq-accordion", [
      {
        id: "rb-model-faq-1",
        question: "Does it cost anything to apply or join?",
        answer:
          "Applying is free. Representation is free. The agency earns a commission on booked work, which means we only do well when you do.",
      },
      {
        id: "rb-model-faq-2",
        question: "Do I need professional photos?",
        answer:
          "No. Clear, recent photos in natural light are enough for the application. If you join the roster, we help you build the portfolio properly.",
      },
      {
        id: "rb-model-faq-3",
        question: "Can I work with other agencies or take my own clients?",
        answer:
          "We discuss this openly when we meet. Terms depend on the division and the market, and nothing is signed before both sides agree in writing.",
      },
    ]),
    {
      id: "rb-model-faq-more",
      kind: "container",
      props: {
        layout: "row",
        align: "center",
        layerLabel: "All questions link",
        style: { gap: "16px", justifyContent: "center", marginTopFree: "8px" },
      },
      children: [lineButton("rb-model-faq-cta", "Read the full FAQ", "/p/faq")],
    },
  ],
  { borderTop: true, layerLabel: "FAQ teaser" },
);

const closing = closingCta("rb-model-closing", {
  eyebrowText: "Apply",
  line1: "The roster has",
  line2: "room for you.",
  sub: "Apply in minutes. A real person reviews every application, and every applicant gets an answer.",
  primary: { label: "Apply for representation", href: "/register" },
  secondary: { label: "Questions? Contact us", href: "/p/contact" },
});

const tree: BuilderNode[] = [
  hero,
  representation,
  whoWeSeek,
  plate,
  applying,
  prepare,
  faqTeaser,
  closing,
];

export const becomeAModelPage: ImprontaRebuildPage = {
  slug: "become-a-model",
  title: "Become a Model",
  seo: {
    meta_title: "Become a Model or Represented Talent | Impronta, Tulum",
    meta_description:
      "Apply for representation with Impronta, the boutique talent agency of the Riviera Maya. Models, hosts, performers, DJs and chefs: free to apply, personally reviewed, real paid briefs.",
    og_title: "Your face works. We make it a career.",
    og_description:
      "Representation with Impronta: real briefs, negotiated rates, a professional profile and an agency on your side of the table.",
    canonical_url: "/p/become-a-model",
    noindex: false,
    include_in_sitemap: true,
  },
  tree,
};
