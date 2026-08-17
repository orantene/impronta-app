/**
 * Impronta rebuild — FAQ (`/p/faq`).
 *
 * Flow: compact hero → client questions accordion → talent questions
 * accordion → still-have-questions closing CTA.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  band,
  centerHead,
  closingCta,
  faqAccordion,
  pageHero,
  type ImprontaRebuildPage,
} from "../shared";

const hero = pageHero("rb-faq", {
  eyebrowText: "FAQ",
  line1: "Asked before,",
  line2: "answered plainly.",
  sub: "Everything clients and talent usually ask before working with Impronta. If your question is not here, the contact page reaches a real coordinator.",
  compact: true,
});

const clientFaq = band(
  "rb-faq-clients",
  [
    centerHead("rb-faq-clients", "For clients", "Booking through Impronta"),
    faqAccordion("rb-faq-clients-accordion", [
      {
        id: "rb-faq-c-1",
        question: "What kind of talent can I book?",
        answer:
          "Four divisions: fashion models, event hosts and promoters, performers, and DJs and musicians. We also place private chefs and culinary talent on request. You can book one face or build a full team across divisions in a single brief.",
      },
      {
        id: "rb-faq-c-2",
        question: "How fast do I get a shortlist?",
        answer:
          "Standard briefs receive a curated shortlist within 24 hours, with availability already confirmed against your dates. Urgent briefs in Tulum and Playa del Carmen can often be staffed faster; tell us the timeline and we will be straight about what is possible.",
      },
      {
        id: "rb-faq-c-3",
        question: "How does pricing work?",
        answer:
          "Rates depend on the talent, the scope and the usage. Your shortlist arrives with clear pricing for your exact brief: time, usage and travel included. Nothing is confirmed until you approve the number, and the final agreement matches the quote.",
      },
      {
        id: "rb-faq-c-4",
        question: "What does agency-managed actually include?",
        answer:
          "Vetting, shortlisting, availability checks, rate negotiation, written agreements, call sheets, logistics and a named coordinator through the day of the booking. You brief once; the agency carries the rest.",
      },
      {
        id: "rb-faq-c-5",
        question: "Can I contact talent directly?",
        answer:
          "Bookings run through the agency. That is what keeps availability real, rates fair and someone accountable to you. On the day you work with the talent directly; the logistics and the paperwork stay with us.",
      },
      {
        id: "rb-faq-c-6",
        question: "Do you work outside Tulum and Playa del Carmen?",
        answer:
          "Yes. The Riviera Maya is home, and the roster regularly works Cancun, the wider Yucatan Peninsula and Mexico City. For travel briefs, transport and accommodation terms are agreed up front in the quote.",
      },
      {
        id: "rb-faq-c-7",
        question: "What happens if plans change?",
        answer:
          "Every agreement states its change and cancellation terms before you confirm, so there are no surprise fees. Tell your coordinator as early as possible and we rework the booking where we can.",
      },
      {
        id: "rb-faq-c-8",
        question: "Do I need an account to send a brief?",
        answer:
          "No. The contact form takes a brief without a login, and a coordinator replies personally. An account becomes useful later, for tracking your inquiries and shortlists in one place.",
      },
    ]),
  ],
  { borderTop: true, layerLabel: "Client FAQ" },
);

const talentFaq = band(
  "rb-faq-talent",
  [
    centerHead("rb-faq-talent", "For talent", "Joining the roster"),
    faqAccordion("rb-faq-talent-accordion", [
      {
        id: "rb-faq-t-1",
        question: "Who can apply?",
        answer:
          "Models, event hosts and hostesses, brand ambassadors, performers, DJs, musicians and culinary talent based on or reachable from the Riviera Maya. Experience helps, but professionalism and reliability decide.",
      },
      {
        id: "rb-faq-t-2",
        question: "Does applying or joining cost anything?",
        answer:
          "No. Applying is free and representation is free. The agency earns a commission on booked work, so we only do well when you do. Nobody on our roster paid to be there.",
      },
      {
        id: "rb-faq-t-3",
        question: "Do I need professional photos to apply?",
        answer:
          "No. Recent, honest photos in natural light are enough to be considered. If you join, we help you build a proper portfolio and present it the way casting directors expect.",
      },
      {
        id: "rb-faq-t-4",
        question: "How do I get paid?",
        answer:
          "Your rate is agreed in writing before the job. The client pays the agency, the agency pays you. You never chase a client for an invoice.",
      },
      {
        id: "rb-faq-t-5",
        question: "How long does the review take?",
        answer:
          "A real person reads every application, usually within a week. Every applicant gets an answer, including a no, because silence is not feedback.",
      },
      {
        id: "rb-faq-t-6",
        question: "Can I stay independent or work with other agencies?",
        answer:
          "We discuss exclusivity openly when we meet. Terms vary by division and market, and nothing binds you before both sides agree in writing.",
      },
    ]),
  ],
  { borderTop: true, layerLabel: "Talent FAQ" },
);

const closing = closingCta("rb-faq-closing", {
  eyebrowText: "Still curious",
  line1: "Questions are",
  line2: "briefs in disguise.",
  sub: "Ask us directly. A coordinator replies within 24 hours, whichever side of the camera you are on.",
  primary: { label: "Contact the agency", href: "/p/contact" },
  secondary: { label: "Browse the roster", href: "/directory" },
});

const tree: BuilderNode[] = [hero, clientFaq, talentFaq, closing];

export const faqPage: ImprontaRebuildPage = {
  slug: "faq",
  title: "Frequently Asked Questions",
  seo: {
    meta_title: "FAQ | Booking Talent & Joining the Roster | Impronta",
    meta_description:
      "How booking through Impronta works, how pricing and coordination are handled, and how models, hosts, performers, DJs and chefs join the roster. Plain answers to the questions we hear most.",
    og_title: "Impronta FAQ, answered plainly",
    og_description:
      "Booking talent on the Riviera Maya or applying for representation: the questions everyone asks, answered without fine print.",
    canonical_url: "/p/faq",
    noindex: false,
    include_in_sitemap: true,
  },
  tree,
};
