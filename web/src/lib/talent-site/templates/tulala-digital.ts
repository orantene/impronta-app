import { randomUUID } from "node:crypto";

import type { TalentSiteSnapshotSection } from "../types";
import type { TalentSiteTemplateDef, TemplateBuildContext } from "./types";

function makeSlot(
  slotKey: string,
  sortOrder: number,
  sectionTypeKey: string,
  name: string,
  props: Record<string, unknown>,
): TalentSiteSnapshotSection {
  return {
    slotKey,
    sortOrder,
    sectionId: randomUUID(),
    sectionTypeKey,
    schemaVersion: 1,
    name,
    props,
  };
}

function buildTulalaDigitalSlots(ctx: TemplateBuildContext): TalentSiteSnapshotSection[] {
  const { profile, media } = ctx;
  const title = profile.displayName.trim() || "My profile";
  const intro =
    profile.publicBio?.trim().slice(0, 240) ||
    (profile.primaryTypeLabel
      ? `${profile.primaryTypeLabel}${profile.homeCity ? ` · ${profile.homeCity}` : ""}`
      : null);
  const profilePath = `/t/${profile.profileCode}`;

  const galleryItems = media.slice(0, 6).map((item, index) => ({
    src: item.url,
    alt: item.alt ?? profile.displayName,
    aspect: (index % 3 === 0 ? "wide" : index % 3 === 1 ? "tall" : "square") as
      | "wide"
      | "tall"
      | "square",
  }));

  const slots: TalentSiteSnapshotSection[] = [
    makeSlot("hero", 0, "hero_split", "Hero", {
      headline: title,
      subheadline: intro ?? undefined,
      primaryCta: {
        label: "Send inquiry",
        href: `${profilePath}?inquire=1`,
      },
      ...(profile.headshotUrl
        ? {
            imageUrl: profile.headshotUrl,
            imageAlt: profile.displayName,
          }
        : {}),
    }),
    makeSlot("about", 1, "image_copy_alternating", "About", {
      eyebrow: "About",
      headline: title,
      items: [
        {
          title,
          body: profile.publicBio?.trim() || intro || "Welcome to my Tulala profile.",
          imageUrl: profile.headshotUrl ?? undefined,
          imageAlt: profile.displayName,
          side: "image-left",
        },
      ],
    }),
  ];

  if (galleryItems.length >= 3) {
    slots.push(
      makeSlot("gallery", 2, "gallery_strip", "Portfolio", {
        eyebrow: "Work",
        headline: "Selected portfolio",
        items: galleryItems,
        variant: "mosaic",
      }),
    );
  }

  const serviceLabels =
    profile.serviceAreaLabels.length > 0
      ? profile.serviceAreaLabels
      : profile.primaryTypeLabel
        ? [profile.primaryTypeLabel]
        : ["Services"];

  slots.push(
    makeSlot("services", slots.length, "values_trio", "Services", {
      eyebrow: "What I offer",
      headline: "Services & focus",
      items: serviceLabels.slice(0, 3).map((label, index) => ({
        numberLabel: String(index + 1).padStart(2, "0"),
        title: label,
        detail: profile.homeCity ? `Based in ${profile.homeCity}` : undefined,
      })),
      variant: "numbered-cards",
    }),
    makeSlot("cta", slots.length + 1, "cta_banner", "Contact", {
      headline: "Let's work together",
      copy: "Send an inquiry through my Tulala profile.",
      primaryCta: {
        label: "Contact me",
        href: `${profilePath}?inquire=1`,
      },
      variant: "minimal-band",
      bandTone: "ivory",
      insetCard: true,
    }),
  );

  return slots;
}

export const TULALA_DIGITAL_TEMPLATE: TalentSiteTemplateDef = {
  key: "tulala-digital",
  label: "Tulala Digital",
  blurb: "Included with Free — a clean service profile on Tulala.",
  availableAt: "free",
  thumbnailUrl: "/talent-templates/tulala-digital.webp",
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
