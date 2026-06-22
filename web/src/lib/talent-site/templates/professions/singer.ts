import type { TalentSiteSnapshotSection } from "../../types";
import type { TalentSiteTemplateDef, TemplateBuildContext } from "../types";
import {
  aboutStory,
  compose,
  contentTabs,
  ctaBook,
  faq,
  gallery,
  heroReel,
  inquireHref,
  marquee,
  stats,
  testimonials,
  bookingCal,
} from "../section-kit";

const DEMO_CAL = "https://cal.com/demo/listen";

/** Singer / songwriter — performance-forward, booking-ready. */
function buildSingerSlots(ctx: TemplateBuildContext): TalentSiteSnapshotSection[] {
  const { profile, media } = ctx;
  const isDemo = ctx.mode === "demo";
  const name = profile.displayName.trim() || "My profile";
  const role = profile.primaryTypeLabel || "Singer-songwriter";
  const intro =
    profile.publicBio?.trim().slice(0, 180) ||
    "Live music with feeling — for the moments that matter.";
  const href = inquireHref(profile.profileCode);
  const images = media.map((m) => m.url);
  const heroImages = profile.headshotUrl ? [profile.headshotUrl, ...images] : images;

  return compose([
    heroReel({
      title: name,
      tagline: intro,
      primary: { label: "Check availability", href },
      secondary: { label: "Listen", href: "#listen" },
      images: heroImages,
      overlay: "gradient-scrim",
      mood: "cinematic",
      background: "espresso",
    }),
    marquee({
      items: ["Weddings", "Private events", "Venue nights", "Corporate", "Festivals", "Brand launches"],
      separator: "diamond",
      background: "espresso",
      onDark: true,
    }),
    aboutStory({
      eyebrow: role,
      headline: "The artist",
      title: name,
      italicTagline: profile.homeCity ? `Based in ${profile.homeCity}` : undefined,
      body:
        profile.publicBio?.trim() ||
        "I write and perform original songs and reimagined covers — shaped to the room, whether that's a candlelit ceremony or a late venue set.",
      imageUrl: images[1] ?? profile.headshotUrl ?? undefined,
      imageAlt: name,
      side: "image-right",
      background: "canvas",
    }),
    gallery({
      eyebrow: "On stage",
      headline: "Recent shows",
      images,
      alt: name,
      variant: "mosaic",
      background: "ivory",
    }),
    stats({
      eyebrow: "Track record",
      items: [
        { value: "200+", label: "Shows played" },
        { value: "8 yrs", label: "Performing" },
        { value: "4.9★", label: "Client rating" },
        { value: "30–180", label: "Minutes per set" },
      ],
      variant: "row",
      background: "espresso",
    }),
    contentTabs({
      eyebrow: "Formats",
      headline: "Ways to book me",
      tabs: [
        {
          label: "Solo",
          body: "Just voice and guitar (with a loop pedal when it fits). Perfect for ceremonies, cocktail hours, and intimate rooms. Fully self-contained PA for up to ~120 guests.",
        },
        {
          label: "Duo",
          body: "Add a second player — cajón or keys — for a fuller sound that still keeps the warmth. Great for dinner sets and small venues.",
        },
        {
          label: "Full band",
          body: "Three to five pieces for parties and venue headline nights. Tailored set list, dance-floor energy, and full production on request.",
        },
      ],
      background: "ivory",
    }),
    testimonials({
      eyebrow: "Kind words",
      headline: "What clients say",
      items: [
        {
          quote: "Our guests are still talking about the ceremony set. She read the room perfectly.",
          author: "Marina & Tom",
          context: "Wedding, Tulum",
        },
        {
          quote: "Professional from the first email to the last song. Booking again for our launch.",
          author: "Casa Vega",
          context: "Brand event",
        },
        {
          quote: "That voice. The whole venue went quiet — in the best way.",
          author: "El Mirador",
          context: "Venue night",
        },
      ],
      background: "blush",
    }),
    faq({
      headline: "Booking questions",
      items: [
        { question: "Do you travel?", answer: "Yes — I'm based in " + (profile.homeCity || "Mexico City") + " and travel nationally and internationally. Travel and accommodation are added for shows outside my home city." },
        { question: "Can we request songs?", answer: "Absolutely. Send your must-plays and any do-not-plays, plus a first-dance or ceremony song to learn, and I'll build the set around them." },
        { question: "What do you need on the day?", answer: "A small footprint, power within reach, and shelter if outdoors. I bring my own PA for most events." },
        { question: "How do we hold a date?", answer: "A signed agreement and deposit secure your date. The balance is due before the event." },
      ],
      background: "champagne",
    }),
    ...(isDemo
      ? [
          bookingCal({
            headline: "See open dates",
            intro: "Pick a slot for a quick call to talk through your event.",
            url: DEMO_CAL,
            background: "ivory",
          }),
        ]
      : []),
    ctaBook({
      eyebrow: "Let's make it special",
      headline: "Bring live music to your day",
      copy: "Tell me the date, the place, and the vibe — I'll reply with availability and a quote.",
      reassurance: "Replies within 24 hours",
      primary: { label: "Check availability", href },
      backgroundImageUrl: heroImages[0],
      variant: heroImages[0] ? "centered-overlay" : "minimal-band",
    }),
  ]);
}

export const SINGER_TEMPLATE: TalentSiteTemplateDef = {
  key: "singer",
  label: "Encore",
  blurb: "For singers & musicians — stage-forward, set formats, and easy booking.",
  availableAt: "pro",
  category: "stage",
  thumbnailUrl: "/marketing/photos/independent-singer-booking.jpg",
  buildSlots: buildSingerSlots,
};
