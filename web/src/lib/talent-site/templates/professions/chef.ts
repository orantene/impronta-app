import type { TalentSiteSnapshotSection } from "../../types";
import type { TalentSiteTemplateDef, TemplateBuildContext } from "../types";
import {
  aboutStory,
  bookingCal,
  compose,
  contentTabs,
  ctaBook,
  faq,
  gallery,
  heroReel,
  inquireHref,
  marquee,
  servicesAlternating,
  stats,
  testimonials,
} from "../section-kit";

const DEMO_CAL = "https://cal.com/demo/table";

/** Private chef — menu-led, experience-forward, reservation-ready. */
function buildChefSlots(ctx: TemplateBuildContext): TalentSiteSnapshotSection[] {
  const { profile, media } = ctx;
  const isDemo = ctx.mode === "demo";
  const name = profile.displayName.trim() || "My profile";
  const role = profile.primaryTypeLabel || "Private chef";
  const intro =
    profile.publicBio?.trim().slice(0, 180) ||
    "Restaurant-quality dinners, cooked in your kitchen.";
  const href = inquireHref(profile.profileCode);
  const images = media.map((m) => m.url);
  const heroImages = profile.headshotUrl ? [profile.headshotUrl, ...images] : images;

  return compose([
    heroReel({
      title: name,
      tagline: intro,
      primary: { label: "Reserve a date", href },
      secondary: { label: "See menus", href: "#menus" },
      images: heroImages,
      overlay: "gradient-scrim",
      mood: "editorial",
      background: "espresso",
    }),
    marquee({
      items: ["Private dinners", "Tasting menus", "Events & celebrations", "Cooking classes", "Weekly meal prep"],
      separator: "diamond",
      background: "espresso",
      onDark: true,
    }),
    aboutStory({
      eyebrow: role,
      headline: "At the pass",
      title: name,
      italicTagline: profile.homeCity ? `Cooking around ${profile.homeCity}` : undefined,
      body:
        profile.publicBio?.trim() ||
        "I build menus around the season and the people at the table — sourced from the market that morning, plated like a restaurant night, served in the comfort of your home.",
      imageUrl: images[1] ?? profile.headshotUrl ?? undefined,
      imageAlt: name,
      side: "image-left",
      background: "canvas",
    }),
    gallery({
      eyebrow: "From the kitchen",
      headline: "Recent plates",
      images,
      alt: name,
      variant: "mosaic",
      background: "ivory",
    }),
    contentTabs({
      eyebrow: "Menus",
      headline: "What we'll eat",
      tabs: [
        {
          label: "Tasting menu",
          body: "Five to seven courses that tell a story — seasonal, surprising, and paced for conversation. Wine pairing available on request.",
        },
        {
          label: "Family-style",
          body: "Generous shared plates brought to the centre of the table. Relaxed, abundant, and built for gathering.",
        },
        {
          label: "Canapés & events",
          body: "Passed bites and grazing tables for celebrations and brand events — designed to look as good as they taste.",
        },
      ],
      background: "ivory",
    }),
    servicesAlternating({
      eyebrow: "Experiences",
      headline: "Ways to host with me",
      items: [
        {
          title: "Intimate dinner",
          body: "Two to twelve guests. I shop, cook, serve, and leave your kitchen spotless. You just show up and enjoy.",
          imageUrl: images[0],
          imageAlt: "Intimate dinner",
          iconKey: "sparkle",
        },
        {
          title: "Events & catering",
          body: "Celebrations, launches, and milestones — full menu design, service staff, and styling coordinated end to end.",
          imageUrl: images[2] ?? images[0],
          imageAlt: "Event catering",
          iconKey: "star",
        },
        {
          title: "Classes",
          body: "Hands-on cooking sessions for couples and small groups. Learn a menu, then sit down and eat it together.",
          imageUrl: images[3] ?? images[1] ?? images[0],
          imageAlt: "Cooking class",
          iconKey: "clipboard",
        },
      ],
      background: "canvas",
    }),
    stats({
      eyebrow: "Track record",
      items: [
        { value: "500+", label: "Dinners served" },
        { value: "12 yrs", label: "In kitchens" },
        { value: "2–40", label: "Guests per event" },
        { value: "4.9★", label: "Host rating" },
      ],
      variant: "row",
      background: "espresso",
    }),
    testimonials({
      eyebrow: "Kind words",
      headline: "From the table",
      items: [
        {
          quote: "Better than any restaurant we've been to this year — and it was in our living room.",
          author: "The Herrera family",
          context: "Anniversary dinner",
        },
        {
          quote: "Seamless from menu to clean-up. Our guests were blown away.",
          author: "Studio Norte",
          context: "Team celebration",
        },
        {
          quote: "Every dish had a story. We're already planning the next one.",
          author: "Andrea P.",
          context: "Birthday tasting",
        },
      ],
      background: "blush",
    }),
    faq({
      headline: "Good to know",
      items: [
        { question: "Do you handle dietary needs?", answer: "Always. Share allergies and preferences when you inquire and I'll tailor every course — vegetarian, vegan, gluten-free, and more." },
        { question: "What do you need in my kitchen?", answer: "A standard home kitchen is plenty. I bring my own tools and arrive with everything prepped to cook on site." },
        { question: "What's included?", answer: "Menu design, grocery sourcing, cooking, plating, service, and full clean-up. Staff and rentals can be added for larger events." },
        { question: "How far ahead should I book?", answer: "Two to three weeks is ideal for dinners; larger events earlier. Last-minute dates are sometimes possible — just ask." },
      ],
      background: "champagne",
    }),
    ...(isDemo
      ? [
          bookingCal({
            headline: "Check open dates",
            intro: "Grab a time for a quick call to plan your menu.",
            url: DEMO_CAL,
            background: "ivory",
          }),
        ]
      : []),
    ctaBook({
      eyebrow: "Let's plan your night",
      headline: "Reserve your table at home",
      copy: "Tell me the date, the headcount, and the occasion — I'll send a menu proposal and a quote.",
      reassurance: "Menus tailored to every table",
      primary: { label: "Reserve a date", href },
      backgroundImageUrl: heroImages[0],
      variant: heroImages[0] ? "centered-overlay" : "minimal-band",
    }),
  ]);
}

export const CHEF_TEMPLATE: TalentSiteTemplateDef = {
  key: "chef",
  label: "Tasting",
  blurb: "For chefs & caterers — menus, experiences, and reservations.",
  availableAt: "pro",
  category: "hospitality",
  thumbnailUrl: "/marketing/photos/case-studies/cs-chefs.jpg",
  buildSlots: buildChefSlots,
};
