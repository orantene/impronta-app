import type { TalentSiteSnapshotSection } from "../types";
import type { TalentSiteTemplateDef, TemplateBuildContext } from "./types";
import {
  aboutStory,
  compose,
  ctaBook,
  gallery,
  heroReel,
  heroSplit,
  inquireHref,
  marquee,
  valuesTrio,
} from "./section-kit";

function labelsOf(ctx: TemplateBuildContext): string[] {
  const { profile } = ctx;
  const labels = [
    ...(profile.primaryTypeLabel ? [profile.primaryTypeLabel] : []),
    ...profile.serviceAreaLabels,
  ];
  return labels.length ? labels : ["Available for select projects"];
}

// ── Minimal ──────────────────────────────────────────────────────────────────

/** Minimal — ultra-clean, type-forward, generous whitespace. */
function buildMinimalSlots(ctx: TemplateBuildContext): TalentSiteSnapshotSection[] {
  const { profile, media } = ctx;
  const title = profile.displayName.trim() || "My profile";
  const intro =
    profile.publicBio?.trim().slice(0, 180) || profile.primaryTypeLabel || "";
  const href = inquireHref(profile.profileCode);
  const images = media.map((m) => m.url);

  return compose([
    heroSplit({
      eyebrow: profile.primaryTypeLabel ?? undefined,
      title,
      tagline: intro,
      primary: { label: "Get in touch", href },
      imageUrl: profile.headshotUrl ?? images[0] ?? "",
      imageAlt: title,
      side: "media-left",
      variant: "card",
      background: "ivory",
    }),
    aboutStory({
      eyebrow: "About",
      title,
      body: profile.publicBio?.trim() || intro || "Welcome to my page.",
      imageUrl: images[1] ?? undefined,
      imageAlt: title,
      side: "image-right",
      background: "canvas",
    }),
    gallery({
      eyebrow: "Work",
      headline: "Selected work",
      images,
      alt: title,
      variant: "grid-uniform",
      background: "canvas",
    }),
    ctaBook({
      headline: "Start a conversation",
      copy: "Tell me about your project and I'll reply with next steps.",
      primary: { label: "Contact", href },
      variant: "minimal-band",
      bandTone: "ivory",
    }),
  ]);
}

export const BASE_MINIMAL_TEMPLATE: TalentSiteTemplateDef = {
  key: "base-minimal",
  label: "Minimal",
  blurb: "Ultra-clean and type-forward. Lets your work do the talking.",
  availableAt: "free",
  category: "base",
  thumbnailUrl: "/marketing/photos/service-pros-lifestyle.jpg",
  buildSlots: buildMinimalSlots,
};

// ── Bold ──────────────────────────────────────────────────────────────────────

/** Bold — dark, full-bleed statement hero with movement. */
function buildBoldSlots(ctx: TemplateBuildContext): TalentSiteSnapshotSection[] {
  const { profile, media } = ctx;
  const title = profile.displayName.trim() || "My profile";
  const intro =
    profile.publicBio?.trim().slice(0, 180) || profile.primaryTypeLabel || "";
  const href = inquireHref(profile.profileCode);
  const images = media.map((m) => m.url);
  const labels = labelsOf(ctx);

  return compose([
    heroReel({
      title,
      tagline: intro,
      primary: { label: "Work with me", href },
      images: profile.headshotUrl ? [profile.headshotUrl, ...images] : images,
      overlay: "gradient-scrim",
      mood: "cinematic",
      background: "espresso",
    }),
    marquee({ items: labels, separator: "diamond", background: "espresso", onDark: true }),
    aboutStory({
      eyebrow: "About",
      headline: "The short version",
      title,
      body: profile.publicBio?.trim() || intro || "Welcome to my page.",
      imageUrl: images[1] ?? profile.headshotUrl ?? undefined,
      imageAlt: title,
      side: "image-left",
      background: "canvas",
    }),
    gallery({
      eyebrow: "Portfolio",
      headline: "Recent work",
      images,
      alt: title,
      variant: "mosaic",
      background: "ivory",
    }),
    valuesTrio({
      eyebrow: "Why me",
      headline: "What you can count on",
      items: labels.slice(0, 3).map((label, i) => ({
        numberLabel: String(i + 1).padStart(2, "0"),
        title: label,
      })),
      background: "canvas",
    }),
    ctaBook({
      eyebrow: "Let's talk",
      headline: "Ready when you are",
      copy: "Send the details and let's make it happen.",
      primary: { label: "Send inquiry", href },
      backgroundImageUrl: images[0] ?? profile.headshotUrl ?? undefined,
      variant: images[0] || profile.headshotUrl ? "centered-overlay" : "minimal-band",
    }),
  ]);
}

export const BASE_BOLD_TEMPLATE: TalentSiteTemplateDef = {
  key: "base-bold",
  label: "Bold",
  blurb: "Dark, full-bleed and cinematic. A confident first impression.",
  availableAt: "free",
  category: "base",
  thumbnailUrl: "/marketing/photos/mk-hero-perform.jpg",
  buildSlots: buildBoldSlots,
};
