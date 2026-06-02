import type { TalentSiteSnapshotSection } from "../../types";
import type { TalentSiteTemplateDef, TemplateBuildContext } from "../types";
import {
  aboutStory,
  compose,
  ctaBook,
  faq,
  gallery,
  heroReel,
  inquireHref,
  lookbook,
  marquee,
  stats,
  testimonials,
} from "../section-kit";

/** Fashion / runway model — comp-card digitals + lookbook. */
function buildModelSlots(ctx: TemplateBuildContext): TalentSiteSnapshotSection[] {
  const { profile, media } = ctx;
  const name = profile.displayName.trim() || "My profile";
  const role = profile.primaryTypeLabel || "Model";
  const intro =
    profile.publicBio?.trim().slice(0, 180) ||
    "Editorial, runway, and campaign work.";
  const href = inquireHref(profile.profileCode);
  const images = media.map((m) => m.url);
  const heroImages = profile.headshotUrl ? [profile.headshotUrl, ...images] : images;

  return compose([
    heroReel({
      title: name,
      tagline: intro,
      primary: { label: "Book me", href },
      secondary: { label: "Digitals", href: "#digitals" },
      images: heroImages,
      overlay: "soft-vignette",
      mood: "editorial",
      background: "espresso",
    }),
    marquee({
      items: ["Runway", "Editorial", "Campaign", "Lookbook", "E-commerce", "Fittings", "Showroom"],
      separator: "slash",
      background: "espresso",
      onDark: true,
    }),
    aboutStory({
      eyebrow: role,
      headline: "Profile",
      title: name,
      italicTagline: profile.homeCity ? `Based in ${profile.homeCity}` : undefined,
      body:
        profile.publicBio?.trim() ||
        "Versatile across editorial and commercial work, with an easy set presence and the professionalism agencies and brands rely on.",
      imageUrl: images[1] ?? profile.headshotUrl ?? undefined,
      imageAlt: name,
      side: "image-right",
      background: "canvas",
    }),
    stats({
      eyebrow: "Digitals",
      headline: "Measurements",
      items: [
        { value: "178 cm", label: "Height" },
        { value: "82", label: "Bust (cm)" },
        { value: "61", label: "Waist (cm)" },
        { value: "89", label: "Hips (cm)" },
        { value: "40 EU", label: "Shoe" },
        { value: "Green", label: "Eyes" },
      ],
      variant: "grid",
      background: "espresso",
    }),
    lookbook({
      eyebrow: "Lookbook",
      headline: "Selected campaigns",
      images,
      alt: name,
      ratio: "4/5",
      background: "champagne",
    }),
    gallery({
      eyebrow: "Polaroids",
      headline: "Recent work",
      images: [...images].reverse(),
      alt: name,
      variant: "grid-uniform",
      background: "canvas",
    }),
    testimonials({
      eyebrow: "Kind words",
      headline: "From set",
      items: [
        {
          quote: "Total pro. Hit every mark and brought ideas we hadn't thought of.",
          author: "Atelier Nord",
          context: "Campaign shoot",
        },
        {
          quote: "Easy to direct, great energy, and the images were stunning.",
          author: "RevistaMX",
          context: "Editorial",
        },
        {
          quote: "Booked again the same week. That says it all.",
          author: "Casa Linen",
          context: "Lookbook",
        },
      ],
      background: "blush",
    }),
    faq({
      headline: "For bookers",
      items: [
        { question: "Are you represented?", answer: "I work both with my agency and on select direct bookings. Reach out and I'll connect you with the right contact." },
        { question: "Do you travel?", answer: "Yes — based in " + (profile.homeCity || "Mexico City") + " and available for travel with notice. Travel and accommodation are covered by the client." },
        { question: "How are usage and rates handled?", answer: "Rates depend on usage, exclusivity, and territory. Send the brief and I'll quote accordingly." },
        { question: "Can you send full digitals?", answer: "Of course — current digitals and a full book are available on request." },
      ],
      background: "champagne",
    }),
    ctaBook({
      eyebrow: "Available for booking",
      headline: "Let's create something",
      copy: "Share your brief, dates, and usage — I'll reply with availability and rates.",
      reassurance: "Full book available on request",
      primary: { label: "Book me", href },
      backgroundImageUrl: heroImages[0],
      variant: heroImages[0] ? "centered-overlay" : "minimal-band",
    }),
  ]);
}

export const MODEL_TEMPLATE: TalentSiteTemplateDef = {
  key: "model",
  label: "Atelier",
  blurb: "For models — comp-card digitals, lookbook, and direct booking.",
  availableAt: "pro",
  category: "studio",
  thumbnailUrl: "/marketing/photos/mk-models-runway.jpg",
  buildSlots: buildModelSlots,
};
