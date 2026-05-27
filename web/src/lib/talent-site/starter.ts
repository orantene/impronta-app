import type { TalentSiteSnapshot, TalentSiteSnapshotSection } from "./types";

function newSectionId(): string {
  return crypto.randomUUID();
}

export type TalentPortfolioStarterProfile = {
  displayName: string;
  profileCode: string;
  primaryTypeLabel: string | null;
  publicBio: string | null;
  homeCity: string | null;
  serviceAreaLabels: string[];
  headshotUrl: string | null;
};

export type TalentPortfolioStarterMedia = {
  url: string;
  alt?: string;
};

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

/**
 * Builds the `talent_portfolio_starter` snapshot from public-safe profile fields only.
 * Omits rates, private notes, unapproved media, agency-private data.
 *
 * Follow-up (Phase 3+): credits / past clients — include only when a dedicated
 * public visibility flag exists on those relations; until then, omit from starter.
 */
export function buildTalentPortfolioStarterSnapshot(
  profile: TalentPortfolioStarterProfile,
  media: TalentPortfolioStarterMedia[],
): TalentSiteSnapshot {
  const title = profile.displayName.trim() || "My portfolio";
  const intro =
    profile.publicBio?.trim().slice(0, 240) ||
    (profile.primaryTypeLabel
      ? `${profile.primaryTypeLabel}${profile.homeCity ? ` · ${profile.homeCity}` : ""}`
      : null);

  const galleryItems = media.slice(0, 6).map((item, index) => ({
    src: item.url,
    alt: item.alt ?? profile.displayName,
    aspect: (index % 3 === 0 ? "wide" : index % 3 === 1 ? "tall" : "square") as
      | "wide"
      | "tall"
      | "square",
  }));

  while (galleryItems.length < 3 && profile.headshotUrl) {
    galleryItems.push({
      src: profile.headshotUrl,
      alt: profile.displayName,
      aspect: "square",
    });
  }

  const serviceLabels =
    profile.serviceAreaLabels.length > 0
      ? profile.serviceAreaLabels
      : profile.primaryTypeLabel
        ? [profile.primaryTypeLabel]
        : ["Portfolio"];

  const valuesItems = serviceLabels.slice(0, 3).map((label, index) => ({
    numberLabel: String(index + 1).padStart(2, "0"),
    title: label,
    detail: profile.homeCity ? `Based in ${profile.homeCity}` : undefined,
  }));

  if (valuesItems.length < 2) {
    valuesItems.push({
      numberLabel: "02",
      title: "Contact",
      detail: "Reach out to discuss your project.",
    });
  }

  const profilePath = `/t/${profile.profileCode}`;

  const slots: TalentSiteSnapshotSection[] = [
    makeSlot("hero", 0, "hero", "Hero", {
      headline: title,
      subheadline: intro ?? undefined,
      primaryCta: {
        label: "View profile",
        href: profilePath,
      },
      ...(profile.headshotUrl
        ? {
            slides: [
              {
                headline: title,
                subheadline: intro ?? undefined,
                backgroundImageUrl: profile.headshotUrl,
                backgroundImageAlt: profile.displayName,
              },
            ],
          }
        : {}),
    }),
    makeSlot("about", 1, "image_copy_alternating", "About", {
      eyebrow: "About",
      headline: title,
      items: [
        {
          title: title,
          body: profile.publicBio?.trim() || intro || "Welcome to my portfolio.",
          imageUrl: profile.headshotUrl ?? undefined,
          imageAlt: profile.displayName,
          side: "image-left",
        },
      ],
    }),
  ];

  if (galleryItems.length >= 3) {
    slots.push(
      makeSlot("gallery", 2, "gallery_strip", "Gallery", {
        eyebrow: "Portfolio",
        headline: "Selected work",
        items: galleryItems,
        variant: "mosaic",
      }),
    );
  }

  slots.push(
    makeSlot("services", slots.length, "values_trio", "Focus", {
      eyebrow: "What I do",
      headline: "Services & focus",
      items: valuesItems,
      variant: "numbered-cards",
    }),
    makeSlot("cta", slots.length + 1, "cta_banner", "Contact", {
      headline: "Let's connect",
      copy: "Send an inquiry through my Tulala profile.",
      primaryCta: {
        label: "Contact me",
        href: profilePath,
      },
      variant: "minimal-band",
      bandTone: "ivory",
      insetCard: true,
    }),
  );

  return {
    version: 1,
    siteKind: "talent_personal",
    templateKey: "roster",
    compositionMode: "template",
    publishedAt: null,
    pageVersion: 1,
    locale: "en",
    fields: {
      title,
      metaDescription: intro,
      introTagline: intro,
    },
    templateSchemaVersion: 1,
    slots,
  };
}
