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

function buildStudioSlots(ctx: TemplateBuildContext): TalentSiteSnapshotSection[] {
  const { profile, media } = ctx;
  const title = profile.displayName.trim() || "My profile";
  const profilePath = `/t/${profile.profileCode}`;
  const galleryItems = media.slice(0, 9).map((item) => ({
    src: item.url,
    alt: item.alt ?? profile.displayName,
    aspect: "square" as const,
  }));

  const slots: TalentSiteSnapshotSection[] = [
    makeSlot("hero", 0, "hero", "Hero", {
      headline: title,
      subheadline: profile.primaryTypeLabel ?? undefined,
      primaryCta: { label: "Inquire", href: `${profilePath}?inquire=1` },
      ...(profile.headshotUrl
        ? {
            slides: [
              {
                headline: title,
                backgroundImageUrl: profile.headshotUrl,
                backgroundImageAlt: profile.displayName,
              },
            ],
          }
        : {}),
    }),
  ];

  if (galleryItems.length >= 3) {
    slots.push(
      makeSlot("gallery", 1, "masonry", "Gallery", {
        eyebrow: "Portfolio",
        headline: "Selected images",
        items: galleryItems,
      }),
    );
  }

  slots.push(
    makeSlot("about", slots.length, "image_copy_alternating", "About", {
      eyebrow: "About",
      headline: title,
      items: [
        {
          title,
          body: profile.publicBio?.trim() || "",
          side: "image-left",
        },
      ],
    }),
    makeSlot("cta", slots.length + 1, "cta_banner", "Contact", {
      headline: "Get in touch",
      primaryCta: { label: "Contact", href: `${profilePath}?inquire=1` },
      variant: "minimal-band",
    }),
  );

  return slots;
}

export const STUDIO_TEMPLATE: TalentSiteTemplateDef = {
  key: "studio",
  label: "Studio",
  blurb: "Tight grid, big imagery — fashion and lifestyle.",
  availableAt: "pro",
  thumbnailUrl: "/talent-templates/studio.webp",
  buildSlots: buildStudioSlots,
};
