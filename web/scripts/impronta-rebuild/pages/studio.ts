/**
 * Impronta rebuild — THE STUDIO (`/p/studio`).
 *
 * TWO PRODUCTS, ONE ROOM — and that is the whole design of this page.
 *
 * The owner asked for the studio to be promoted as something a person can BOOK
 * AND PAY FOR: portfolio shoots for aspiring talent, updated books for working
 * talent, personal shoots. The page that lived at this slug was something else
 * entirely — production services sold to brands and editorial teams (casting,
 * production, image direction, logistics).
 *
 * That existing offering is real and coherent, so it is NOT deleted to make
 * room. Both live here, in that order: sessions first, because that is what is
 * being promoted and what a person arriving from the homepage came for;
 * production services second, under their own heading, for the teams who were
 * already finding this page. If the owner would rather split them into two
 * pages, the sessions half lifts out whole.
 *
 * NO PRICES. "Sessions from $X" needs a number only the owner has. The form
 * asks for session type and dates instead, which is what a booking needs
 * anyway.
 *
 * NO CITY. The old page said "across the Riviera Maya and beyond" and never
 * named where the studio physically is. Inventing an address for a room people
 * are meant to travel to would be the worst kind of guess.
 *
 * THE GALLERY IS REAL. Unlike the show page, this one can honestly show its
 * work: four studio frames from the library, which is exactly what a session
 * produces. (Assumption worth confirming: that these were shot in Alejandra's
 * studio. They carry the Impronta watermark and the same seamless setup.)
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import {
  band,
  bulletRow,
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
  IMAGE_SLOT,
  type ImprontaRebuildPage,
} from "../shared";

const hero = pageHero("rb-studio", {
  eyebrowText: "The studio",
  line1: "Book the room",
  line2: "where the work happens.",
  sub: "Impronta's own photo studio: a professional space, agency lighting and a photographer who shoots talent every week. Book a session for your portfolio, or bring a production and let us run the day.",
  primary: { label: "Book a session", href: "#rb-studio-booking" },
  secondary: { label: "For production teams", href: "#rb-studio-services" },
  footnote: "Sessions for talent · production days for brands",
});

// ── sessions: the product the owner asked to promote ─────────────────────────
const sessions = band(
  "rb-studio-sessions",
  [
    centerHead(
      "rb-studio-sessions",
      "Sessions",
      "A session at the Impronta studio",
      "You do not need to be represented by the agency to book. Come with an idea or come with nothing; we shoot what you need and you leave with images you can use.",
    ),
    grid(
      "rb-studio-sessions-grid",
      3,
      [
        featureCard(
          "rb-studio-session-1",
          "Your first portfolio",
          "For anyone starting out. We shoot the frames an agency actually asks for: clean digitals, a full-length, a portrait, and a few looks with real styling. You leave knowing what your book is missing.",
        ),
        featureCard(
          "rb-studio-session-2",
          "An updated book",
          "For working talent whose images no longer match them. New looks, new light, and the shots your last castings kept asking for.",
        ),
        featureCard(
          "rb-studio-session-3",
          "A personal shoot",
          "Not everything is a career move. Birthdays, milestones, or simply wanting good photographs of yourself, shot properly in a real studio.",
        ),
      ],
      { layerLabel: "Session types" },
    ),
    {
      id: "rb-studio-includes",
      kind: "container",
      props: {
        layout: "stack",
        align: "start",
        layerLabel: "Every session includes",
        style: { gap: "0px", marginTopFree: "36px", width: "100%", maxWidthFree: "640px", marginLeftFree: "auto", marginRightFree: "auto" },
      },
      children: [
        eyebrow("rb-studio-includes-eyebrow", "Every session includes", "left"),
        bulletRow("rb-studio-includes-1", "The studio, lighting and a photographer who shoots talent every week"),
        bulletRow("rb-studio-includes-2", "Direction on set, so you are never left to pose at a wall"),
        bulletRow("rb-studio-includes-3", "Edited images delivered ready to send to an agency or a client"),
      ],
    },
  ],
  { borderTop: true, layerLabel: "Sessions" },
);

const howToBook = band(
  "rb-studio-process",
  [
    centerHead("rb-studio-process", "Booking", "How a session is booked"),
    grid(
      "rb-studio-process-grid",
      4,
      [
        processStep("rb-studio-step-1", "01", "Tell us what you need", "Session type, roughly when, and anything you already know you want."),
        processStep("rb-studio-step-2", "02", "We confirm the details", "Date, time, what to bring and what a session costs, before you commit."),
        processStep("rb-studio-step-3", "03", "Shoot day", "Direction on set from the first frame. Bring your looks; we handle the rest."),
        processStep("rb-studio-step-4", "04", "Your images", "Edited and delivered, ready for your book, your agency or your own use."),
      ],
      { layerLabel: "Booking steps" },
    ),
  ],
  { layerLabel: "Booking" },
);

const booking = band(
  "rb-studio-booking",
  [
    {
      id: "rb-studio-booking-inner",
      kind: "container",
      props: {
        layout: "stack",
        align: "center",
        layerLabel: "Booking form",
        style: { width: "100%", maxWidthFree: "720px", marginLeftFree: "auto", marginRightFree: "auto", gap: "0px" },
      },
      children: [
        eyebrow("rb-studio-booking-eyebrow", "Book"),
        headingLine("rb-studio-booking-title", "Book your session.", { align: "center", layerLabel: "Booking title" }),
        copy(
          "rb-studio-booking-lead",
          "Tell us what you are shooting and when. We reply with availability and what the session costs, so you know before you commit.",
          { align: "center", maxWidth: "620px", marginTop: "16px" },
        ),
        leadForm(
          "rb-studio-booking-form",
          [
            { id: "rb-studio-f-name", name: "name", type: "text", label: "Name", placeholder: "Your name", required: true },
            { id: "rb-studio-f-email", name: "email", type: "email", label: "Email", placeholder: "you@email.com", required: true },
            { id: "rb-studio-f-phone", name: "phone", type: "tel", label: "Phone or WhatsApp", placeholder: "+52 ...", required: true },
            { id: "rb-studio-f-type", name: "session_type", type: "text", label: "What kind of session?", placeholder: "e.g. first portfolio, book update, personal shoot", required: true },
            { id: "rb-studio-f-dates", name: "dates", type: "text", label: "When suits you?", placeholder: "e.g. any weekday in March, or a specific date", required: true },
            { id: "rb-studio-f-message", name: "message", type: "textarea", label: "Anything else we should know?", placeholder: "Looks you have in mind, references, or what the images are for." },
            { id: "rb-studio-f-submit", name: "submit", type: "submit", label: "Request a session" },
          ],
          { layerLabel: "Booking form", maxWidth: "620px" },
        ),
        copy(
          "rb-studio-booking-footnote",
          "No account needed · we reply within 24 hours · you hear the cost before you commit",
          { align: "center", size: "small", marginTop: "14px", layerLabel: "Reassurance" },
        ),
      ],
    },
  ],
  { borderTop: true, layerLabel: "Book a session" },
);

// ── gallery: what a session actually produces ────────────────────────────────
function galleryTile(n: 1 | 2 | 3 | 4, alt: string): BuilderNode {
  return {
    id: `rb-studio-gallery-${n}`,
    kind: "image",
    props: {
      src: IMAGE_SLOT(`studio-gallery-${n}`),
      alt,
      layerLabel: `Studio frame ${n}`,
      style: {
        width: "100%",
        aspectRatioFree: "0.72",
        objectFit: "cover",
        objectPosition: "center top",
        borderRadius: "4px",
      },
    },
  };
}

const gallery = band(
  "rb-studio-gallery",
  [
    centerHead("rb-studio-gallery", "From the studio", "Frames from recent sessions"),
    grid(
      "rb-studio-gallery-grid",
      4,
      [
        galleryTile(1, "An Impronta model on a stool in a white shirt over a black top and wide jeans, against a grey studio backdrop."),
        galleryTile(2, "An Impronta model in an open white shirt with one hand in his hair, against a white studio backdrop."),
        galleryTile(3, "An Impronta model in a black crop top with one hand behind her head, against a grey studio backdrop."),
        galleryTile(4, "An Impronta model in a grey Impronta t-shirt, arms folded, against a white studio backdrop."),
      ],
      { layerLabel: "Studio gallery" },
    ),
  ],
  { layerLabel: "Gallery" },
);

// ── production services: the offering that was already here ──────────────────
const services = band(
  "rb-studio-services",
  [
    centerHead(
      "rb-studio-services",
      "For production teams",
      "Everything a shoot needs",
      "Brands and editorial teams book the studio as a production, not an hour. Casting, crew, permits and the call sheet come through the agency, with one point of contact from the brief to the final frame.",
    ),
    grid(
      "rb-studio-services-grid",
      4,
      [
        featureCard("rb-studio-service-1", "Casting", "Scouting and casting the right faces for your brief, from first option to confirmed booking."),
        featureCard("rb-studio-service-2", "Production", "Call sheets, scheduling, permits and on-set coordination so the day runs on time."),
        featureCard("rb-studio-service-3", "Image direction", "Hair, makeup, styling and creative direction aligned to your references."),
        featureCard("rb-studio-service-4", "Logistics", "Travel, accommodation and location scouting, handled end to end."),
      ],
      { layerLabel: "Production services" },
    ),
  ],
  { borderTop: true, layerLabel: "For production teams" },
);

const closing = closingCta("rb-studio-closing", {
  eyebrowText: "Ready when you are",
  line1: "Bring us",
  line2: "your next shoot.",
  sub: "A session for your book, or a full production day. Tell us which and we answer within 24 hours with dates and costs.",
  primary: { label: "Book a session", href: "#rb-studio-booking" },
  secondary: { label: "Brief a production", href: "/p/contact" },
});

const tree: BuilderNode[] = [hero, sessions, howToBook, booking, gallery, services, closing];

export const studioPage: ImprontaRebuildPage = {
  slug: "studio",
  title: "The Studio | Impronta",
  seo: {
    meta_title: "Book a photo session at the Impronta studio | Riviera Maya",
    meta_description:
      "Impronta's own photo studio: portfolio shoots for new talent, updated books for working models, and personal sessions. Production days for brands and editorial teams.",
    og_title: "Book a photo session at the Impronta studio | Riviera Maya",
    og_description:
      "Portfolio shoots, book updates and personal sessions at the Impronta studio, plus full production days for brands.",
    canonical_url: "/p/studio",
    noindex: false,
    include_in_sitemap: true,
  } as ImprontaRebuildPage["seo"],
  tree,
};
