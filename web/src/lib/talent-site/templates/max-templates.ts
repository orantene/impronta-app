import type { TalentSiteSnapshotSection } from "../types";
import type { TalentSiteTemplateDef, TemplateBuildContext } from "./types";
import { buildEditorialSlots } from "./editorial";

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

function buildStageSlots(ctx: TemplateBuildContext): TalentSiteSnapshotSection[] {
  const { profile, media } = ctx;
  const title = profile.displayName.trim() || "My profile";
  const profilePath = `/t/${profile.profileCode}`;
  const videoUrl = media[0]?.url;

  return [
    makeSlot("hero", 0, "hero", "Hero", {
      headline: title,
      subheadline: profile.primaryTypeLabel ?? undefined,
      primaryCta: { label: "Book", href: `${profilePath}?inquire=1` },
    }),
    ...(videoUrl
      ? [
          makeSlot("reel", 1, "video_reel", "Showreel", {
            eyebrow: "Video",
            headline: "Showreel",
            items: [{ url: videoUrl, title: "Reel" }],
          }),
        ]
      : []),
    makeSlot("cta", 2, "cta_banner", "Contact", {
      headline: "Booking inquiries",
      primaryCta: { label: "Inquire", href: `${profilePath}?inquire=1` },
    }),
  ];
}

function buildCreatorSlots(ctx: TemplateBuildContext): TalentSiteSnapshotSection[] {
  const base = buildEditorialSlots(ctx);
  const profilePath = `/t/${ctx.profile.profileCode}`;
  base.push(
    makeSlot("social", base.length, "logo_cloud", "Social", {
      eyebrow: "Follow",
      headline: "Connect",
      items: [{ name: "Tulala profile", logoUrl: "", href: profilePath }],
    }),
  );
  return base;
}

function buildEpkSlots(ctx: TemplateBuildContext): TalentSiteSnapshotSection[] {
  const { profile, media } = ctx;
  const title = profile.displayName.trim() || "My profile";
  const profilePath = `/t/${profile.profileCode}`;

  return [
    makeSlot("hero", 0, "hero_split", "Hero", {
      headline: title,
      subheadline: profile.publicBio?.trim().slice(0, 200) ?? undefined,
      primaryCta: { label: "Press inquiry", href: `${profilePath}?inquire=1` },
      ...(profile.headshotUrl ? { imageUrl: profile.headshotUrl, imageAlt: title } : {}),
    }),
    makeSlot("about", 1, "image_copy_alternating", "Bio", {
      eyebrow: "Bio",
      headline: title,
      items: [{ title, body: profile.publicBio?.trim() || "", side: "image-left" }],
    }),
    ...(media.length >= 3
      ? [
          makeSlot("gallery", 2, "gallery_strip", "Press", {
            eyebrow: "Media",
            headline: "Press kit images",
            items: media.slice(0, 6).map((m) => ({
              src: m.url,
              alt: m.alt ?? title,
              aspect: "square" as const,
            })),
          }),
        ]
      : []),
    makeSlot("cta", 3, "cta_banner", "Contact", {
      headline: "Press & bookings",
      primaryCta: { label: "Contact", href: `${profilePath}?inquire=1` },
    }),
  ];
}

export const STAGE_TEMPLATE: TalentSiteTemplateDef = {
  key: "stage",
  label: "Stage",
  blurb: "Video-first hero for performers and live talent.",
  availableAt: "max",
  category: "classic",
  thumbnailUrl: "/talent-templates/stage.webp",
  buildSlots: buildStageSlots,
};

export const CREATOR_TEMPLATE: TalentSiteTemplateDef = {
  key: "creator",
  label: "Creator",
  blurb: "Social-first layout for creators and influencers.",
  availableAt: "max",
  category: "classic",
  thumbnailUrl: "/talent-templates/creator.webp",
  buildSlots: buildCreatorSlots,
};

export const EPK_TEMPLATE: TalentSiteTemplateDef = {
  key: "epk",
  label: "EPK",
  blurb: "Press-kit feel — bio, gallery, and contact CTA.",
  availableAt: "max",
  category: "classic",
  thumbnailUrl: "/talent-templates/epk.webp",
  buildSlots: buildEpkSlots,
};
