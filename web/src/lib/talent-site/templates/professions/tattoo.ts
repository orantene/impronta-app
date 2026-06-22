import type { TalentSiteSnapshotSection } from "../../types";
import type { TalentSiteTemplateDef, TemplateBuildContext } from "../types";
import {
  aboutStory,
  beforeAfter,
  bookingCal,
  compose,
  ctaBook,
  faq,
  gallery,
  heroReel,
  inquireHref,
  marquee,
  stats,
  testimonials,
  valuesTrio,
} from "../section-kit";

const DEMO_CAL = "https://cal.com/demo/consult";

/** Tattoo artist — portfolio-first, process-driven, deposit-aware booking. */
function buildTattooSlots(ctx: TemplateBuildContext): TalentSiteSnapshotSection[] {
  const { profile, media } = ctx;
  const isDemo = ctx.mode === "demo";
  const name = profile.displayName.trim() || "My profile";
  const role = profile.primaryTypeLabel || "Tattoo artist";
  const intro =
    profile.publicBio?.trim().slice(0, 180) ||
    "Custom work, booked by the piece.";
  const href = inquireHref(profile.profileCode);
  const images = media.map((m) => m.url);
  const heroImages = profile.headshotUrl ? [profile.headshotUrl, ...images] : images;

  return compose([
    heroReel({
      title: name,
      tagline: intro,
      primary: { label: "Request a booking", href },
      secondary: { label: "Portfolio", href: "#work" },
      images: heroImages,
      overlay: "gradient-scrim",
      mood: "cinematic",
      background: "espresso",
    }),
    marquee({
      items: ["Fine-line", "Blackwork", "Custom designs", "Cover-ups", "Guest spots"],
      separator: "diamond",
      background: "espresso",
      onDark: true,
    }),
    aboutStory({
      eyebrow: role,
      headline: "The artist",
      title: name,
      italicTagline: profile.homeCity ? `Working from ${profile.homeCity}` : undefined,
      body:
        profile.publicBio?.trim() ||
        "I take a limited number of custom projects each month so each design gets the time it deserves — from first consultation to a healed, lasting piece.",
      imageUrl: images[1] ?? profile.headshotUrl ?? undefined,
      imageAlt: name,
      side: "image-right",
      background: "canvas",
    }),
    gallery({
      eyebrow: "Portfolio",
      headline: "Selected work",
      images,
      alt: name,
      variant: "mosaic",
      background: "ivory",
    }),
    images.length >= 2
      ? beforeAfter({
          eyebrow: "Healed",
          headline: "Fresh vs. healed",
          beforeUrl: images[0],
          afterUrl: images[1],
          beforeLabel: "Day of",
          afterLabel: "Healed",
          ratio: "4/3",
          background: "canvas",
        })
      : null,
    valuesTrio({
      eyebrow: "Process",
      headline: "How a booking works",
      items: [
        { numberLabel: "01", title: "Consultation", detail: "Share your idea, placement, and references. We refine the concept together." },
        { numberLabel: "02", title: "Deposit", detail: "A deposit secures your date and goes toward the final price." },
        { numberLabel: "03", title: "Session", detail: "Your custom design, tattooed in a clean, private, comfortable studio." },
        { numberLabel: "04", title: "Aftercare", detail: "Clear aftercare guidance and a free touch-up window for peace of mind." },
      ],
      background: "canvas",
    }),
    stats({
      eyebrow: "Track record",
      items: [
        { value: "1.2k+", label: "Pieces done" },
        { value: "10 yrs", label: "Tattooing" },
        { value: "6", label: "Slots / month" },
        { value: "100%", label: "Custom work" },
      ],
      variant: "row",
      background: "espresso",
    }),
    testimonials({
      eyebrow: "Kind words",
      headline: "From clients",
      items: [
        {
          quote: "Took my rough idea and made it better than I imagined. Healed perfectly.",
          author: "Sam R.",
          context: "Custom fine-line",
        },
        {
          quote: "Calm, precise, and a spotless studio. Already planning the next piece.",
          author: "Dani M.",
          context: "Blackwork sleeve",
        },
        {
          quote: "Best cover-up I could have hoped for. Worth every minute on the waitlist.",
          author: "Leo V.",
          context: "Cover-up",
        },
      ],
      background: "blush",
    }),
    faq({
      headline: "Before you book",
      items: [
        { question: "How do deposits work?", answer: "A deposit is required to reserve your session and is deducted from the final price. It's non-refundable but transferable with notice." },
        { question: "Do you offer touch-ups?", answer: "Yes — a complimentary touch-up is included within a set window after your piece has healed." },
        { question: "How should I prepare?", answer: "Sleep well, eat beforehand, stay hydrated, and avoid alcohol the night before. Wear comfortable clothing for the placement." },
        { question: "What's your minimum age?", answer: "Clients must be 18+ with valid ID. No exceptions." },
      ],
      background: "champagne",
    }),
    ...(isDemo
      ? [
          bookingCal({
            headline: "Open consultation slots",
            intro: "Book a short consult to talk through your idea.",
            url: DEMO_CAL,
            background: "ivory",
          }),
        ]
      : []),
    ctaBook({
      eyebrow: "Now booking",
      headline: "Let's design your piece",
      copy: "Send your idea, placement, and a few references — I'll reply with availability and next steps.",
      reassurance: "Limited slots each month",
      primary: { label: "Request a booking", href },
      backgroundImageUrl: heroImages[0],
      variant: heroImages[0] ? "centered-overlay" : "minimal-band",
    }),
  ]);
}

export const TATTOO_TEMPLATE: TalentSiteTemplateDef = {
  key: "tattoo",
  label: "Ink",
  blurb: "For tattoo artists — portfolio, process, healed results, and deposits.",
  availableAt: "pro",
  category: "studio",
  thumbnailUrl: "/marketing/photos/case-studies/cs-tattoo.jpg",
  buildSlots: buildTattooSlots,
};
