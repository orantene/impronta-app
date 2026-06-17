import type { TalentSiteSnapshotSection } from "../types";
import type { TalentSiteTemplateDef, TemplateBuildContext } from "./types";

function newSectionId(): string {
  return crypto.randomUUID();
}

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
    sectionId: newSectionId(),
    sectionTypeKey,
    schemaVersion: 1,
    name,
    props,
  };
}

export function buildEditorialSlots(ctx: TemplateBuildContext): TalentSiteSnapshotSection[] {
  const { profile, media } = ctx;
  const title = profile.displayName.trim() || "My profile";
  const intro = profile.publicBio?.trim().slice(0, 280) ?? profile.primaryTypeLabel;
  const profilePath = `/t/${profile.profileCode}`;
  const heroImage = profile.headshotUrl ?? media[0]?.url;

  const slots: TalentSiteSnapshotSection[] = [
    makeSlot("hero", 0, "editorial_split_hero", "Hero", {
      headline: title,
      subheadline: intro ?? undefined,
      primaryCta: { label: "Inquire", href: `${profilePath}?inquire=1` },
      ...(heroImage ? { backgroundImageUrl: heroImage, backgroundImageAlt: profile.displayName } : {}),
    }),
    makeSlot("about", 1, "image_copy_alternating", "Story", {
      eyebrow: "Profile",
      headline: title,
      items: [
        {
          title,
          body: profile.publicBio?.trim() || intro || "",
          imageUrl: heroImage ?? undefined,
          imageAlt: profile.displayName,
          side: "image-right",
        },
      ],
    }),
  ];

  const galleryItems = media.slice(0, 8).map((item, index) => ({
    src: item.url,
    alt: item.alt ?? profile.displayName,
    aspect: (index % 2 === 0 ? "tall" : "wide") as "wide" | "tall" | "square",
  }));

  if (galleryItems.length >= 3) {
    slots.push(
      makeSlot("gallery", 2, "gallery_strip", "Portfolio", {
        eyebrow: "Portfolio",
        headline: "Recent work",
        items: galleryItems,
        variant: "editorial-row",
      }),
    );
  }

  slots.push(
    makeSlot("cta", slots.length, "cta_banner", "Contact", {
      headline: "Book or inquire",
      copy: "Reach out for availability and rates.",
      primaryCta: { label: "Send inquiry", href: `${profilePath}?inquire=1` },
      variant: "minimal-band",
    }),
  );

  return slots;
}

export const EDITORIAL_TEMPLATE: TalentSiteTemplateDef = {
  key: "editorial",
  label: "Editorial",
  blurb: "A magazine-spread layout with a large editorial hero, generous white space, a portfolio row and a contact call to action. Best for photographers and image-forward talent.",
  availableAt: "pro",
  thumbnailUrl: "/talent-templates/editorial.webp",
  buildSlots: buildEditorialSlots,
};
