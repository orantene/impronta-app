import type { TalentSiteSnapshotSection } from "../types";
import type { TalentSiteTemplateDef, TemplateBuildContext } from "./types";
import {
  aboutStory,
  compose,
  ctaBook,
  gallery,
  heroSplit,
  inquireHref,
  marquee,
  valuesTrio,
} from "./section-kit";

function serviceLabels(ctx: TemplateBuildContext): string[] {
  const { profile } = ctx;
  const labels = [
    ...(profile.primaryTypeLabel ? [profile.primaryTypeLabel] : []),
    ...profile.serviceAreaLabels,
  ];
  return labels.length ? labels : ["Available for select projects"];
}

/**
 * Tulala Digital — the free, auto-assigned base. Clean, profession-agnostic,
 * intentionally lighter than the Pro profession templates.
 */
function buildTulalaDigitalSlots(ctx: TemplateBuildContext): TalentSiteSnapshotSection[] {
  const { profile, media } = ctx;
  const title = profile.displayName.trim() || "My profile";
  const intro =
    profile.publicBio?.trim().slice(0, 200) ||
    (profile.primaryTypeLabel
      ? `${profile.primaryTypeLabel}${profile.homeCity ? ` · ${profile.homeCity}` : ""}`
      : "Welcome to my Tulala page.");
  const href = inquireHref(profile.profileCode);
  const images = media.map((m) => m.url);
  const labels = serviceLabels(ctx);

  return compose([
    heroSplit({
      eyebrow: profile.primaryTypeLabel ?? undefined,
      title,
      tagline: intro,
      primary: { label: "Send inquiry", href },
      imageUrl: profile.headshotUrl ?? images[0] ?? "",
      imageAlt: title,
      side: "media-right",
      variant: "asymmetric",
      background: "canvas",
    }),
    marquee({ items: labels, background: "ivory", onDark: false, variant: "tags" }),
    aboutStory({
      eyebrow: "About",
      headline: "A little about me",
      title,
      body: profile.publicBio?.trim() || intro,
      imageUrl: images[1] ?? profile.headshotUrl ?? undefined,
      imageAlt: title,
      side: "image-left",
      background: "canvas",
    }),
    gallery({
      eyebrow: "Work",
      headline: "Selected work",
      images,
      alt: title,
      variant: "mosaic",
      background: "ivory",
    }),
    valuesTrio({
      eyebrow: "What I offer",
      headline: "How I can help",
      items: labels.slice(0, 3).map((label, i) => ({
        numberLabel: String(i + 1).padStart(2, "0"),
        title: label,
        detail: profile.homeCity ? `Based in ${profile.homeCity}` : undefined,
      })),
      background: "canvas",
    }),
    ctaBook({
      headline: "Let's work together",
      copy: "Send an inquiry and I'll get back to you with availability.",
      primary: { label: "Contact me", href },
      variant: "minimal-band",
      bandTone: "espresso",
    }),
  ]);
}

export const TULALA_DIGITAL_TEMPLATE: TalentSiteTemplateDef = {
  key: "tulala-digital",
  label: "Tulala Signature",
  blurb: "Included free — a clean, confident one-page profile.",
  availableAt: "free",
  category: "base",
  thumbnailUrl: "/marketing/photos/talent-services-hero.jpg",
  buildSlots: buildTulalaDigitalSlots,
};

export function buildTulalaDigitalSnapshotFields(ctx: TemplateBuildContext) {
  const title = ctx.profile.displayName.trim() || "My profile";
  const intro =
    ctx.profile.publicBio?.trim().slice(0, 240) ||
    (ctx.profile.primaryTypeLabel
      ? `${ctx.profile.primaryTypeLabel}${ctx.profile.homeCity ? ` · ${ctx.profile.homeCity}` : ""}`
      : null);
  return {
    title,
    metaDescription: intro,
    introTagline: intro,
  };
}
